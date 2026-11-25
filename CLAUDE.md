# CLAUDE.md

Internal app for quotations, invoices and delivery orders for HALFX INDUSTRIES and sister companies. Cloudflare Workers + D1 + R2 behind Cloudflare Access.

- **Orientation and current state:** `PROJECT.md` — read it first
- **Exact behaviour, data model, acceptance criteria:** `spec.json` (source of truth)
- **This file:** coding rules and commands

The owner has limited coding experience. Explain what you are about to do in plain language, keep changes small, and stop to ask when a rule is unclear.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Local app with local D1 and R2 (`PDF_RENDERING=off`, Access bypass for `DEV_AUTH_EMAIL`) |
| `npm run check` | Typecheck + lint + all Vitest tests. Must pass before a feature is done |
| `npm test` | Vitest (runs inside the Workers runtime) |
| `npm run test:e2e` | Playwright against local dev |
| `npm run db:generate` | Generate a SQL migration from `src/worker/db/schema.ts` |
| `npm run db:migrate:local` | Apply migrations locally |
| `npm run db:migrate:staging` | Apply migrations to staging (ask first) |
| `npm run db:migrate:prod` | Apply migrations to production (ask first, every time) |
| `npm run seed` | Fake data into local D1. `npm run seed -- --remote` targets staging |
| `npm run deploy:staging` | Build for staging and deploy |
| `npm run deploy:prod` | Build for production and deploy. Emergency only, ask first; normal releases are a `v*` tag with approval (`PROJECT.md` §9) |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |

CI: `npm run check` on every push; staging deploys from `main`; production deploys from a `v*` tag with manual approval; nightly backup at 02:10 MYT.

## Where things live

- `src/worker/index.ts` — Hono app; mounts `/api/*`, serves static assets
- `src/worker/auth/` — Access JWT check, app user, company membership, owner guard
- `src/worker/routes/` — `me`, `companies`, `members`, `customers`, `items`, `documents`, `document-pdf`, `audit`, `export`
- `src/worker/services/` — `totals`, `amount-in-words`, `dates`, `numbering`, `documents`, `pdf`, `delivery`, `audit`
- `src/worker/db/` — Drizzle schema, client, data helpers (take `companyId` first)
- `src/worker/pdf/` — `layout`, `quotation`, `invoice`, `delivery-order` (Hono `html` templates)
- `src/shared/` — Zod schemas and types shared with the client
- `src/client/` — React app: `pages/`, `components/ui` (shadcn), `api.ts`, `company.tsx`
- `migrations/` — generated SQL; never edit an applied migration
- `tests/worker/` — Vitest; `tests/e2e/` — Playwright
- `RESTORE.md` — restore instructions and the drill log

## Hard rules

1. **Money is integer sen**, quantities integer thousandths. Round half up per line, then sum. Never floats. Use `src/shared/totals.ts` from both API and editor.
2. **Company scope:** every company row is filtered by `company_id`. Data helpers take `companyId` first. Another company's record returns `404`.
3. **Auth on every `/api` route:** validate the Access JWT (signature, issuer, audience, expiry). Owner-only actions check the role server-side.
4. **Issued documents are immutable.** Only drafts are editable or deletable. Corrections: owner voids with a reason, then a new document. A void keeps its number.
5. **Numbers only from `services/numbering.ts`**: Quotations and invoices: `PREFIX-1000+`, gap-free, never reset. Delivery orders take their invoice's digits (`DO-1042`, `DO-1042-2`), may have gaps, and never use `number_sequences`. All assigned inside one `db.batch`. Never compute a number in a route or the client.
6. **Delivery orders never expose money** — not in the API response, the editor or the PDF.
7. **No SST** while `sst_registered = 0`: title INVOICE, no tax lines, `tax_sen = 0`.
8. **Validate every request body with Zod** from `src/shared`; reject unknown fields.
9. **D1 limits:** `db.batch` for multi-statement writes, ≤100 bound parameters per statement (chunk line inserts), stay well under 50 queries per request.
10. **PDFs:** generate once at issue through `services/pdf.ts`, store under `{company_id}/{type}/{year}/{number}.pdf`, record SHA-256, never overwrite. Escape all user text. `PDF_RENDERING=off` locally and in tests.
11. **Audit rows in the same batch** as issue, void, convert, mark-delivered, paid, company settings and member changes.
12. **Download links authorise by document id or `company_id` query** plus membership — never by `X-Company-Id`, because a link click cannot send headers.

## How to do a feature

1. Read the feature in `spec.json` and every feature in its `depends_on`.
2. Restate the acceptance criteria, list the files you will touch, and flag anything unclear.
3. Write failing tests that map one-to-one to the acceptance criteria.
4. Implement in small commits; business rules live in `services/`, not routes or components.
5. Run `npm run check`, then deploy to staging and describe how to check it by hand.
6. Set the feature's `status` to `"done"` and summarise the change in one paragraph.
7. If a decision changes the spec, update `spec.json` and add a `decision_log` entry in the same commit.
8. Finish with the release block from *Releasing to production* below.

## Releasing to production (after every app change)

The owner is new to releases. Apply this to features **and** fixes, UI tweaks and PDF changes alike.

**Needs a release** when the change touches `src/`, `migrations/`, `public/`, `index.html`, `wrangler.jsonc`, `vite.config.ts`, `package.json` or `package-lock.json`.
**No release needed** for docs (`*.md`, `docs/`, `spec.json`), `tests/`, `scripts/` or `.github/`. Say "No release needed. Production doesn't change." and stop.

Steps:

1. `npm run check`, commit, push `main`. Wait until CI and Deploy staging are green.
2. Pick the next version from `git tag -l 'v*' --sort=-v:refname | head -1`. A fix bumps the last digit (`v1.0.0` → `v1.0.1`); a feature bumps the middle digit and resets the last (`v1.0.1` → `v1.1.0`). Create the annotated tag locally: `git tag -a vX.Y.Z -m "vX.Y.Z: <what changed>"`.
3. End the message with the release block below, filled in for this change.
4. Push the tag **only** after the owner replies "push". Then confirm the run is waiting, and after approval check `npx wrangler deployments list --env production`.

Release block (plain English, filled in):

> **Ready to release vX.Y.Z: <one-line summary>**
> 1. **Check staging:** open https://atlas-staging.halfxind.workers.dev → <exact clicks for this change> → you should see <expected result>.
> 2. **Reply "push"** and I'll send `vX.Y.Z` to GitHub. (Database change included: <yes, what it does / no>.)
> 3. **Approve:** GitHub → Actions → Deploy production → the `vX.Y.Z` run → **Review deployments** → tick `production` → **Approve and deploy**. **Reject** cancels with nothing changed.
> 4. **Check production** after about a minute: <what to look at>.

## Always ask first

- Changing the data model, or any rule in `spec.json`
- Adding a dependency
- Any command that touches staging or production data or resources (remote migrations, deletes, deploys, production provisioning)
- Anything in `spec.json` → `out_of_scope`

## Style

- TypeScript strict; no `any` without a comment explaining why.
- Business dates: `YYYY-MM-DD` in Malaysia time (UTC+8). Timestamps: integer Unix ms.
- UI text in plain English. Money as `RM 1,234.50`; dates as `DD/MM/YYYY`.
- Errors: `{ error: { code, message, details? } }`, status codes from `spec.json` → `api.errors`.
- Prefer small focused files; keep `services/` free of HTTP types.
