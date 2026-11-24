# CLAUDE.md

Internal app for quotations, invoices and delivery orders for several Malaysian companies. Runs on Cloudflare Workers + D1 + R2 behind Cloudflare Access.

- **What and why:** `PROJECT.md`
- **Exact behaviour, data model, acceptance criteria:** `spec.json` (source of truth)
- **How to code it:** this file

The owner has limited coding experience. Explain what you are about to do in plain language, keep changes small, and stop to ask when a rule is unclear.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Local app with local D1 and R2 |
| `npm run check` | Typecheck + lint + all tests. Must pass before a feature is done |
| `npm test` | Vitest (runs inside the Workers runtime) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:generate` | Generate a SQL migration from `src/worker/db/schema.ts` |
| `npm run db:migrate:local` | Apply migrations locally |
| `npm run db:migrate:staging` | Apply migrations to staging (ask first) |
| `npm run db:migrate:prod` | Apply migrations to production (ask first, every time) |
| `npm run seed` | Load fake companies, customers and items locally |
| `npm run deploy:staging` | Deploy to staging |
| `npm run deploy:prod` | Deploy to production (ask first, every time) |

These scripts are created in F-00. Keep their names.

## Where things live

- `src/worker/index.ts`: Hono app; mounts `/api/*` and serves static assets
- `src/worker/auth/`: Access JWT check, current user, membership and role guards
- `src/worker/routes/`: one file per resource
- `src/worker/services/`: business logic (`numbering.ts`, `documents.ts`, `totals.ts`, `amount-in-words.ts`, `pdf.ts`, `audit.ts`)
- `src/worker/db/`: Drizzle schema and data access helpers
- `src/worker/pdf/`: Hono JSX templates for quotation, invoice, delivery order
- `src/shared/`: Zod schemas and types shared with the client
- `src/client/`: React app
- `migrations/`: generated SQL; never edit one that has been applied
- `tests/`: Vitest; `tests/e2e/` for Playwright

## Hard rules

1. **Money is integer sen** (`1250` = RM 12.50). Quantities are integer thousandths. No floats for money, ever. Round half up per line. Use `services/totals.ts` for every calculation.
2. **Company scope:** every query on company data filters by `company_id` from the `X-Company-Id` header, after the membership check. Data helpers take `companyId` as their first argument. A record from another company returns 404.
3. **Auth on every API route:** validate the Access JWT (signature, audience, expiry) in middleware. No route may skip it. Owner-only actions check the role in the API.
4. **Issued documents are immutable.** Only drafts can be edited or deleted. Changes after issue go through void (owner, with reason) and a new document.
5. **Numbers come only from `services/numbering.ts`,** which issues inside one `db.batch` as described in `spec.json` → `numbering.implementation`. Never compute a number in a route or the client.
6. **Delivery orders never expose prices:** no unit price, discount or total in DO API responses, editor or PDF.
7. **No SST while `sst_registered = 0`:** title is INVOICE, no tax lines, `tax_sen = 0`.
8. **Validate every request body with Zod** from `src/shared`. Reject unknown fields.
9. **Respect D1 limits:** use `db.batch` for multi-statement writes (it is one transaction), keep each statement at 100 bound parameters or fewer, and stay under 50 queries per request.
10. **PDFs:** generate once at issue through `services/pdf.ts`, store in R2 at `{company_id}/{type}/{year}/{number}.pdf`, and record the SHA-256. Never overwrite a stored PDF. Escape all user text in templates.
11. **Write `audit_log` in the same batch** as issue, void, accept, reject, convert, mark-delivered, settings and member changes.
12. **No secrets in the repo.** Use `wrangler secret` and GitHub secrets.

## How to do a feature

1. Read the feature in `spec.json` and every feature in its `depends_on`.
2. Restate the acceptance criteria and list the files you will touch. Flag anything unclear.
3. Write failing tests that map one-to-one to the acceptance criteria. Name each test after the criterion.
4. Implement in small commits. Keep functions short, and keep business rules in `services/`, not in routes or React components.
5. Run `npm run check`, fix everything, then deploy to staging and say how to check it by hand.
6. Set the feature's `status` to `"done"` in `spec.json` and summarise the change in one short paragraph.

## Always ask first

- Changing the data model, or any rule in `spec.json`
- Adding a dependency
- Any command that touches staging or production data or resources (`wrangler d1 execute --remote`, migrations, deletes, deploy to production)
- Anything listed in `spec.json` → `out_of_scope`

## Style

- TypeScript strict mode; no `any` without a comment explaining why.
- Dates: `YYYY-MM-DD` strings for business dates in Malaysia time; integer Unix ms for timestamps.
- UI text in plain English. Show money as `RM 1,234.50` and dates as `DD/MM/YYYY`.
- Error responses use `{ error: { code, message, details? } }` with the status codes in `spec.json` → `api.errors`.
