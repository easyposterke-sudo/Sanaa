# Admin access with Cloudflare One

The admin entry URL is `https://YOUR-STUDIO-HOST/admin`. Cloudflare Access asks for the approved email and one-time PIN before serving that URL. The app then creates or resumes the matching account session. Admin controls remain available in the poster and 3D editors on that browser. Ordinary account sessions do not receive admin controls.

## Configure Cloudflare Access

1. In **Zero Trust → Integrations → Identity providers**, add **One-time PIN** if it is not already enabled.
2. Create a **self-hosted** Access application for the exact public hostname and `/admin` path. Add an **Allow** policy with **Include → Emails → your exact admin email address**. Do not use `Everyone` or `Login methods → One-time PIN` as the only Include rule.
3. Leave **Cookie Path Attribute** off. The `CF_Authorization` cookie must reach `/api/auth/access-admin` and the other `/api` paths on the same hostname. Use the same hostname for the admin page and API. Protect `/admin` as a real URL path, not `#/admin` (Access cannot inspect hash fragments).
4. Copy the application's **Application Audience (AUD) Tag**. Set these Worker secrets using `wrangler secret put ACCESS_TEAM_DOMAIN` and `wrangler secret put ACCESS_ADMIN_AUD`. The team domain value must be the full `https://YOUR-TEAM.cloudflareaccess.com` URL. Set the same values in `.dev.vars` only when testing locally with a real Access token.
5. Deploy the app, then open `/admin` in a fresh browser session. Complete the email PIN. The admin workspace should show links for the poster editor, template management, and 3D editor.

The Worker verifies the Access token signature, issuer, audience, expiration, and email against the logged-in account on every privileged API request. A valid ordinary app session alone cannot upload fonts, manage reusable templates, or access process recordings. Font lists and published templates remain readable for use in designs.

If the Access session expires, revisit `/admin` and complete the Access sign-in again. If the admin page reports that Access sign-in is unavailable, check the application hostname/path, Cookie Path Attribute, team domain, AUD tag, and OTP policy email.

The admin **Sign out** button also opens Cloudflare Access logout, clearing the Access browser session.

Cloudflare references: [One-time PIN login](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [authorization cookie settings](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/), and [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
