-- A small price history so the coin page can draw a chart without an indexer.
CREATE TABLE market_snapshots (
  id          bigserial PRIMARY KEY,
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  price_usd   numeric(24,12) NOT NULL DEFAULT 0,
  mcap_usd    numeric(20,2) NOT NULL DEFAULT 0,
  vol_1h_usd  numeric(20,2) NOT NULL DEFAULT 0,
  liquidity_usd numeric(20,2) NOT NULL DEFAULT 0,
  holders     integer NOT NULL DEFAULT 0,
  bonding_pct numeric(5,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_snapshots_agent_idx ON market_snapshots (agent_id, created_at DESC);

-- Keep it bounded: one row per agent per 5 minutes is plenty for a chart.
CREATE UNIQUE INDEX market_snapshots_bucket_idx
  ON market_snapshots (agent_id, date_trunc('hour', created_at AT TIME ZONE 'UTC'), (EXTRACT(MINUTE FROM created_at AT TIME ZONE 'UTC')::int / 5));
