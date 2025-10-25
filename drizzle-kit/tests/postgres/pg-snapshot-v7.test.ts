import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diffSnapshotV7, prepareTestDatabase, TestDatabase } from './mocks';
import * as s01 from './snapshots/schema01';
import * as s01new from './snapshots/schema01new';
import * as s02 from './snapshots/schema02';
import * as s02new from './snapshots/schema02new';
import * as s03 from './snapshots/schema03';
import * as s03new from './snapshots/schema03new';

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
	const res = await diffSnapshotV7(db, s01new, s01);
	expect(res.all).toStrictEqual([]);
});

test('s02', async (t) => {
	const res = await diffSnapshotV7(db, s02new, s02);
	expect(res.all).toStrictEqual([]);
});

test('s03', async (t) => {
	const res = await diffSnapshotV7(db, s03new, s03);
	expect(res.all).toStrictEqual([]);
});
