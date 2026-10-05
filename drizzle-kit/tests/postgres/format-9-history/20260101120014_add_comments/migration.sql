CREATE TABLE "comments" (
	"id" integer,
	"body" varchar
);
--> statement-breakpoint
CREATE INDEX "comments_body_ix" ON "comments" ("body");