CREATE TABLE `cities_migration` (
	`id` int,
	`fullname_name` text,
	`state` text
);
--> statement-breakpoint
CREATE TABLE `users_migration` (
	`id` int NOT NULL,
	`full_name` text,
	`phone` int,
	`invited_by` int,
	`city_id` int,
	`date` timestamp DEFAULT (now()),
	CONSTRAINT `users_migration_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users12` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	CONSTRAINT `users12_id` PRIMARY KEY(`id`)
);
