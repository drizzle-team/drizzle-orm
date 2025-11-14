import { pgSchema } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

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

test('big schema #1', async () => {
	const schema = await import('./schemas/schema1');

	await push({ db, to: schema });

	const res1 = await push({ db, to: { ...schema, core: pgSchema('core').existing() } });
	expect(res1.sqlStatements).toStrictEqual([]);

	const res2 = await push({ db, to: schema });
	expect(res2.sqlStatements).toStrictEqual([]);
});
