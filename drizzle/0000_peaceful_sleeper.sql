CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`generated` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_owner_project` ON `assets` (`user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`prompt` text NOT NULL,
	`skill_ids` text NOT NULL,
	`snapshot` text NOT NULL,
	`base_revision` integer NOT NULL,
	`status` text NOT NULL,
	`session_id` text,
	`environment_id` text,
	`turn_id` text,
	`provider_files` text DEFAULT '[]' NOT NULL,
	`image_state` text,
	`result` text,
	`error` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_owner_created` ON `jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_request_id` ON `jobs` (`user_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `projects_owner_updated` ON `projects` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
