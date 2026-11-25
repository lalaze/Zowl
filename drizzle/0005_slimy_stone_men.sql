ALTER TABLE `import_batches` ADD `confirmation_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_items` ADD `duplicate_assessment_digest` text;--> statement-breakpoint
ALTER TABLE `recognition_items` ADD `duplicate_assessment_digest` text;--> statement-breakpoint
ALTER TABLE `recognition_jobs` ADD `confirmation_version` integer DEFAULT 1 NOT NULL;