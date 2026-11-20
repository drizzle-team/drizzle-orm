CREATE TABLE "orders" (
	"id" serial PRIMARY KEY,
	"driver_id" integer,
	"pickup" text NOT NULL,
	"dropoff" text NOT NULL,
	"price" numeric NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"username" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_orders_driver_id" ON "orders" ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" ("status");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_driver_id_users_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE;