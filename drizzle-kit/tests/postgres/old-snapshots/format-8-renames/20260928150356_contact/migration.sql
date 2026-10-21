ALTER TABLE "users" RENAME COLUMN "email" TO "contact";--> statement-breakpoint
DROP INDEX "email";--> statement-breakpoint
CREATE INDEX "contact_idx" ON "users" ("contact");