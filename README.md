<div align="center">
  <a href="https://rungset.com">
    <img src="public/images/rungset-banner.png" alt="Rungset — build momentum, one rung at a time" width="100%" />
  </a>

  <p><strong>An open-source goal-planning app that turns ambitious outcomes into focused weekly progress.</strong></p>

  <p>
    <a href="https://app.rungset.com">Open the app</a>
    · <a href="https://rungset.com">Website</a>
    · <a href="https://play.google.com/store/apps/details?id=com.rungset.app">Android app</a>
    · <a href="https://github.com/Ismailco/Rungset-website">Website repository</a>
    · <a href="LICENSE">AGPL-3.0</a>
  </p>
</div>

---

Rungset gives goals a practical rhythm: define the outcome, break it into milestones, decide the next task, then check in and adjust as the work evolves.

> **Goal → Milestone → Task → Completion → Check-in → Review → Adjust**

## A focused system for meaningful progress

| Plan with clarity | Follow through | Learn and adjust |
| --- | --- | --- |
| Shape goals around categories, timeframes, target dates, and milestones. | Prioritize work with due dates, recurring schedules, and completion history. | Use check-ins and notes to capture progress, blockers, and the next area of focus. |

## What’s included

- Goal workspaces that bring milestones, tasks, and recent check-ins together.
- Focused task management with priorities, due dates, recurrence, and completion history.
- Progress check-ins for recording momentum, blockers, and next steps.
- Notes and user-scoped JSON export.
- Offline caching for continuity between connections.
- Android app available through Google Play as a wrapper around the hosted workspace.
- Email/password and social sign-in with user-scoped data access.

## Beta scope

Rungset is intentionally focused. Calendar synchronization, analytics, team features, an iOS app, AI features, and external reminder delivery are not presented as shipped capabilities. The Android app opens the same hosted workspace; reminder configuration currently provides in-app due and overdue guidance.

## Technology

Rungset is a Next.js App Router application, deployed to Cloudflare Workers through OpenNext.

- **Frontend:** Next.js 16, React 19, TypeScript, and Tailwind CSS 4
- **Authentication:** Better Auth
- **Data:** Drizzle ORM with Cloudflare D1 (SQLite)
- **Delivery:** OpenNext and Wrangler

Client storage maintains the offline-first experience and synchronizes changes through authenticated `/api/*` routes. Database definitions and forward-only migrations live in [`lib/db/schema.ts`](lib/db/schema.ts) and [`drizzle/`](drizzle/).

## Supported versions

The validated toolchain for this repository is:

- Node.js 24.11.0 (`.nvmrc`)
- pnpm 11 (CI)
- Next.js 16.3.7
- OpenNext 1.20.7
- Wrangler 4.145.0

Keep this list aligned with the lockfile and CI configuration when updating the toolchain.

## Quick start

**Prerequisites:** Node.js 24 (see [`.nvmrc`](.nvmrc)) and pnpm 11.

```bash
pnpm install
cp .env.example .dev.vars
cp .env.example .env.local
pnpm db:migrate:local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). To run the Cloudflare Workers preview path, use `pnpm cf:preview` and open [http://localhost:8787](http://localhost:8787).

Keep local-only values in `.env.local` and `.dev.vars`; neither file belongs in version control. `BETTER_AUTH_SECRET` must be strong and unique outside test fixtures. Google and GitHub credentials are optional unless their sign-in providers are enabled locally.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm cf:preview
```

## Deployment

Configure the Cloudflare D1 database ID in [`wrangler.jsonc`](wrangler.jsonc), then apply forward-only migrations with `pnpm db:migrate:prod`. Deploy the Worker with `pnpm cf:deploy` once authenticated Wrangler access and production secrets are configured.

A successful local build is source evidence—not proof that the live deployment is healthy.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Keep changes focused, protect user data, add coverage when behavior changes, and run the relevant checks before submitting.

## License

Rungset is licensed under the [GNU Affero General Public License v3.0](LICENSE).
