CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."items" (
	"id" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY,
	"email" varchar
);
--> statement-breakpoint
CREATE INDEX "email" ON "users" ("email");