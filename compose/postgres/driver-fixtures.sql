-- What the Drizzle Postgres driver's suite (postgres/) expects on the server, as postgres/test/setup-pg.sh makes it on
-- a native cluster: the md5user and scramuser roles, and the testdb database with the fixture table t. Run with psql
-- by compose/dockers.sh after every start; every statement leaves an existing object as it is. The suite's parallel
-- workers each copy testdb's fixtures into a database of their own (postgres/test/helpers/worker-db.ts).
SET password_encryption = 'md5';
SELECT $$CREATE ROLE md5user LOGIN PASSWORD 'md5pw'$$ WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'md5user') \gexec
SET password_encryption = 'scram-sha-256';
SELECT $$CREATE ROLE scramuser LOGIN PASSWORD 'scrampw'$$ WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'scramuser') \gexec
SELECT 'CREATE DATABASE testdb OWNER postgres' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'testdb') \gexec

\connect testdb
CREATE TABLE IF NOT EXISTS t(id serial primary key, name text, n8 bigint, amount numeric, ok bool, data jsonb, blob bytea);
INSERT INTO t(name, n8, amount, ok, data, blob)
SELECT * FROM (VALUES
	('alice', 9007199254740993, 1234.56, true, '{"a":1}'::jsonb, '\xdeadbeef'::bytea),
	('bob', 42, 0.1, false, '[1,2,3]', '\x00ff'),
	(NULL, NULL, NULL, NULL, NULL, NULL)
) AS rows
WHERE NOT EXISTS (SELECT FROM t);
