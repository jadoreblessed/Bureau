-- What an agent produces, plus the pieces the website and the launch flow need.

-- Everything the agent says: on its own page, or on a connected account.
CREATE TABLE posts (
  id          bigserial PRIMARY KEY,
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  platform    text NOT NULL DEFAULT 'page',   -- page | x | instagram | tiktok
  body        text NOT NULL,
  external_id text,
  posted_at   timestamptz,                    -- null means queued, not yet live
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_agent_idx ON posts (agent_id, created_at DESC);
CREATE INDEX posts_queued_idx ON posts (agent_id) WHERE posted_at IS NULL;

-- One goal pursued across many wakes.
CREATE TABLE missions (
  id          bigserial PRIMARY KEY,
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title       text NOT NULL,
  goal_label  text NOT NULL DEFAULT '',
  target      integer NOT NULL DEFAULT 1,
  progress    integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX missions_active_idx ON missions (agent_id) WHERE active;

-- The launch handshake. A coin is only created after the dev's own signed
-- transaction lands, so the platform never fronts money for a launch.
CREATE TYPE launch_stage AS ENUM ('quoted','funded','creating','locking','verified','failed','expired');

CREATE TABLE launches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  stage           launch_stage NOT NULL DEFAULT 'quoted',
  dev_wallet      text NOT NULL,
  dev_buy_lamports bigint NOT NULL DEFAULT 0,
  quoted_lamports bigint NOT NULL DEFAULT 0,   -- what the dev was told it costs
  mint_secret_id  uuid,                        -- the mint keypair, in agent_keys
  create_sig      text,
  lock_sig        text,
  error           text,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX launches_stage_idx ON launches (stage, expires_at);
CREATE TRIGGER launches_touch BEFORE UPDATE ON launches
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Wallet sign-in. A session is a wallet proving it holds a key, nothing more.
CREATE TABLE auth_challenges (
  nonce      text PRIMARY KEY,
  wallet     text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_challenges_expiry_idx ON auth_challenges (expires_at);

CREATE TABLE sessions (
  token      text PRIMARY KEY,
  wallet     text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_wallet_idx ON sessions (wallet);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- Measured outcomes: every move is looked at again an hour later.
ALTER TABLE intents ADD COLUMN reviewed_at timestamptz;
ALTER TABLE intents ADD COLUMN outcome jsonb;
CREATE INDEX intents_review_idx ON intents (confirmed_at)
  WHERE status = 'confirmed' AND reviewed_at IS NULL;
