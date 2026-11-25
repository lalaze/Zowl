ALTER TABLE `recognition_jobs` ADD `submission_id` text;--> statement-breakpoint
ALTER TABLE `recognition_jobs` ADD `submission_digest` text;--> statement-breakpoint
CREATE UNIQUE INDEX `recognition_jobs_user_submission_unique` ON `recognition_jobs` (`user_id`,`submission_id`);