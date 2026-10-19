import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { log } from "../logger.js";
import { query, one } from "../db.js";
import { getSolBalance } from "../chain/rpc.js";
import { complete, ModelError, type Message } from "./openrouter.js";
import { systemPrompt, wakePrompt, type PromptFacts } from "./prompt.js";
import { toolsFor, runTool, note, type AgentCtx } from "./tools.js";

/**
 * One wake.
 *
 * The agent observes, decides and acts, with every step written to `thoughts`
 * as it happens so the coin page can stream it live. A wake is bounded three
 * ways — wall clock, tool calls and model turns — so a confused agent costs a
 * known amount and then stops.
 */

interface AgentRow {
  id: string;
  name: string;
  ticker: string;
  kind: string;
  families: string[];
  traits: string[];
  instructions: string;
  model: string;
  mint: string | null;
  agent_wallet: string | null;
  wake_count: number;
}

export interface WakeResult {
  wakeId: string;
  ok: boolean;
  toolCalls: number;
  costUsd: number;
  error?: string;
}

export async function wake(agentId: string, trigger = "scheduled"): Promise<WakeResult> {
  const agent = await one<AgentRow>(
    `SELECT id, name, ticker, kind, families, traits, instructions, model, mint, agent_wallet, wake_count
       FROM agents WHERE id = $1`,
    [agentId],
  );
  if (!agent) throw new Error(`unknown agent ${agentId}`);

  const wakeId = randomUUID();
  const startedAt = Date.now();
  await query(`INSERT INTO wakes (id, agent_id, trigger, model) VALUES ($1,$2,$3,$4)`, [
    wakeId, agentId, trigger, agent.model,
  ]);

  const ctx: AgentCtx = {
    agentId,
    wakeId,
    name: agent.name,
    ticker: agent.ticker,
    mint: agent.mint,
    agentWallet: agent.agent_wallet,
    families: agent.families ?? [],
    calls: 0,
  };

  let totalCost = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const facts = await gatherFacts(agent);
    const tools = toolsFor(ctx.families);
    const byName = new Map(tools.map((t) => [t.spec.name, t]));

    const messages: Message[] = [
      { role: "system", content: systemPrompt(facts) },
      { role: "user", content: wakePrompt(trigger) },
    ];

    const deadline = startedAt + config.MAX_WAKE_SECONDS * 1_000;
    let turns = 0;

    while (turns < config.MAX_TOOL_CALLS_PER_WAKE + 2) {
      if (Date.now() > deadline) {
        await note(ctx, "doubt", "I ran out of time this wake. Picking it up next time.", { reason: "deadline" });
        break;
      }
      turns++;

      const res = await complete({
        model: agent.model,
        messages,
        tools: tools.map((t) => t.spec),
        maxTokens: 1_200,
      });
      totalCost += res.usage.costUsd;
      tokensIn += res.usage.promptTokens;
      tokensOut += res.usage.completionTokens;

      // Anything the model says out loud between calls is its thinking.
      if (res.content.trim()) {
        await note(ctx, res.toolCalls.length ? "think" : "act", res.content.trim(), {});
      }

      if (!res.toolCalls.length) break;

      messages.push({
        role: "assistant",
        content: res.content || null,
        tool_calls: res.toolCalls.map((c) => ({
          id: c.id,
          type: "function" as const,
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      });

      for (const call of res.toolCalls) {
        if (ctx.calls >= config.MAX_TOOL_CALLS_PER_WAKE) {
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "tool budget for this wake is spent" }) });
          continue;
        }
        ctx.calls++;
        const tool = byName.get(call.name);
        if (!tool) {
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: `no such tool: ${call.name}` }) });
          continue;
        }
        const out = await runTool(tool, call.args, ctx);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out).slice(0, 8_000) });
      }
    }

    await finishWake(agentId, wakeId, { ok: true, tokensIn, tokensOut, costUsd: totalCost });
    log.info({ agentId, wakeId, calls: ctx.calls, costUsd: totalCost.toFixed(4) }, "wake finished");
    return { wakeId, ok: true, toolCalls: ctx.calls, costUsd: totalCost };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await note(ctx, "observe", "This wake ended early: something on my side failed.", { error: message.slice(0, 200) });
    await finishWake(agentId, wakeId, { ok: false, tokensIn, tokensOut, costUsd: totalCost, error: message });

    // Out of credit is not a crash — it means the agent goes back to sleep.
    if (err instanceof ModelError && err.status === 402) {
      await query(`UPDATE agents SET status = 'asleep_fees', status_reason = 'out of model credit' WHERE id = $1`, [agentId]);
    }
    log.warn({ err, agentId, wakeId }, "wake failed");
    return { wakeId, ok: false, toolCalls: ctx.calls, costUsd: totalCost, error: message };
  }
}

async function finishWake(
  agentId: string,
  wakeId: string,
  r: { ok: boolean; tokensIn: number; tokensOut: number; costUsd: number; error?: string },
) {
  await query(
    `UPDATE wakes SET ended_at = now(), ok = $2, error = $3, tokens_in = $4, tokens_out = $5, cost_usd = $6
       WHERE id = $1`,
    [wakeId, r.ok, r.error?.slice(0, 500) ?? null, r.tokensIn, r.tokensOut, r.costUsd],
  );
  await query(
    `UPDATE agents
        SET wake_count = wake_count + 1,
            last_wake_at = now(),
            next_wake_at = now() + make_interval(mins => $2)
      WHERE id = $1`,
    [agentId, config.WAKE_INTERVAL_MIN],
  );
}

async function gatherFacts(agent: AgentRow): Promise<PromptFacts> {
  const [balance, mission, memories, notes, thoughts] = await Promise.all([
    agent.agent_wallet ? getSolBalance(agent.agent_wallet).catch(() => 0) : Promise.resolve(0),
    one<{ title: string; goal_label: string; target: number; progress: number }>(
      `SELECT title, goal_label, target, progress FROM missions WHERE agent_id = $1 AND active ORDER BY created_at DESC LIMIT 1`,
      [agent.id],
    ),
    query<{ body: string }>(`SELECT body FROM memories WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 8`, [agent.id]),
    query<{ id: string; body: string }>(`SELECT id, body FROM dev_notes WHERE agent_id = $1 AND NOT consumed ORDER BY created_at LIMIT 5`, [agent.id]),
    query<{ body: string }>(
      `SELECT body FROM thoughts WHERE agent_id = $1 AND phase IN ('act','learn') ORDER BY id DESC LIMIT 4`,
      [agent.id],
    ),
  ]);

  // Notes are handed over once; a note read twice would nag forever.
  if (notes.rows.length) {
    await query(`UPDATE dev_notes SET consumed = true WHERE id = ANY($1::bigint[])`, [notes.rows.map((n) => n.id)]);
  }

  return {
    name: agent.name,
    ticker: agent.ticker,
    kind: agent.kind,
    families: agent.families ?? [],
    traits: agent.traits ?? [],
    instructions: agent.instructions ?? "",
    mint: agent.mint,
    walletLamports: balance,
    mission: mission
      ? { title: mission.title, goalLabel: mission.goal_label, target: mission.target, progress: mission.progress }
      : null,
    recentMemories: memories.rows.map((r) => r.body),
    devNotes: notes.rows.map((r) => r.body),
    lastThoughts: thoughts.rows.map((r) => r.body).reverse(),
    wakeNumber: (agent.wake_count ?? 0) + 1,
  };
}
