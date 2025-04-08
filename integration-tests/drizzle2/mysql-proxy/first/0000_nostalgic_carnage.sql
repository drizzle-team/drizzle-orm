CREATE TABLE `userstest` (
	`id` serial PRIMARY KEY,
	`name` text NOT NULL,
	`verified` boolean NOT NULL DEFAULT false, 
	`jsonb` json,
	`created_at` timestamp NOT NULL DEFAULT now()
);