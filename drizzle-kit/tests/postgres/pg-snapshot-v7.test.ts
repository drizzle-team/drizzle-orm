import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diffSnapshotV7, prepareTestDatabase, TestDatabase } from './mocks';
import * as s01 from './snapshots/schema01';
import * as s02 from './snapshots/schema02';
import * as s03 from './snapshots/schema02';

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

test('s01', async (t) => {
	const res = await diffSnapshotV7(db, s01);
	expect(res.all).toStrictEqual([]);
});

test('s02', async (t) => {
	const res = await diffSnapshotV7(db, s02);
	expect(res.all).toStrictEqual([]);
});

test('s03', async (t) => {
	const res = await diffSnapshotV7(db, s03);
	expect(res.all).toStrictEqual([]);
});
