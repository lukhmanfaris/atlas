import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Seeds the local D1 database with obviously fake data.
 * Safe to run more than once: every row uses INSERT OR IGNORE.
 *
 * Run with: npm run seed
 */

const now = Date.now();

const companyA = "018f0000-0000-7000-8000-000000000001";
const companyB = "018f0000-0000-7000-8000-000000000002";
const owner = "018f0000-0000-7000-8000-0000000000a1";
const staff = "018f0000-0000-7000-8000-0000000000a2";

// Must match the email the owner signs in with through Cloudflare Access,
// because F-01 matches users.email against the Access token.
const ownerEmail = "halfxindustries@gmail.com";

function lines(...values: string[]): string {
  return values.join("\n");
}

const sql = lines(
  "INSERT OR IGNORE INTO users (id, email, name, is_active, created_at) VALUES",
  `  ('${owner}', '${ownerEmail}', 'Demo Owner', 1, ${now}),`,
  `  ('${staff}', 'staff@example.com', 'Demo Staff', 1, ${now});`,
  "",
  "INSERT OR IGNORE INTO companies (id, name, registration_no, address_line1, postcode, city, state, country, phone, email, default_payment_terms_days, quotation_validity_days, prefix_quotation, prefix_invoice, prefix_delivery_order, sst_registered, is_archived, created_at, updated_at) VALUES",
  `  ('${companyA}', 'Atlas Trading Sdn Bhd', '202601000001 (1234567-A)', '12 Jalan Contoh Satu', '50450', 'Kuala Lumpur', 'Wilayah Persekutuan', 'Malaysia', '03-1234 5678', 'hello@atlas-trading.example', 30, 30, 'QT', 'INV', 'DO', 0, 0, ${now}, ${now}),`,
  `  ('${companyB}', 'Atlas Services Sdn Bhd', '202601000002 (7654321-B)', '88 Jalan Contoh Dua', '40150', 'Shah Alam', 'Selangor', 'Malaysia', '03-8765 4321', 'hello@atlas-services.example', 14, 21, 'QT', 'INV', 'DO', 0, 0, ${now}, ${now});`,
  "",
  "INSERT OR IGNORE INTO company_members (company_id, user_id, role, created_at) VALUES",
  `  ('${companyA}', '${owner}', 'owner', ${now}),`,
  `  ('${companyB}', '${owner}', 'owner', ${now}),`,
  `  ('${companyA}', '${staff}', 'staff', ${now});`,
  "",
  "INSERT OR IGNORE INTO customers (id, company_id, name, registration_no, contact_person, phone, email, billing_address, delivery_address, payment_terms_days, is_archived, created_at, updated_at) VALUES",
  `  ('018f0000-0000-7000-8000-0000000000c1', '${companyA}', 'Syarikat Maju Jaya Sdn Bhd', '202001000011 (1111111-X)', 'Aminah', '03-2222 3333', 'accounts@majujaya.example', '15 Jalan Perdagangan\\n50000 Kuala Lumpur', '15 Jalan Perdagangan\\n50000 Kuala Lumpur', 30, 0, ${now}, ${now}),`,
  `  ('018f0000-0000-7000-8000-0000000000c2', '${companyA}', 'Kedai Bahagia', NULL, 'Lim', '012-345 6789', 'lim@bahagia.example', '7 Jalan Pasar\\n41000 Klang', NULL, NULL, 0, ${now}, ${now}),`,
  `  ('018f0000-0000-7000-8000-0000000000c3', '${companyB}', 'Tech Niaga Enterprise', '202101000022 (2222222-Y)', 'Ravi', '03-4444 5555', 'ravi@techniaga.example', '3 Jalan Teknologi\\n40150 Shah Alam', '3 Jalan Teknologi\\n40150 Shah Alam', 14, 0, ${now}, ${now});`,
  "",
  "INSERT OR IGNORE INTO items (id, company_id, sku, name, description, unit, unit_price_sen, is_archived, created_at, updated_at) VALUES",
  `  ('018f0000-0000-7000-8000-0000000000d1', '${companyA}', 'BOX-A4', 'A4 Copier Paper', '80 gsm, 500 sheets per ream', 'box', 2350, 0, ${now}, ${now}),`,
  `  ('018f0000-0000-7000-8000-0000000000d2', '${companyA}', 'SVC-DEL', 'Delivery Service', 'Within Klang Valley', 'trip', 15000, 0, ${now}, ${now}),`,
  `  ('018f0000-0000-7000-8000-0000000000d3', '${companyB}', 'CONS-01', 'Consulting', 'Half day of advisory work', 'hour', 9000, 0, ${now}, ${now}),`,
  `  ('018f0000-0000-7000-8000-0000000000d4', '${companyB}', 'SUP-01', 'Support Retainer', 'Monthly support, billed in advance', 'month', 120000, 0, ${now}, ${now});`,
  "",
);

const directory = mkdtempSync(join(tmpdir(), "atlas-seed-"));
const file = join(directory, "seed.sql");
writeFileSync(file, sql, "utf8");

execFileSync(
  "npx",
  ["wrangler", "d1", "execute", "DB", "--local", "--file", file],
  { stdio: "inherit" },
);

console.log("Seeded local D1: 2 companies, 2 users, 3 customers, 4 items.");
