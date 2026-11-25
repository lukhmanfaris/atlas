# DO Numbers Follow Invoice + Production Clean-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue each delivery order with its invoice's digits (`INV-1042` → `DO-1042`, then `DO-1042-2`…), and clear the test documents from production so real numbering starts at 1000.

**Architecture:** `issueDocumentNumber` gets a delivery-order branch whose single stamping UPDATE derives the number from the source invoice's `seq` plus a count of that invoice's already-numbered DOs. Production clean-up is a committed SQL file plus five R2 deletes, run after a fresh export.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), R2, Vitest (`@cloudflare/vitest-plugin`), Wrangler.

**Spec:** `docs/superpowers/specs/2026-11-25-do-numbers-follow-invoice-design.md`

## Global Constraints
- Number computed only in `src/worker/services/numbering.ts`, inside one `db.batch` (CLAUDE.md rule 5).
- Format: `{DO prefix}-{invoice seq, printf('%04d')}`; suffix `-{n+1}` when the invoice already has `n ≥ 1` numbered DOs (void included).
- Quotation and invoice numbering unchanged.
- Every production command needs the owner's go-ahead at the moment it runs. Backup first.
- Stored PDFs are never overwritten.

## Review Focus
- DO issued for an invoice whose first DO was voided → next is `DO-1042-2` (void keeps its number). Test in Task 1.
- DO draft with no `source_document_id` → issue returns null, no counter touched. Test in Task 1.
- DO prefix changed in settings → `XDO-1042`. Test in Task 1.
- Invoice issued with a non-default prefix (`ABC-1042`) → DO still `DO-1042` (digits from `seq`, not by parsing the number). Test in Task 1.
- Two companies with the same invoice digits → both get `DO-1000`, no clash (unique index is per company). Test in Task 1.

---

### Task 1: Delivery-order branch in numbering

**Files:**
- Modify: `src/worker/services/numbering.ts`
- Test: `tests/worker/numbering.test.ts` (extend `seedDraft` with optional `sourceDocumentId`; replace the `DO-1000` assertion in "counts separately per document type and per company")
- Test: `tests/worker/delivery-orders.test.ts` ("allows several partial deliveries…": assert issued numbers)

**Interfaces:**
- Produces: `issueDocumentNumber(d1, input): Promise<IssueNumberResult | null>` — signature unchanged; for `type: "delivery_order"` returns `{ number: "DO-1042" | "DO-1042-2", seq: <invoice seq> }`.

- [ ] **Step 1: Write failing tests** in a new `describe("delivery order numbers", …)`:
  - `"takes the invoice digits"`: issue invoice → `INV-1000`; DO draft sourced from it → `{ number: "DO-1000", seq: 1000 }`.
  - `"suffixes later delivery orders for the same invoice"`: second DO → `"DO-1000-2"`, third → `"DO-1000-3"`.
  - `"counts a voided delivery order"`: first DO issued then set `status: "void"`; next → `"DO-1000-2"`.
  - `"refuses a delivery order without an issued invoice"`: DO draft with no source → `null`; draft whose source is an unissued invoice → `null`.
  - `"uses the delivery order prefix and the invoice seq"`: `prefixInvoice: "ABC"`, `prefixDeliveryOrder: "XDO"` → `ABC-1000` / `XDO-1000`.
  - `"does not advance a delivery order counter"`: after a DO issue, `nextValue(companyId, "delivery_order")` is `null`.
  - Update the per-type test: drop the bare DO issue (now covered above).
  - API test: in the partial-deliveries test, first issued DO `number` is `"DO-1000"`; issue the second and assert `"DO-1000-2"`.
- [ ] **Step 2:** `npx vitest run tests/worker/numbering.test.ts tests/worker/delivery-orders.test.ts` → new tests FAIL (DO gets its own `DO-1000`/`DO-1001`).
- [ ] **Step 3: Implement.** In `issueDocumentNumber`, when `type === "delivery_order"` run a batch of only the stamping UPDATE (+ `extraStatements`); no `number_sequences` statements. The UPDATE sets `seq` = source invoice `seq`; `number` = prefix `|| '-' || printf('%04d', inv.seq) ||` (`''` when count of `documents o WHERE o.company_id = ? AND o.type = 'delivery_order' AND o.source_document_id = documents.source_document_id AND o.number IS NOT NULL` is 0, else `'-' || (count + 1)`); `WHERE id = ? AND company_id = ? AND type = 'delivery_order' AND status = 'draft' AND EXISTS (source invoice in same company, type 'invoice', seq NOT NULL)`. Success = stamp `changes > 0`. Quotation/invoice path untouched.
- [ ] **Step 4:** Same vitest command → PASS. Then `npm run check` → typecheck, lint, all tests pass.
- [ ] **Step 5: Commit** `feat: delivery order numbers follow their invoice`.

### Task 2: Record the rule

**Files:**
- Modify: `spec.json` (`numbering.format`, `numbering.examples` → add `DO-1042-2`, `numbering.rules`: DO rule + "DO numbers may have gaps"; `numbering.implementation`: DO note; `decision_log`: two entries dated 2026-11-25 — DO numbering, one-off production clear + counter restart)
- Modify: `CLAUDE.md` rule 5 — append "Delivery orders take their invoice's digits (`DO-1042`, `DO-1042-2`)."
- Modify: `PROJECT.md` §5 numbering bullet and §2 Data row (production: companies, customers, items; no documents yet)

- [ ] **Step 1:** Edit the three files; `python3 -c "import json;json.load(open('spec.json'))"` → no error.
- [ ] **Step 2: Commit** `docs: delivery order numbering and the production clear in spec and guides`.

### Task 3: Production clean-up (owner confirms each step)

**Files:**
- Create: `scripts/2026-11-25-clear-test-documents.sql`

- [ ] **Step 1: Write the SQL file** — statements in this order: `DELETE FROM document_lines WHERE document_id IN (SELECT id FROM documents WHERE type = 'delivery_order')`; `DELETE FROM documents WHERE type = 'delivery_order'`; same pair for `'invoice'`, then `'quotation'`; `DELETE FROM audit_log WHERE entity = 'document'`; `DELETE FROM number_sequences`. Commit `chore: script to clear test documents from production`.
- [ ] **Step 2: Baseline + backup** — read-only counts of companies, users, company_members, customers, items, item_sku_sequences, non-document audit rows (to compare in Step 5); then `npx wrangler d1 export DB --remote --env production --output ~/Documents/atlas-backups/2026-11-25-before-cleanup.sql` → file exists and contains `INSERT INTO "documents"`.
- [ ] **Step 3: Run SQL** — `npx wrangler d1 execute DB --remote --env production --file scripts/2026-11-25-clear-test-documents.sql`.
- [ ] **Step 4: Delete PDFs** — `npx wrangler r2 object delete atlas-files-production/<key> --remote` for the five keys: `01a211ad-bc6a-7ee6-97b6-b9cf72893963/invoice/2026/INV-1000.pdf`, `…/INV-1000-void.pdf`, `…/INV-1001.pdf`, `…/INV-1001-paid.pdf`, `01a211ad-bc6a-7ee6-97b6-b9cf72893963/delivery_order/2026/DO-1000.pdf`.
- [ ] **Step 5: Verify** — re-run the read-only counts: 0 documents, 0 document_lines, 0 `entity='document'` audit rows, 0 number_sequences; 2 companies, customers and items unchanged; `wrangler r2 object get … --remote` on one key → not found.
- [ ] **Step 6: Deploy** — ask; then `npm run deploy:prod` (and push `main`).
