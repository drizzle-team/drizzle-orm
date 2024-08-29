CREATE TABLE "users" (
	id serial PRIMARY KEY,
	name text NOT NULL,
	verified boolean NOT NULL DEFAULT false, 
	jsonb jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);