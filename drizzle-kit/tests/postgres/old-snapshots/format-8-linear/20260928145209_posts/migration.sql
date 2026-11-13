CREATE TABLE "posts" (
	"id" integer PRIMARY KEY,
	"authorId" integer
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" ("email");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_users_id_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id");