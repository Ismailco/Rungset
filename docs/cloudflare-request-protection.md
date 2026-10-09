# Cloudflare request protection

Rungset uses a narrow, hostname-scoped Cloudflare WAF policy so requests
outside the application's public surface are rejected before the Worker runs.
The policy is maintained by `scripts/configure-cloudflare-waf.mjs`.

## What the policy protects

- Only known application pages (including the protected `/admin` route and the
  `/auth/verify-email` landing page), static assets, and API routes are allowed
  on `app.rungset.com`.
- Admin API access is limited to the dashboard's exact endpoints and, like the
  other data APIs, requires a Better Auth session cookie at the WAF. The app
  still verifies the user's admin access in each handler.
- Methods outside `GET`, `HEAD`, `POST`, `PUT`, `DELETE`, and `OPTIONS` are
  blocked.
- Data API requests without a Better Auth session cookie are blocked at the
  edge. The API still validates the session and authorization; cookie presence
  in the WAF is only an early rejection filter.
- Empty and common scanner user agents receive a Managed Challenge.
- Email sign-in, social sign-in, and email sign-up starts are limited to five
  requests per 10 seconds per IP. Cloudflare then blocks further matching
  requests for 10 seconds. These are the path-only limits supported by the
  zone's Free plan.

Do not replace the session-cookie check with an `Origin` or `Referer` check.
Those headers can be absent in legitimate flows and can be spoofed by clients.

## Apply the rules

Create a scoped Cloudflare API token with these permissions for the
`rungset.com` zone:

- Zone > Zone > Read
- Zone > WAF > Edit

Keep the token outside the repository. Place it in a mode-`600` temporary file
and pass only its path so the value is not stored in shell history:

```bash
CLOUDFLARE_API_TOKEN_FILE=/tmp/rungset-waf-token pnpm run cf:waf
```

The script creates or updates only rules whose descriptions start with
`Rungset -`; it preserves unrelated rules in both entry-point rulesets.

Review the generated expressions without changing Cloudflare:

```bash
pnpm run cf:waf -- --dry-run
```

## Maintain the allowlist

When adding a page, public asset, or API route, update the matching constant in
`scripts/configure-cloudflare-waf.mjs` and re-run `pnpm run cf:waf`. Deploy the
application and WAF change together so a new route is not blocked between
releases.

## Verify production

Use a browser user agent for allowed-route probes because command-line clients
are intentionally challenged:

```bash
curl -I -A 'Mozilla/5.0' https://app.rungset.com/auth/signin
curl -I -A 'Mozilla/5.0' https://app.rungset.com/dashboard
curl -I -A 'Mozilla/5.0' https://app.rungset.com/manifest.json
curl -I -A 'Mozilla/5.0' https://app.rungset.com/wp-plain.php
curl -I -A 'Mozilla/5.0' https://app.rungset.com/api/goals
```

Expected results:

- `/auth/signin` remains available.
- `/auth/verify-email` remains available after the email-verification endpoint
  validates a link.
- `/dashboard` redirects unauthenticated visitors to sign in.
- `/admin` reaches the app's server-side admin gate; only authenticated users
  with a verified allowlisted email can access the dashboard.
- Admin dashboard requests to `/api/admin/overview`, `/api/admin/users`,
  `/api/admin/logs`, and `/api/admin/email` reach their server-side admin gates.
- `/manifest.json` is served by Workers Static Assets without invoking the
  application Worker.
- `/wp-plain.php` is blocked with `403` at the WAF.
- `/api/goals` without a session cookie is blocked with `403` at the WAF.
