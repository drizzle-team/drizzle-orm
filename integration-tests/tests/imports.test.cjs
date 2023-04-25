require('drizzle-orm');
require('drizzle-orm/aws-data-api/pg');
require('drizzle-orm/aws-data-api/pg/migrator');
require('drizzle-orm/better-sqlite3');
require('drizzle-orm/better-sqlite3/migrator');
require('drizzle-orm/bun-sqlite');
require('drizzle-orm/bun-sqlite/migrator');
require('drizzle-orm/d1');
require('drizzle-orm/d1/migrator');
require('drizzle-orm/knex');
require('drizzle-orm/kysely');
require('drizzle-orm/libsql');
require('drizzle-orm/libsql/migrator');
require('drizzle-orm/mysql-core');
require('drizzle-orm/mysql2');
require('drizzle-orm/mysql2/migrator');
require('drizzle-orm/neon-serverless');
require('drizzle-orm/neon-serverless/migrator');
require('drizzle-orm/node-postgres');
require('drizzle-orm/node-postgres/migrator');
const { pgTable, serial } = require('drizzle-orm/pg-core');
require('drizzle-orm/planetscale-serverless');
require('drizzle-orm/planetscale-serverless/migrator');
require('drizzle-orm/postgres-js');
require('drizzle-orm/postgres-js/migrator');
require('drizzle-orm/sql-js');
require('drizzle-orm/sql-js/migrator');
require('drizzle-orm/sqlite-core');
require('drizzle-orm/sqlite-proxy');
require('drizzle-orm/sqlite-proxy/migrator');
require('drizzle-orm/migrator');
const { createInsertSchema } = require('drizzle-zod');
const { compatibilityVersion, npmVersion } = require('drizzle-orm/version');
const { strict: assert } = require('node:assert');

assert.equal(typeof compatibilityVersion, 'number');
assert.equal(typeof npmVersion, 'string');

const test = pgTable('test', {
	id: serial('id').primaryKey(),
});

const insertSchema = createInsertSchema(test);
