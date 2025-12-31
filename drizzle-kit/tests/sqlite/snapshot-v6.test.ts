import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diffSnapshotV6, prepareTestDatabase, TestDatabase } from './mocks';
import * as s01 from './snapshots/schema01';
import * as s01new from './snapshots/schema01new';
import * as s02 from './snapshots/schema02';
import * as s02new from './snapshots/schema02new';
import * as s03Generate from './snapshots/schema03-generate';
import * as s03Push from './snapshots/schema03-push';
import * as s03newGenerate from './snapshots/schema03new-generate';
import * as s03newPush from './snapshots/schema03new-push';
import * as s04 from './snapshots/schema04';
import * as s04new from './snapshots/schema04new';

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
	const res = await diffSnapshotV6(db, s01new, s01);
	expect(res.all).toStrictEqual([]);
});

test('s02', async (t) => {
	const res = await diffSnapshotV6(db, s02new, s02);
	expect(res.all).toStrictEqual([]);
});

// fk namings
// old kit did not store fk names
// that is okay for generate, but for push db will not have any name
test('s03', async (t) => {
	const res1 = await diffSnapshotV6(db, s03newGenerate, s03Generate, 'generate');

	_.clear();

	const res2 = await diffSnapshotV6(db, s03newPush, s03Push, 'push');
	expect([...res1.all]).toStrictEqual([]);
	expect([...res2.all]).toStrictEqual([]);
});

test('s04', async (t) => {
	const res = await diffSnapshotV6(db, s04new, s04);
	expect(res.all).toStrictEqual([]);
});
