CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_company_id_at_idx` ON `audit_log` (`company_id`,`at`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`registration_no` text NOT NULL,
	`address_line1` text NOT NULL,
	`address_line2` text,
	`address_line3` text,
	`postcode` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`country` text DEFAULT 'Malaysia' NOT NULL,
	`phone` text,
	`email` text,
	`website` text,
	`logo_r2_key` text,
	`brand_color` text DEFAULT '#111827' NOT NULL,
	`bank_name` text,
	`bank_account_name` text,
	`bank_account_no` text,
	`default_payment_terms_days` integer DEFAULT 30 NOT NULL,
	`quotation_validity_days` integer DEFAULT 30 NOT NULL,
	`prefix_quotation` text DEFAULT 'QT' NOT NULL,
	`prefix_invoice` text DEFAULT 'INV' NOT NULL,
	`prefix_delivery_order` text DEFAULT 'DO' NOT NULL,
	`quotation_terms` text,
	`invoice_notes` text,
	`delivery_order_notes` text,
	`sst_registered` integer DEFAULT 0 NOT NULL,
	`sst_no` text,
	`tin` text,
	`msic_code` text,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_members` (
	`company_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`company_id`, `user_id`),
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`registration_no` text,
	`contact_person` text,
	`phone` text,
	`email` text,
	`billing_address` text NOT NULL,
	`delivery_address` text,
	`payment_terms_days` integer,
	`notes` text,
	`tin` text,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `customers_company_id_name_idx` ON `customers` (`company_id`,`name`);--> statement-breakpoint
CREATE TABLE `document_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`item_id` text,
	`sku` text,
	`description` text NOT NULL,
	`unit` text NOT NULL,
	`quantity_milli` integer NOT NULL,
	`unit_price_sen` integer,
	`discount_sen` integer DEFAULT 0 NOT NULL,
	`tax_rate_bp` integer DEFAULT 0 NOT NULL,
	`line_total_sen` integer,
	`source_line_id` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_line_id`) REFERENCES `document_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_lines_document_line_no_idx` ON `document_lines` (`document_id`,`line_no`);--> statement-breakpoint
CREATE INDEX `document_lines_source_line_idx` ON `document_lines` (`source_line_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`number` text,
	`seq` integer,
	`seq_year` integer,
	`customer_id` text NOT NULL,
	`customer_snapshot` text,
	`company_snapshot` text,
	`issue_date` text NOT NULL,
	`due_date` text,
	`valid_until` text,
	`delivery_date` text,
	`delivery_address` text,
	`reference` text,
	`source_document_id` text,
	`notes` text,
	`terms` text,
	`subtotal_sen` integer DEFAULT 0 NOT NULL,
	`discount_sen` integer DEFAULT 0 NOT NULL,
	`tax_sen` integer DEFAULT 0 NOT NULL,
	`total_sen` integer DEFAULT 0 NOT NULL,
	`amount_in_words` text,
	`vehicle_no` text,
	`driver_name` text,
	`delivered_at` integer,
	`received_by` text,
	`pdf_r2_key` text,
	`pdf_sha256` text,
	`void_pdf_r2_key` text,
	`issued_at` integer,
	`issued_by` text,
	`voided_at` integer,
	`voided_by` text,
	`void_reason` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_company_type_status_idx` ON `documents` (`company_id`,`type`,`status`);--> statement-breakpoint
CREATE INDEX `documents_company_customer_idx` ON `documents` (`company_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `documents_source_document_idx` ON `documents` (`source_document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_company_number_unique` ON `documents` (`company_id`,`number`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`sku` text,
	`name` text NOT NULL,
	`description` text,
	`unit` text DEFAULT 'pcs' NOT NULL,
	`unit_price_sen` integer DEFAULT 0 NOT NULL,
	`classification_code` text,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_company_id_name_idx` ON `items` (`company_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `items_company_id_sku_unique` ON `items` (`company_id`,`sku`);--> statement-breakpoint
CREATE TABLE `number_sequences` (
	`company_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`year` integer NOT NULL,
	`next_value` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`company_id`, `doc_type`, `year`),
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);