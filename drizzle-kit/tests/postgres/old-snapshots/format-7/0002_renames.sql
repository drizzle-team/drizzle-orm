ALTER TABLE "posts" RENAME TO "articles";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "email" TO "contact";--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT "posts_authorId_users_id_fk";
--> statement-breakpoint
DROP INDEX "users_email_idx";--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_authorId_users_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("contact");