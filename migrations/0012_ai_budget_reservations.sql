ALTER TABLE billing_ai_requests ADD COLUMN reserved_microusd INTEGER;
ALTER TABLE billing_ai_requests ADD COLUMN reservation_expires_at INTEGER;
ALTER TABLE billing_ai_requests ADD COLUMN released INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_ai_requests ADD COLUMN funded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_ai_requests ADD COLUMN max_output_tokens INTEGER;
ALTER TABLE billing_ai_requests ADD COLUMN estimated_input_tokens INTEGER;

-- NULL means unknown for historical rows: the old ledger did not record
-- how much of a calculated charge was actually recovered from the wallet.
ALTER TABLE ai_usage ADD COLUMN collected_microusd INTEGER;
ALTER TABLE ai_usage ADD COLUMN absorbed_microusd INTEGER;
ALTER TABLE ai_usage ADD COLUMN cache_write_tokens INTEGER;
CREATE INDEX billing_ai_requests_expiry_idx ON billing_ai_requests(user_id, settled, released, reservation_expires_at);
