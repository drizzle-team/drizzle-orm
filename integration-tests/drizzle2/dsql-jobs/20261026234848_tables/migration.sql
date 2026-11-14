CREATE TABLE "dsql_jobs_parent" (
	"id" uuid PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE "dsql_jobs_items" (
	"id" uuid PRIMARY KEY,
	"code" integer,
	"parent_id" uuid
);
