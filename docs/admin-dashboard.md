# Admin dashboard setup

The private dashboard is available at `/admin`. Every dashboard API checks the authenticated session on the server, requires a verified email in the server-side allowlist, and bypasses Better Auth's short-lived session cookie cache. There is no public admin-role or account-creation endpoint.

## Provision the first admin

Create the account through the existing Rungset sign-in flow, then add its verified email to the Worker secret. For example, run `pnpm exec wrangler secret put RUNGSET_ADMIN_EMAILS` and enter one or more comma-separated addresses when prompted. Only those server-configured identities can open `/admin`; changing browser state or calling an API directly cannot grant access. If a password account is not email-verified, use a verified identity or verify it through the existing server-side account process before adding it.

## Required deployment steps

1. Apply the D1 migration `0010_illegal_baron_strucker.sql` before deploying code that reads the new user columns. The migration preserves existing accounts, backfills last login from retained session rows, and leaves existing accounts unsubscribed from marketing email.
2. The Worker email binding is named `EMAIL` and permits sending only from `hello@rungset.com`. Welcome email delivery is scheduled after user creation. Local Wrangler development does not enable the remote email binding.
3. To display Worker logs in `/admin`, set `RUNGSET_OBSERVABILITY_API_TOKEN` as a Worker secret. The app reuses the configured D1 account ID. Cloudflare's current telemetry query endpoint requires the account-scoped **Workers Observability Write** permission, even though the dashboard only issues log queries. Keep this token server-side and scoped to the Rungset Cloudflare account.

## Email preferences

The signup product-updates checkbox is optional and unchecked by default. Checking it creates a pending request; the welcome email contains a confirmation link. Existing users are not opted in by the migration. Users can manage the setting in Account Settings. Broadcasts go only to confirmed, non-unsubscribed addresses, are sent individually, and include both a visible unsubscribe link and one-click unsubscribe headers. The unsubscribe and confirmation links are signed server-side and do not require an active login. A campaign is capped at 1,000 recipients per request; larger lists need a queued sender.

## Dashboard metrics

- **New users · 30 days** counts account creation timestamps in the previous 30 days.
- **Signed in · 30 days** counts users whose most recent recorded session creation is in that period.
- Goals, tasks, and check-ins are current database totals.
- Runtime logs come from Cloudflare Workers Observability for the previous 24 hours. No product analytics or third-party user-behavior tracking is added.
