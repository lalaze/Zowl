CREATE TABLE `posting_confirmation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`confirmation_row_id` text NOT NULL,
	`user_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`source_kind` text NOT NULL,
	`source_item_ref` text NOT NULL,
	`candidate_digest` text NOT NULL,
	`decision` text NOT NULL,
	`assessment_status` text NOT NULL,
	`reason_code` text,
	`matched_transaction_id` text,
	`matched_candidate_ref` text,
	`fingerprint` text NOT NULL,
	`algorithm_version` integer NOT NULL,
	`override_digest` text,
	`outcome` text NOT NULL,
	`result_transaction_id` text,
	`result_revision_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`confirmation_row_id`) REFERENCES `posting_confirmations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`matched_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`result_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`result_revision_id`) REFERENCES `transaction_revisions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "posting_confirmation_items_ordinal_positive" CHECK("posting_confirmation_items"."ordinal" > 0),
	CONSTRAINT "posting_confirmation_items_algorithm_positive" CHECK("posting_confirmation_items"."algorithm_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posting_confirmation_items_confirmation_ordinal_unique` ON `posting_confirmation_items` (`confirmation_row_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `posting_confirmation_items_confirmation_source_unique` ON `posting_confirmation_items` (`confirmation_row_id`,`source_item_ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `posting_confirmation_items_user_source_unique` ON `posting_confirmation_items` (`user_id`,`source_kind`,`source_item_ref`);--> statement-breakpoint
CREATE TABLE `posting_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`confirmation_id` text NOT NULL,
	`version` integer NOT NULL,
	`command_digest` text NOT NULL,
	`status` text NOT NULL,
	`posted_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "posting_confirmations_version_positive" CHECK("posting_confirmations"."version" > 0),
	CONSTRAINT "posting_confirmations_counts_non_negative" CHECK("posting_confirmations"."posted_count" >= 0 and "posting_confirmations"."duplicate_count" >= 0 and "posting_confirmations"."skipped_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posting_confirmations_user_identity_unique` ON `posting_confirmations` (`user_id`,`confirmation_id`);--> statement-breakpoint
CREATE INDEX `posting_confirmations_user_created_idx` ON `posting_confirmations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `transaction_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`kind` text NOT NULL,
	`facts_snapshot` text NOT NULL,
	`provenance_snapshot` text NOT NULL,
	`actor_user_id` text,
	`confirmation_row_id` text,
	`operation_id` text,
	`command_digest` text NOT NULL,
	`duplicate_assessment` text,
	`duplicate_override` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`confirmation_row_id`) REFERENCES `posting_confirmations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "transaction_revisions_number_positive" CHECK("transaction_revisions"."revision_number" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_revisions_transaction_number_unique` ON `transaction_revisions` (`transaction_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_revisions_user_operation_unique` ON `transaction_revisions` (`user_id`,`operation_id`) WHERE "transaction_revisions"."operation_id" is not null;--> statement-breakpoint
CREATE INDEX `transaction_revisions_user_transaction_idx` ON `transaction_revisions` (`user_id`,`transaction_id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `current_revision_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `revision_number` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `voided_at` text;--> statement-breakpoint
INSERT INTO `transaction_revisions` (
	`id`,
	`transaction_id`,
	`user_id`,
	`revision_number`,
	`kind`,
	`facts_snapshot`,
	`provenance_snapshot`,
	`actor_user_id`,
	`confirmation_row_id`,
	`operation_id`,
	`command_digest`,
	`duplicate_assessment`,
	`duplicate_override`,
	`created_at`
)
SELECT
	'legacy:' || `id`,
	`id`,
	`user_id`,
	1,
	'legacy_snapshot',
	json_object(
		'type', `type`,
		'amountMinor', `amount_minor`,
		'currency', `currency`,
		'merchantName', `merchant_name`,
		'description', `description`,
		'categoryId', `category_id`,
		'transactionTime', `transaction_time`,
		'paymentMethod', `payment_method`
	),
	json_object(
		'kind', 'legacy',
		'source', `source`,
		'originalFileId', `original_file_id`,
		'importBatchId', `import_batch_id`
	),
	NULL,
	NULL,
	NULL,
	'legacy_snapshot:' || `id`,
	NULL,
	NULL,
	`created_at`
FROM `transactions`
WHERE `current_revision_id` IS NULL;--> statement-breakpoint
UPDATE `transactions`
SET
	`current_revision_id` = 'legacy:' || `id`,
	`revision_number` = 1
WHERE `current_revision_id` IS NULL;
