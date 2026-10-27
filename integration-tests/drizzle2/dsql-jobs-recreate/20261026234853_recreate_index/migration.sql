DROP INDEX IF EXISTS "dsql_jobs_recreate_code_key";--> statement-breakpoint
CREATE UNIQUE INDEX ASYNC "dsql_jobs_recreate_code_key" ON "dsql_jobs_recreate" ("code") WHERE "code" > 0;