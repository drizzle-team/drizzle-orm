import BetterSqlite3 from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { seed } from '../../../src/index.ts';
import * as schema from './sqliteSchema.ts';

let client: BetterSqlite3.Database;
let db: BetterSQLite3Database;

beforeAll(async () => {
	client = new BetterSqlite3(':memory:');

	db = drizzle(client);

	db.run(
		sql.raw(`
    CREATE TABLE \`all_data_types\` (
	\`integer_number\` integer,
	\`integer_boolean\` integer,
	\`integer_timestamp\` integer,
	\`integer_timestampms\` integer,
	\`real\` real,
	\`text\` text,
	\`text_json\` text,
	\`blob_bigint\` blob,
	\`blob_buffer\` blob,
	\`blob_json\` blob,
	\`numeric\` numeric
);

    `),
	);
});

afterAll(async () => {
	client.close();
});

test('basic seed test', async () => {
	// migrate(db, { migrationsFolder: path.join(__dirname, "sqliteMigrations") });

	await seed(db, schema, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);
	// every value in each 10 rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);

	client.close();
});
