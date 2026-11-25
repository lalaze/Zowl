ALTER TABLE `users` ADD `role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `disabled_at` text;--> statement-breakpoint
UPDATE `users`
SET `role` = 'admin'
WHERE `id` = (
	SELECT `id`
	FROM `users`
	ORDER BY `created_at` ASC, `id` ASC
	LIMIT 1
);
