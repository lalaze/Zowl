UPDATE `transactions`
SET `transaction_time` = strftime('%Y-%m-%dT%H:%M:%fZ', `transaction_time`)
WHERE strftime('%Y-%m-%dT%H:%M:%fZ', `transaction_time`) IS NOT NULL;--> statement-breakpoint
CREATE INDEX `import_batches_user_file_idx` ON `import_batches` (`user_id`,`file_id`);--> statement-breakpoint
CREATE INDEX `recognition_items_user_file_idx` ON `recognition_items` (`user_id`,`file_id`);--> statement-breakpoint
CREATE INDEX `transactions_user_source_time_id_idx` ON `transactions` (`user_id`,`source`,`transaction_time`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_user_type_time_id_idx` ON `transactions` (`user_id`,`type`,`transaction_time`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_user_original_file_idx` ON `transactions` (`user_id`,`original_file_id`);
