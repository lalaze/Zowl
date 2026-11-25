CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_id` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`detected_headers` text,
	`field_mapping` text,
	`header_row_number` integer,
	`total_count` integer DEFAULT 0 NOT NULL,
	`valid_count` integer DEFAULT 0 NOT NULL,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`failure_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `stored_files`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `import_batches_user_created_idx` ON `import_batches` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `import_batches_user_status_idx` ON `import_batches` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`row_number` integer NOT NULL,
	`raw_data` text NOT NULL,
	`normalized_data` text,
	`validation_errors` text NOT NULL,
	`warnings` text NOT NULL,
	`duplicate_status` text DEFAULT 'unique' NOT NULL,
	`duplicate_transaction_id` text,
	`decision` text DEFAULT 'pending' NOT NULL,
	`result_transaction_id` text,
	`result_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`duplicate_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`result_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `import_items_batch_row_idx` ON `import_items` (`batch_id`,`row_number`);--> statement-breakpoint
CREATE INDEX `import_items_user_batch_idx` ON `import_items` (`user_id`,`batch_id`);--> statement-breakpoint
CREATE TABLE `stored_files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`original_name` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`extension` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "stored_files_size_non_negative" CHECK("stored_files"."size" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stored_files_storage_key_unique` ON `stored_files` (`storage_key`);--> statement-breakpoint
CREATE INDEX `stored_files_user_created_idx` ON `stored_files` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stored_files_user_hash_idx` ON `stored_files` (`user_id`,`sha256`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`merchant_name` text,
	`description` text,
	`category_id` text,
	`transaction_time` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`source` text NOT NULL,
	`payment_method` text,
	`platform_transaction_id` text,
	`status` text,
	`original_file_id` text,
	`original_row_data` text,
	`import_batch_id` text,
	`fingerprint` text NOT NULL,
	`duplicate_status` text DEFAULT 'unique' NOT NULL,
	`recognition_confidence` integer,
	`needs_review` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`original_file_id`) REFERENCES `stored_files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "transactions_amount_non_negative" CHECK("__new_transactions"."amount_minor" >= 0),
	CONSTRAINT "transactions_confidence_range" CHECK("__new_transactions"."recognition_confidence" is null or ("__new_transactions"."recognition_confidence" >= 0 and "__new_transactions"."recognition_confidence" <= 10000))
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "user_id", "type", "amount_minor", "currency", "merchant_name", "description", "category_id", "transaction_time", "created_at", "updated_at", "source", "payment_method", "platform_transaction_id", "status", "original_file_id", "original_row_data", "import_batch_id", "fingerprint", "duplicate_status", "recognition_confidence", "needs_review") SELECT "id", "user_id", "type", "amount_minor", "currency", "merchant_name", "description", "category_id", "transaction_time", "created_at", "updated_at", "source", "payment_method", "platform_transaction_id", "status", "original_file_id", "original_row_data", "import_batch_id", "fingerprint", "duplicate_status", "recognition_confidence", "needs_review" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_user_time_idx` ON `transactions` (`user_id`,`transaction_time`);--> statement-breakpoint
CREATE INDEX `transactions_user_category_time_idx` ON `transactions` (`user_id`,`category_id`,`transaction_time`);--> statement-breakpoint
CREATE INDEX `transactions_user_fingerprint_idx` ON `transactions` (`user_id`,`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_user_source_platform_id_unique` ON `transactions` (`user_id`,`source`,`platform_transaction_id`) WHERE "transactions"."platform_transaction_id" is not null;