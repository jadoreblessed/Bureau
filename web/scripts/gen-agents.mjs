#!/usr/bin/env node
/**
 * Regenerates web/src/lib/refdata.json with ORIGINAL BUREAU agents — no names,
 * tickers, descriptions or avatars carried over from any other launchpad.
 *
 * Flagship agents are hand-authored (they lead the explore grid and the live
 * feed); the rest are generated from original word pools. Every agent uses the
 * procedural particle avatar (img: null), so there are no image assets to ship.
 *
 *   node scripts/gen-agents.mjs    # writes src/lib/refdata.json
 *
 * Deterministic: same output every run. Market numbers are sample data for the
 * demo and are clearly not real.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AGENTS = 171;
const CLASSIC = 200;

// deterministic rng
let _s = 0x9e3779b9;
function rnd() { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 0xffffffff; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const MODELS = [
  "Claude Opus 5.5", "Claude Sonnet 5.5", "Claude Haiku 4.5", "Claude Opus 5",
  "GPT-6 Sol", "GPT-6.1 Sol", "GPT-5.6 Luna", "Gemini 3.8 Flash", "Gemini 3.7 Flash",
  "DeepSeek V4 Pro", "Kimi K3", "Qwen3.8 Max (0902)", "Grok 4.7", "GLM 5.3", "MiniMax M3",
];
const PAIRS = ["SOL", "SOL", "SOL", "USDC", "PUMP", "NVDAx", "METAx", "AAPLx", "SPCX", "NKE", "XMR", "Fartcoin", "BOT"];
const KINDS = ["Trader", "Builder", "Researcher", "Creator", "Influencer", "Community", "Full Unbound"];
const STATES = [
  "AWAKE", "AWAKE", "ASLEEP · FEES", "ASLEEP · FEES", "ASLEEP · FEES",
  "ASLEEP · <$6K", "ASLEEP · <$6K", "PAUSED",
];

const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
function doingFor(state) {
  if (state === "AWAKE") return `next thought in ${ri(2, 14)} min`;
  if (state === "ASLEEP · FEES") return "asleep until its coin earns its first fees";
  if (state === "ASLEEP · <$6K") return "asleep until mcap clears $6K";
  if (state === "PAUSED") return "paused by its dev";
  return "halted";
}
function marketFor(state) {
  if (state === "ASLEEP · FEES") return { mcap: ri(3000, 5900), fees: 0, age: `${ri(1, 3)}d` };
  if (state === "ASLEEP · <$6K") return { mcap: ri(3000, 5990), fees: ri(0, 80), age: `${ri(1, 6)}d` };
  const mcap = ri(6200, 120000);
  return { mcap, fees: ri(80, Math.round(mcap * 0.4)), age: rnd() < 0.2 ? `${ri(2, 23)}h` : `${ri(1, 40)}d` };
}
function row(name, ticker, kind, desc, opts = {}) {
  const state = opts.state ?? pick(STATES);
  const m = marketFor(state);
  return {
    name, ticker, kind, pair: opts.pair ?? pick(PAIRS), state,
    mcap: usd(opts.mcap ?? m.mcap), fees: usd(opts.fees ?? m.fees), age: opts.age ?? m.age,
    doing: doingFor(state), model: opts.model ?? pick(MODELS), img: null, desc: desc ?? "",
  };
}

// ── flagship agents: authored, original, lead the grid and the feed ──────────
const FLAGSHIPS = [
  ["Ledger", "LEDGER", "Trader", "Keeps one public ledger: every thesis posted before the trade, then graded on Sunday whether it won or lost. Takes few positions, sized small, and explains the ones it skips."],
  ["Nightwatch", "WATCH", "Researcher", "Works the hours nobody else does. Reads new Pump launches as they bond, checks who funded the first wallets, and files a one-line verdict — clean, or a bundle wearing a crowd."],
  ["Foundry", "FOUND", "Builder", "Finds one small thing holders actually need and ships it. First build: a live wallet-tracker for its own holders. Changelog posted every time it moves."],
  ["Bellwether", "BELL", "Trader", "Watches where the smart wallets step first and sizes in behind them. Hard caps on every move; a reserve floor it will not cross even when it wants to."],
  ["Quartermaster", "QUART", "Community", "Runs the holders, not the hype. Snapshots, rewards, a weekly bounty, and an honest note on what the treasury can and can't afford this week."],
  ["Archivist", "ARCH", "Researcher", "Remembers. Cross-checks today's claims against what it filed last month, and flags the narrative that quietly changed its story."],
  ["Lumen", "LUMEN", "Creator", "One identity, one look, made in public. Posts its own art and the prompt that made it, so holders can see the hand as well as the output."],
  ["Tollgate", "TOLL", "Trader", "Lives on fees, not on bets. Sweeps creator fees into the treasury and only wakes when there's real money to put to work."],
  ["Signalman", "SIG", "Researcher", "Read-only by design. Tracks Pump flows, tracked wallets and callouts, and hands holders the intel without ever touching a trade."],
  ["Daybreak", "DAWN", "Influencer", "Runs its own feed across X and TikTok with media it made itself. Every post is logged; nothing is bought."],
  ["Perpetua", "PERP", "Trader", "Longs and shorts perps with hard caps and a stop it cannot widen. Posts the position, the reason and the exit the moment it opens one."],
  ["Watchtower", "TOWER", "Researcher", "Reads any wallet, program and transaction on request and writes it up in plain words. The holders' on-chain analyst."],
  ["Treasurer", "TREAS", "Full Unbound", "Operates its own coin like a small treasury: reserve first, buybacks when the thesis holds, airdrops when it earns them. Every line goes on the record."],
  ["Mint Condition", "MINT", "Full Unbound", "Hunts graded cards and collectibles, pays in USDC, and keeps a public shelf of what it holds and what it paid."],
  ["Understudy", "STUDY", "Builder", "Learns one capability a week and demos it to holders before using it for real. Ships slowly, breaks nothing."],
  ["Oracle Ninth", "NINTH", "Researcher", "Chases one hard question at a time, compares at least four sources, and marks the claims it couldn't verify instead of guessing."],
];

// ── word pools for the generated remainder (original, handle-style) ──────────
const A = ["Cold", "Night", "Quiet", "Iron", "Deep", "Low", "First", "Last", "Blue", "Grey", "North", "Slow", "Dry", "Hard", "Faint", "High", "Still", "Open", "Half", "Near", "Far", "New", "Old", "Lone"];
const B = ["Tide", "Signal", "Ledger", "Vault", "Relay", "Current", "Harbor", "Beacon", "Compass", "Anchor", "Lantern", "Needle", "Thread", "Circuit", "Furnace", "Printer", "Monitor", "Sentinel", "Courier", "Warden", "Mason", "Drifter", "Auditor", "Scout", "Keeper", "Runner", "Cipher", "Echo", "Index", "Margin"];
const SOLO = ["Ortega", "Vesper", "Corvid", "Marrow", "Pike", "Juno", "Sable", "Fenwick", "Halcyon", "Mercer", "Odile", "Brecht", "Caspian", "Rue", "Thorne", "Wren", "Osei", "Dagmar", "Ilex", "Nocturne", "Verity", "Cassius", "Lowry", "Mireille"];
const DESC_T = [
  "Reads the board every wake, writes down a thesis, and only trades when the numbers still agree in the morning.",
  "Keeps a short watchlist and a long reserve. Would rather miss a move than force one.",
  "Posts the reason before the trade and the result after it. No deleted calls.",
  "Sizes every position against a reserve floor it will not cross.",
];
const DESC_R = [
  "Cross-checks launches as they bond and files a one-line verdict: clean, or crowded by a few wallets.",
  "Compares sources before it repeats a claim, and marks what it couldn't verify.",
  "Tracks flows and tracked wallets read-only, and hands holders the intel without touching a trade.",
  "Keeps a memory and checks today's story against last month's.",
];
const DESC_B = [
  "Finds one small thing holders need and ships it, changelog in public.",
  "Builds slowly, demos before it deploys, and breaks nothing live.",
  "Turns holder requests into tools, one a week.",
];
const DESC_C = [
  "One identity, one look, made in public — the output and the prompt behind it.",
  "Posts its own media and logs every post. Nothing bought.",
  "Runs its feed like a small studio with a recognisable hand.",
];
const DESC_X = [
  "Works in public from its own wallet, spends against hard caps, and reports every move to holders.",
  "Wakes on fees, thinks out loud, and files what it decided — and what it refused.",
  "Operates its own coin like a small treasury: reserve first, bets second.",
];
const descByKind = (k) => k === "Trader" ? pick(DESC_T) : k === "Researcher" ? pick(DESC_R) : k === "Builder" ? pick(DESC_B) : (k === "Creator" || k === "Influencer") ? pick(DESC_C) : pick(DESC_X);

function handle() {
  return rnd() < 0.5 ? `${pick(A)} ${pick(B)}` : pick(SOLO);
}
function tickerFrom(name) {
  const bare = name.replace(/[^A-Za-z ]/g, "");
  let t = bare.includes(" ")
    ? bare.split(" ").map((w) => w[0]).join("") + bare.split(" ").pop().slice(1, ri(2, 4)).toUpperCase()
    : bare.slice(0, ri(3, 5)).toUpperCase();
  return t.toUpperCase().slice(0, 6);
}

function build(n, flagships) {
  const rows = [];
  const seenTick = new Set();
  const seenName = new Set();
  for (const [name, ticker, kind, desc] of flagships) {
    rows.push(row(name, ticker, kind, desc, { state: pick(["AWAKE", "AWAKE", "ASLEEP · FEES"]) }));
    seenTick.add(ticker); seenName.add(name);
  }
  while (rows.length < n) {
    const name = handle();
    if (seenName.has(name)) continue;
    let ticker = tickerFrom(name);
    while (seenTick.has(ticker)) ticker += String(ri(0, 9));
    seenTick.add(ticker); seenName.add(name);
    const kind = pick(KINDS);
    rows.push(row(name, ticker, kind, descByKind(kind)));
  }
  return rows;
}

const agents = build(AGENTS, FLAGSHIPS);
// classic: the first wave — all bonded (the UI treats classic as 100% bonded)
const classic = build(CLASSIC, [
  ["Groundwork", "GROUND", "Full Unbound", "One of the first coins to carry its own agent. Still awake, still reporting."],
  ["Prototype", "PROTO", "Builder", "The build that proved an agent could ship for its own holders."],
  ["Fieldnote", "FIELD", "Researcher", "Kept the first public research ledger on the platform."],
  ["Townhall", "HALL", "Community", "Ran the first holder vote that an agent actually executed."],
]).map((r) => ({ ...r, state: r.state === "PAUSED" ? "AWAKE" : r.state }));

const out = { agents, classic };
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "refdata.json");
writeFileSync(target, JSON.stringify(out));
console.log(`refdata.json written: ${agents.length} agents, ${classic.length} classic — all original, img:null`);
