import { config } from "../config.js";
import { log } from "../logger.js";
import { retry, withTimeout } from "../util/retry.js";

/** Minimal OpenRouter chat client with tool calling. */

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };

export interface Completion {
  content: string;
  toolCalls: ToolCall[];
  usage: { promptTokens: number; completionTokens: number; costUsd: number };
  finishReason: string;
}

export class ModelError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = "ModelError";
  }
}

export async function complete(opts: {
  model: string;
  messages: Message[];
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
}): Promise<Completion> {
  if (!config.OPENROUTER_API_KEY) {
    throw new ModelError("OPENROUTER_API_KEY is not set; the agent cannot think");
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 1_500,
    temperature: opts.temperature ?? 0.7,
    usage: { include: true },
  };
  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }

  const res = await retry(
    () =>
      withTimeout(
        () =>
          fetch(`${config.OPENROUTER_URL}/chat/completions`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
              "content-type": "application/json",
              "HTTP-Referer": config.PUBLIC_URL,
              "X-Title": "BUREAU",
            },
            body: JSON.stringify(body),
          }),
        config.OPENROUTER_TIMEOUT_MS,
        "openrouter",
      ),
    {
      label: "openrouter",
      attempts: 3,
      retryable: (err) => !(err instanceof ModelError) || err.retryable,
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 402 means the account is out of credit; 400 usually means a bad model id.
    const retryable = res.status === 429 || res.status >= 500;
    throw new ModelError(`openrouter ${res.status}: ${text.slice(0, 300)}`, res.status, retryable);
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };

  const choice = json.choices?.[0];
  if (!choice) throw new ModelError("openrouter returned no choices");

  const toolCalls: ToolCall[] = (choice.message?.tool_calls ?? []).flatMap((c) => {
    try {
      return [{ id: c.id, name: c.function.name, args: JSON.parse(c.function.arguments || "{}") as Record<string, unknown> }];
    } catch {
      // A model that produces unparseable arguments gets that call dropped
      // rather than crashing the wake.
      log.warn({ name: c.function.name }, "dropping a tool call with unparseable arguments");
      return [];
    }
  });

  return {
    content: choice.message?.content ?? "",
    toolCalls,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      costUsd: json.usage?.cost ?? 0,
    },
    finishReason: choice.finish_reason ?? "stop",
  };
}
