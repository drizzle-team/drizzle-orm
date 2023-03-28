CREATE TABLE posts (
	`id` integer PRIMARY KEY NOT NULL,
	`title` integer NOT NULL,
	`body` integer NOT NULL,
	`author_id` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES users(`id`)
);
