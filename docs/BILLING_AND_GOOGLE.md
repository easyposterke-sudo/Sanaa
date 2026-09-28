# Google sign-in and AI billing

## Google OAuth setup

Create a Google OAuth **web application** client. Add the deployed application's
origin under Authorized JavaScript origins, and add this exact redirect URI under
Authorized redirect URIs:

```text
https://YOUR_DOMAIN/api/auth/google/callback
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as encrypted Worker secrets.
In Cloudflare's Variables and Secrets screen, select the **Secret** type for
both values, not Text. The Worker is named `easyposter-studio`. If you prefer
the terminal, run each command below from the project directory and enter the
value only at Wrangler's interactive prompt:

```text
npx wrangler secret put GOOGLE_CLIENT_ID --name easyposter-studio
npx wrangler secret put GOOGLE_CLIENT_SECRET --name easyposter-studio
```

No Git pull or copy of the secret values into `wrangler.jsonc` is needed.
Wrangler deploys preserve encrypted Worker secrets. This project's
`keep_vars: true` also preserves dashboard Text variables, while
`secrets.required` stops a deployment if either Google secret or the Paystack
secret is absent.
Check the deployed Worker's secret names before and after a Git push with
`npx wrangler secret list --name easyposter-studio --format pretty`. This
command reports names and types, never secret values.
For local testing, add `http://127.0.0.1:5173/api/auth/google/callback` to the
Google client and place test values in `.dev.vars` (never commit this file).
Existing password accounts can link Google after signing in through **Link
Google account** in the user menu. A new Google account receives the same one
time $0.50 trial as an email/password account. Accounts are identified by the
stable Google subject, not by future email changes.

## Paystack setup

Set `PAYSTACK_SECRET_KEY` as an encrypted Worker secret. Use the Paystack test
secret while testing, and switch to the live secret only for live payments.
It can also be set interactively with
`npx wrangler secret put PAYSTACK_SECRET_KEY --name easyposter-studio`.
Configure the Paystack webhook URL as:

```text
https://YOUR_DOMAIN/api/billing/paystack-webhook
```

Pay-as-you-go top-ups accept whole-shilling amounts from **KSh 20** to KSh 100,000.
The fixed top-up rate is **1.25 credits per shilling**, so KSh 20 adds **25 credits**
and KSh 100 adds **125 credits**. **100 credits = $1** of service credit for usage
accounting. This is a product rate, not a live exchange-rate feed. Pricing constants
live in `shared/billing.ts`. Existing balances and previously quoted pending payments
retain their stored credit amounts; the new rate applies to new checkouts.

The **$5 monthly plan** costs **KSh 658**, priced independently from top-ups,
and grants **500 monthly credits**. It is prepaid and manually
renewed through either payment method. No automatic recurring charges are created.
Card customers
are redirected to Paystack checkout. M-Pesa customers enter a Kenyan phone
number and receive the Paystack STK prompt. The app accepts credit only after
Paystack's server side transaction verification confirms the correct reference,
KES currency, successful status, and the exact amount saved for that purchase.
The server determines the credit amount and purchase kind. Webhook signatures use
Paystack's `x-paystack-signature` HMAC SHA-512. Browser returns and mobile
prompts alone never credit a wallet. Payments are idempotent.

Apply migrations through **0011_billing_plans.sql** before deploying the updated
Worker. Existing balances and historical charges are preserved; accounts with
successful prior payments are marked paid rather than receiving another trial:

```text
npm run db:migrate:local
npm run db:migrate:remote
```

## AI usage accounting

Each account starts with **50 trial credits** ($0.50 of service credit).
Provider usage cost is multiplied by **5 during trial**, **10 for pay-as-you-go**,
or **8 when using monthly credits**. For example, $0.02 of provider usage consumes
10 trial credits, 20 pay-as-you-go credits, or 16 monthly credits. Buying either
product ends trial pricing for future requests; any remaining trial balance is
preserved in the pay-as-you-go wallet.

Monthly credits are used first while the plan is active and has enough credits
for the requested operation. The expiry is one calendar month from purchase (clamped to the last day
for short months). Early renewal extends that expiry by a month and adds 500
credits to the remaining allowance. Renewal after expiry starts a new 500-credit
allowance. Unused monthly credits expire; pay-as-you-go credits never expire.
If the monthly balance is insufficient or expired, requests fall back to sufficient
pay-as-you-go credits at 10x. Configured daily generation limits still apply.

Full poster generation and recreation require **at least 20 credits** in either
the active monthly balance or the pay-as-you-go/trial balance before starting a
provider call. Balances are not combined across pricing tiers. Exactly 20 credits
qualifies; 19.9999 does not. Selected-layer AI edits only require a positive balance.
This check is atomic with the request lock and tier selection. Cached responses,
which incur no new provider cost, remain available without this starting minimum.

The two OpenAI backed AI routes
lock an account to one concurrent AI request, then use the Responses API's
reported input, cached input, cache write, and output token counts to debit
credit. The pricing tier is stored at reservation time so payment or expiry during
a request does not change its rate. Settlement is atomic and idempotent, including
late responses after a reservation lock expires. Failed or incomplete generations with reported usage also debit credit,
because OpenAI can bill for those tokens. Cached application responses do not
make a new OpenAI call or debit credit.

The default `gpt-5.6-luna` model is priced in `worker/billing.ts` at the current
standard token rates. Review that table whenever OpenAI pricing changes. The
app deliberately blocks a different `OPENAI_MODEL` until its rates are added.
These amounts are calculated from token usage and published rates; they are
usage estimates, not a copy of OpenAI's final invoice. A request that starts
at the starting minimum (or a small positive editing balance) can finish past zero because OpenAI
reports exact usage only after execution. The wallet displays zero available
credit after such a request and blocks the next one.

The browser shows credit balances, trial/monthly usage percentages, per-request
credit charges, monthly expiry, and payment status under **Billing and credits**.
The billing API does not expose token counts or raw provider cost in recent usage.
The `ai_usage` table keeps internal token counts, provider `cost_microusd`, and
customer `charged_microusd` separately. `billing_ai_requests` keeps reservation
pricing and settlement status, and
`billing_payments` keeps the payment ledger. Never put the Google or Paystack
secret in frontend build variables or source files.
