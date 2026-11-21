CREATE TABLE "users" (
	"id" integer PRIMARY KEY,
	"email" varchar
);
--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" ("email");