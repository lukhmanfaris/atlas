CREATE TABLE `item_sku_sequences` (
	`company_id` text NOT NULL,
	`category` text NOT NULL,
	`next_value` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`company_id`, `category`),
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `items` ADD `category` text;