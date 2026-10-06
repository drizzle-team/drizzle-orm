import { cockroachTable, int4, text as crText } from 'drizzle-orm/cockroach-core';
import { int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { index, integer, pgSchema, pgTable, text } from 'drizzle-orm/pg-core';
import { int as ssInt, singlestoreTable, varchar as ssVarchar } from 'drizzle-orm/singlestore-core';
import { integer as sqliteInt, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { ddlDiffWithDown as cockroachDiff } from 'src/cli/commands/generate-cockroach';
import { ddlDiffWithDown as mysqlDiff } from 'src/cli/commands/generate-mysql';
import { ddlDiffWithDown as postgresDiff } from 'src/cli/commands/generate-postgres';
import { ddlDiffWithDown as singlestoreDiff } from 'src/cli/commands/generate-singlestore';
import { ddlDiffWithDown as sqliteDiff } from 'src/cli/commands/generate-sqlite';
import { mockResolver } from 'src/utils/mocks';
import { describe, expect, test } from 'vitest';
import { type CockroachDBSchema, drizzleToDDL as cockroachDDL } from '../cockroach/mocks';
import { drizzleToDDL as mysqlDDL, type MysqlSchema } from '../mysql/mocks';
import { drizzleToDDL as postgresDDL, type PostgresSchema } from '../postgres/mocks';
import { drizzleToDDL as singlestoreDDL, type SinglestoreSchema } from '../singlestore/mocks';
import { drizzleToDDL as sqliteDDL, type SqliteSchema } from '../sqlite/mocks';

const postgres = async (from: PostgresSchema, to: PostgresSchema, renames: string[] = []) => {
	const set = new Set(renames);
	const up = await postgresDiff(postgresDDL(from).ddl, postgresDDL(to).ddl, () => mockResolver(set));
	return { up: up.sqlStatements, down: (await up.down()).sqlStatements };
};

const sqlite = async (from: SqliteSchema, to: SqliteSchema, renames: string[] = []) => {
	const set = new Set(renames);
	const up = await sqliteDiff(sqliteDDL(from).ddl, sqliteDDL(to).ddl, () => mockResolver(set));
	return { up: up.sqlStatements, down: (await up.down()).sqlStatements };
};

describe('postgres down.sql renames', () => {
	test('table rename is renamed back', async () => {
		const { down } = await postgres(
			{ users: pgTable('users', { id: integer() }) },
			{ users: pgTable('people', { id: integer() }) },
			['public.users->public.people'],
		);
		expect(down).toStrictEqual(['ALTER TABLE "people" RENAME TO "users";']);
	});

	test('column rename is renamed back', async () => {
		const { down } = await postgres(
			{ users: pgTable('users', { id: integer(), name: text() }) },
			{ users: pgTable('users', { id: integer(), fullName: text('full_name') }) },
			['public.users.name->public.users.full_name'],
		);
		expect(down).toStrictEqual(['ALTER TABLE "users" RENAME COLUMN "full_name" TO "name";']);
	});

	test('table rename plus added column drops the column and renames the table back', async () => {
		const { down } = await postgres(
			{ users: pgTable('users', { id: integer() }) },
			{ users: pgTable('people', { id: integer(), age: integer() }) },
			['public.users->public.people'],
		);
		expect(down).toStrictEqual([
			'ALTER TABLE "people" RENAME TO "users";',
			'ALTER TABLE "users" DROP COLUMN "age";',
		]);
	});

	test('table and column renamed together are both renamed back', async () => {
		const { down } = await postgres(
			{ users: pgTable('users', { id: integer(), name: text() }) },
			{ users: pgTable('people', { id: integer(), fullName: text('full_name') }) },
			['public.users->public.people', 'public.people.name->public.people.full_name'],
		);
		expect(down).toStrictEqual([
			'ALTER TABLE "people" RENAME TO "users";',
			'ALTER TABLE "users" RENAME COLUMN "full_name" TO "name";',
		]);
	});

	test('schema, table, column and index renamed together are all renamed back', async () => {
		const s1 = pgSchema('s1');
		const s2 = pgSchema('s2');
		const { down } = await postgres(
			{ s1, users: s1.table('users', { id: integer(), name: text() }, (t) => [index('ix').on(t.name)]) },
			{
				s2,
				users: s2.table('people', { id: integer(), fullName: text('full_name') }, (t) => [index('ix2').on(t.fullName)]),
			},
			['s1->s2', 's2.users->s2.people', 's2.people.name->s2.people.full_name', 's2.people.ix->s2.people.ix2'],
		);
		expect(down).toStrictEqual([
			'ALTER SCHEMA "s2" RENAME TO "s1";\n',
			'ALTER TABLE "s1"."people" RENAME TO "users";',
			'ALTER TABLE "s1"."users" RENAME COLUMN "full_name" TO "name";',
			'ALTER INDEX "s1"."ix2" RENAME TO "ix";',
		]);
	});
});

describe('sqlite down.sql renames', () => {
	test('table rename is renamed back', async () => {
		const { down } = await sqlite(
			{ users: sqliteTable('users', { id: sqliteInt(), name: sqliteText() }) },
			{ users: sqliteTable('people', { id: sqliteInt(), name: sqliteText() }) },
			['users->people'],
		);
		expect(down).toStrictEqual(['ALTER TABLE `people` RENAME TO `users`;']);
	});

	test('table and column renamed together are both renamed back', async () => {
		const { down } = await sqlite(
			{ users: sqliteTable('users', { id: sqliteInt(), name: sqliteText() }) },
			{ users: sqliteTable('people', { id: sqliteInt(), fullName: sqliteText('full_name') }) },
			['users->people', 'people.name->people.full_name'],
		);
		expect(down).toStrictEqual([
			'ALTER TABLE `people` RENAME TO `users`;',
			'ALTER TABLE `users` RENAME COLUMN `full_name` TO `name`;',
		]);
	});
});

test('mysql table and column renamed together are both renamed back', async () => {
	const from: MysqlSchema = { users: mysqlTable('users', { id: int(), name: varchar({ length: 10 }) }) };
	const to: MysqlSchema = {
		users: mysqlTable('people', { id: int(), fullName: varchar('full_name', { length: 10 }) }),
	};
	const set = new Set(['users->people', 'people.name->people.full_name']);
	const up = await mysqlDiff(mysqlDDL(from).ddl, mysqlDDL(to).ddl, () => mockResolver(set));
	expect((await up.down()).sqlStatements).toStrictEqual([
		'RENAME TABLE `people` TO `users`;',
		'ALTER TABLE `users` RENAME COLUMN `full_name` TO `name`;',
	]);
});

test('singlestore table and column renamed together are both renamed back', async () => {
	const from: SinglestoreSchema = {
		users: singlestoreTable('users', { id: ssInt(), name: ssVarchar({ length: 10 }) }),
	};
	const to: SinglestoreSchema = {
		users: singlestoreTable('people', { id: ssInt(), fullName: ssVarchar('full_name', { length: 10 }) }),
	};
	const set = new Set(['users->people', 'people.name->people.full_name']);
	const up = await singlestoreDiff(singlestoreDDL(from).ddl, singlestoreDDL(to).ddl, () => mockResolver(set));
	expect((await up.down()).sqlStatements).toStrictEqual([
		'RENAME TABLE `people` TO `users`;',
		'ALTER TABLE `users` RENAME COLUMN `full_name` TO `name`;',
	]);
});

test('cockroach table and column renamed together are both renamed back', async () => {
	const from: CockroachDBSchema = { users: cockroachTable('users', { id: int4(), name: crText() }) };
	const to: CockroachDBSchema = { users: cockroachTable('people', { id: int4(), fullName: crText('full_name') }) };
	const set = new Set(['public.users->public.people', 'public.people.name->public.people.full_name']);
	const up = await cockroachDiff(cockroachDDL(from).ddl, cockroachDDL(to).ddl, () => mockResolver(set));
	expect((await up.down()).sqlStatements).toStrictEqual([
		'ALTER TABLE "people" RENAME TO "users";',
		'ALTER TABLE "users" RENAME COLUMN "full_name" TO "name";',
	]);
});
