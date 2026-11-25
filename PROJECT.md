# PROJECT.md — Atlas

> Last updated: 25 November 2026 (release process and backup keep-alive).
> **Start here.** Read this file, `CLAUDE.md` and `spec.json` — you do not need to scan the codebase to understand the project.
> `spec.json` is the source of truth for behaviour. `CLAUDE.md` holds the coding rules and commands. This file explains what exists today and why.

## 1. What this is

An internal web app for **HALFX INDUSTRIES** (and any future sister companies) that issues

**quotations → invoices → delivery orders**

as branded A4 PDFs, and keeps every issued document for seven years.

- 1–5 internal staff. No customer logins; PDFs are downloaded and sent from staff mailboxes.
- Two roles per company: **owner** (settings, members, voiding, export) and **staff** (day-to-day documents).
- Several companies, each with its own logo, registration number, bank details, numbering and customers. A company switcher separates them completely.

## 2. Current state

Both environments are live and behind Cloudflare Access with a one-time PIN sent to `halfxindustries@gmail.com`.

| | Staging | Production |
| --- | --- | --- |
| URL | https://atlas-staging.halfxind.workers.dev | https://atlas-production.halfxind.workers.dev |
| Purpose | testing, fake data | real business records |
| D1 | `atlas-staging` | `atlas-production` |
| R2 | `atlas-files-staging`, `atlas-backups-staging` | `atlas-files-production`, `atlas-backups-production` |
| Data | demo companies and one restored test quotation | HALFX INDUSTRIES and Waffl Works Services, owner account, customers and items; no documents yet (test documents cleared 25 November 2026) |

- Access is **Worker-level** (Workers → the Worker → Access → All traffic). Each Worker has its own audience tag, so a staging session cannot be replayed against production. There is no custom domain; the `workers.dev` address is the app.
- Team domain: `atlas-docs.cloudflareaccess.com`. The zero-trust organisation also hosts unrelated older apps — never touch their Access applications.
- Database: D1 in `apac`, read replication off. Storage: R2, private buckets, files served only through the Worker after a membership check.
- PDFs: Cloudflare Browser Run via `@cloudflare/puppeteer`, generated once at issue and stored in R2. `PDF_RENDERING` is **on** in staging/production and **off** locally (there is no Browser Run on a laptop; the call hangs rather than failing).
- Tests: `npm run check` runs typecheck + lint + `184` unit/API tests; `npm run test:e2e` runs `11` Playwright flows.
- Backups: nightly GitHub Action at 02:10 Malaysia time exports production D1 to `atlas-backups-production/backups/YYYY/MM/DD.sql.gz` (Malaysia date), gzip. A 7-year lifecycle rule (2,557 days, prefix `backups/`) deletes older copies. The restore drill has been run once (see `RESTORE.md`). The job re-enables its own schedule at the end of every run, because GitHub switches off scheduled workflows in public repos after 60 days without commits.
- GitHub: the repo `lukhmanfaris/atlas` is **public** (free plan). Nothing secret is committed; the Cloudflare token lives in repository secrets. The GitHub `production` environment requires the owner's approval before a deploy runs.

All sixteen features in `spec.json` are `done`.

## 3. What is left — human work, no code

1. Finish the company profile in **Settings → Company**: address lines, logo, bank details, **payment instructions**, prefixes.
2. Enter real **customers** and **items** in production.
3. Create a **draft quotation** and download its PDF on production — this is the only path the automated tests cannot cover (Browser Run). A draft uses no number and can be deleted.
4. Run the **parallel month** from section 10: real documents alongside the current method, with no differences.
5. Repeat the restore drill quarterly and log it in `RESTORE.md`.
6. Optional: the payments **ledger** (partial payments, balances) is deferred; v1 only marks an invoice paid on a date.
7. **15 January 2027:** open GitHub → Actions → Nightly backup and confirm there is still a run every night (checks that the schedule keep-alive works past GitHub's 60-day limit).

## 4. How it is actually built

| Layer | What is used | Note |
| --- | --- | --- |
| Runtime | One Cloudflare Worker serving the React SPA and `/api` | `src/worker/index.ts` |
| API | Hono 4 + Zod 4 | Validation schemas in `src/shared` |
| Frontend | React 19 + Vite 8 + React Router 8 + TanStack Query 5 + Tailwind 4 + shadcn/ui | Components under `src/client/components/ui` |
| Database | D1 (SQLite) + Drizzle ORM, drizzle-kit migrations | `src/worker/db/schema.ts`, `migrations/` |
| Files | R2 `FILES` (logos, PDFs) and `BACKUPS` | Logo inlined as a data URI in PDFs |
| Auth | Cloudflare Access JWT validated on every `/api` request | `src/worker/auth/` |
| PDF | Hono `html` templates → `@cloudflare/puppeteer` | `src/worker/pdf/` |
| Tests | Vitest 5 with `@cloudflare/vitest-plugin`, Playwright | D1 migrations applied per test file |
| CI/CD | GitHub Actions: check on push, staging from `main`, production on a `v*` tag, nightly backup | `.github/workflows/` |

**Deviations from the original plan, deliberately:**
- Templates use Hono's `html` tag, not Hono JSX — two JSX runtimes in one Vite project do not coexist cleanly.
- `@cloudflare/vitest-pool-workers` was renamed upstream to `@cloudflare/vitest-plugin`.
- No custom domain; Worker-level Access protects the `workers.dev` address.
- Browser Run is switched off locally and on in deployed environments.

## 5. The rules that matter

- **Money is integer sen**; quantities are integer thousandths. Round half up per line, then sum. Both API and editor share `src/shared/totals.ts`.
- **Company scope**: every company row is filtered by `company_id`, taken from `X-Company-Id` for API calls or from the document/company being addressed. Another company's record is a `404`.
- **Issued documents are immutable.** Drafts are editable and deletable. Corrections after issue: owner voids with a reason, then a new document is issued. A voided document keeps its number.
- **Quotations and invoices use per-company, per-type gap-free counters that never reset**, starting at **1000** (`INV-1042`, `QT-1001`). Delivery orders take their invoice's digits (`DO-1042`, then `DO-1042-2`), so they can have gaps. The year is recorded on the document but not printed.
- **Delivery orders never carry money** in the API, the editor or the PDF.
- **No SST** while `companies.sst_registered = 0`; title is INVOICE, never TAX INVOICE.
- **Typed customers**: a document can be created by typing a buyer's name. Exact (case-insensitive) match reuses the customer; otherwise a customer is created with its billing address when the draft saves.
- **Paid** is a date on the invoice (`paid_at`), set by staff or owner; it does not alter the stored PDF.

## 6. Document workflow

```
Quotation ──convert──▶ Invoice ──create DO──▶ Delivery order #1 (partial)
(draft→issued→void)    (draft→issued→void)  ──create DO──▶ Delivery order #2 (rest)
                                              (draft→issued→delivered / void)
```

- Converting an issued quotation creates a draft invoice with the same customer, lines, discounts, notes and terms, sets `source_document_id` and per-line `source_line_id`, and marks the quotation **accepted**. A second conversion is blocked while a non-void invoice exists.
- Delivery orders are created only from an **issued** invoice, prefilled with the remaining quantity per line. Over-delivery is refused on save and again at issue. Voiding a DO returns its quantities.
- An invoice cannot be voided while a non-void delivery order points at it.
- The dashboard shows drafts, the 10 latest issued documents, and invoices still awaiting delivery.

## 7. Where things live

| Path | What |
| --- | --- |
| `src/worker/index.ts` | Hono app: mounts `/api/*`, serves the SPA |
| `src/worker/auth/` | Access JWT check, app user, company membership, owner guard |
| `src/worker/routes/` | `me`, `companies`, `members`, `customers`, `items`, `documents`, `document-pdf`, `audit`, `export` |
| `src/worker/services/` | `totals`, `amount-in-words`, `dates`, `numbering`, `documents` (snapshots/model), `pdf`, `delivery`, `audit` |
| `src/worker/db/` | `schema.ts`, `client.ts`, helpers that take `companyId` first |
| `src/worker/pdf/` | `layout`, `quotation`, `invoice`, `delivery-order` |
| `src/shared/` | Zod schemas and types used by both sides |
| `src/client/` | React app: `pages/`, `components/ui` (shadcn), `api.ts`, `company.tsx` |
| `migrations/` | Generated SQL — never edit an applied migration |
| `tests/worker/` | Vitest API/service tests; `tests/e2e/` Playwright |
| `RESTORE.md` | Time Travel and export restore, drill log |

## 8. Decisions that changed the original plan

Recorded in full in `spec.json` → `decision_log`:

- Worker-level Cloudflare Access on `workers.dev`, no custom domain.
- Document numbers `PREFIX-1000+`, no year, never reset; **random numbers rejected** because they break gap-free numbering and auditability.
- `reference` removed everywhere (the owner does not use customer PO numbers).
- Manual accept/reject removed; **conversion implies acceptance**.
- Customers can be typed on a document instead of picked first.
- Items live under **Settings → Items**, keeping the bottom bar short: Home · Customers · Quotes · Invoices · Settings.
- Simple **paid date** instead of a payments ledger (deferred).
- Item SKUs auto-assign by category: `MCH-001`, `PRT-001`, `CTRL-001`, editable, per company.

## 9. Environments and commands

| Command | Does |
| --- | --- |
| `npm run dev` | Local app with local D1/R2; Access bypass for `DEV_AUTH_EMAIL`; PDF rendering off |
| `npm run check` | Typecheck, lint, all Vitest tests |
| `npm run test:e2e` | Playwright against local dev |
| `npm run db:generate` | New SQL migration from the Drizzle schema |
| `npm run db:migrate:local` / `:staging` / `:prod` | Apply migrations (`:staging`/`:prod` are remote) |
| `npm run seed` | Fake data into local D1 (`-- --remote` targets staging) |
| `npm run deploy:staging` / `:prod` | Build for that environment and deploy |
| `npm run cf-typegen` | Regenerate bindings types after `wrangler.jsonc` changes |

### Releasing to production

Production is released only by pushing a version tag. The GitHub workflow then runs the checks, applies migrations and deploys, in that order, after the owner approves.

1. Commit and push `main`. Staging deploys automatically; check the change there.
2. Tag the commit and push the tag (this starts the production workflow):
   ```bash
   git tag -a v1.0.1 -m "v1.0.1: what changed"
   git push origin v1.0.1
   ```
3. GitHub → Actions → **Deploy production** → the run shows *Waiting* → **Review deployments** → tick `production` → **Approve and deploy**.
4. The run goes green. `npx wrangler deployments list --env production` shows the new version.

Version numbers: last digit for fixes (`v1.0.1`), middle digit for new features (`v1.1.0`). `npm run deploy:prod` from a laptop is for emergencies only.

## 10. Before a new chat starts work

1. Confirm the feature statuses in `spec.json` — everything is `done`; new work needs a new feature entry.
2. Read `CLAUDE.md` for the hard rules (money, company scope, immutability, numbering).
3. Do not run `db:migrate:prod`, `deploy:prod`, or any remote destructive command without explicit approval.
4. Check `RESTORE.md` before any data operation you might need to undo.

## 11. Traps worth knowing

- **Download links** (`/api/documents/:id/pdf`, `/preview`, `/api/export/documents.csv`) are plain browser navigations, so they authorise by **document id or `company_id` query parameter** plus membership. They must never require `X-Company-Id`.
- **Backup filenames** use the Malaysia date; the workflow runs at 02:10 MYT.
- **Restoring an export** can fail with `FOREIGN KEY constraint failed` because statements are grouped by table; insert parents first (`users → companies → company_members → customers → items → documents → document_lines → audit_log`).
- **Local dev has no Browser Run.** `PDF_RENDERING=off` there; issuing still succeeds and `pdf_r2_key` stays null.
- **Seed data is local by default**; `-- --remote` writes fake rows into staging.
- The `.wrangler` folder and `.dev.vars` are git-ignored; `worker-configuration.d.ts` is generated and committed.
- **Do not deploy production from the laptop.** `npm run deploy:prod` skips the release record (the tag), the checks and the migration ordering. Release with a `v*` tag (section 9).
- **Making the repo private on the free plan removes the approval step.** Required reviewers on a private repo need GitHub Pro.
