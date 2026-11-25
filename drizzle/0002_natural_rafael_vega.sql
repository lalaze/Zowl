CREATE TABLE `recognition_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`file_id` text NOT NULL,
	`position` integer NOT NULL,
	`status` text NOT NULL,
	`provider_payload_hash` text,
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
	FOREIGN KEY (`job_id`) REFERENCES `recognition_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `stored_files`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`duplicate_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`result_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "recognition_items_position_positive" CHECK("recognition_items"."position" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recognition_items_job_position_unique` ON `recognition_items` (`job_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `recognition_items_job_file_unique` ON `recognition_items` (`job_id`,`file_id`);--> statement-breakpoint
CREATE INDEX `recognition_items_user_job_idx` ON `recognition_items` (`user_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `recognition_items_file_idx` ON `recognition_items` (`file_id`);--> statement-breakpoint
CREATE TABLE `recognition_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`succeeded_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`failure_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recognition_jobs_counts_non_negative" CHECK("recognition_jobs"."total_count" >= 0 and "recognition_jobs"."succeeded_count" >= 0 and "recognition_jobs"."failed_count" >= 0 and "recognition_jobs"."imported_count" >= 0 and "recognition_jobs"."skipped_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `recognition_jobs_user_created_idx` ON `recognition_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `recognition_jobs_user_status_idx` ON `recognition_jobs` (`user_id`,`status`);