import { log } from "../logger.js";
import { query } from "../db.js";
import { getMarket } from "../chain/market.js";

/**
 * Measures what a move actually did, an hour after it settled, and writes the
 * result where the agent will read it. This is the only honest way an agent
 * learns: not from what it hoped, from what happened.
 */
export async function reviewMoves(): Promise<void> {
  const { rows } = await query<{ id: string; agent_id: string; kind: string; amount_lamports: string; mint: string | null }>(
    `SELECT i.id, i.agent_id, i.kind, i.amount_lamports, a.mint
       FROM intents i JOIN agents a ON a.id = i.agent_id
      WHERE i.status = 'confirmed' AND i.reviewed_at IS NULL
        AND i.confirmed_at < now() - interval '1 hour'
      ORDER BY i.confirmed_at LIMIT 20`,
  );

  for (const move of rows) {
    try {
      const before = await query<{ mcap_usd: number }>(
        `SELECT mcap_usd FROM market_snapshots
          WHERE agent_id = $1 AND created_at <= (SELECT confirmed_at FROM intents WHERE id = $2)
          ORDER BY created_at DESC LIMIT 1`,
        [move.agent_id, move.id],
      );
      const now = move.mint ? await getMarket(move.mint) : null;
      const mcapBefore = before.rows[0]?.mcap_usd ?? 0;
      const mcapAfter = now?.marketCapUsd ?? 0;
      const changePct = mcapBefore > 0 ? Math.round(((mcapAfter - mcapBefore) / mcapBefore) * 1000) / 10 : 0;

      await query(`UPDATE intents SET reviewed_at = now(), outcome = $2 WHERE id = $1`, [
        move.id, JSON.stringify({ mcapBefore, mcapAfter, changePct }),
      ]);

      await query(
        `INSERT INTO memories (agent_id, kind, body) VALUES ($1,'lesson',$2)`,
        [
          move.agent_id,
          `An hour after my ${move.kind}, market cap went from $${Math.round(mcapBefore)} to $${Math.round(mcapAfter)} (${changePct > 0 ? "+" : ""}${changePct}%).`,
        ],
      );
    } catch (err) {
      log.warn({ err, intentId: move.id }, "review failed");
    }
  }
}
