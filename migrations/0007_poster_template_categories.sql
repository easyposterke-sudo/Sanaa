CREATE TABLE poster_template_categories (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  inputs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_poster_template_categories_owner_updated
  ON poster_template_categories(owner_id, updated_at DESC);
