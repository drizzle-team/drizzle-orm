-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "t" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"n8" bigint,
	"amount" numeric,
	"ok" boolean,
	"data" jsonb,
	"blob" "bytea"
);
--> statement-breakpoint
CREATE TABLE "pulse_playground" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pulse_playground_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text,
	"qty" integer,
	"price" double precision,
	"tags" jsonb,
	"updated_at" timestamp with time zone DEFAULT now()
);

*/