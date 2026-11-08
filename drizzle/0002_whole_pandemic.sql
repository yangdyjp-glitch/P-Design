ALTER TABLE `assets` ADD `source` text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `search_state` text;