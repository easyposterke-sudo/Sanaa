ALTER TABLE billing_wallets ADD COLUMN has_paid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_wallets ADD COLUMN monthly_until INTEGER;
ALTER TABLE billing_wallets ADD COLUMN monthly_balance_microusd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_wallets ADD COLUMN monthly_granted_microusd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_wallets ADD COLUMN monthly_period TEXT;
UPDATE billing_wallets SET has_paid = 1 WHERE EXISTS (
  SELECT 1 FROM billing_payments WHERE billing_payments.user_id = billing_wallets.user_id AND status = 'success'
);

ALTER TABLE billing_payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'credits';
ALTER TABLE ai_usage ADD COLUMN charged_microusd INTEGER NOT NULL DEFAULT 0;
UPDATE ai_usage SET charged_microusd = cost_microusd;

-- Keep pricing fixed at the time each request starts, even if a payment arrives
-- while it is running. Retain reservations to settle delayed responses once.
CREATE TABLE billing_ai_requests (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  multiplier INTEGER NOT NULL CHECK (multiplier IN (5, 8, 10)),
  monthly_period TEXT,
  settled INTEGER NOT NULL DEFAULT 0
);
