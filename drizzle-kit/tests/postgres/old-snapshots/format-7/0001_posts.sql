CREATE TYPE "public"."status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"authorId" integer NOT NULL,
	"status" "status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_users_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;