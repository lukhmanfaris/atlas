-- One-off clear of test documents on PRODUCTION before go-live.
-- Approved by the owner on 2026-11-25.
--
-- Deletes: all delivery orders, invoices and quotations (and their lines),
-- the document activity-log rows (audit_log where entity = 'document'),
-- and the number counters (number_sequences).
-- Keeps: companies, users, company members, customers and items.
--
-- Run ONLY after a fresh backup of the production database.
-- Stored PDFs in R2 are NOT removed by this script; delete them separately.
--
-- Run command:
--   npx wrangler d1 execute DB --remote --env production --file scripts/2026-11-25-clear-test-documents.sql

DELETE FROM document_lines WHERE document_id IN (SELECT id FROM documents WHERE type = 'delivery_order');
DELETE FROM documents WHERE type = 'delivery_order';
DELETE FROM document_lines WHERE document_id IN (SELECT id FROM documents WHERE type = 'invoice');
DELETE FROM documents WHERE type = 'invoice';
DELETE FROM document_lines WHERE document_id IN (SELECT id FROM documents WHERE type = 'quotation');
DELETE FROM documents WHERE type = 'quotation';
DELETE FROM audit_log WHERE entity = 'document';
DELETE FROM number_sequences;
