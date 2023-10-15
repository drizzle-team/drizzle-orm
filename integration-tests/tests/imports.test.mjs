import 'drizzle-orm';
import 'drizzle-orm/aws-data-api/pg';
import 'drizzle-orm/aws-data-api/pg/migrator';
import 'drizzle-orm/better-sqlite3';
import 'drizzle-orm/better-sqlite3/migrator';
import 'drizzle-orm/bun-sqlite';
import 'drizzle-orm/bun-sqlite/migrator';
import 'drizzle-orm/d1';
import 'drizzle-orm/d1/migrator';
import 'drizzle-orm/knex';
import 'drizzle-orm/kysely';
import 'drizzle-orm/libsql';
import 'drizzle-orm/libsql/migrator';
import 'drizzle-orm/mysql-core';
import 'drizzle-orm/mysql2';
import 'drizzle-orm/mysql2/migrator';
import 'drizzle-orm/neon-serverless';
import 'drizzle-orm/neon-serverless/migrator';
import 'drizzle-orm/node-postgres';
import 'drizzle-orm/node-postgres/migrator';
import { pgTable, serial } from 'drizzle-orm/pg-core';
import 'drizzle-orm/planetscale-serverless';
import 'drizzle-orm/planetscale-serverless/migrator';
import 'drizzle-orm/postgres-js';
import 'drizzle-orm/postgres-js/migrator';
import 'drizzle-orm/sql-js';
import 'drizzle-orm/sql-js/migrator';
import 'drizzle-orm/sqlite-core';
import 'drizzle-orm/sqlite-proxy';
import 'drizzle-orm/sqlite-proxy/migrator';
import 'drizzle-orm/pg-proxy';
import 'drizzle-orm/pg-proxy/migrator';
import 'drizzle-orm/mysql-proxy';
import 'drizzle-orm/mysql-proxy/migrator';
import 'drizzle-orm/migrator';
import { createInsertSchema } from 'drizzle-zod';
import { compatibilityVersion, npmVersion } from 'drizzle-orm/version';
import { strict as assert } from 'node:assert';

assert.equal(typeof compatibilityVersion, 'number');
assert.equal(typeof npmVersion, 'string');

const test = pgTable('test', {
	id: serial('id').primaryKey(),
});

const insertSchema = createInsertSchema(test);
