CREATE TABLE `user34` (
    `id` serial PRIMARY KEY NOT NULL,
    `username` varchar(120) NOT NULL,
    `email` varchar(120),
    `password` varchar(120),
    `avatar` text,
    `update_at` timestamp (2) DEFAULT CURRENT_TIMESTAMP(2),
    `created_at` timestamp (2) DEFAULT CURRENT_TIMESTAMP(2)
);
    
CREATE UNIQUE INDEX username_idx ON user34 (`username`);
CREATE UNIQUE INDEX email_idx ON user34 (`email`);