CREATE TABLE IF NOT EXISTS ai_poster_plans (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  openai_request_id TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  UNIQUE(owner_id, cache_key)
);

CREATE INDEX IF NOT EXISTS ai_poster_plans_owner_used_idx
  ON ai_poster_plans(owner_id, last_used_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  owner_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  generation_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, usage_date)
);
