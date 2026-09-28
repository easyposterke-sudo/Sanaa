import { creditVerifiedPayment } from './billing';
import { paymentQuote, type PurchaseKind } from '../shared/billing';

type PaystackResponse = { status?: boolean; message?: string; data?: {
  reference?: string; authorization_url?: string; status?: string; display_text?: string;
  amount?: number; currency?: string;
} };

async function paystack(path: string, secret: string, body?: object): Promise<PaystackResponse> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${secret}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json() as PaystackResponse;
  if (!response.ok || !payload.status) throw new Error(payload.message || 'Paystack could not process the payment.');
  return payload;
}

export function normalizeKenyanPhone(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  const phone = digits.startsWith('0') ? `254${digits.slice(1)}` : digits;
  return /^254[17]\d{8}$/.test(phone) ? `+${phone}` : null;
}

export async function beginPayment(db: D1Database, secret: string, user: { id: string; email: string }, origin: string, channel: 'card' | 'mpesa', phone: string | undefined, kind: PurchaseKind, amountKes?: number) {
  const { amountMinor: amount, creditMicrousd: credit } = paymentQuote(kind, amountKes);
  const normalizedPhone = channel === 'mpesa' ? normalizeKenyanPhone(phone ?? '') : null;
  if (channel === 'mpesa' && !normalizedPhone) throw new Error('Enter a valid Kenyan M-Pesa number.');
  const reference = `ep-${crypto.randomUUID()}`;
  await db.prepare('INSERT INTO billing_payments (reference, user_id, channel, amount_minor, credit_microusd, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(reference, user.id, channel, amount, credit, kind, new Date().toISOString()).run();
  // Keep the pending reference on network errors: a signed webhook can still
  // confirm a charge that reached Paystack before the connection failed.
  const result = channel === 'card'
    ? await paystack('/transaction/initialize', secret, {
      email: user.email, amount, currency: 'KES', reference, channels: ['card'], callback_url: `${origin}/billing`,
    })
    : await paystack('/charge', secret, {
      email: user.email, amount, currency: 'KES', reference,
      mobile_money: { phone: normalizedPhone, provider: 'mpesa' },
    });
  if (result.data?.reference !== reference) throw new Error('Paystack returned an unexpected payment reference.');
  if (channel === 'card') {
    const checkout = result.data.authorization_url ? new URL(result.data.authorization_url) : null;
    if (!checkout || checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.paystack.com') {
      throw new Error('Paystack returned an invalid checkout URL.');
    }
  }
  return { reference, authorizationUrl: result.data.authorization_url ?? null, status: result.data.status ?? 'pending', displayText: result.data.display_text ?? null };
}

export async function verifyPayment(db: D1Database, secret: string, reference: string, userId?: string) {
  if (!/^ep-[0-9a-f-]{36}$/.test(reference)) return null;
  const row = await db.prepare('SELECT user_id, status FROM billing_payments WHERE reference = ?').bind(reference)
    .first<{ user_id: string; status: string }>();
  if (!row || (userId && row.user_id !== userId)) return null;
  if (row.status === 'success' || row.status === 'failed') return { status: row.status };
  const verified = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`, secret);
  if (verified.data?.reference !== reference) return { status: 'pending' };
  if (verified.data.status === 'success') {
    const credited = await creditVerifiedPayment(db, reference, Number(verified.data.amount), String(verified.data.currency), 'success');
    return { status: credited ? 'success' : 'pending' };
  }
  if (verified.data.status === 'failed' || verified.data.status === 'abandoned') {
    await db.prepare("UPDATE billing_payments SET status = 'failed' WHERE reference = ? AND status = 'pending'").bind(reference).run();
    return { status: 'failed' };
  }
  return { status: 'pending' };
}

export async function validPaystackSignature(raw: string, signature: string | undefined, secret: string) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const expected = Uint8Array.from(signature.match(/../g)!, part => parseInt(part, 16));
  let difference = 0;
  for (let i = 0; i < signed.length; i++) difference |= signed[i]! ^ expected[i]!;
  return difference === 0;
}
