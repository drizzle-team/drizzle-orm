CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "mood" AS ENUM('ok', 'sad');--> statement-breakpoint
CREATE ROLE "staff";--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer,
	"email" varchar,
	"state" "mood",
	CONSTRAINT "users_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "posts" (
	"id" integer,
	"userId" integer,
	"title" varchar CONSTRAINT "posts_title_uq" UNIQUE,
	CONSTRAINT "posts_id_ck" CHECK ("id" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."things" (
	"id" integer
);
--> statement-breakpoint
CREATE INDEX "users_email_ix" ON "users" ("email");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_fk" FOREIGN KEY ("userId") REFERENCES "users"("id");--> statement-breakpoint
CREATE POLICY "users_read" ON "users" AS PERMISSIVE FOR SELECT TO "staff";