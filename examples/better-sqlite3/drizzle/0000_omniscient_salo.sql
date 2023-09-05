CREATE TABLE `projects` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`owner_id` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`full_name` text
);
