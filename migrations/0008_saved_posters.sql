CREATE TABLE IF NOT EXISTS saved_posters (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  thumbnail_r2_key TEXT,
  thumbnail_media_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS saved_posters_owner_updated_idx
  ON saved_posters(owner_id, updated_at DESC);
