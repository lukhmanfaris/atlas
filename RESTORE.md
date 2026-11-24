# Restoring Atlas data

Plain-language instructions for getting data back. Two ways: a quick rewind with
D1 Time Travel, or a rebuild from a nightly export.

Everyone with access to this repository is a member of the business, so keep
these steps in the repo rather than in a personal note.

---

## What is backed up, and where

| What | Where | Kept |
| --- | --- | --- |
| Recent database state | D1 **Time Travel** (Cloudflare's own snapshots) | 7 days on the free plan |
| Nightly database export | R2 bucket `atlas-backups-production`, path `backups/YYYY/MM/DD.sql.gz` | 7 years (lifecycle rule) |
| Issued PDFs and logos | R2 bucket `atlas-files-production` | forever; files are written once and never overwritten |
| Code | GitHub repository | forever |

The nightly export runs from `.github/workflows/backup.yml` at 02:10 Malaysia
time. You can also run it by hand: GitHub → **Actions** → **Nightly backup** →
**Run workflow**.

---

## Setting the 7-year lifecycle rule (one-off, in the dashboard)

Cloudflare keeps objects for ever unless a lifecycle rule says otherwise.

1. Dashboard → **R2** → **atlas-backups-production** → **Settings**.
2. **Object lifecycle rules** → **Add rule**.
3. Name: `keep-backups-7-years`.
4. Scope: prefix `backups/`.
5. Action: **Delete objects** after **2555 days** (7 × 365).
6. Save.

Check it once a year, and again if Cloudflare changes the plan limits.

---

## Route 1 — rewind with Time Travel (minutes, no export needed)

Use this when something was deleted or changed **in the last 7 days**.

1. Dashboard → **D1** → **atlas-production** → **Time Travel**.
2. Pick the point in time, ideally a minute **before** the mistake. The preview
   shows the state at that moment.
3. **Restore**. Cloudflare takes a bookmark first, so this step is reversible.
4. Tell the team that anything entered after that moment is gone and must be
   re-entered.

Time Travel replaces the whole database. It is not a way to recover one row.

---

## Route 2 — rebuild from a nightly export

Use this when the damage is older than 7 days, or when you want a copy to look
at without touching production.

### Restore into staging (the safe rehearsal)

1. Download the export: **R2** → **atlas-backups-production** → pick
   `backups/YYYY/MM/DD.sql.gz` → **Download**. Decompress it on your computer:
   `gunzip 2026-11-26.sql.gz`
2. Empty the staging database first — the export creates tables and will fail if
   they already exist. In the dashboard: **D1** → **atlas-staging** → **Console**,
   then run the drop statements for each table (`documents`, `document_lines`,
   `customers`, `items`, `companies`, `users`, `company_members`,
   `number_sequences`, `item_sku_sequences`, `audit_log`).
3. Load the file:
   `npx wrangler d1 execute atlas-staging --remote --env staging --file ./2026-11-26.sql`
4. Open the staging app and check: the company list, a few invoices, and that
   `/api/me` shows your email. Numbers and totals should match the export date.

### Restore into production

Same steps with `atlas-production` and `--env production`, and **only** after:

- the staging rehearsal worked on the same file,
- the owner has said yes in writing,
- you have exported the current production database first, so there is a way
  back.

Expect to lose everything created after the export was taken.

---

## The drill (run once before go-live, then quarterly)

Do this on a normal day, not during an emergency.

- [ ] Trigger **Nightly backup** manually and confirm a new object appears under
      `backups/YYYY/MM/DD.sql.gz`.
- [ ] Download that object and decompress it (`gunzip`).
- [ ] Restore it into **staging** using Route 2.
- [ ] Sign in to staging and check: two companies, customers, items, a few issued
      invoices, and one delivery order.
- [ ] Pick one issued invoice, open its PDF from R2, and confirm it is the same
      file as before the drill (the SHA-256 on the document still matches).
- [ ] Note the date and who ran it at the bottom of this file.

### Drill log

| Date | Run by | Result | Notes |
| --- | --- | --- | --- |
| — | — | not yet run | required before go-live |

---

## Monthly local copy

The owner downloads one export a month and keeps it on a computer in Malaysia.
That copy is outside Cloudflare on purpose: it is the answer to "what if the
account is lost".

1. R2 → `atlas-backups-production` → download the newest `.sql.gz`.
2. Store it in the business's usual secure folder. Do not email it.
