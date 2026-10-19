-- BUREAU — core schema.
-- Money is stored in integer base units (lamports / token atoms), never floats.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- agents
CREATE TYPE agent_status AS ENUM ('pending','launching','asleep_fees','asleep_floor','awake','paused','halted','failed');
CREATE TYPE agent_kind   AS ENUM ('builder','researcher','trader','creator','influencer','community','unbound','custom');

CREATE TABLE agents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text UNIQUE NOT NULL,
  name             text NOT NULL,
  ticker           text NOT NULL,
  description      text NOT NULL DEFAULT '',
  image_url        text,
  kind             agent_kind NOT NULL DEFAULT 'unbound',
  families         text[] NOT NULL DEFAULT '{}',
  powers           text[] NOT NULL DEFAULT '{}',
  model            text NOT NULL,
  instructions     text NOT NULL DEFAULT '',
  traits           text[] NOT NULL DEFAULT '{}',

  -- chain
  mint             text UNIQUE,
  quote_mint       text NOT NULL DEFAULT 'So11111111111111111111111111111111111111112',
  pair_symbol      text NOT NULL DEFAULT 'SOL',
  creator_wallet   text NOT NULL,              -- the launcher (dev)
  agent_wallet     text UNIQUE,                -- the agent's own wallet
  sharing_config   text,                       -- pump fee-sharing PDA
  fees_locked      boolean NOT NULL DEFAULT false,
  launch_sig       text,
  lock_sig         text,

  -- state
  status           agent_status NOT NULL DEFAULT 'pending',
  status_reason    text,
  paused_by_dev    boolean NOT NULL DEFAULT false,
  next_wake_at     timestamptz,
  last_wake_at     timestamptz,
  wake_count       integer NOT NULL DEFAULT 0,

  -- market cache (refreshed by the market worker)
  mcap_usd         numeric(20,2) NOT NULL DEFAULT 0,
  vol_1h_usd       numeric(20,2) NOT NULL DEFAULT 0,
  holders          integer NOT NULL DEFAULT 0,
  bonding_pct      numeric(5,2) NOT NULL DEFAULT 0,
  graduated        boolean NOT NULL DEFAULT false,
  fees_earned_lamports  bigint NOT NULL DEFAULT 0,

  links            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agents_status_idx    ON agents (status);
CREATE INDEX agents_mcap_idx      ON agents (mcap_usd DESC);
CREATE INDEX agents_created_idx   ON agents (created_at DESC);
CREATE INDEX agents_next_wake_idx ON agents (next_wake_at) WHERE status = 'awake';
CREATE INDEX agents_creator_idx   ON agents (creator_wallet);

-- Agent wallet keys live apart from the agent row and are encrypted at rest.
-- Only the signer process reads this table.
CREATE TABLE agent_keys (
  agent_id     uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  pubkey       text UNIQUE NOT NULL,
  enc_version  smallint NOT NULL DEFAULT 1,
  nonce        bytea NOT NULL,
  ciphertext   bytea NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- policy
-- Hard limits. Written by the platform, never by an agent.
CREATE TABLE agent_policy (
  agent_id              uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  max_per_move_lamports bigint  NOT NULL DEFAULT 200000000,   -- 0.2 SOL
  max_per_hour_lamports bigint  NOT NULL DEFAULT 500000000,   -- 0.5 SOL
  max_per_day_lamports  bigint  NOT NULL DEFAULT 2000000000,  -- 2 SOL
  reserve_floor_lamports bigint NOT NULL DEFAULT 50000000,    -- 0.05 SOL untouchable
  max_price_impact_bps  integer NOT NULL DEFAULT 300,         -- 3%
  max_slippage_bps      integer NOT NULL DEFAULT 150,
  allowed_assets        text[]  NOT NULL DEFAULT '{}',
  trading_enabled       boolean NOT NULL DEFAULT false,
  payouts_enabled       boolean NOT NULL DEFAULT false,
  burns_enabled         boolean NOT NULL DEFAULT false,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- money
CREATE TYPE intent_kind   AS ENUM ('buyback','sell','burn','swap','airdrop','fund_credits','transfer');
CREATE TYPE intent_status AS ENUM ('proposed','rejected','approved','signing','submitted','confirmed','failed');

CREATE TABLE intents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  wake_id       uuid,
  kind          intent_kind NOT NULL,
  params        jsonb NOT NULL,
  amount_lamports bigint NOT NULL DEFAULT 0,
  status        intent_status NOT NULL DEFAULT 'proposed',
  reject_reason text,
  signature     text,
  slot          bigint,
  confirmed_at  timestamptz,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intents_agent_idx  ON intents (agent_id, created_at DESC);
CREATE INDEX intents_status_idx ON intents (status);
-- spend windows are computed from confirmed intents
CREATE INDEX intents_spend_idx  ON intents (agent_id, confirmed_at) WHERE status = 'confirmed';

-- Confirmed on-chain movements only. The books never move before settlement.
CREATE TABLE ledger (
  id            bigserial PRIMARY KEY,
  agent_id      uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  intent_id     uuid REFERENCES intents(id),
  entry         text NOT NULL,              -- fee_claim | buyback | burn | airdrop | credits | platform | buyback_burn
  amount_lamports bigint NOT NULL,          -- signed: + in, - out
  mint          text,
  amount_atoms  numeric(40,0),
  signature     text,
  slot          bigint,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_agent_idx ON ledger (agent_id, created_at DESC);
CREATE UNIQUE INDEX ledger_sig_entry_idx ON ledger (signature, entry) WHERE signature IS NOT NULL;

-- ---------------------------------------------------------------- thinking
CREATE TABLE wakes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trigger      text NOT NULL,
  model        text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz,
  ok           boolean,
  error        text,
  tokens_in    integer NOT NULL DEFAULT 0,
  tokens_out   integer NOT NULL DEFAULT 0,
  cost_usd     numeric(12,6) NOT NULL DEFAULT 0
);
CREATE INDEX wakes_agent_idx ON wakes (agent_id, started_at DESC);

CREATE TABLE thoughts (
  id         bigserial PRIMARY KEY,
  agent_id   uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  wake_id    uuid REFERENCES wakes(id) ON DELETE CASCADE,
  phase      text NOT NULL,        -- observe | research | think | doubt | act | learn
  body       text NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX thoughts_agent_idx ON thoughts (agent_id, id DESC);
CREATE INDEX thoughts_feed_idx  ON thoughts (created_at DESC);

CREATE TABLE memories (
  id         bigserial PRIMARY KEY,
  agent_id   uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  kind       text NOT NULL,        -- lesson | promise | fact | person
  body       text NOT NULL,
  weight     real NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memories_agent_idx ON memories (agent_id, created_at DESC);

-- Notes the dev leaves; the agent reads them on its next wake.
CREATE TABLE dev_notes (
  id         bigserial PRIMARY KEY,
  agent_id   uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  body       text NOT NULL,
  consumed   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dev_notes_pending_idx ON dev_notes (agent_id) WHERE NOT consumed;

-- ---------------------------------------------------------------- platform
CREATE TABLE platform_stats (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),
  bureau_burned   numeric(40,0) NOT NULL DEFAULT 0,
  buyback_sol     bigint NOT NULL DEFAULT 0,
  buyback_count   integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_stats (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Generic job lock so several workers can run without stepping on each other.
CREATE TABLE job_locks (
  name       text PRIMARY KEY,
  locked_by  text NOT NULL,
  locked_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER agents_touch BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
