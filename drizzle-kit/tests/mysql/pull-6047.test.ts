import 'dotenv/config';
import { interimToDDL } from 'src/dialects/mysql/ddl';
import { fromDatabaseForDrizzle } from 'src/dialects/mysql/introspect';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { prepareTestDatabase, TestDatabase } from './mocks';

// Regression for https://github.com/drizzle-team/drizzle-orm/issues/6047
// A unique index over a TEXT/BLOB column is valid in MySQL when it has a prefix
// length, so `drizzle-kit pull` must not reject it. It used to fail the whole
// pull with `column_unsupported_unique` ("Failed to map the introspected schema").

// @vitest-environment-options {"max-concurrency":1}

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('#6047: pull tolerates a unique index on a text column', async () => {
	await db.query(
		'CREATE TABLE `notes` (`id` int, `code` text, UNIQUE KEY `notes_code_uq` (`code`(255)))',
	);

	const schema = await fromDatabaseForDrizzle(db, 'drizzle', () => true, () => {}, {
		schema: 'drizzle',
		table: '__drizzle_migrations',
	});

	// Introspecting a database must not raise column_unsupported_unique...
	const fromDb = interimToDDL(schema, { from: 'database' });
	expect(fromDb.errors.some((e) => e.type === 'column_unsupported_unique')).toBe(false);

	// ...and the unique index is still captured in the pulled schema.
	const idx = fromDb.ddl.indexes.list().find((i) => i.name === 'notes_code_uq');
	expect(idx?.isUnique).toBe(true);

	// The guard still applies to drizzle-authored schemas (the default), which is
	// what makes an unprefixed unique on a text column fail early on push/generate.
	expect(interimToDDL(schema).errors.some((e) => e.type === 'column_unsupported_unique')).toBe(true);
});
