CREATE TYPE "role" AS ENUM('admin', 'user');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "role" DEFAULT 'user'::"role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;