CREATE TABLE IF NOT EXISTS poster_templates (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('church', 'conference', 'business', 'event', 'general')),
  description TEXT,
  r2_key TEXT NOT NULL UNIQUE,
  thumbnail_r2_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS poster_templates_updated_idx
  ON poster_templates(updated_at DESC);

CREATE INDEX IF NOT EXISTS poster_templates_owner_updated_idx
  ON poster_templates(owner_id, updated_at DESC);
