CREATE TABLE IF NOT EXISTS billing_wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_microusd INTEGER NOT NULL DEFAULT 500000,
  spent_microusd INTEGER NOT NULL DEFAULT 0,
  active_request_id TEXT,
  active_until INTEGER
);

CREATE TABLE IF NOT EXISTS ai_usage (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_microusd INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_user_idx ON ai_usage(user_id, created_at);

CREATE TABLE IF NOT EXISTS billing_payments (
  reference TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  credit_microusd INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS billing_payments_user_idx ON billing_payments(user_id, created_at);

CREATE TABLE IF NOT EXISTS google_identities (
  sub TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS google_oauth_states (
  state TEXT PRIMARY KEY,
  linking_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS google_login_tickets (
  ticket TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
