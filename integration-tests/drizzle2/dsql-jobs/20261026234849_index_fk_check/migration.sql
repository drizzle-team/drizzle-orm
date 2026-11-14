CREATE INDEX ASYNC "dsql_jobs_items_code_idx" ON "dsql_jobs_items" ("code");--> statement-breakpoint
ALTER TABLE "dsql_jobs_items" ADD CONSTRAINT "dsql_jobs_items_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "dsql_jobs_parent"("id") NOT VALID;--> statement-breakpoint
ALTER TABLE ASYNC "dsql_jobs_items" VALIDATE CONSTRAINT "dsql_jobs_items_parent_fk";--> statement-breakpoint
ALTER TABLE "dsql_jobs_items" ADD CONSTRAINT "dsql_jobs_items_code_check" CHECK ("code" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE ASYNC "dsql_jobs_items" VALIDATE CONSTRAINT "dsql_jobs_items_code_check";