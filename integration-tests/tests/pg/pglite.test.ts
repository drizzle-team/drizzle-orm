import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { vector } from '@electric-sql/pglite/vector';
import { defineRelations, getColumns, Name, sql } from 'drizzle-orm';
import { getTableConfig, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { describe, expect, test as vitestTest } from 'vitest';
import { tests } from './common';
import { _push, pgliteTest as test } from './instrumentation';
import { usersMigratorTable, usersTable } from './schema';
import { normalizeDataWithDbCodecs } from './utils';

tests(test, []);

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

	test('insert via db.execute + select via db.execute', async ({ db }) => {
		await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

		const result = await db.execute<{ id: number; name: string }>(sql`select id, name from "users"`);
		expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute + returning', async ({ db }) => {
		const result = await db.execute<{ id: number; name: string }>(
			sql`insert into ${usersTable} (${new Name(
				usersTable.name.name,
			)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
		);
		expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute w/ query builder', async ({ db }) => {
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
			data: (await db.execute(db.select().from(allTypesTable))).rows as Record<string, unknown>[],
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
