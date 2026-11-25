CREATE TABLE `transaction_supplemental_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`import_item_id` text NOT NULL,
	`file_id` text NOT NULL,
	`source` text NOT NULL,
	`platform_transaction_id` text,
	`platform_status` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_item_id`) REFERENCES `import_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `stored_files`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_supplemental_evidence_user_item_unique` ON `transaction_supplemental_evidence` (`user_id`,`import_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_supplemental_evidence_user_platform_unique` ON `transaction_supplemental_evidence` (`user_id`,`source`,`platform_transaction_id`) WHERE "transaction_supplemental_evidence"."platform_transaction_id" is not null;--> statement-breakpoint
CREATE INDEX `transaction_supplemental_evidence_user_transaction_idx` ON `transaction_supplemental_evidence` (`user_id`,`transaction_id`);--> statement-breakpoint
ALTER TABLE `import_batches` ADD `created_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `enriched_count` integer DEFAULT 0 NOT NULL;