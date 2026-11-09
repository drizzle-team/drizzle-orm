CREATE UNIQUE INDEX ASYNC "dsql_jobs_recreate_code_key_dsql_new" ON "dsql_jobs_recreate" ("code") WHERE "code" > 0;--> statement-breakpoint
DROP INDEX IF EXISTS "dsql_jobs_recreate_code_key";--> statement-breakpoint
ALTER INDEX "dsql_jobs_recreate_code_key_dsql_new" RENAME TO "dsql_jobs_recreate_code_key";