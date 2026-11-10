-- Custom SQL migration file, put your code below! --
ALTER TABLE "orders" REPLICA IDENTITY FULL;
--> statement-breakpoint
DROP PUBLICATION IF EXISTS fixture_full_orders_pub;
--> statement-breakpoint
CREATE PUBLICATION fixture_full_orders_pub FOR TABLE "orders" WITH (publish = 'insert, update, delete');
