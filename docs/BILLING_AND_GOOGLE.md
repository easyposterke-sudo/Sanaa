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

The current package is **KSh 500 for $3.80 of AI usage credit**. Card customers
are redirected to Paystack checkout. M-Pesa customers enter a Kenyan phone
number and receive the Paystack STK prompt. The app accepts credit only after
Paystack's server side transaction verification confirms the correct reference,
KES currency, successful status, and KSh 500 amount. Webhook signatures use
Paystack's `x-paystack-signature` HMAC SHA-512. Browser returns and mobile
prompts alone never credit a wallet. Payments are idempotent.

Run the D1 migration before enabling these flows:

```text
npm run db:migrate:local
npm run db:migrate:remote
```

## AI usage accounting

Each account starts with **$0.50 of credit**. The two OpenAI backed AI routes
lock an account to one concurrent AI request, then use the Responses API's
reported input, cached input, cache write, and output token counts to debit
credit. Failed or incomplete generations with reported usage also debit credit,
because OpenAI can bill for those tokens. Cached application responses do not
make a new OpenAI call or debit credit.

The default `gpt-5.6-luna` model is priced in `worker/billing.ts` at the current
standard token rates. Review that table whenever OpenAI pricing changes. The
app deliberately blocks a different `OPENAI_MODEL` until its rates are added.
These amounts are calculated from token usage and published rates; they are
usage estimates, not a copy of OpenAI's final invoice. A request that starts
with a small positive balance can finish slightly past zero because OpenAI
reports exact usage only after execution. The wallet displays zero available
credit after such a request and blocks the next one.

The browser shows balance, recent per-request token cost, and payment status
under **Billing and AI credit**.
The `ai_usage` table keeps per request token counts and cost, and
`billing_payments` keeps the payment ledger. Never put the Google or Paystack
secret in frontend build variables or source files.
