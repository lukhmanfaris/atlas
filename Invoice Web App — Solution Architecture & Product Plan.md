# Invoice Web App — Solution Architecture & Product Plan

> **Historical document.** This holds the research and reasoning from 24 November 2026, before the build.
> The system has since been built and deployed, and some decisions changed (no custom domain, Worker-level Access, no reference field, no manual accept/reject, `PREFIX-1000+` numbering, a simple paid date instead of a payments ledger).
> **For current state read `PROJECT.md`; for behaviour read `spec.json`; for code rules read `CLAUDE.md`.**

Nov 24, 2026 · @Lukhman Faris

## Summary

Build a small internal app on Cloudflare Workers and D1 that issues branded quotations, invoices and delivery orders for each of your companies. It costs about $0 a month to run. The build instructions live in three repository files: PROJECT.md, CLAUDE.md and spec.json.

- **What:** quotation → invoice → one or more delivery orders, for 1–5 staff and several companies. Each company has its own logo, registration number, bank details and numbering.
- **Stack:** a React and Hono app in one Cloudflare Worker, a D1 database, R2 for logos and PDFs, Cloudflare Access for login, and Browser Run for PDFs.
- **Rules that shaped it:** no company is SST-registered, so documents say INVOICE and carry no SST. All companies are under RM3 million, so MyInvois is not needed. Everything is in MYR, and PDPA duties are light at this size.
- **Cost:** about $0/month on free tiers. Workers Paid ($5/month) is needed once the app sends email.
- **Timeline (estimate, part-time and AI-assisted):** about 7–10 weeks to build, then one month running alongside your current method.
- **This doc** holds the reasoning and research. spec.json is the source of truth for the build.

## Product requirements

v1 lets 1–5 staff issue quotations, invoices and delivery orders for several companies, each with its own branding and numbering. Payments, expenses and email follow in the next phase.

**Users and roles**

| Role | Who | Can do |
| --- | --- | --- |
| Owner | You | Everything: companies, logo, users, settings, voiding, export |
| Staff | 1–4 people | Customers, items, drafts, issuing, converting quotations, creating delivery orders, marking them delivered, downloading PDFs |

**Scope by release**

| Module | v1 | Next phase | Only if required later |
| --- | --- | --- | --- |
| Companies | Several entities; logo, SSM no., address, bank details, numbering prefixes, default terms, PDF colour | — | SST no., TIN, MSIC code (fields already reserved) |
| Customers | Per company; name, registration no., contact, billing and delivery address, payment terms | — | TIN for MyInvois |
| Items | Catalogue: SKU, name, unit, unit price | — | LHDN classification code |
| Quotations | Draft → issued → accepted, rejected or void; PDF; convert to invoice | Email to customer | — |
| Invoices | Gap-free numbering per company; PDF with logo; void with reason | Payment tracking, email, payment links | SST tax invoice, MyInvois |
| Delivery orders | Created from an issued invoice; partial deliveries; no prices; signature blocks; mark delivered | Upload of customer-signed DO | — |
| Reports | Lists, search, dashboard, CSV export | Expenses, profit and loss, aging | — |

**Not in v1:** payments, expenses, email from the app, SST, MyInvois, foreign currency, customer portal, inventory, Bahasa Malaysia UI, offline mode.

**Key user stories**

1. As the owner, I switch company and every new document carries that company's logo, registration number and numbering.
2. As staff, I turn an accepted quotation into an invoice in one click, without retyping lines.
3. As staff, I create a delivery order from an invoice for part of the goods, then a second one for the rest. The app stops me from delivering more than was invoiced.
4. As staff, I print a delivery order with no prices and a block for the customer's signature and company stamp.
5. As the owner, I void a wrong invoice with a reason, and it keeps its number.

**Success criteria**

- A branded invoice is issued from a saved customer in under 2 minutes.
- Zero duplicate or skipped numbers per company and document type.
- Delivered quantities never exceed invoiced quantities.
- Hosting stays at $0/month at the current size.
- A restore from backup has been tested before go-live.

## Malaysia compliance requirements

No company is SST-registered and all are under RM3 million, so the rules are light. That means plain invoices with no SST, 7-year record keeping, and basic PDPA care. SST invoices and MyInvois are designed for, but switched off.

| Rule | What it means for the app | Source |
| --- | --- | --- |
| No SST registration | Documents don't charge or show SST and are titled INVOICE, never TAX INVOICE. Tax columns exist with value 0, so registering later is a settings change plus a tax-invoice template. | [ClearTax: what a tax invoice needs once registered](https://cleartax.com/my/en/tax-invoice-malaysia) |
| Record keeping | Keep issued documents and their PDFs for 7 years. Never hard-delete or edit an issued document. | [LHDN Public Ruling 4/2000](https://www.hasil.gov.my/wp-content/uploads/PR4_2000_Rev.pdf), [Grant Thornton](https://grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Malaysia) |
| MyInvois threshold | Businesses under RM3 million are exempt unless a related company or shareholder is at or above it. Re-check every year. | [KPMG](https://kpmg.com/us/en/taxnewsflash/news/2026/09/malaysia-e-invoicing-threshold-increased-rm3-million-effective-september-1-2026.html), [RinggitPlus](https://ringgitplus.com/en/blog/personal-finance-news/freelancers-are-now-exempt-from-e-invoicing-too.html) |
| PDPA scope | Customer contact persons' names, addresses and contact details are personal data, even in B2B invoicing. | [Thomas Philip](https://thomasphilip.com.my/articles/articles-3) |
| PDPA privacy notice | A written notice in Bahasa Malaysia and English. | [Chambers](https://practiceguides.chambers.com/practice-guides/comparison/1129/18512/29027-29028-29029-29030-29031) |
| PDPA data protection officer | Required only above 20,000 data subjects (10,000 for sensitive data) or for systematic monitoring, so not needed now. | [DNH](https://dnh.com.my/mandatory-appointment-of-data-protection-officer-dpo-effective-1-june-2025/) |
| PDPA cross-border transfer | More flexible since the 2024 amendments. Keep a short record of where data is stored and on what basis. | [CMS](https://cms.law/en/omn/legal-updates/malaysian-guidelines-on-cross-border-data-transfers) |
| PDPA breaches and penalties | Notify the Commissioner and affected individuals if a breach causes or is likely to cause significant harm. Fines go up to RM1 million and/or 3 years in prison. | [Rödl](https://www.roedl.com/en/insights/malaysia-personal-data-protection-amendment-act-2024/) |

Re-check this section if you register for SST, a company's revenue nears RM3 million, or you appoint a tax agent.

## Target architecture

&#91;embedded content: target architecture · v1 on Cloudflare\]

Staff pass Cloudflare Access before they reach the Worker. The Worker keeps data in D1 and files in R2, and renders PDFs with Browser Run. A nightly job exports the database to a backup bucket that keeps copies for 7 years.

## Tech stack exploration

Recommendation, updated 24 Nov: keep everything on Cloudflare, with Workers for the app and **D1** for the database. Neon Postgres in Singapore was the first pick, while SST record rules and MyInvois looked likely. With neither applying, D1's simplicity wins.

**Database options compared** (all with Cloudflare Workers in front)

| Option | Data location | v1 cost | Lock-in | Free backups | Effort for an AI-assisted solo build |
| --- | --- | --- | --- | --- | --- |
| **A. All Cloudflare: D1 + R2 (chosen)** | "apac" hint only, and a hint [does not guarantee the location](https://developers.cloudflare.com/d1/configuration/data-location/) | $0 | Medium: SQLite dialect, eased by Drizzle | 7-day Time Travel ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)) | Lowest: one vendor, no connection strings |
| B. Workers + Neon Postgres, Singapore | AWS Singapore ([Neon](https://neon.com/docs/changelog/2026-04-17)) | $0 | Low: standard Postgres | 6-hour restore window ([Neon free plan](https://neon.com/faqs/free-plan-limits-and-quotas)) | Low–medium: second vendor, Hyperdrive, cold starts after 5 idle minutes |
| C. Workers + Supabase, Singapore | AWS Singapore ([Supabase regions](https://supabase.com/docs/guides/platform/regions)) | $0, but free projects pause after 1 week idle; Pro $25/month ([pricing](https://supabase.com/pricing.md)) | Low: Postgres, self-hostable | None on free | Medium: Auth and Storage overlap with Cloudflare |
| D. Workers + Postgres in Malaysia (AWS Lightsail) | AWS Malaysia ([AWS](https://aws.amazon.com/about-aws/whats-new/2026/04/amazon-lightsail-malaysia)) | From $15/month ([Lightsail FAQ](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html)) | Low: Postgres | Managed snapshots | Medium: AWS account and networking |

A wins now: it's $0, has the longest free restore window, and means fewer moving parts for you and the AI. Its weakness is that the data's country isn't fixed, and PDPA handles that with a short transfer record. Move to B or D if you register for SST, a company nears RM3 million, or a tax agent wants the data in a named country. Drizzle makes that a migration, not a rewrite.

**Chosen stack**

| Layer | Choice | Why | Exit path |
| --- | --- | --- | --- |
| Compute and hosting | One Cloudflare Worker serving the React app and the API | Static assets free and unlimited; 100,000 requests/day on Free ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)) | Hono runs on Node, Bun or Deno |
| API framework | Hono + Zod validation | Small, typed, portable | Same |
| Frontend | React + Vite, TanStack Query, Tailwind CSS, shadcn/ui | Mainstream stack that AI tools write well | Any static host |
| Database | Cloudflare D1, apac hint, read replication off | 500 MB per database, 100,000 rows written/day on Free ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [pricing](https://developers.cloudflare.com/d1/platform/pricing/)) | Drizzle schema ported to Postgres |
| ORM and migrations | Drizzle ORM + drizzle-kit | Typed SQL; supports SQLite and Postgres | Plain SQL migrations |
| Files (logos, issued PDFs) | Cloudflare R2 | 10 GB free, no egress fees ([R2 pricing](https://developers.cloudflare.com/r2/pricing)) | S3 API: copy to any S3 store |
| Login | Cloudflare Access with email one-time PIN | Free for up to 50 users ([Access](https://www.cloudflare.com/en-gb/products/zero-trust/access)) | App-level login later |
| PDF | HTML template rendered by Cloudflare Browser Run | 10 browser-minutes/day on Free ([limits](https://developers.cloudflare.com/browser-rendering/platform/limits)) | Any headless Chrome |
| Email | Next phase: Cloudflare Email Sending | Needs Workers Paid; beta ([Email Service](https://developers.cloudflare.com/email-service/)) | Any SMTP or email API |
| Tests | Vitest in the Workers runtime; Playwright for key flows | Tests run against the real D1 engine | Standard tools |
| Backup | D1 Time Travel + nightly `wrangler d1 export` from GitHub Actions to an R2 backup bucket | 7-day restore window plus a 7-year archive | Standard SQL dump |

**Running it locally:** `wrangler dev` emulates the Worker, D1 and R2 on your laptop, with seeded fake data.

## Data residency and PDPA

Where the data sits matters less than first thought. PDPA allows storage outside Malaysia with simple safeguards, and the SST "records kept in Malaysia" rule doesn't apply while no company is registered. So data stays on Cloudflare in APAC, and the owner keeps a monthly backup copy in Malaysia.

| Data | Where it lives | Note |
| --- | --- | --- |
| Database: companies, customers, documents | Cloudflare D1, "apac" location hint | A hint, not a guarantee: record this in the transfer note |
| Files: logos, issued PDFs | Cloudflare R2 | Private bucket, served only through the Worker |
| Requests in transit | Cloudflare's network, usually the nearest data centre | Not pinned to a region |
| Nightly backup | R2 backup bucket, kept 7 years | Written by a GitHub Actions job |
| Monthly copy | The owner's computer in Malaysia | Downloaded by the owner |

**PDPA checklist before go-live**

- [ ] Write a one-page transfer record: Cloudflare (APAC) and GitHub, what data each holds, and why.
- [ ] Accept Cloudflare's and GitHub's data processing terms.
- [ ] Collect only what documents need. No NRIC or passport numbers in v1.
- [ ] Publish a short privacy notice in Bahasa Malaysia and English saying invoices and contact details are kept in a cloud service.
- [ ] Write a half-page breach plan: who decides, and how to notify the Commissioner and affected customers.
- [ ] Re-check the data protection officer rule if the customer list ever approaches 20,000 people.

## Data model

One `documents` table holds quotations, invoices and delivery orders. Every table carries `company_id`, and issued documents are never edited. SST and MyInvois fields already exist as hidden, optional columns. Full field lists are in spec.json → `entities`.

| Table | Holds | Key rules | Reserved for later (hidden) |
| --- | --- | --- | --- |
| `companies` | Each legal entity: logo, SSM no., address, bank details, prefixes, default terms | Owner edits only | SST registered flag, SST no., TIN, MSIC code |
| `users`, `company_members` | Staff identified by their Cloudflare Access email; role per company | Owner or staff | — |
| `customers` | Buyers, per company: billing and delivery address, contact, payment terms | Archived, never deleted | TIN |
| `items` | Catalogue: SKU, name, unit, unit price | SKU unique per company | LHDN classification code |
| `documents` | Quotations, invoices and delivery orders, told apart by `type` | Number assigned at issue; customer and company details frozen at issue; PDF key and SHA-256 stored | Tax total (0 in v1) |
| `document_lines` | Quantity, unit, price, discount per line; DO lines have no price | `source_line_id` links invoice to quotation lines and DO to invoice lines | Tax rate (0 in v1) |
| `number_sequences` | Next number per company, document type and year | Updated only by the numbering service | — |
| `audit_log` | Who did what, and when | Insert only | — |

**Rules the code must keep**

- **Money:** whole sen in `INTEGER` columns; quantities in thousandths. Round half up per line, then total.
- **Gap-free numbers:** drafts have no number. D1 has no interactive transactions, so issuing runs as one `db.batch`, which executes as a single transaction. A voided document keeps its number.
- **Delivery limits:** for each invoice line, quantities on all non-void delivery orders can never exceed the invoiced quantity.
- **Company isolation:** every query goes through one data-access layer that requires `company_id`.
- **Time:** timestamps in UTC; business dates as `YYYY-MM-DD` in Malaysia time.

## MyInvois design (future, only if required)

Not needed now: every company is under RM3 million. This design is kept for the day a company crosses the threshold. The reserved fields in the data model make it an add-on module: it signs each issued invoice, submits it, waits for LHDN to validate it, and adds the QR code to the PDF.

**Prerequisites per company**

- [ ] Register the app as an ERP system in MyInvois to get a client ID and secret, separately for sandbox and production ([Retarus](https://docs.retarus.com/sci/process-description-malaysia)).
- [ ] Buy a soft X.509 signing certificate from a Malaysian licensed certification authority: one per tax ID, with the Non-Repudiation key usage ([Retarus](https://docs.retarus.com/sci/e-invoicing-malaysia), [MyInvois signature spec](https://sdk.myinvois.hasil.gov.my/signature/)).
- [ ] Fill in the company's MSIC code and each item's classification code.

**Document flow**

1. Staff issue the invoice as in v1. The app builds the e-invoice from the frozen snapshot.
2. A Cloudflare Workflow signs it with the company's key, held as a Worker secret. The spec requires XAdES with SHA-256 and RSA.
3. The Workflow logs in as a taxpayer system and reuses the token until it expires. Tokens last 60 minutes by default.
4. It submits the document and stores the submission UID.
5. It polls the submission until the status is valid or invalid. If invalid, staff see LHDN's errors, fix them and submit again.
6. If valid, it stores the UUID and long ID, adds the QR code and validation link to the PDF, and emails the buyer.
7. Within [72 hours of validation](https://sdk.myinvois.hasil.gov.my/einvoicingapi/03-cancel-document/) a wrong document can be cancelled. After that, corrections go through a credit or debit note, which is submitted the same way.
8. Each month, B2C sales without their own e-invoice go into one consolidated e-invoice, [within 7 calendar days of month end](https://assets.kpmg.com/content/dam/kpmg/my/pdf/e-invoicing-tax-whiz-guidelines-july-2024.pdf).

**API limits that shape the design** ([MyInvois integration practices](https://sdk.myinvois.hasil.gov.my/integration-practices/))

| API | Limit per client ID | Design response |
| --- | --- | --- |
| Login as taxpayer system | 12/min | Cache the token for its lifetime |
| Submit documents | 100/min | Queue submissions per company |
| Get submission | 300/min | Poll with back-off; never use search to track status |
| Validate TIN | 60/min | Check when a customer is saved, not at submit |
| Cancel document | 12/min | Manual action only |

Plan on Workers Paid ($5/month) for MyInvois: signing may exceed the Free plan's 10 ms CPU limit per request. The MyInvois sandbox deletes data after 3 months, so keep test evidence in the app.

## Security, backups and exit plan

Cloudflare Access keeps everyone except your named staff away from the app entirely. The app then checks Access's signed token and each user's role per company. D1 can rewind 7 days, a nightly export is kept for 7 years, and a restore is rehearsed before go-live.

**Security controls**

- **Login:** Access email one-time PIN, with an allow-list of staff emails.
- **No bypass:** the Worker validates the Access token (`Cf-Access-Jwt-Assertion`) on every API call, and the public `workers.dev` address is switched off.
- **Roles:** owner and staff per company, checked in the API, not only hidden in the UI.
- **Secrets:** kept in Wrangler and GitHub secrets, never in the repository.
- **Files:** R2 buckets are private. Logos and PDFs stream through the Worker after a membership check.
- **Audit:** issue, void, accept, reject, convert, mark-delivered, settings and member changes go to `audit_log`.
- **AI-written code:** every route passes a checklist covering auth, `company_id` filter, Zod validation, and tests for money and numbering.

**Backups**

| What | How | Kept | Restore drill |
| --- | --- | --- | --- |
| Database, recent | D1 Time Travel: rewind to any minute | 7 days on Free | Once before go-live |
| Database, archive | Nightly GitHub Actions `wrangler d1 export`, compressed, to the R2 backup bucket | 7 years, by R2 lifecycle rule | Quarterly, rebuild staging from last night's export |
| Local copy | The owner downloads one export a month to a computer in Malaysia | Owner's choice | — |
| Files | Issued PDFs are written once and never overwritten | 7 years | Spot-check during the drill |
| Code and config | Private GitHub repository | Full history | Redeploy from scratch once |

**Exit plan**

| Component | Replacement if you leave | Effort |
| --- | --- | --- |
| Workers (Hono API) | Node or Bun container on any host | Low |
| D1 | Postgres: port the Drizzle schema, load the exported data | Medium |
| R2 | Any S3-compatible store, copied with `rclone` | Low |
| Browser Run | Headless Chrome (Playwright) in a container | Low |
| Cloudflare Access | App-level login library | Medium |

## Cost estimate

v1 runs at about $0 a month on free tiers. Email sending adds $5 a month for Workers Paid. Moving the database to Malaysia would add about $15 a month, and is needed only if a tax agent asks. Vendors bill in USD.

| Item | v1 on free tier | Upgrade when | Cost after upgrade |
| --- | --- | --- | --- |
| Cloudflare Workers | 100,000 requests/day, 10 ms CPU each | Email sending (next phase), or heavier processing | $5/month minimum ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)) |
| Cloudflare D1 | 5 GB total, 500 MB per database, 5 million rows read and 100,000 written per day | Years away at 1–5 users | Included with Workers Paid up to 5 GB ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)) |
| Cloudflare R2 (files and backups) | 10 GB, no egress fees | Files and backups pass 10 GB | $0.015/GB-month ([R2](https://developers.cloudflare.com/r2/pricing)) |
| Cloudflare Access | Up to 50 users | Not expected | $0 |
| Browser Run (PDFs) | 10 browser-minutes/day; each PDF is made once | Very high PDF volume | $0.09 per browser hour on Paid ([Cloudflare plans](https://www.cloudflare.com/plans.md)) |
| Email to customers | Staff download the PDF and send it from their own mailbox | Next phase, after choosing a sending domain | Needs Workers Paid; check Cloudflare's sending price |
| GitHub (code, CI, nightly backup) | Private repository on the free plan | Not expected | $0 |
| Postgres in Malaysia (option D) | Not used | Only if a tax agent requires it | From $15/month on Lightsail ([AWS](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html)) |

Free-tier terms change often, so set Cloudflare usage alerts at 80% of each free limit.

## Roadmap

&#91;embedded content: roadmap · 4 milestones, parallel run, 2 gates\]

v1 replaces your current invoicing only after a month of matching results. Payments, email and expenses follow in the next phase. The weeks are estimates for about 15–20 hours a week.

**Building it with AI assistance**

- Put PROJECT.md, CLAUDE.md and spec.json in the root of an empty repository.
- Start Claude Code and paste the kickoff prompt from spec.json → `agent_instructions.kickoff_prompt`.
- Build one feature at a time with the feature prompt template, and review each on staging before the next.
- Ask for tests first on money, numbering, delivery limits and permissions. CI runs them on every push.
- When a rule changes, have the agent update spec.json and its decision log in the same change.

## Risks and open questions

The biggest risk is now bugs in AI-written code around money, numbering and permissions. The spec answers it with a test for every acceptance criterion and a month of running alongside your current method.

| Risk | Mitigation |
| --- | --- |
| Bugs in AI-written code: rounding, numbering, delivery limits, missing auth checks | Tests per acceptance criterion, the route checklist in CLAUDE.md, one month running in parallel |
| D1's location is a hint, not a guarantee | A transfer record for PDPA. Move to option B or D if a tax agent or customer requires a named country |
| Free-tier terms change or limits are hit | Usage alerts at 80%; Workers Paid is $5/month |
| Browser Run's free minutes run out on a busy day | Each PDF is made once at issue; a failed render retries on download |
| Revenue nears RM3 million, or the business registers for SST | MyInvois and SST fields already exist, and the designs are kept in this doc |
| You are the only maintainer | PROJECT.md, CLAUDE.md, spec.json and RESTORE.md live in the repository |

**Answered on 24 Nov**

| Question | Answer | Effect |
| --- | --- | --- |
| Any company or related company at or above RM3 million? | No | MyInvois not needed |
| SST registration? | None | Plain INVOICE, no SST |
| Tax agent? | Not appointed | Follow the 7-year rule; confirm the setup with an agent later |
| Foreign currency? | No | MYR only |
| Sending mailbox and domain? | Next phase | No email in v1 |
| How do delivery orders relate to invoices? | Invoice first, DO from it | Partial deliveries from one invoice |
| Database? | All-Cloudflare D1 | Option A |

**Still open**

- [ ] When a tax agent is appointed, confirm that cloud storage plus a monthly local copy is acceptable for 7-year record keeping.
- [ ] Choose the sending domain and mailbox before the email phase.

## Sources

Prices and limits checked on 24 Nov 2026.

**Malaysian rules**

- [KPMG: e-invoicing threshold raised to RM3 million](https://kpmg.com/us/en/taxnewsflash/news/2026/09/malaysia-e-invoicing-threshold-increased-rm3-million-effective-september-1-2026.html)
- [MyInvois SDK: integration practices and rate limits](https://sdk.myinvois.hasil.gov.my/integration-practices/)
- [MyInvois SDK: digital signature](https://sdk.myinvois.hasil.gov.my/signature/) and [cancel document](https://sdk.myinvois.hasil.gov.my/einvoicingapi/03-cancel-document/)
- [ClearTax: SST tax invoice particulars](https://cleartax.com/my/en/tax-invoice-malaysia)
- [Grant Thornton: Malaysia indirect tax guide](https://grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Malaysia)
- [LHDN Public Ruling 4/2000: keeping sufficient records](https://www.hasil.gov.my/wp-content/uploads/PR4_2000_Rev.pdf)
- [CMS: PDPA cross-border transfer guidelines](https://cms.law/en/omn/legal-updates/malaysian-guidelines-on-cross-border-data-transfers)
- [DNH: data protection officer thresholds](https://dnh.com.my/mandatory-appointment-of-data-protection-officer-dpo-effective-1-june-2025/)
- [Rödl: PDPA Amendment Act 2024 penalties and breach notification](https://www.roedl.com/en/insights/malaysia-personal-data-protection-amendment-act-2024/)
- [Thomas Philip: what counts as personal data](https://thomasphilip.com.my/articles/articles-3)

**Platforms**

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing)
- [Cloudflare Browser Run limits](https://developers.cloudflare.com/browser-rendering/platform/limits)
- [Cloudflare Email Service](https://developers.cloudflare.com/email-service/)
- [Neon Free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas)
- [Supabase pricing](https://supabase.com/pricing.md)
- [AWS Lightsail in Malaysia](https://aws.amazon.com/about-aws/whats-new/2026/04/amazon-lightsail-malaysia)
