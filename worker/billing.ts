export type AiUsage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } };

const TRIAL_MICROUSD = 500_000;
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
  const row = await db.prepare('SELECT balance_microusd, spent_microusd, active_request_id FROM billing_wallets WHERE user_id = ?').bind(userId)
    .first<{ balance_microusd: number; spent_microusd: number; active_request_id: string | null }>();
  return { balanceMicrousd: row?.balance_microusd ?? TRIAL_MICROUSD, spentMicrousd: row?.spent_microusd ?? 0, busy: Boolean(row?.active_request_id) };
}

export async function reserveAi(db: D1Database, userId: string, requestId: string) {
  await wallet(db, userId);
  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare(`UPDATE billing_wallets SET active_request_id = ?, active_until = ?
    WHERE user_id = ? AND balance_microusd > 0 AND (active_request_id IS NULL OR active_until < ?)`)
    .bind(requestId, now + 180, userId, now).run();
  return result.meta.changes > 0;
}

export async function settleAi(db: D1Database, userId: string, requestId: string, model: string, usage?: AiUsage) {
  if (!usage) {
    await db.prepare('UPDATE billing_wallets SET active_request_id = NULL, active_until = NULL WHERE user_id = ? AND active_request_id = ?')
      .bind(userId, requestId).run();
    return;
  }
  const charge = usageCost(usage, model);
  await db.batch([
    db.prepare(`INSERT INTO ai_usage (request_id, user_id, model, input_tokens, cached_input_tokens, output_tokens, cost_microusd, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(requestId, userId, model, charge.input, charge.cached, charge.output, charge.cost, new Date().toISOString()),
    db.prepare(`UPDATE billing_wallets SET balance_microusd = MAX(0, balance_microusd - ?), spent_microusd = spent_microusd + ?, active_request_id = NULL, active_until = NULL
      WHERE user_id = ? AND active_request_id = ?`).bind(charge.cost, charge.cost, userId, requestId),
  ]);
}

export async function creditVerifiedPayment(db: D1Database, reference: string, amount: number, currency: string, status: string) {
  const payment = await db.prepare('SELECT user_id, amount_minor FROM billing_payments WHERE reference = ?').bind(reference).first<{ user_id: string; amount_minor: number }>();
  if (!payment || payment.amount_minor !== amount || currency !== 'KES' || status !== 'success') return false;
  await wallet(db, payment.user_id);
  await db.batch([
    db.prepare(`UPDATE billing_wallets SET balance_microusd = balance_microusd +
      (SELECT credit_microusd FROM billing_payments WHERE reference = ?)
      WHERE user_id = (SELECT user_id FROM billing_payments WHERE reference = ? AND status = 'pending')`).bind(reference, reference),
    db.prepare(`UPDATE billing_payments SET status = 'success', paid_at = ? WHERE reference = ? AND status = 'pending'`)
      .bind(new Date().toISOString(), reference),
  ]);
  return true;
}
