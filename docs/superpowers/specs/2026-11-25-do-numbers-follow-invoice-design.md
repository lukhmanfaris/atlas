# Delivery order numbers follow their invoice — design

**Date:** 2026-11-25 · **Approved by owner in conversation.**

## Intent
A delivery order should carry its invoice's number so anyone can pair the two at a glance (the invoice number was dropped from the DO PDF earlier). INV-1042 → DO-1042.

## Decisions (owner)
- Format: DO prefix + the invoice's digits: `DO-1042`. Not the literal `INV-1042` (number is unique per company).
- Extra DOs for the same invoice (partial delivery, or replacing a voided DO): `DO-1042-2`, `DO-1042-3`. The first stays plain.
- Production test documents are cleared before go-live instead of renumbered: delete all quotations, invoices, delivery orders, their lines, their stored PDFs and their activity-log rows; restart counters so the next numbers are QT-1000 / INV-1000. Keep companies, users, members, customers, items.

## Constraints
- Rule 5 stays in spirit: the number is computed only in `services/numbering.ts`, inside the issuing `db.batch`.
- Quotations and invoices keep their gap-free counters. DO numbers have gaps by design (an invoice with no DO).
- Stored PDFs are never overwritten; the counter restart is only safe because the old PDFs are deleted.

## Approaches
1. **Compute in the issuing batch from the source invoice (chosen).** One SQL UPDATE reads the invoice's `seq` and counts the invoice's numbered DOs. No schema change.
2. Compute in the route or client — rejected: breaks rule 5.
3. Add a `suffix` column — rejected: data-model change for no gain.

## Left to the builder
- A DO whose source is missing or not a numbered invoice is not issued (returns null → 409).
- DO `seq` stores the invoice's seq; `number_sequences` is no longer advanced for DOs.
