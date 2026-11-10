CREATE TABLE "orders" (
	"id" serial PRIMARY KEY,
	"driver_id" integer,
	"status" text DEFAULT 'requested' NOT NULL,
	"price" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
