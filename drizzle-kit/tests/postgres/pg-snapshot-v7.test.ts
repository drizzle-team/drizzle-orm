import { readFileSync } from 'fs';
import { fromEntities } from 'src/dialects/postgres/ddl';
import { upToV8 } from 'src/dialects/postgres/versions';
import { serializePg } from 'src/legacy/postgres-v7/serializer';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, diffSnapshotV7, drizzleToDDL, prepareTestDatabase, push, TestDatabase } from './mocks';
import * as s01 from './snapshots/schema01';
import * as s01new from './snapshots/schema01new';
import * as s02 from './snapshots/schema02';
import * as s02new from './snapshots/schema02new';
import * as s03 from './snapshots/schema03';
import * as s03new from './snapshots/schema03new';
import * as s06 from './snapshots/schema06';
import * as s06new from './snapshots/schema06new';

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

// The s06 tests build the old snapshot with `serializePg` and do not run the SQL of the old kit, because that
// SQL fails for an enum array and for an object enum of a custom schema. The upgrade stores no type schema for
// these columns, so `diff` must ignore a type schema that only one state names.
test('s06. the first diff after the upgrade writes no SQL for enum arrays and object enums', async () => {
	const { snapshot } = upToV8(await serializePg(s06, 'camelCase'));

	const { sqlStatements: st } = await diff(fromEntities(snapshot.ddl), s06new, []);

	expect(st).toStrictEqual([]);
});

test.each([
	{ schema: 'folder', name: 'color', table: 'cats', column: 'color', kept: 'red' },
	{ schema: 'folder', name: 'size', table: 'cats', column: 'size', kept: 'small' },
	{ schema: 'public', name: 'coat', table: 'dogs', column: 'coat', kept: 'short' },
	{ schema: 'public', name: 'weight', table: 'dogs', column: 'weight', kept: 'light' },
])(
	's06. the first diff after the upgrade removes a value of the enum $name of the schema $schema with SQL that runs',
	async ({ schema, name, table, column, kept }) => {
		const { snapshot } = upToV8(await serializePg(s06, 'camelCase'));
		const withoutValue = () => {
			const { ddl } = drizzleToDDL(s06new);
			ddl.enums.update({ set: { values: [kept] }, where: { schema, name } });
			return ddl;
		};

		const { sqlStatements: st } = await diff(fromEntities(snapshot.ddl), withoutValue(), []);
		await push({ db, to: s06new });
		for (const statement of st) await db.query(statement);

		const type = schema === 'public' ? `"${name}"` : `"${schema}"."${name}"`;
		expect(st).toStrictEqual([
			`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DATA TYPE text;`,
			`ALTER TABLE "${table}" ALTER COLUMN "${column}s" SET DATA TYPE text[];`,
			`DROP TYPE ${type};`,
			`CREATE TYPE ${type} AS ENUM('${kept}');`,
			`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DATA TYPE ${type} USING "${column}"::${type};`,
			`ALTER TABLE "${table}" ALTER COLUMN "${column}s" SET DATA TYPE ${type}[] USING "${column}s"::${type}[];`,
		]);
		expect((await push({ db, to: withoutValue() })).sqlStatements).toStrictEqual([]);
	},
);

// `jobs.timeout` has the built-in type `interval`, and `jobs.period` has the enum folder.interval. The old
// format stores the two columns in the same way, apart from the schema of the type.
test('s06. the first diff after the upgrade keeps a column of a built-in type that has the name of an enum', async () => {
	const { snapshot } = upToV8(await serializePg(s06, 'camelCase'));
	const withoutValue = () => {
		const { ddl } = drizzleToDDL(s06new);
		ddl.enums.update({ set: { values: ['month'] }, where: { schema: 'folder', name: 'interval' } });
		return ddl;
	};

	const { sqlStatements: st } = await diff(fromEntities(snapshot.ddl), withoutValue(), []);
	await push({ db, to: s06new });
	await db.query(`INSERT INTO "jobs" ("timeout") VALUES ('1 hour');`);
	for (const statement of st) await db.query(statement);

	expect(st).toStrictEqual([
		'ALTER TABLE "jobs" ALTER COLUMN "period" SET DATA TYPE text;',
		'DROP TYPE "folder"."interval";',
		`CREATE TYPE "folder"."interval" AS ENUM('month');`,
		'ALTER TABLE "jobs" ALTER COLUMN "period" SET DATA TYPE "folder"."interval" USING "period"::"folder"."interval";',
	]);
	expect((await push({ db, to: withoutValue() })).sqlStatements).toStrictEqual([]);
});
