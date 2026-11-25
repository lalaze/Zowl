ALTER TABLE `notification_capture_settings` ADD `auto_post_trusted_max_amount_minor` integer DEFAULT 500000 NOT NULL CONSTRAINT `notification_capture_settings_trusted_max_amount_range` CHECK (`auto_post_trusted_max_amount_minor` >= 0 AND `auto_post_trusted_max_amount_minor` <= 100000000);
--> statement-breakpoint
ALTER TABLE `notification_capture_settings` ADD `auto_post_payment_pages` integer DEFAULT false NOT NULL;
