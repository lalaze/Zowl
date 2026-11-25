CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`icon` text,
	`color` text,
	`is_system` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_name_unique` ON `categories` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `categories_user_sort_idx` ON `categories` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `merchant_category_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`normalized_merchant_name` text NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_rules_user_merchant_type_unique` ON `merchant_category_rules` (`user_id`,`normalized_merchant_name`,`match_type`);--> statement-breakpoint
CREATE INDEX `merchant_rules_user_idx` ON `merchant_category_rules` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
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
	CONSTRAINT "transactions_amount_non_negative" CHECK("transactions"."amount_minor" >= 0),
	CONSTRAINT "transactions_confidence_range" CHECK("transactions"."recognition_confidence" is null or ("transactions"."recognition_confidence" >= 0 and "transactions"."recognition_confidence" <= 10000))
);
--> statement-breakpoint
CREATE INDEX `transactions_user_time_idx` ON `transactions` (`user_id`,`transaction_time`);--> statement-breakpoint
CREATE INDEX `transactions_user_category_time_idx` ON `transactions` (`user_id`,`category_id`,`transaction_time`);--> statement-breakpoint
CREATE INDEX `transactions_user_fingerprint_idx` ON `transactions` (`user_id`,`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_user_source_platform_id_unique` ON `transactions` (`user_id`,`source`,`platform_transaction_id`) WHERE "transactions"."platform_transaction_id" is not null;--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);