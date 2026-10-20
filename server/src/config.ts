import { z } from "zod";

/**
 * Every setting the services read, validated once at boot.
 * Nothing below has a default that would move real money on mainnet.
 */
const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8080),
  SIGNER_PORT: z.coerce.number().default(8081),
  SIGNER_HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.string().default("info"),
  PUBLIC_URL: z.string().url().default("http://localhost:8080"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:4173"),

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  // ---------------------------------------------------------------- chain
  SOLANA_CLUSTER: z.enum(["devnet", "mainnet-beta"]).default("devnet"),
  SOLANA_RPC_URL: z.string().url(),
  SOLANA_RPC_WS: z.string().url().optional(),

  /** Pays network fees for upkeep (fee sweeps, buybacks). Never holds agent funds. */
  PLATFORM_PAYER_SECRET: z.string().min(32),
  /** 32 bytes, base64. Seals agent wallet keys at rest. openssl rand -base64 32 */
  MASTER_KEY: z.string().min(40),

  // Wallets that receive the non-agent shares. Must all differ.
  PLATFORM_FEE_WALLET: z.string().min(32),
  CREDITS_WALLET: z.string().min(32),
  BUYBACK_WALLET: z.string().min(32),
  /** $BUREAU mint, for buyback + burn. Empty until the token is live. */
  BUREAU_MINT: z.string().optional(),

  // Creator fee split, locked on chain at launch. Must total 10000.
  SHARE_AGENT_BPS: z.coerce.number().int().min(0).max(10_000).default(8_500),
  SHARE_PLATFORM_BPS: z.coerce.number().int().min(0).max(10_000).default(500),
  SHARE_CREDITS_BPS: z.coerce.number().int().min(0).max(10_000).default(500),
  SHARE_BUYBACK_BPS: z.coerce.number().int().min(0).max(10_000).default(500),

  // ---------------------------------------------------------------- models
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().default(120_000),

  // Optional research providers; each tool turns itself off without a key.
  SEARCH_PROVIDER: z.enum(["none", "brave", "tavily", "exa"]).default("none"),
  SEARCH_API_KEY: z.string().optional(),
  X_BEARER_TOKEN: z.string().optional(),

  // ---------------------------------------------------------------- risk
  /**
   * Master switch for anything that moves funds. Off means agents think,
   * research and write, but every financial intent is refused by the policy
   * engine before it reaches the signer.
   */
  MONEY_ENABLED: bool.default(false),
  /** Posting to connected social accounts. */
  SOCIAL_ENABLED: bool.default(false),
  /** Creating real coins. Off means the launch flow stops before the chain. */
  LAUNCH_ENABLED: bool.default(false),

  // ---------------------------------------------------------------- limits
  WAKE_THRESHOLD_USD: z.coerce.number().default(20),
  MCAP_FLOOR_USD: z.coerce.number().default(6_000),
  WAKE_INTERVAL_MIN: z.coerce.number().default(12),
  MAX_WAKE_SECONDS: z.coerce.number().default(120),
  MAX_TOOL_CALLS_PER_WAKE: z.coerce.number().default(12),

  DEFAULT_MAX_PER_MOVE_LAMPORTS: z.coerce.number().default(200_000_000),
  DEFAULT_MAX_PER_HOUR_LAMPORTS: z.coerce.number().default(500_000_000),
  DEFAULT_MAX_PER_DAY_LAMPORTS: z.coerce.number().default(2_000_000_000),
  DEFAULT_RESERVE_FLOOR_LAMPORTS: z.coerce.number().default(50_000_000),
  DEFAULT_MAX_PRICE_IMPACT_BPS: z.coerce.number().default(300),

  // Deployment-wide spend ceiling across ALL agents, ever, in lamports.
  // 0 = no ceiling (production). For a bounded test set it low, e.g. 20000000
  // (0.02 SOL), and the agents collectively cannot spend past it.
  MAX_TOTAL_SPEND_LAMPORTS: z.coerce.number().default(0),

  // ---------------------------------------------------------------- launch
  LAUNCH_SLIPPAGE_BPS: z.coerce.number().default(500),
  MAX_DEV_BUY_LAMPORTS: z.coerce.number().default(10_000_000_000),
  LAUNCH_TTL_MIN: z.coerce.number().default(30),

  // ---------------------------------------------------------------- auth
  SESSION_TTL_HOURS: z.coerce.number().default(168),
  SIGNER_URL: z.string().url().default("http://localhost:8081"),
  SIGNER_TOKEN: z.string().min(24),

  // ---------------------------------------------------------------- admin
  /** Bearer token for /admin (site settings). Unset = admin disabled. openssl rand -hex 24 */
  ADMIN_TOKEN: z.string().min(24).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
  console.error("Bad environment:\n" + lines.join("\n") + "\n\nSee .env.example.");
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === "production";
export const isMainnet = config.SOLANA_CLUSTER === "mainnet-beta";

const shareTotal =
  config.SHARE_AGENT_BPS + config.SHARE_PLATFORM_BPS + config.SHARE_CREDITS_BPS + config.SHARE_BUYBACK_BPS;
if (shareTotal !== 10_000) {
  console.error(`Creator fee shares must total 10000 bps, got ${shareTotal}`);
  process.exit(1);
}

/** Pump program ids. Overridable so devnet deployments can differ. */
export const PUMP = {
  program: process.env.PUMP_PROGRAM ?? "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  fees: process.env.PUMP_FEES_PROGRAM ?? "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ",
  amm: process.env.PUMP_AMM_PROGRAM ?? "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
} as const;

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export const corsOrigins = config.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
