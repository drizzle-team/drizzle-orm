CREATE TABLE IF NOT EXISTS "users" (
	"uuid1" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text
);
