CREATE TABLE `webhook_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`done` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
