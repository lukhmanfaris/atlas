PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_number_sequences` (
	`company_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`next_value` integer DEFAULT 1000 NOT NULL,
	PRIMARY KEY(`company_id`, `doc_type`),
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_number_sequences`("company_id", "doc_type", "next_value") SELECT "company_id", "doc_type", "next_value" FROM `number_sequences`;--> statement-breakpoint
DROP TABLE `number_sequences`;--> statement-breakpoint
ALTER TABLE `__new_number_sequences` RENAME TO `number_sequences`;--> statement-breakpoint
PRAGMA foreign_keys=ON;