import { BILLING, toCredits } from '../shared/billing';

export type AiUsage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } };
const LUNA_RATES = { input: 0.20, cached: 0.02, output: 1.20, cacheWrite: 0.25 };

export function usageCost(usage: AiUsage, model: string): { input: number; cached: number; output: number; cost: number } {
  if (model !== 'gpt-5.6-luna') throw new Error('Billing rates are not configured for this OpenAI model.');
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const cacheWrite = usage.input_tokens_details?.cache_write_tokens ?? 0;
  if (![input, output, cached, cacheWrite].every(value => Number.isSafeInteger(value) && value! >= 0) || input === undefined || output === undefined || cached + cacheWrite > input) {
    throw new Error('OpenAI did not return valid token usage.');
  }
  const longContext = input > 272_000;
  const cost = Math.ceil(
    ((input - cached - cacheWrite) * LUNA_RATES.input + cached * LUNA_RATES.cached + cacheWrite * LUNA_RATES.cacheWrite) * (longContext ? 2 : 1)
    + output * LUNA_RATES.output * (longContext ? 1.5 : 1),
  );
  return { input, cached, output, cost };
}

export async function wallet(db: D1Database, userId: string) {
  await db.prepare('INSERT OR IGNORE INTO billing_wallets (user_id) VALUES (?)').bind(userId).run();
  const row = await db.prepare('SELECT * FROM billing_wallets WHERE user_id = ?').bind(userId)
    .first<{ balance_microusd: number; spent_microusd: number; active_request_id: string | null; active_until: number | null;
      has_paid: number; monthly_until: number | null; monthly_balance_microusd: number; monthly_granted_microusd: number }>();
  if (!row) throw new Error('Could not load billing wallet.');
  const now = Math.floor(Date.now() / 1000);
  const monthlyActive = (row.monthly_until ?? 0) > now;
  return {
    balanceMicrousd: row.balance_microusd, spentMicrousd: row.spent_microusd,
    balanceCredits: toCredits(row.balance_microusd), spentCredits: toCredits(row.spent_microusd),
    busy: Boolean(row.active_request_id && (row.active_until ?? 0) >= now),
    plan: monthlyActive ? 'monthly' as const : row.has_paid ? 'paid' as const : 'trial' as const,
    trialUsedPercent: Math.max(0, Math.min(100, (BILLING.trialMicrousd - row.balance_microusd) * 100 / BILLING.trialMicrousd)),
    monthly: { active: monthlyActive, expiresAt: row.monthly_until ? new Date(row.monthly_until * 1000).toISOString() : null,
      balanceCredits: monthlyActive ? toCredits(row.monthly_balance_microusd) : 0,
      allowanceCredits: monthlyActive ? toCredits(row.monthly_granted_microusd) : toCredits(BILLING.monthlyMicrousd),
      usedPercent: monthlyActive && row.monthly_granted_microusd > 0
        ? Math.min(100, (row.monthly_granted_microusd - row.monthly_balance_microusd) * 100 / row.monthly_granted_microusd) : 100 },
  };
}

export async function reserveAi(db: D1Database, userId: string, requestId: string) {
  await wallet(db, userId);
  const now = Math.floor(Date.now() / 1000);
  const result = await db.batch([
    db.prepare(`UPDATE billing_wallets SET active_request_id = ?, active_until = ?
      WHERE user_id = ? AND (balance_microusd > 0 OR (monthly_until > ? AND monthly_balance_microusd > 0))
      AND (active_request_id IS NULL OR active_until < ?)
      AND NOT EXISTS (SELECT 1 FROM billing_ai_requests WHERE request_id = ?)`)
      .bind(requestId, now + 180, userId, now, now, requestId),
    db.prepare(`INSERT OR IGNORE INTO billing_ai_requests (request_id, user_id, multiplier, monthly_period)
      SELECT ?, user_id, CASE WHEN monthly_until > ? AND monthly_balance_microusd > 0 THEN ? WHEN has_paid = 1 THEN ? ELSE ? END, monthly_period
      FROM billing_wallets WHERE user_id = ? AND active_request_id = ?`)
      .bind(requestId, now, BILLING.monthlyMultiplier, BILLING.paidMultiplier, BILLING.trialMultiplier, userId, requestId),
  ]);
  return result[1]!.meta.changes > 0;
}

export async function settleAi(db: D1Database, userId: string, requestId: string, model: string, usage?: AiUsage) {
  if (!usage) {
    await db.batch([
      db.prepare('UPDATE billing_wallets SET active_request_id = NULL, active_until = NULL WHERE user_id = ? AND active_request_id = ?').bind(userId, requestId),
      db.prepare('UPDATE billing_ai_requests SET settled = 1 WHERE user_id = ? AND request_id = ?').bind(userId, requestId),
    ]);
    return;
  }
  const charge = usageCost(usage, model);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO ai_usage (request_id, user_id, model, input_tokens, cached_input_tokens, output_tokens, cost_microusd, charged_microusd, created_at)
      SELECT request_id, user_id, ?, ?, ?, ?, ?, ? * multiplier, ? FROM billing_ai_requests
      WHERE request_id = ? AND user_id = ? AND settled = 0`)
      .bind(model, charge.input, charge.cached, charge.output, charge.cost, charge.cost, new Date().toISOString(), requestId, userId),
    db.prepare(`UPDATE billing_wallets SET
      balance_microusd = MAX(0, balance_microusd - CASE WHEN (SELECT multiplier FROM billing_ai_requests WHERE request_id = ?) = 8 THEN 0 ELSE (SELECT charged_microusd FROM ai_usage WHERE request_id = ?) END),
      monthly_balance_microusd = MAX(0, monthly_balance_microusd - CASE WHEN EXISTS (SELECT 1 FROM billing_ai_requests WHERE request_id = ? AND multiplier = 8 AND monthly_period = billing_wallets.monthly_period) THEN (SELECT charged_microusd FROM ai_usage WHERE request_id = ?) ELSE 0 END),
      spent_microusd = spent_microusd + (SELECT charged_microusd FROM ai_usage WHERE request_id = ?),
      active_until = CASE WHEN active_request_id = ? THEN NULL ELSE active_until END,
      active_request_id = CASE WHEN active_request_id = ? THEN NULL ELSE active_request_id END
      WHERE user_id = ? AND EXISTS (SELECT 1 FROM billing_ai_requests WHERE request_id = ? AND user_id = ? AND settled = 0)
      AND EXISTS (SELECT 1 FROM ai_usage WHERE request_id = ?)`)
      .bind(requestId, requestId, requestId, requestId, requestId, requestId, requestId, userId, requestId, userId, requestId),
    db.prepare('UPDATE billing_ai_requests SET settled = 1 WHERE request_id = ? AND user_id = ?').bind(requestId, userId),
  ]);
}

export async function creditVerifiedPayment(db: D1Database, reference: string, amount: number, currency: string, status: string) {
  const payment = await db.prepare('SELECT user_id, amount_minor FROM billing_payments WHERE reference = ?').bind(reference).first<{ user_id: string; amount_minor: number }>();
  if (!payment || payment.amount_minor !== amount || currency !== 'KES' || status !== 'success') return false;
  await wallet(db, payment.user_id);
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(`UPDATE billing_wallets SET has_paid = 1, balance_microusd = balance_microusd +
      (SELECT credit_microusd FROM billing_payments WHERE reference = ?)
      WHERE user_id = (SELECT user_id FROM billing_payments WHERE reference = ? AND status = 'pending' AND kind = 'credits')`).bind(reference, reference),
    db.prepare(`UPDATE billing_wallets SET has_paid = 1,
      monthly_balance_microusd = CASE WHEN monthly_until > ? THEN monthly_balance_microusd ELSE 0 END + ?,
      monthly_granted_microusd = CASE WHEN monthly_until > ? THEN monthly_granted_microusd ELSE 0 END + ?,
      monthly_period = CASE WHEN monthly_until > ? THEN monthly_period ELSE ? END,
      monthly_until = CAST(strftime('%s', MAX(COALESCE(monthly_until, 0), ?), 'unixepoch', '+1 month', 'floor') AS INTEGER)
      WHERE user_id = (SELECT user_id FROM billing_payments WHERE reference = ? AND status = 'pending' AND kind = 'monthly')`)
      .bind(now, BILLING.monthlyMicrousd, now, BILLING.monthlyMicrousd, now, reference, now, reference),
    db.prepare(`UPDATE billing_payments SET status = 'success', paid_at = ? WHERE reference = ? AND status = 'pending'`)
      .bind(new Date().toISOString(), reference),
  ]);
  return true;
}
