import { BILLING, toCredits } from '../shared/billing';
import { OpenAiPlannerError } from './ai/openAiPosterPlanner';

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
  // Integer hundredths of a microdollar avoid floating-point rounding overcharges.
  const cost = Math.ceil((
    ((input - cached - cacheWrite) * (LUNA_RATES.input * 100) + cached * (LUNA_RATES.cached * 100) + cacheWrite * (LUNA_RATES.cacheWrite * 100)) * (longContext ? 2 : 1)
    + output * (LUNA_RATES.output * 100) * (longContext ? 1.5 : 1)
  ) / 100);
  return { input, cached, output, cost };
}

export async function wallet(db: D1Database, userId: string) {
  await db.prepare('INSERT OR IGNORE INTO billing_wallets (user_id) VALUES (?)').bind(userId).run();
  await releaseExpiredReservations(db, userId);
  const row = await db.prepare(`SELECT w.*,
    COALESCE((SELECT SUM(reserved_microusd) FROM billing_ai_requests r WHERE r.user_id = w.user_id AND settled = 0 AND released = 0 AND multiplier != 8), 0) AS held_microusd,
    COALESCE((SELECT SUM(reserved_microusd) FROM billing_ai_requests r WHERE r.user_id = w.user_id AND settled = 0 AND released = 0 AND multiplier = 8 AND r.monthly_period = w.monthly_period), 0) AS monthly_held_microusd
    FROM billing_wallets w WHERE user_id = ?`).bind(userId)
    .first<{ balance_microusd: number; spent_microusd: number; active_request_id: string | null; active_until: number | null;
      has_paid: number; monthly_until: number | null; monthly_balance_microusd: number; monthly_granted_microusd: number; held_microusd: number; monthly_held_microusd: number }>();
  if (!row) throw new Error('Could not load billing wallet.');
  const now = Math.floor(Date.now() / 1000);
  const monthlyActive = (row.monthly_until ?? 0) > now;
  return {
    balanceMicrousd: row.balance_microusd, spentMicrousd: row.spent_microusd,
    balanceCredits: toCredits(row.balance_microusd), spentCredits: toCredits(row.spent_microusd),
    reservedCredits: toCredits(row.held_microusd + row.monthly_held_microusd),
    busy: Boolean(row.active_request_id && (row.active_until ?? 0) >= now),
    plan: monthlyActive ? 'monthly' as const : row.has_paid ? 'paid' as const : 'trial' as const,
    trialUsedPercent: Math.max(0, Math.min(100, (BILLING.trialMicrousd - row.balance_microusd - row.held_microusd) * 100 / BILLING.trialMicrousd)),
    monthly: { active: monthlyActive, expiresAt: row.monthly_until ? new Date(row.monthly_until * 1000).toISOString() : null,
      balanceCredits: monthlyActive ? toCredits(row.monthly_balance_microusd) : 0,
      allowanceCredits: monthlyActive ? toCredits(row.monthly_granted_microusd) : toCredits(BILLING.monthlyMicrousd),
      usedPercent: monthlyActive && row.monthly_granted_microusd > 0
        ? Math.min(100, (row.monthly_granted_microusd - row.monthly_balance_microusd - row.monthly_held_microusd) * 100 / row.monthly_granted_microusd) : 100 },
  };
}

export type AiBudget = { inputTokens: number; maxOutputTokens: number; reservedMicrousd: number; maximumCredits: number; multiplier: number; tier: 'trial' | 'paid' | 'monthly'; limited: boolean };

export type AiOperation = 'generation' | 'reference' | 'edit';

export async function reserveAi(db: D1Database, userId: string, requestId: string, operation: AiOperation = 'generation', budget?: AiBudget) {
  await wallet(db, userId);
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + BILLING.aiReservationSeconds;
  const minimum = Math.max(operation === 'edit' ? 1 : BILLING.minimumGenerationCredits * BILLING.microusdPerCredit, budget?.reservedMicrousd ?? 0);
  const result = await db.batch([
    db.prepare(`UPDATE billing_wallets SET active_request_id = ?, active_until = ?
      WHERE user_id = ? AND (balance_microusd >= ? OR (monthly_until > ? AND monthly_balance_microusd >= ?))
      AND (active_request_id IS NULL OR active_until < ?)
      AND NOT EXISTS (SELECT 1 FROM billing_ai_requests WHERE request_id = ?)
      AND (? IS NULL OR CASE WHEN ? = 8 THEN monthly_until > ? AND monthly_balance_microusd >= ?
        ELSE balance_microusd >= ? AND CASE WHEN has_paid = 1 THEN 10 ELSE 5 END = ? END)`)
      .bind(requestId, expiry, userId, minimum, now, minimum, now, requestId, budget?.multiplier ?? null,
        budget?.multiplier ?? null, now, minimum, minimum, budget?.multiplier ?? null),
    db.prepare(`INSERT OR IGNORE INTO billing_ai_requests
      (request_id, user_id, multiplier, monthly_period, reserved_microusd, reservation_expires_at, max_output_tokens, estimated_input_tokens)
      SELECT ?, user_id, COALESCE(?, CASE WHEN monthly_until > ? AND monthly_balance_microusd >= ? THEN ? WHEN has_paid = 1 THEN ? ELSE ? END),
        monthly_period, ?, ?, ?, ? FROM billing_wallets WHERE user_id = ? AND active_request_id = ?`)
      .bind(requestId, budget?.multiplier ?? null, now, minimum, BILLING.monthlyMultiplier, BILLING.paidMultiplier, BILLING.trialMultiplier,
        budget?.reservedMicrousd ?? null, budget ? expiry : null, budget?.maxOutputTokens ?? null, budget?.inputTokens ?? null, userId, requestId),
    db.prepare(`UPDATE billing_wallets SET
      balance_microusd = balance_microusd - CASE WHEN ? = 8 THEN 0 ELSE ? END,
      monthly_balance_microusd = monthly_balance_microusd - CASE WHEN ? = 8 THEN ? ELSE 0 END
      WHERE user_id = ? AND active_request_id = ? AND EXISTS
      (SELECT 1 FROM billing_ai_requests WHERE request_id = ? AND reserved_microusd IS NOT NULL AND funded = 0 AND released = 0 AND settled = 0)`)
      .bind(budget?.multiplier ?? null, budget?.reservedMicrousd ?? 0, budget?.multiplier ?? null, budget?.reservedMicrousd ?? 0, userId, requestId, requestId),
    db.prepare('UPDATE billing_ai_requests SET funded = 1 WHERE request_id = ? AND user_id = ? AND reserved_microusd IS NOT NULL AND funded = 0 AND settled = 0 AND released = 0').bind(requestId, userId),
  ]);
  return result[1]!.meta.changes > 0;
}

/** Cache writes are the most expensive input category. Reserve at that rate,
 * with 5% input headroom; cached reads can only reduce the final charge. */
export function budgetForTokens(inputTokens: number, outputLimit: number, available: number, multiplier: number): AiBudget {
  if (![inputTokens, outputLimit, available, multiplier].every(Number.isSafeInteger) || inputTokens < 0 || outputLimit < 1 || available < 0 || ![5, 8, 10].includes(multiplier)) {
    throw new Error('Invalid AI budget');
  }
  const countedInput = Math.ceil(inputTokens * 1.05);
  const inputHundredths = countedInput * (LUNA_RATES.cacheWrite * 100) * (countedInput > 272_000 ? 2 : 1);
  const outputHundredths = (LUNA_RATES.output * 100) * (countedInput > 272_000 ? 1.5 : 1);
  const affordable = Math.floor((Math.floor(available / multiplier) * 100 - inputHundredths) / outputHundredths);
  const maxOutputTokens = Math.min(outputLimit, affordable, 1_050_000 - countedInput);
  // Avoid taking money for an output too small to contain a useful structured plan.
  if (maxOutputTokens < Math.min(1024, outputLimit)) throw new OpenAiPlannerError('Add credits to cover this request’s input and a useful AI response.', 402, 'AI_CREDIT_REQUIRED');
  const reservedMicrousd = Math.ceil((inputHundredths + maxOutputTokens * outputHundredths) / 100) * multiplier;
  return { inputTokens, maxOutputTokens, reservedMicrousd, maximumCredits: toCredits(reservedMicrousd), multiplier,
    tier: multiplier === BILLING.monthlyMultiplier ? 'monthly' : multiplier === BILLING.paidMultiplier ? 'paid' : 'trial', limited: maxOutputTokens < outputLimit };
}

export async function quoteAi(db: D1Database, userId: string, inputTokens: number, outputLimit: number, operation: AiOperation, maximumCredits?: number): Promise<AiBudget> {
  const balance = await wallet(db, userId);
  if (balance.busy) throw new OpenAiPlannerError('Another AI request is still running.', 409, 'AI_BUSY');
  const minimum = operation === 'edit' ? 1 : BILLING.minimumGenerationCredits * BILLING.microusdPerCredit;
  const monthlyAvailable = Math.round(balance.monthly.balanceCredits * BILLING.microusdPerCredit);
  const cap = (available: number) => maximumCredits === undefined ? available : Math.min(available, Math.floor(maximumCredits * BILLING.microusdPerCredit));
  const budgetForTier = (available: number, multiplier: number): AiBudget => {
    if (operation !== 'reference') return budgetForTokens(inputTokens, outputLimit, cap(available), multiplier);
    const referenceCap = BILLING.referenceMaximumPaidCredits * BILLING.microusdPerCredit * multiplier / BILLING.paidMultiplier;
    // Bound input costs before subsidizing output. Oversized inputs must not
    // turn a fixed customer price into an unbounded provider expense.
    try { budgetForTokens(inputTokens, outputLimit, referenceCap, multiplier); }
    catch (error) {
      if (!(error instanceof OpenAiPlannerError)) throw error;
      throw new OpenAiPlannerError('This reference is too large for the reconstruction credit cap. Try a smaller reference image.', 422, 'AI_REFERENCE_TOO_LARGE');
    }
    const availableBudget = budgetForTokens(inputTokens, outputLimit, Math.min(cap(available), referenceCap), multiplier);
    // Keep the full structured-plan output allowance. Settlement collects at
    // most this hold and records any excess as covered by Sanaa.
    const fullBudget = budgetForTokens(inputTokens, outputLimit, Number.MAX_SAFE_INTEGER, multiplier);
    const reservedMicrousd = Math.min(cap(available), referenceCap, fullBudget.reservedMicrousd);
    return { ...availableBudget, maxOutputTokens: fullBudget.maxOutputTokens, limited: fullBudget.limited,
      reservedMicrousd, maximumCredits: toCredits(reservedMicrousd) };
  };
  if (balance.monthly.active && monthlyAvailable >= minimum) {
    try { return budgetForTier(monthlyAvailable, BILLING.monthlyMultiplier); }
    catch (error) { if (!(error instanceof OpenAiPlannerError) || error.code !== 'AI_CREDIT_REQUIRED') throw error; }
  }
  if (balance.balanceMicrousd < minimum) throw new OpenAiPlannerError('Add credits to cover this AI request.', 402, 'AI_CREDIT_REQUIRED');
  // An expired monthly plan still belongs to a paying account.
  const paid = await db.prepare('SELECT has_paid FROM billing_wallets WHERE user_id = ?').bind(userId).first<{ has_paid: number }>();
  return budgetForTier(balance.balanceMicrousd, paid?.has_paid ? BILLING.paidMultiplier : BILLING.trialMultiplier);
}

async function releaseExpiredReservations(db: D1Database, userId: string) {
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(`UPDATE billing_wallets SET
      balance_microusd = balance_microusd + COALESCE((SELECT SUM(reserved_microusd) FROM billing_ai_requests WHERE user_id = ? AND settled = 0 AND released = 0 AND reservation_expires_at < ? AND multiplier != 8), 0),
      monthly_balance_microusd = monthly_balance_microusd + COALESCE((SELECT SUM(reserved_microusd) FROM billing_ai_requests WHERE user_id = ? AND settled = 0 AND released = 0 AND reservation_expires_at < ? AND multiplier = 8 AND monthly_period = billing_wallets.monthly_period), 0),
      active_request_id = CASE WHEN active_until < ? THEN NULL ELSE active_request_id END,
      active_until = CASE WHEN active_until < ? THEN NULL ELSE active_until END WHERE user_id = ?`)
      .bind(userId, now, userId, now, now, now, userId),
    db.prepare('UPDATE billing_ai_requests SET released = 1 WHERE user_id = ? AND settled = 0 AND released = 0 AND reservation_expires_at < ?').bind(userId, now),
  ]);
}

export async function aiReceipt(db: D1Database, userId: string, requestId: string) {
  return db.prepare(`SELECT collected_microusd / 10000.0 AS credits, charged_microusd / 10000.0 AS calculatedCredits,
    absorbed_microusd / 10000.0 AS coveredCredits FROM ai_usage WHERE user_id = ? AND request_id = ?`).bind(userId, requestId)
    .first<{ credits: number; calculatedCredits: number; coveredCredits: number }>();
}

export async function settleAi(db: D1Database, userId: string, requestId: string, model: string, usage?: AiUsage) {
  const charge = usage ? usageCost(usage, model) : null;
  const statements: D1PreparedStatement[] = [];
  if (charge) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO ai_usage
      (request_id, user_id, model, input_tokens, cached_input_tokens, output_tokens, cost_microusd, charged_microusd, created_at, collected_microusd, absorbed_microusd, cache_write_tokens)
      SELECT r.request_id, r.user_id, ?, ?, ?, ?, ?, ? * r.multiplier, ?,
      MIN(? * r.multiplier, CASE WHEN r.released = 1 THEN 0 WHEN r.reserved_microusd IS NOT NULL THEN r.reserved_microusd
        WHEN r.multiplier != 8 THEN w.balance_microusd WHEN r.monthly_period = w.monthly_period THEN w.monthly_balance_microusd ELSE 0 END),
      0, ? FROM billing_ai_requests r JOIN billing_wallets w ON w.user_id = r.user_id
      WHERE r.request_id = ? AND r.user_id = ? AND r.settled = 0`)
      .bind(model, charge.input, charge.cached, charge.output, charge.cost, charge.cost, new Date().toISOString(), charge.cost, usage?.input_tokens_details?.cache_write_tokens ?? 0, requestId, userId));
    statements.push(db.prepare('UPDATE ai_usage SET absorbed_microusd = charged_microusd - collected_microusd WHERE request_id = ? AND user_id = ? AND collected_microusd IS NOT NULL').bind(requestId, userId));
  }
  // Holds were already deducted. Return only their unused portion; legacy
  // reservations without holds instead debit the amount actually collectable.
  const refund = `(SELECT CASE WHEN released = 1 THEN 0 ELSE COALESCE(reserved_microusd, 0) END FROM billing_ai_requests WHERE request_id = ?)`;
  const collected = `COALESCE((SELECT collected_microusd FROM ai_usage WHERE request_id = ?), 0)`;
  statements.push(db.prepare(`UPDATE billing_wallets SET
    balance_microusd = balance_microusd + CASE WHEN (SELECT multiplier FROM billing_ai_requests WHERE request_id = ?) != 8 THEN ${refund} - ${collected} ELSE 0 END,
    monthly_balance_microusd = monthly_balance_microusd + CASE WHEN EXISTS (SELECT 1 FROM billing_ai_requests WHERE request_id = ? AND multiplier = 8 AND monthly_period = billing_wallets.monthly_period) THEN ${refund} - ${collected} ELSE 0 END,
    spent_microusd = spent_microusd + ${collected},
    active_until = CASE WHEN active_request_id = ? THEN NULL ELSE active_until END,
    active_request_id = CASE WHEN active_request_id = ? THEN NULL ELSE active_request_id END
    WHERE user_id = ? AND EXISTS (SELECT 1 FROM billing_ai_requests WHERE request_id = ? AND user_id = ? AND settled = 0)`)
    .bind(requestId, requestId, requestId, requestId, requestId, requestId, requestId, requestId, requestId, userId, requestId, userId));
  statements.push(db.prepare('UPDATE billing_ai_requests SET settled = 1 WHERE request_id = ? AND user_id = ?').bind(requestId, userId));
  await db.batch(statements);
  return aiReceipt(db, userId, requestId);
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
