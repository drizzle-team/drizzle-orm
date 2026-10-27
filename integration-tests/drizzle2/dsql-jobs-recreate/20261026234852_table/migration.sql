CREATE TABLE "dsql_jobs_recreate" (
	"id" uuid PRIMARY KEY,
	"code" integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX ASYNC "dsql_jobs_recreate_code_key" ON "dsql_jobs_recreate" ("code") WHERE "code" > 100;