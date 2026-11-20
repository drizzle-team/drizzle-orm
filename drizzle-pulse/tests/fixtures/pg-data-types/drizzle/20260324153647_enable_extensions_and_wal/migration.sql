-- Custom SQL migration file, put your code below! --
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "pg_data_types" REPLICA IDENTITY FULL;
--> statement-breakpoint
DROP PUBLICATION IF EXISTS fixture_pg_data_types_pub;
--> statement-breakpoint
CREATE PUBLICATION fixture_pg_data_types_pub FOR TABLE "pg_data_types" WITH (publish = 'insert, update, delete');
