import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Data model from spec.json -> entities.
 *
 * Conventions (spec.json -> conventions):
 * - ids are TEXT UUIDv7
 * - timestamps are INTEGER Unix milliseconds UTC
 * - business dates are TEXT "YYYY-MM-DD" in Malaysia time
 * - money is INTEGER sen, quantities are INTEGER thousandths
 * - booleans are INTEGER 0/1
 */
export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  registrationNo: text("registration_no").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  addressLine3: text("address_line3"),
  postcode: text("postcode").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  country: text("country").notNull().default("Malaysia"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  logoR2Key: text("logo_r2_key"),
  stampR2Key: text("stamp_r2_key"),
  brandColor: text("brand_color").notNull().default("#111827"),
  bankName: text("bank_name"),
  bankAccountName: text("bank_account_name"),
  bankAccountNo: text("bank_account_no"),
  defaultPaymentTermsDays: integer("default_payment_terms_days").notNull().default(30),
  quotationValidityDays: integer("quotation_validity_days").notNull().default(30),
  prefixQuotation: text("prefix_quotation").notNull().default("QT"),
  prefixInvoice: text("prefix_invoice").notNull().default("INV"),
  prefixDeliveryOrder: text("prefix_delivery_order").notNull().default("DO"),
  quotationTerms: text("quotation_terms"),
  invoiceNotes: text("invoice_notes"),
  deliveryOrderNotes: text("delivery_order_notes"),
  paymentInstructions: text("payment_instructions"),
  sstRegistered: integer("sst_registered").notNull().default(0),
  sstNo: text("sst_no"),
  tin: text("tin"),
  msicCode: text("msic_code"),
  isArchived: integer("is_archived").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  isActive: integer("is_active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

export const companyMembers = sqliteTable(
  "company_members",
  {
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["owner", "staff"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.userId] })],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    registrationNo: text("registration_no"),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    billingAddress: text("billing_address").notNull(),
    deliveryAddress: text("delivery_address"),
    paymentTermsDays: integer("payment_terms_days"),
    notes: text("notes"),
    tin: text("tin"),
    isArchived: integer("is_archived").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("customers_company_id_name_idx").on(table.companyId, table.name)],
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    sku: text("sku"),
    category: text("category", { enum: ["MCH", "PRT", "CTRL"] }),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit").notNull().default("pcs"),
    unitPriceSen: integer("unit_price_sen").notNull().default(0),
    classificationCode: text("classification_code"),
    isArchived: integer("is_archived").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("items_company_id_name_idx").on(table.companyId, table.name),
    uniqueIndex("items_company_id_sku_unique").on(table.companyId, table.sku),
  ],
);

export const itemSkuSequences = sqliteTable(
  "item_sku_sequences",
  {
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    category: text("category", { enum: ["MCH", "PRT", "CTRL"] }).notNull(),
    nextValue: integer("next_value").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.category] })],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    type: text("type", { enum: ["quotation", "invoice", "delivery_order"] }).notNull(),
    status: text("status").notNull(),
    number: text("number"),
    seq: integer("seq"),
    seqYear: integer("seq_year"),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    customerSnapshot: text("customer_snapshot"),
    companySnapshot: text("company_snapshot"),
    issueDate: text("issue_date").notNull(),
    dueDate: text("due_date"),
    validUntil: text("valid_until"),
    deliveryDate: text("delivery_date"),
    deliveryAddress: text("delivery_address"),
    sourceDocumentId: text("source_document_id").references((): AnySQLiteColumn => documents.id),
    notes: text("notes"),
    terms: text("terms"),
    subtotalSen: integer("subtotal_sen").notNull().default(0),
    discountSen: integer("discount_sen").notNull().default(0),
    taxSen: integer("tax_sen").notNull().default(0),
    totalSen: integer("total_sen").notNull().default(0),
    amountInWords: text("amount_in_words"),
    vehicleNo: text("vehicle_no"),
    driverName: text("driver_name"),
    deliveredAt: integer("delivered_at"),
  paidAt: integer("paid_at"),
  paidPdfR2Key: text("paid_pdf_r2_key"),
    receivedBy: text("received_by"),
    pdfR2Key: text("pdf_r2_key"),
    pdfSha256: text("pdf_sha256"),
    voidPdfR2Key: text("void_pdf_r2_key"),
    issuedAt: integer("issued_at"),
    issuedBy: text("issued_by").references(() => users.id),
    voidedAt: integer("voided_at"),
    voidedBy: text("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("documents_company_type_status_idx").on(table.companyId, table.type, table.status),
    index("documents_company_customer_idx").on(table.companyId, table.customerId),
    index("documents_source_document_idx").on(table.sourceDocumentId),
    uniqueIndex("documents_company_number_unique").on(table.companyId, table.number),
  ],
);

export const documentLines = sqliteTable(
  "document_lines",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: text("item_id").references(() => items.id),
    sku: text("sku"),
    description: text("description").notNull(),
    unit: text("unit").notNull(),
    quantityMilli: integer("quantity_milli").notNull(),
    unitPriceSen: integer("unit_price_sen"),
    discountSen: integer("discount_sen").notNull().default(0),
    taxRateBp: integer("tax_rate_bp").notNull().default(0),
    lineTotalSen: integer("line_total_sen"),
    sourceLineId: text("source_line_id").references((): AnySQLiteColumn => documentLines.id),
  },
  (table) => [
    index("document_lines_document_line_no_idx").on(table.documentId, table.lineNo),
    index("document_lines_source_line_idx").on(table.sourceLineId),
  ],
);

export const numberSequences = sqliteTable(
  "number_sequences",
  {
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    docType: text("doc_type", { enum: ["quotation", "invoice", "delivery_order"] }).notNull(),
    // One continuous counter per company and type; it never resets.
    nextValue: integer("next_value").notNull().default(1000),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.docType] })],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").references(() => companies.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    detail: text("detail"),
    at: integer("at").notNull(),
  },
  (table) => [index("audit_log_company_id_at_idx").on(table.companyId, table.at)],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CompanyMember = typeof companyMembers.$inferSelect;
export type NewCompanyMember = typeof companyMembers.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Item = typeof items.$inferSelect;
export type ItemSkuSequence = typeof itemSkuSequences.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentLine = typeof documentLines.$inferSelect;
export type NewDocumentLine = typeof documentLines.$inferInsert;
export type NumberSequence = typeof numberSequences.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
