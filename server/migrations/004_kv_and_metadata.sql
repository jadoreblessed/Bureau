-- Small shared values the workers pass between each other (SOL price, cursors).
CREATE TABLE platform_kv (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agents ADD COLUMN metadata_uri text;
