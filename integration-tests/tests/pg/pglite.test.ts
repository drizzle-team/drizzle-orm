import type { Results } from '@electric-sql/pglite';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { postgis } from '@electric-sql/pglite-postgis';
import { defineRelations, getColumns, Name, sql } from 'drizzle-orm';
import { getTableConfig, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate, rollback } from 'drizzle-orm/pglite/migrator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { describe, expect, expectTypeOf, test as vitestTest } from 'vitest';
import { tests } from './common';
import { _push, pgliteTest as test } from './instrumentation';
import { usersMigratorTable, usersTable } from './schema';
import { assertMalformedSnapshotRejected, assertSnapshotIdNotInjectable } from './snapshot';
import { normalizeDataWithDbCodecs } from './utils';

tests(test, []);

test('raw db.execute type matches returned data', async ({ db: fixtureDb }) => {
	const db = fixtureDb as unknown as PgliteDatabase;
	const table = sql.identifier('raw_execute_types');

	await db.execute<never>(sql`drop table if exists ${table}`);

	// DDL
	const created = await db.execute<never>(sql`create table ${table} ("id" integer primary key, "name" text not null)`);
	expectTypeOf(created).toEqualTypeOf<Results<never>>();
	expect(created).toEqual({ rows: [], fields: [], affectedRows: 0, command: 'CREATE' });

	// `insert` without returning
	const inserted = await db.execute<never>(sql`insert into ${table} values (1, 'John')`);
	expectTypeOf(inserted).toEqualTypeOf<Results<never>>();
	expect(inserted).toEqual({ rows: [], fields: [], affectedRows: 1, command: 'INSERT', rowCount: 1 });

	// Simple select
	const selected = await db.execute<{ id: number; name: string }>(sql`select "id", "name" from ${table} order by "id"`);
	expectTypeOf(selected).toEqualTypeOf<Results<{ id: number; name: string }>>();
	expect(selected).toEqual({
		rows: [{ id: 1, name: 'John' }],
		fields: [expect.objectContaining({ name: 'id' }), expect.objectContaining({ name: 'name' })],
		affectedRows: 0,
		command: 'SELECT',
		rowCount: 1,
	});

	// Any response
	const any = await db.execute(sql`select "id", "name" from ${table} order by "id"`);
	expectTypeOf(any).toEqualTypeOf<Results<Record<string, unknown>>>();
	expect(any).toEqual({
		rows: [{ id: 1, name: 'John' }],
		fields: [expect.objectContaining({ name: 'id' }), expect.objectContaining({ name: 'name' })],
		affectedRows: 0,
		command: 'SELECT',
		rowCount: 1,
	});

	await db.execute<never>(sql`drop table ${table}`);
});

describe('pglite', () => {
	test('migrator : default migration strategy', async ({ db }) => {
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(
			sql`drop table if exists users12`,
		);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db, { migrationsFolder: './drizzle2/pg' });

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

		const result = await db.select().from(usersMigratorTable);

		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
	});

	test('insert via db.execute + select via db.execute', async ({ db, push }) => {
		const usersTable = pgTable('users_execute_raw_pglite_1', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${usersTable}`);
		await push({ usersTable });

		await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

		const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
		expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute + returning', async ({ db, push }) => {
		const usersTable = pgTable('users_execute_raw_pglite_2', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${usersTable}`);
		await push({ usersTable });

		const result = await db.execute<{ id: number; name: string }>(
			sql`insert into ${usersTable} (${new Name(
				usersTable.name.name,
			)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
		);
		expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute w/ query builder', async ({ db, push }) => {
		const usersTable = pgTable('users_execute_raw_pglite_3', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${usersTable}`);
		await push({ usersTable });

		const result = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
			db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
		);
		expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
	});

	test('migrator : --init', async ({ db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/pg-init',
			migrationsTable,
			migrationsSchema,
			// @ts-ignore - internal param
			init: true,
		});

		const meta = await db.select({
			hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
			createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
		}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

		const res = await db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
					SELECT 1
					FROM pg_tables
					WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? 'public'} AND tablename = ${
			getTableConfig(usersMigratorTable).name
		}
				) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual(undefined);
		expect(meta.length).toStrictEqual(1);
		expect(res.rows[0]?.tableExists).toStrictEqual(false);
	});

	test('migrator : --init - local migrations error', async ({ db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/pg',
			migrationsTable,
			migrationsSchema,
			// @ts-ignore - internal param
			init: true,
		});

		const meta = await db.select({
			hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
			createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
		}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

		const res = await db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
					SELECT 1
					FROM pg_tables
					WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? 'public'} AND tablename = ${
			getTableConfig(usersMigratorTable).name
		}
				) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual({ exitCode: 'localMigrations' });
		expect(meta.length).toStrictEqual(0);
		expect(res.rows[0]?.tableExists).toStrictEqual(false);
	});

	test('migrator : --init - db migrations error', async ({ db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		await migrate(db, {
			migrationsFolder: './drizzle2/pg-init',
			migrationsSchema,
			migrationsTable,
		});

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/pg',
			migrationsTable,
			migrationsSchema,
			// @ts-ignore - internal param
			init: true,
		});

		const meta = await db.select({
			hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
			createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
		}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

		const res = await db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
					SELECT 1
					FROM pg_tables
					WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? 'public'} AND tablename = ${
			getTableConfig(usersMigratorTable).name
		}
				) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual({ exitCode: 'databaseMigrations' });
		expect(meta.length).toStrictEqual(1);
		expect(res.rows[0]?.tableExists).toStrictEqual(true);
	});

	test('migrator: local migration is unapplied. Migrations timestamp is less than last db migration', async ({ db }) => {
		const users = pgTable('migration_users', {
			id: serial('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: integer(),
		});

		const users2 = pgTable('migration_users2', {
			id: serial('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: integer(),
		});

		await db.execute(sql`drop schema if exists "drizzle" cascade;`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`drop table if exists ${users2}`);

		// create migration directory
		const migrationDir = './migrations/pglite';
		if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
		mkdirSync(migrationDir, { recursive: true });

		// first branch
		mkdirSync(`${migrationDir}/20240101010101_initial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101010101_initial/migration.sql`,
			`CREATE TABLE "migration_users" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n);`,
		);
		mkdirSync(`${migrationDir}/20240303030303_third`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240303030303_third/migration.sql`,
			`ALTER TABLE "migration_users" ADD COLUMN "age" integer;`,
		);

		await migrate(db, { migrationsFolder: migrationDir });
		const res1 = await db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

		// second migration was not applied yet
		await expect(db.insert(users2).values({ name: 'John', email: '', age: 30 })).rejects.toThrowError();

		// insert migration with earlier timestamp
		mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240202020202_second/migration.sql`,
			`CREATE TABLE "migration_users2" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
		);
		await migrate(db, { migrationsFolder: migrationDir });

		const res2 = await db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

		const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
		expect(res1).toStrictEqual(expected);
		expect(res2).toStrictEqual(expected);

		rmSync(migrationDir, { recursive: true });
	});

	const rollbackMigrationDir = './migrations/pglite-rollback';

	const writeRollbackMigration = (name: string, up: string, down?: string) => {
		mkdirSync(`${rollbackMigrationDir}/${name}`, { recursive: true });
		writeFileSync(`${rollbackMigrationDir}/${name}/migration.sql`, up);
		if (down !== undefined) writeFileSync(`${rollbackMigrationDir}/${name}/down.sql`, down);
	};

	const prepareRollbackMigrations = async (db: PgliteDatabase<any>) => {
		await db.execute(sql`drop schema if exists "drizzle" cascade;`);
		await db.execute(sql`drop table if exists "rollback_posts"`);
		await db.execute(sql`drop table if exists "rollback_users"`);

		if (existsSync(rollbackMigrationDir)) rmSync(rollbackMigrationDir, { recursive: true });
		mkdirSync(rollbackMigrationDir, { recursive: true });
	};

	const appliedMigrations = async (db: PgliteDatabase<any>) => {
		const res = await db.execute<{ name: string }>(
			sql`select name from "drizzle"."__drizzle_migrations" order by id`,
		);
		return Array.prototype.slice.call(res.rows).map((row: { name: string }) => row.name);
	};

	const tableExists = async (db: PgliteDatabase<any>, name: string) => {
		const res = await db.execute<{ exists: boolean }>(
			sql`select exists (select 1 from pg_tables where tablename = ${name}) as ${sql.identifier('exists')}`,
		);
		return Array.prototype.slice.call(res.rows)[0]?.exists;
	};

	test('rollback: undoes the last migration and re-applies cleanly', async ({ db }) => {
		await prepareRollbackMigrations(db);
		writeRollbackMigration(
			'20240101010101_users',
			`CREATE TABLE "rollback_users" ("id" serial PRIMARY KEY);`,
			`DROP TABLE "rollback_users";`,
		);
		writeRollbackMigration(
			'20240202020202_posts',
			`CREATE TABLE "rollback_posts" ("id" serial PRIMARY KEY);`,
			`DROP TABLE "rollback_posts";`,
		);

		await migrate(db, { migrationsFolder: rollbackMigrationDir });
		await rollback(db, { migrationsFolder: rollbackMigrationDir });

		expect(await appliedMigrations(db)).toStrictEqual(['20240101010101_users']);
		expect(await tableExists(db, 'rollback_posts')).toBe(false);
		expect(await tableExists(db, 'rollback_users')).toBe(true);

		await migrate(db, { migrationsFolder: rollbackMigrationDir });

		expect(await appliedMigrations(db)).toStrictEqual(['20240101010101_users', '20240202020202_posts']);
		expect(await tableExists(db, 'rollback_posts')).toBe(true);

		rmSync(rollbackMigrationDir, { recursive: true });
	});

	test('rollback: steps undoes several migrations newest first', async ({ db }) => {
		await prepareRollbackMigrations(db);
		writeRollbackMigration(
			'20240101010101_users',
			`CREATE TABLE "rollback_users" ("id" serial PRIMARY KEY);`,
			`DROP TABLE "rollback_users";`,
		);
		writeRollbackMigration(
			'20240202020202_posts',
			`CREATE TABLE "rollback_posts" ("id" serial PRIMARY KEY, "user_id" integer REFERENCES "rollback_users"("id"));`,
			`DROP TABLE "rollback_posts";`,
		);

		await migrate(db, { migrationsFolder: rollbackMigrationDir });
		await rollback(db, { migrationsFolder: rollbackMigrationDir }, { steps: 2 });

		expect(await appliedMigrations(db)).toStrictEqual([]);
		expect(await tableExists(db, 'rollback_posts')).toBe(false);
		expect(await tableExists(db, 'rollback_users')).toBe(false);

		rmSync(rollbackMigrationDir, { recursive: true });
	});

	test('rollback: rejects a migration without down.sql', async ({ db }) => {
		await prepareRollbackMigrations(db);
		writeRollbackMigration('20240101010101_users', `CREATE TABLE "rollback_users" ("id" serial PRIMARY KEY);`);

		await migrate(db, { migrationsFolder: rollbackMigrationDir });

		await expect(rollback(db, { migrationsFolder: rollbackMigrationDir })).rejects.toThrowError(
			/has no down SQL/,
		);

		expect(await appliedMigrations(db)).toStrictEqual(['20240101010101_users']);
		expect(await tableExists(db, 'rollback_users')).toBe(true);

		rmSync(rollbackMigrationDir, { recursive: true });
	});

	test('rollback: a failing down statement leaves the migration applied', async ({ db }) => {
		await prepareRollbackMigrations(db);
		writeRollbackMigration(
			'20240101010101_users',
			`CREATE TABLE "rollback_users" ("id" serial PRIMARY KEY);`,
			// The drop succeeds before the bad statement fails, so without a transaction the table
			// would be gone while the journal still claimed the migration was applied.
			`DROP TABLE "rollback_users";\n--> statement-breakpoint\nSELECT * FROM "rollback_missing";`,
		);

		await migrate(db, { migrationsFolder: rollbackMigrationDir });

		await expect(rollback(db, { migrationsFolder: rollbackMigrationDir })).rejects.toThrowError();

		expect(await appliedMigrations(db)).toStrictEqual(['20240101010101_users']);
		expect(await tableExists(db, 'rollback_users')).toBe(true);

		rmSync(rollbackMigrationDir, { recursive: true });
	});

	// Postgres accepts a comment-only query as a successful no-op, which would delete the journal row while
	// leaving the schema migrated.
	test('rollback: rejects an unedited custom scaffold instead of running it', async ({ db }) => {
		await prepareRollbackMigrations(db);
		writeRollbackMigration(
			'20240101010101_users',
			`CREATE TABLE "rollback_users" ("id" serial PRIMARY KEY);`,
			'-- Custom SQL rollback file, put your reverse statements below! --\n',
		);

		await migrate(db, { migrationsFolder: rollbackMigrationDir });

		await expect(rollback(db, { migrationsFolder: rollbackMigrationDir })).rejects.toThrowError(
			/has no down SQL/,
		);
		expect(await appliedMigrations(db)).toStrictEqual(['20240101010101_users']);

		rmSync(rollbackMigrationDir, { recursive: true });
	});

	test('rollback: to and dryRun report the plan without touching the database', async ({ db }) => {
		await prepareRollbackMigrations(db);
		writeRollbackMigration(
			'20240101010101_users',
			`CREATE TABLE "rollback_users" ("id" serial PRIMARY KEY);`,
			`DROP TABLE "rollback_users";`,
		);
		writeRollbackMigration(
			'20240102010101_posts',
			`CREATE TABLE "rollback_posts" ("id" serial PRIMARY KEY);`,
			`DROP TABLE "rollback_posts";`,
		);

		await migrate(db, { migrationsFolder: rollbackMigrationDir });

		const plan = await rollback(db, { migrationsFolder: rollbackMigrationDir }, {
			to: '20240101010101_users',
			dryRun: true,
		});
		expect(plan).toMatchObject([{ name: '20240102010101_posts', downSql: ['DROP TABLE "rollback_posts";'] }]);
		expect(await appliedMigrations(db)).toStrictEqual(['20240101010101_users', '20240102010101_posts']);
		expect(await tableExists(db, 'rollback_posts')).toBe(true);

		const done = await rollback(db, { migrationsFolder: rollbackMigrationDir }, { to: '20240101010101_users' });
		expect(done).toStrictEqual(plan);
		expect(await appliedMigrations(db)).toStrictEqual(['20240101010101_users']);
		expect(await tableExists(db, 'rollback_posts')).toBe(false);

		rmSync(rollbackMigrationDir, { recursive: true });
	});

	test('rollback: reports a missing journal instead of a raw SQL error', async ({ db }) => {
		await prepareRollbackMigrations(db);
		writeRollbackMigration('20240101010101_users', `SELECT 1;`, `SELECT 1;`);

		await expect(rollback(db, { migrationsFolder: rollbackMigrationDir })).rejects.toThrowError(
			/Cannot read the migrations journal drizzle.__drizzle_migrations/,
		);

		rmSync(rollbackMigrationDir, { recursive: true });
	});
});

describe('pglite extensions', () => {
	const allTypesTable = pgTable('extension_types', (t) => ({
		id: t.integer('id').primaryKey(),
		geo: t.geometry('geo'),
		arrgeo: t.geometry('arrgeo').array(),
		geoxy: t.geometry('geoxy', { mode: 'xy' }),
		arrgeoxy: t.geometry('arrgeoxy', { mode: 'xy' }).array(),
		bit: t.bit('bit', { dimensions: 3 }),
		arrbit: t.bit('arrbit', { dimensions: 3 }).array(),
		halfvec: t.halfvec('halfvec', { dimensions: 3 }),
		arrhalfvec: t.halfvec('arrhalfvec', { dimensions: 3 }).array(),
		vector: t.vector('vector', { dimensions: 3 }),
		arrvector: t.vector('arrvector', { dimensions: 3 }).array(),
		sparsevec: t.sparsevec('sparsevec', { dimensions: 5 }),
		arrsparsevec: t.sparsevec('arrsparsevec', { dimensions: 5 }).array(),
	}));

	const relations = defineRelations({ allTypesTable }, (r) => ({
		allTypesTable: {
			self: r.many.allTypesTable({
				from: r.allTypesTable.id,
				to: r.allTypesTable.id,
			}),
		},
	}));

	const createExtDb = async () => {
		const client = new PGlite({ extensions: { postgis, vector: vector as any } });
		const db = drizzle({ client, relations });
		await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis;`);
		await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
		return { client, db };
	};

	const pushExt = (client: PGlite, schema: any) =>
		_push(async (s, params) => (await client.query(s, params)).rows as any[], schema);

	vitestTest('extension types ~codecs~', async () => {
		const { client, db } = await createExtDb();
		await db.execute(sql`DROP TABLE IF EXISTS ${allTypesTable} CASCADE;`);
		await pushExt(client, { allTypesTable });

		await db.insert(allTypesTable).values({
			id: 1,
			geo: [15.23, 51.13],
			arrgeo: [[15.23, 51.13], [1.5, 2.5]],
			geoxy: { x: 15.23, y: 51.13 },
			arrgeoxy: [{ x: 15.23, y: 51.13 }, { x: 1.5, y: 2.5 }],
			bit: '101',
			arrbit: ['101', '010'],
			halfvec: [0.2, 3.5, 8.4],
			arrhalfvec: [[0.2, 3.5, 8.4], [1, 2, 3]],
			vector: [1.9345, 2.8238, 12.3465],
			arrvector: [[1.9345, 2.8238, 12.3465], [4.5, 5.5, 6.5]],
			sparsevec: '{1:1,3:2,5:3}/5',
			arrsparsevec: ['{1:1,3:2,5:3}/5', '{2:9}/5'],
		});

		const queryRes = normalizeDataWithDbCodecs({
			db,
			columns: getColumns(allTypesTable),
			data: (await db.execute(db.select().from(allTypesTable).getSQL(true))).rows as Record<string, unknown>[],
			mode: 'query',
		})[0];

		const [{ self: relationRaw, ...rootRaw }] = (await db.execute(
			db.query.allTypesTable.findFirst({ with: { self: true } }),
		)).rows as any[];

		const relationRes = normalizeDataWithDbCodecs({
			db,
			columns: getColumns(allTypesTable),
			data: relationRaw,
			mode: 'json',
		})[0]!;
		const rootRes = normalizeDataWithDbCodecs({
			db,
			columns: getColumns(allTypesTable),
			data: [rootRaw],
			mode: 'query',
		})[0]!;

		const expectedRes = {
			id: 1,
			geo: [15.23, 51.13],
			arrgeo: [[15.23, 51.13], [1.5, 2.5]],
			geoxy: { x: 15.23, y: 51.13 },
			arrgeoxy: [{ x: 15.23, y: 51.13 }, { x: 1.5, y: 2.5 }],
			bit: '101',
			arrbit: ['101', '010'],
			halfvec: [0.19995117, 3.5, 8.3984375],
			arrhalfvec: [[0.19995117, 3.5, 8.3984375], [1, 2, 3]],
			vector: [1.9345, 2.8238, 12.3465],
			arrvector: [[1.9345, 2.8238, 12.3465], [4.5, 5.5, 6.5]],
			sparsevec: '{1:1,3:2,5:3}/5',
			arrsparsevec: ['{1:1,3:2,5:3}/5', '{2:9}/5'],
		};

		expect(queryRes).toStrictEqual(expectedRes);
		expect(relationRes).toStrictEqual(expectedRes);
		expect(rootRes).toStrictEqual(expectedRes);

		await client.close();
	});
});

describe('transaction snapshot', () => {
	test('rejects a malformed id', async ({ db }) => {
		await assertMalformedSnapshotRejected(db, expect);
	});

	test('does not let the id inject SQL', async ({ db }) => {
		await assertSnapshotIdNotInjectable(db, expect, 'pglite');
	});
});
