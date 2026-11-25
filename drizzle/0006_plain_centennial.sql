CREATE TABLE `ai_categorization_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`provider` text DEFAULT 'openai-compatible' NOT NULL,
	`base_url` text,
	`model` text,
	`encrypted_api_key` text,
	`response_mode` text DEFAULT 'json_schema' NOT NULL,
	`auto_threshold_basis_points` integer DEFAULT 8500 NOT NULL,
	`batch_size` integer DEFAULT 20 NOT NULL,
	`timeout_ms` integer DEFAULT 30000 NOT NULL,
	`allow_insecure_http` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_settings_threshold_range" CHECK("ai_categorization_settings"."auto_threshold_basis_points" >= 0 and "ai_categorization_settings"."auto_threshold_basis_points" <= 10000),
	CONSTRAINT "ai_settings_batch_size_range" CHECK("ai_categorization_settings"."batch_size" >= 1 and "ai_categorization_settings"."batch_size" <= 50),
	CONSTRAINT "ai_settings_timeout_range" CHECK("ai_categorization_settings"."timeout_ms" >= 100 and "ai_categorization_settings"."timeout_ms" <= 120000)
);
