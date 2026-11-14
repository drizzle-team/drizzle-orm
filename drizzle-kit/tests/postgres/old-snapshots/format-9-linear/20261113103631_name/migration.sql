ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
DROP INDEX "users_email_idx";--> statement-breakpoint
CREATE INDEX CONCURRENTLY "users_email_idx" ON "users" ("email") WHERE "email" is not null;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "users_name_idx" ON "users" ("name");