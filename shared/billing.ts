// Fixed pay-as-you-go store rate: KSh 20 buys 25 credits.
// Monthly plan pricing is independent of this top-up rate.
export const BILLING = {
  microusdPerCredit: 10_000,
  microusdPerKes: 12_500,
  minimumGenerationCredits: 20,
  trialMicrousd: 500_000,
  trialMultiplier: 5,
  paidMultiplier: 10,
  monthlyMultiplier: 8,
  monthlyMicrousd: 5_000_000,
  minimumTopupKes: 20,
  maximumTopupKes: 100_000,
  monthlyUsd: 5,
  monthlyKes: 658,
} as const;

export type PurchaseKind = 'credits' | 'monthly';

export function paymentQuote(kind: PurchaseKind, amountKes?: number) {
  if (kind === 'monthly') return { amountMinor: BILLING.monthlyKes * 100, creditMicrousd: 0 };
  if (kind !== 'credits' || !Number.isSafeInteger(amountKes) || amountKes! < BILLING.minimumTopupKes || amountKes! > BILLING.maximumTopupKes) {
    throw new Error(`Enter a whole-shilling amount from KSh ${BILLING.minimumTopupKes} to KSh ${BILLING.maximumTopupKes.toLocaleString()}.`);
  }
  return { amountMinor: amountKes! * 100, creditMicrousd: amountKes! * BILLING.microusdPerKes };
}

export function toCredits(microusd: number) { return microusd / BILLING.microusdPerCredit; }
