CREATE TABLE IF NOT EXISTS "transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_user_id" integer,
	"recipient_user_id" integer
);

CREATE TABLE IF NOT EXISTS "user" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text
);

DO $$ BEGIN
 ALTER TABLE transaction ADD CONSTRAINT transaction_sender_user_id_user_id_fk FOREIGN KEY ("sender_user_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE transaction ADD CONSTRAINT transaction_recipient_user_id_user_id_fk FOREIGN KEY ("recipient_user_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
