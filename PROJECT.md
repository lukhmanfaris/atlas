# PROJECT.md: SME Invoice and Delivery Order App

> Last updated: 24 Nov 2026. `spec.json` is the source of truth for data model, rules and acceptance criteria. `CLAUDE.md` holds the coding rules. This file explains what we are building and why.

## 1. What we are building

An internal web app for a small Malaysian business group. It produces branded **quotations, invoices and delivery orders** for several companies, and stores every issued document as a PDF for 7 years.

The main flow is **quotation → invoice → one or more delivery orders**. Each company has its own logo, registration number, bank details and document numbering.

## 2. Who uses it

- 1–5 internal staff, on laptops and phones.
- Two roles: **owner** (settings, users, voiding) and **staff** (day-to-day documents).
- Customers never log in. They receive PDFs, which staff download and send from their own mailbox in v1.

## 3. Decisions so far

| Topic | Decision | Reason |
| --- | --- | --- |
| Hosting | Cloudflare Workers, cloud only | Near-zero cost, nothing to maintain |
| Database | Cloudflare D1 (SQLite), location hint `apac` | One vendor, $0, simplest for an AI-assisted build |
| Files | Cloudflare R2 (logos, issued PDFs, backups) | 10 GB free, no egress fees |
| Login | Cloudflare Access, email one-time PIN | Free for up to 50 users, no password code to write |
| PDFs | HTML templates rendered by Cloudflare Browser Run | Same template for preview and PDF |
| SST | Not registered, so no SST on documents | Title is **INVOICE**, never TAX INVOICE |
| MyInvois | Not mandatory (all companies under RM3 million) | Fields reserved so it can be added later |
| Currency | MYR only | No foreign-currency invoicing today |
| Email | Deferred to next phase | Mailbox and domain not chosen yet |
| Spec format | PROJECT.md + CLAUDE.md + spec.json | Readable for people, precise for the agent |

## 4. Scope

**In v1**

- Company profiles with logo, bank details, numbering prefixes and default terms. Several companies, with a switcher.
- Customers and items (catalogue), per company.
- Quotations: draft, issue, accept, reject, void, and convert to invoice.
- Invoices: draft, issue, void.
- Delivery orders: created from an issued invoice, with partial deliveries, issue, mark delivered, void.
- A4 PDFs with logo, stored once at issue.
- Lists, search, dashboard, audit log, nightly backups and CSV export.

**Not in v1:** payments, expenses and reports, email sending, signed-DO upload, SST, MyInvois, foreign currency, customer portal, inventory, Bahasa Malaysia UI.

## 5. Document workflow

```
 Quotation ──convert──▶ Invoice ──create DO──▶ Delivery order #1 (partial)
 (draft→issued→          (draft→issued→void)  ──create DO──▶ Delivery order #2 (rest)
  accepted/rejected/void)                        (draft→issued→delivered / void)
```

Key rules (full detail in `spec.json` → `state_machines`, `numbering`, `calculations`):

1. **Drafts** can be edited and deleted. They have no number.
2. **Issuing** assigns the next number (e.g. `INV-2026-0042`), freezes the customer and company details, and stores the PDF with its SHA-256 hash.
3. **Issued documents never change.** Mistakes are fixed by voiding (owner only, with a reason) and issuing a new document. A voided document keeps its number.
4. **Numbers are gap-free** per company, document type and year, and restart at 0001 each January.
5. **Delivery orders** come only from issued invoices. They show quantities, not prices. The app tracks remaining quantity per invoice line, so several partial DOs can never exceed the invoice.
6. An invoice cannot be voided while it has delivery orders that are not void.
7. **Money** is stored in whole sen, and quantities in thousandths, so totals are exact.

## 6. Compliance notes

- **SST:** no company is registered. Documents must not charge or show SST. Tax columns exist in the database with value 0, so registering later is a settings change.
- **Record keeping:** keep issued documents and PDFs for 7 years. Never hard-delete an issued document.
- **PDPA:** the Act applies to customer contact details, but the obligations for a business this size are light. Collect only what documents need, keep the app behind Access, accept vendor data-processing terms, keep a one-page note of where data is stored, and publish a short privacy notice. A data protection officer is required only above 20,000 data subjects.
- **MyInvois:** not mandatory below RM3 million annual revenue (including related companies). Re-check if revenue grows.

## 7. Architecture

```
 Staff browser ──▶ Cloudflare Access (email PIN)
                        │
                        ▼
        ┌─────────────── Cloudflare Worker ───────────────┐
        │  React app (static assets)  │  Hono API /api/*  │
        └───────┬──────────────┬───────────────┬──────────┘
                ▼              ▼               ▼
          D1 database     R2 bucket       Browser Run
          (apac hint)   (logos, PDFs)   (HTML → PDF)

 GitHub Actions ── nightly `wrangler d1 export` ──▶ R2 backup bucket (kept 7 years)
```

| Layer | Choice |
| --- | --- |
| Frontend | React, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS, shadcn/ui |
| API | Hono on Workers, Zod validation shared with the client |
| Data | D1 with Drizzle ORM and drizzle-kit migrations |
| Files | R2: `FILES` bucket (logos, PDFs), `BACKUPS` bucket |
| Auth | Cloudflare Access; the Worker validates `Cf-Access-Jwt-Assertion` on every API call |
| PDF | Hono JSX templates → Browser Run (`@cloudflare/puppeteer`) |
| Tests | Vitest with `@cloudflare/vitest-pool-workers`; Playwright for key flows |
| CI/CD | GitHub Actions: check on push, staging from `main`, production on a version tag |

**Free-tier limits the code must respect:** 100,000 requests/day and 10 ms CPU per request. D1 allows 500 MB per database, 100,000 rows written/day, 50 queries per request (a batch counts as one) and 100 parameters per query. Browser Run gives 10 browser-minutes a day. At 1–5 users this leaves a wide margin.

## 8. Data model (summary)

`companies` · `users` · `company_members` · `customers` · `items` · `documents` (quotation, invoice, delivery order) · `document_lines` · `number_sequences` · `audit_log`

Every table except `users` carries `company_id`, and every query is filtered by the current company. Full field lists are in `spec.json` → `entities`.

## 9. Milestones

| Milestone | Features (ids in spec.json) | Done when |
| --- | --- | --- |
| **M0 Foundations** | F-00 scaffold and deploy | Hello page live on staging behind Access; CI green |
| **M1 Master data** | F-01 users and roles · F-02 companies and logo · F-03 customers · F-04 items | Two test companies with logos, customers and items on staging |
| **M2 Documents** | F-05 numbering · F-06 PDFs · F-07 quotations · F-08 invoices · F-09 convert · F-10 delivery orders | Quotation → invoice → two partial DOs works with correct PDFs |
| **M3 Go-live** | F-11 lists and dashboard · F-12 audit log · F-13 backups · F-14 CSV export | Restore drill passed, privacy notice published, one month running alongside the current method without differences |

Rough effort, part-time and AI-assisted: M0 1–2 weeks, M1 2 weeks, M2 3–4 weeks, M3 1–2 weeks plus the month-long parallel run.

## 10. Environments

| Environment | What | Data |
| --- | --- | --- |
| local | `npm run dev` with local D1 and R2 | Seeded fake data |
| staging | Own Worker, D1 and R2, behind Access | Fake data only |
| production | Own Worker, D1 and R2, behind Access | Real data |

## 11. Security and backups

- Access in front of everything; the `workers.dev` address is disabled; JWT checked on every API call.
- Roles checked in the API, not only hidden in the UI.
- Private R2 buckets; files served only through the Worker after a membership check.
- D1 Time Travel restores to any point in the last 7 days (Free plan).
- Nightly export to the backup bucket, kept 7 years. The owner downloads one copy a month to a computer in Malaysia.
- Restore drill before go-live, then every quarter (`RESTORE.md`).

## 12. Running cost

$0/month on free tiers at this size, plus the domain. Upgrade to Workers Paid ($5/month) when email sending or MyInvois is added.

## 13. Working with the coding agent

1. Put `PROJECT.md`, `CLAUDE.md` and `spec.json` in the root of an empty repository.
2. Start the agent and paste the kickoff prompt from `spec.json` → `agent_instructions.kickoff_prompt`.
3. For each next feature, use `agent_instructions.feature_prompt_template` with the feature id, e.g. *"Implement F-05 (Document numbering service) from spec.json…"*.
4. Review each feature on staging before moving on. The agent marks the feature `done` in `spec.json`.
5. When you change your mind about a rule, tell the agent to update `spec.json` and add a `decision_log` entry, in the same change.

## 14. Next phase (after go-live)

Payment tracking, email sending (needs a sending domain and Workers Paid), signed-DO photo upload, expenses and reports. SST and MyInvois only if registration or revenue requires them.
