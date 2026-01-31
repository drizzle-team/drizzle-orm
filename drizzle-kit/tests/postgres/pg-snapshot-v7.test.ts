import { readFileSync } from 'fs';
import { fromEntities } from 'src/dialects/postgres/ddl';
import { upToV8 } from 'src/dialects/postgres/versions';
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

// Snapshot was generated on drizzle-kit@0.23.2 version. This already generated v7 snapshot, but still it lacked of "roles", "policies", "checks", "views" in v7
//
// this is pretty simple schema
/**
 * export const users = pgTable('users', {
 * 	id: serial("id").primaryKey(),
 * 	name: text("name").notNull(),
 * 	email: text("email").notNull().unique(),
 * 	password: text("password").notNull(),
 * 	avatar: text("avatar"),
 * 	createdAt: timestamp("createdAt").notNull().defaultNow(),
 * })
 */
// https://github.com/drizzle-team/drizzle-orm/issues/5099
test('s05. drizzle-kit@0.23.2', async (t) => {
	const snapshotV7 = JSON.parse(readFileSync('tests/postgres/snapshots/snapshot05-0.23.2.json', 'utf-8'));

	expect(() => upToV8(snapshotV7)).not.toThrowError();

	const { snapshot, hints } = upToV8(snapshotV7);
	const ddl = fromEntities(snapshot.ddl);

	expect(ddl.roles.list()).toStrictEqual([]);
	expect(ddl.policies.list()).toStrictEqual([]);
	expect(ddl.checks.list()).toStrictEqual([]);
	expect(ddl.views.list()).toStrictEqual([]);
});
