CREATE TABLE `notification_capture_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`auto_post_alipay` integer DEFAULT false NOT NULL,
	`auto_post_wechat` integer DEFAULT false NOT NULL,
	`auto_post_cmb` integer DEFAULT false NOT NULL,
	`auto_post_max_amount_minor` integer DEFAULT 50000 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notification_capture_settings_max_amount_range" CHECK("notification_capture_settings"."auto_post_max_amount_minor" >= 0 and "notification_capture_settings"."auto_post_max_amount_minor" <= 100000000)
);
