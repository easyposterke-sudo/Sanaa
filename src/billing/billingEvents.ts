export const BILLING_UPDATED_EVENT = 'sanaa:billing-updated';

export function notifyBillingUpdated() {
  window.dispatchEvent(new Event(BILLING_UPDATED_EVENT));
}
