CREATE TABLE "users_concurrently" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY "users_concurrently_name_index" ON "users_concurrently" ("name");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "users_concurrently_email_index" ON "users_concurrently" ("email");
