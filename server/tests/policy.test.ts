import { test } from "node:test";
import assert from "node:assert/strict";
import { check, priceImpactBps, DEFAULT_LIMITS, type Context, type Intent } from "../src/policy/engine.ts";

const ctx = (over: Partial<Context> = {}): Context => ({
  moneyEnabled: true,
  agentBalanceLamports: 1_000_000_000,
  spentLastHourLamports: 0,
  spentLastDayLamports: 0,
  totalSpentLamports: 0,
  maxTotalLamports: 0,
  ownMint: "OWN",
  agentActive: true,
  limits: { ...DEFAULT_LIMITS, tradingEnabled: true, payoutsEnabled: true, burnsEnabled: true },
  ...over,
});

const buyback = (over: Partial<Intent> = {}): Intent => ({
  kind: "buyback",
  amountLamports: 100_000_000,
  mint: "OWN",
  poolReserveLamports: 100_000_000_000,
  slippageBps: 100,
  ...over,
});

test("allows a buyback inside every limit", () => {
  const d = check(buyback(), ctx());
  assert.equal(d.ok, true);
});

test("refuses everything financial when money is off", () => {
  const d = check(buyback(), ctx({ moneyEnabled: false }));
  assert.equal(d.ok, false);
  assert.equal(d.ok === false && d.rule, "money_disabled");
});

test("refuses while the agent is paused", () => {
  const d = check(buyback(), ctx({ agentActive: false }));
  assert.equal(d.ok === false && d.rule, "agent_inactive");
});

test("enforces the per-move cap", () => {
  const d = check(buyback({ amountLamports: 300_000_000 }), ctx());
  assert.equal(d.ok === false && d.rule, "cap_per_move");
});

test("enforces the hourly cap across moves", () => {
  const d = check(buyback({ amountLamports: 200_000_000 }), ctx({ spentLastHourLamports: 400_000_000 }));
  assert.equal(d.ok === false && d.rule, "cap_per_hour");
});

test("enforces the daily cap", () => {
  const d = check(buyback({ amountLamports: 100_000_000 }), ctx({ spentLastDayLamports: 1_950_000_000 }));
  assert.equal(d.ok === false && d.rule, "cap_per_day");
});

test("never spends through the reserve floor", () => {
  const d = check(buyback({ amountLamports: 100_000_000 }), ctx({ agentBalanceLamports: 120_000_000 }));
  assert.equal(d.ok === false && d.rule, "reserve_floor");
});

test("refuses more than the agent holds", () => {
  const d = check(buyback({ amountLamports: 150_000_000 }), ctx({ agentBalanceLamports: 100_000_000 }));
  assert.equal(d.ok === false && d.rule, "insufficient_balance");
});

test("refuses a trade with no reserve to size against", () => {
  const d = check(buyback({ poolReserveLamports: undefined }), ctx());
  assert.equal(d.ok === false && d.rule, "impact_unknown");
});

test("refuses a trade that would move the price too far", () => {
  const d = check(buyback({ amountLamports: 100_000_000, poolReserveLamports: 1_000_000_000 }), ctx());
  assert.equal(d.ok === false && d.rule, "price_impact");
});

test("refuses an asset that is not on the list", () => {
  const d = check(buyback({ mint: "SOMETHING_ELSE" }), ctx());
  assert.equal(d.ok === false && d.rule, "asset_not_allowed");
});

test("allows an asset once it is listed", () => {
  const c = ctx();
  c.limits.allowedAssets = ["SOMETHING_ELSE"];
  const d = check(buyback({ mint: "SOMETHING_ELSE" }), c);
  assert.equal(d.ok, true);
});

test("never allows a free transfer", () => {
  const d = check({ kind: "transfer", amountLamports: 1_000, destination: "ATTACKER" }, ctx());
  assert.equal(d.ok === false && d.rule, "transfer_forbidden");
});

test("airdrops cannot name their own destination", () => {
  const d = check({ kind: "airdrop", amountLamports: 1_000_000, destination: "ATTACKER" }, ctx());
  assert.equal(d.ok === false && d.rule, "airdrop_destination");
});

test("respects per-capability switches", () => {
  const c = ctx();
  c.limits.payoutsEnabled = false;
  const d = check({ kind: "airdrop", amountLamports: 1_000_000 }, c);
  assert.equal(d.ok === false && d.rule, "payouts_disabled");
});

test("rejects nonsense amounts", () => {
  for (const bad of [-1, 1.5, NaN, Infinity]) {
    const d = check(buyback({ amountLamports: bad }), ctx());
    assert.equal(d.ok === false && d.rule, "bad_amount", `amount ${bad}`);
  }
});

test("no deployment ceiling by default", () => {
  const d = check(buyback({ amountLamports: 100_000_000 }), ctx({ totalSpentLamports: 9_000_000_000, maxTotalLamports: 0 }));
  assert.equal(d.ok, true);
});

test("enforces the deployment spend ceiling", () => {
  const d = check(buyback({ amountLamports: 30_000_000 }), ctx({ totalSpentLamports: 30_000_000, maxTotalLamports: 50_000_000 }));
  assert.equal(d.ok === false && d.rule, "cap_total");
});

test("allows a move that stays under the ceiling", () => {
  const d = check(buyback({ amountLamports: 10_000_000 }), ctx({ totalSpentLamports: 30_000_000, maxTotalLamports: 50_000_000 }));
  assert.equal(d.ok, true);
});

test("price impact grows with size", () => {
  assert.equal(priceImpactBps(0, 1_000), 0);
  assert.ok(priceImpactBps(100, 1_000) < priceImpactBps(500, 1_000));
  assert.equal(priceImpactBps(100, 0), 10_000);
});
