CREATE TABLE IF NOT EXISTS custom_elements (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS custom_elements_owner_created_idx
  ON custom_elements(owner_id, created_at DESC);
