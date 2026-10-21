import { createPool as createAuroraClient } from '@drizzle-team/minipg/aurora';
import { and, defineRelations, eq, getColumns, inArray, not, sql } from 'drizzle-orm';
import {
	boolean,
	foreignKey,
	getTableConfig,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgSchema,
	pgTable,
	pgView,
	serial,
	snakeCase,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';
import { drizzle as drizzleAurora, minipgAuroraCodecs, type PostgresAuroraDatabase } from 'drizzle-orm/postgres/aurora';
import { migrate } from 'drizzle-orm/postgres/aurora/migrator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { describe, expect, expectTypeOf } from 'vitest';
import { randomString } from '~/utils';
import {
	allTypesData,
	allTypesEnum,
	allTypesRelations,
	allTypesTable,
	assertAllTypesBounds,
	assertAllTypesUnions,
	makeAllTypes,
} from './all-types';
import { tests } from './common';
import { awsDataApiConfig, postgresAuroraTest as test } from './instrumentation';
import { usersMigratorTable } from './schema';
import {
	assertMalformedSnapshotRejected,
	assertSnapshotIdNotInjectable,
	assertSnapshotIsolatesTransaction,
} from './snapshot';

const skips = [
	// Data API dialect uses `:pN` placeholders instead of `$N`, redefined below
	'2 consecutive use of .toSQL',
	'Issue No3856',
	'mySchema :: build query insert with onConflict do update / multiple columns',
	'mySchema :: build query insert with onConflict do nothing + target',
	'casing in sql``',
	'comments',
	'RQB v2 find many - $count',
	'issue #4169',
	// Default client has no codecs, uses shapes instead
	'all types ~codecs~',
];

const stringTemporalDb = (database: string) =>
	drizzleAurora({
		client: createAuroraClient({
			...awsDataApiConfig,
			database,
			endpoint: process.env['AWS_DATA_API_URL']!,
			temporal: 'string',
		}),
	});

describe('postgres/aurora', () => {
	tests(test, skips);

	test('raw db.execute type matches returned data', async ({ db: fixtureDb }) => {
		const db = fixtureDb as unknown as PostgresAuroraDatabase;
		const table = sql.identifier('raw_execute_types');

		await db.execute<never>(sql`drop table if exists ${table}`);

		// DDL
		const created = await db.execute<never>(
			sql`create table ${table} ("id" integer primary key, "name" text not null)`,
		);
		expectTypeOf(created).toEqualTypeOf<
			{ rows: never[]; columns: string[]; command: string | null; rowCount: number | null }
		>();
		expect(created).toEqual({ rows: [], columns: [], command: 'CREATE', rowCount: 0 });

		// `insert` without returning
		const inserted = await db.execute<never>(sql`insert into ${table} values (1, 'John')`);
		expectTypeOf(inserted).toEqualTypeOf<
			{ rows: never[]; columns: string[]; command: string | null; rowCount: number | null }
		>();
		expect(inserted).toEqual({ rows: [], columns: [], command: 'INSERT', rowCount: 1 });

		// Simple select
		const selected = await db.execute<{ id: number; name: string }>(
			sql`select "id", "name" from ${table} order by "id"`,
		);
		expectTypeOf(selected).toEqualTypeOf<
			{ rows: { id: number; name: string }[]; columns: string[]; command: string | null; rowCount: number | null }
		>();
		expect(selected).toEqual({
			rows: [{ id: 1, name: 'John' }],
			columns: ['id', 'name'],
			command: 'SELECT',
			rowCount: 1,
		});

		// Any response
		const any = await db.execute(sql`select "id", "name" from ${table} order by "id"`);
		expectTypeOf(any).toEqualTypeOf<
			{ rows: Record<string, unknown>[]; columns: string[]; command: string | null; rowCount: number | null }
		>();
		expect(any).toEqual({ rows: [{ id: 1, name: 'John' }], columns: ['id', 'name'], command: 'SELECT', rowCount: 1 });

		await db.execute<never>(sql`drop table ${table}`);
	});

	describe(':pN placeholders', () => {
		test('2 consecutive use of .toSQL - :pN placeholders', async ({ db }) => {
			const t1 = pgTable('table', (t) => ({
				id: t.text().primaryKey(),
			}));
			const query1 = db.insert(t1).values({ id: '1' }).toSQL();
			expect(query1).toStrictEqual({ sql: 'insert into "table" ("id") values (:p1)', params: ['1'] });

			const t2 = pgTable('table', (t) => ({
				id: t.text().primaryKey(),
				name: t.text(),
			}));
			const query2 = db.insert(t2).values({ id: '1', name: 'test' }).toSQL();
			expect(query2).toStrictEqual({
				sql: 'insert into "table" ("id", "name") values (:p1, :p2)',
				params: ['1', 'test'],
			});
		});

		test('Issue No3856 - :pN placeholders', async ({ push, db }) => {
			const code = snakeCase.table(
				'code',
				{
					id: uuid().defaultRandom().primaryKey(),
					personId: uuid().notNull(),
					code: text().notNull(),
				},
				(table) => [
					foreignKey({
						columns: [table.personId],
						foreignColumns: [person.id],
						name: 'person_code_fk',
					}),
				],
			);

			const person = snakeCase.table('person', {
				id: uuid().defaultRandom().primaryKey(),
				email: text().notNull(),
				firstName: text().notNull(),
				lastName: text().notNull(),
			});

			const personWithCode = pgView('person_with_code').as((queryBuilder) => {
				const personColumns = getColumns(person);

				return queryBuilder
					.select({
						...personColumns,
						code: code.code,
					})
					.from(person)
					.innerJoin(code, eq(code.personId, person.id));
			});

			await push({ person, code, personWithCode });

			await db.insert(person).values({
				id: '11111111-1111-1111-1111-111111111111',
				email: 'test@gmail.com',
				firstName: 'first_name',
				lastName: 'last_name',
			});
			await db.insert(code).values({
				id: '21111111-1111-1111-1111-111111111111',
				personId: '11111111-1111-1111-1111-111111111111',
				code: 'code value',
			});

			const query = db
				.select()
				.from(personWithCode)
				.where(eq(personWithCode.code, 'code value'));

			const res = await query;

			expect(res).toStrictEqual([{
				code: 'code value',
				email: 'test@gmail.com',
				firstName: 'first_name',
				id: '11111111-1111-1111-1111-111111111111',
				lastName: 'last_name',
			}]);

			expect(query.toSQL()).toStrictEqual({
				sql:
					'select "id", "email", "first_name", "last_name", "code" from "person_with_code" where "person_with_code"."code" = :p1',
				params: ['code value'],
			});
		});

		test('mySchema :: build query insert with onConflict do update / multiple columns - :pN placeholders', async ({ db }) => {
			const mySchema = pgSchema('mySchema_15');
			const users = mySchema.table('users', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			const query = db
				.insert(users)
				.values({ name: 'John', jsonb: ['foo', 'bar'] })
				.onConflictDoUpdate({
					target: [users.id, users.name],
					set: { name: 'John1' },
				})
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into "mySchema_15"."users" ("id", "name", "verified", "jsonb", "created_at") values (default, :p1, default, :p2, default) on conflict ("id","name") do update set "name" = :p3',
				params: ['John', JSON.stringify(['foo', 'bar']), 'John1'],
			});
		});

		test('mySchema :: build query insert with onConflict do nothing + target - :pN placeholders', async ({ db }) => {
			const mySchema = pgSchema('mySchema_16');
			const users = mySchema.table('users', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			const query = db
				.insert(users)
				.values({ name: 'John', jsonb: ['foo', 'bar'] })
				.onConflictDoNothing({ target: users.id })
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into "mySchema_16"."users" ("id", "name", "verified", "jsonb", "created_at") values (default, :p1, default, :p2, default) on conflict ("id") do nothing',
				params: ['John', JSON.stringify(['foo', 'bar'])],
			});
		});

		test('casing in sql`` - :pN placeholders', async ({ db, push }) => {
			const payments = snakeCase.table('payments', {
				id: integer().primaryKey(),
				amount: numeric(),
				completedAt: timestamp(),
			});
			await push({ payments });
			await db.insert(payments).values({
				id: 1,
				amount: '10.12',
				completedAt: new Date(),
			});

			const query = db
				.insert(payments)
				.values({ id: 1, amount: '12.14', completedAt: new Date() })
				.onConflictDoUpdate({
					target: [payments.id],
					set: {
						completedAt: sql`excluded.${sql.identifier(payments.completedAt.name)}`,
						amount: sql`excluded.${sql.identifier(payments.amount.name)}`,
					},
				});

			expect(query.toSQL().sql).toEqual(
				'insert into "payments" ("id", "amount", "completed_at") values (:p1, :p2, :p3) on conflict ("id") do update set "amount" = excluded."amount", "completed_at" = excluded."completed_at"',
			);
			await query;

			const result = await db
				.select({ amount: payments.amount })
				.from(payments)
				.where(eq(payments.id, 1));

			expect(result).toStrictEqual([{ amount: '12.14' }]);
		});

		test('comments - :pN placeholders', async ({ createDB, push }) => {
			const ctbl = pgTable('comments_test', (t) => ({
				id: t.integer('id').primaryKey(),
				name: t.text('name').notNull(),
			}));

			await push({ ctbl });
			const db = createDB({ ctbl });

			const insertQ = db
				.insert(ctbl)
				.values([{ id: 1, name: 'First' }, { id: 2, name: 'Second' }])
				.comment({ insert: '*/ comment /*', '/* n': 1 });
			expect(insertQ.toSQL().sql).toStrictEqual(
				`insert into "comments_test" ("id", "name") values (:p1, :p2), (:p3, :p4) /*%2F*%20n='1',insert='*%2F%20comment%20%2F*'*/`,
			);

			const deleteQ = db
				.delete(ctbl)
				.where(eq(ctbl.id, 2))
				.comment({ "del ' ete": '*/ comment /*' });
			expect(deleteQ.toSQL().sql).toStrictEqual(
				`delete from "comments_test" where "comments_test"."id" = :p1 /*del%20\\'%20ete='*%2F%20comment%20%2F*'*/`,
			);

			const updateQ = db
				.update(ctbl)
				.set({ name: 'Updated' })
				.where(eq(ctbl.id, 1))
				.comment({ update: 'here /**' });
			expect(updateQ.toSQL().sql).toStrictEqual(
				`update "comments_test" set "name" = :p1 where "comments_test"."id" = :p2 /*update='here%20%2F**'*/`,
			);

			const selectQ = db
				.select()
				.from(ctbl)
				.comment({ select: 'co\'m"m`/* ent*/ "' });
			expect(selectQ.toSQL().sql).toStrictEqual(
				`select "id", "name" from "comments_test" /*select='co\\'m%22m%60%2F*%20ent*%2F%20%22'*/`,
			);

			const rqbQ = db.query.ctbl.findFirst({
				columns: { id: true },
				comment: { fieldOne: '_valueOne', _fieldTwo: 'value two' },
			});
			expect(rqbQ.toSQL().sql).toStrictEqual(
				`select "d0"."id" as "id" from "comments_test" as "d0" limit :p1 /*_fieldTwo='value%20two',fieldOne='_valueOne'*/`,
			);

			await insertQ;
			await updateQ;
			await deleteQ;

			expect(await selectQ).toStrictEqual([{ id: 1, name: 'Updated' }]);
			expect(await rqbQ).toStrictEqual({ id: 1 });
		});

		test('RQB v2 find many - $count - :pN placeholders', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_18', {
				id: serial('id').primaryKey(),
			});

			const statusEnum = pgEnum('status', ['IN_PROGRESS', 'CANCELED', 'CLOSED']);

			const orders = pgTable('rqb_orders_18', {
				id: serial('id').primaryKey(),
				userId: integer('user_id').references(() => users.id).notNull(),
				status: statusEnum('status'),
			});

			await push({ users, orders, statusEnum });
			const db = createDB({ users, orders }, (r) => ({
				orders: {
					user: r.one.users({
						from: [r.orders.userId],
						to: [r.users.id],
					}),
				},
			}));

			await db.insert(users).values([{ id: 1 }, { id: 2 }]);
			await db.insert(orders).values([{ userId: 1, status: 'CANCELED' }, { userId: 2, status: 'IN_PROGRESS' }]);

			const recordsQuery = db.query.users.findMany({
				extras: {
					activeOrders: (users) =>
						db
							.$count(orders, and(eq(orders.userId, users.id), not(inArray(orders.status, ['CANCELED', 'CLOSED']))))
							.as('activeOrders'),
					allOrders: db.$count(orders),
				},
			});

			const result = await recordsQuery;
			expect(result).toStrictEqual([{ id: 1, activeOrders: 0, allOrders: 2 }, {
				id: 2,
				activeOrders: 1,
				allOrders: 2,
			}]);
			expect(recordsQuery.toSQL()).toStrictEqual({
				sql:
					'select "d0"."id" as "id", ((select count(*) from "rqb_orders_18" where (("rqb_orders_18"."user_id" = "d0"."id") and (not ("rqb_orders_18"."status" in (:p1, :p2)))))) as "activeOrders", ((select count(*) from "rqb_orders_18")) as "allOrders" from "rqb_users_18" as "d0"',
				params: ['CANCELED', 'CLOSED'],
			});
		});

		test('issue #4169 - :pN placeholders', async ({ createDB }) => {
			const candidates = pgTable(
				'candidates',
				{
					id: uuid().defaultRandom().primaryKey(),
					createdOn: timestamp('created_on', { mode: 'date' }).notNull().defaultNow(),
					email: text().notNull(),
					firstName: text('first_name').notNull(),
					lastName: text('last_name').notNull(),
					phone: text('phone').notNull(),
					profileLink: text('profile_link'),
				},
				(table) => [
					index('created_on_candidates_idx').on(table.createdOn),
					uniqueIndex('email_candidates_idx').on(table.email),
				],
			);

			const candicacyStatusEnum = pgEnum('candidacy_status', ['IN_PROGRESS', 'CANCELED', 'CLOSED']);

			const jobCandidacies = pgTable('job_candidacy', {
				id: uuid().defaultRandom().primaryKey(),
				createdOn: timestamp('created_on', { mode: 'date' }).notNull().defaultNow(),
				candidateId: uuid('candidate_id')
					.notNull()
					.references(() => candidates.id),
				status: candicacyStatusEnum().notNull(),
			});

			const db = createDB({ candidates, jobCandidacies }, (r) => ({
				candidates: {
					jobCandidacies: r.many.jobCandidacies(),
				},
				jobCandidacies: {
					candidate: r.one.candidates({
						from: r.jobCandidacies.candidateId,
						to: r.candidates.id,
					}),
				},
			}));

			const recordsQuery = db.query.candidates.findMany({
				extras: {
					activeJobs: db
						.$count(
							jobCandidacies,
							and(
								eq(jobCandidacies.candidateId, candidates.id),
								not(inArray(jobCandidacies.status, ['CANCELED', 'CLOSED'])),
							),
						)
						.as('activeJobs'),
				},
			}).toSQL();

			expect(recordsQuery).toStrictEqual({
				params: ['CANCELED', 'CLOSED'],
				sql:
					'select "d0"."id" as "id", "d0"."created_on" as "createdOn", "d0"."email" as "email", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."phone" as "phone", "d0"."profile_link" as "profileLink", ((select count(*) from "job_candidacy" where (("job_candidacy"."candidate_id" = "candidates"."id") and (not ("job_candidacy"."status" in (:p1, :p2)))))) as "activeJobs" from "candidates" as "d0"',
			});
		});
	});

	describe('migrator', () => {
		test('migrator : default migration strategy', async ({ db }) => {
			await db.execute(sql`drop table if exists all_columns`);
			await db.execute(sql`drop table if exists users12`);
			await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

			await migrate(db as any as PostgresAuroraDatabase<any>, { migrationsFolder: './drizzle2/pg' });

			await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

			const result = await db.select().from(usersMigratorTable);

			expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

			await db.execute(sql`drop table all_columns`);
			await db.execute(sql`drop table users12`);
			await db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
		});

		test('migrator : migrate with custom schema', async ({ db }) => {
			const customSchema = randomString();
			await db.execute(sql`drop table if exists all_columns`);
			await db.execute(sql`drop table if exists users12`);
			await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

			await migrate(db as any as PostgresAuroraDatabase<any>, {
				migrationsFolder: './drizzle2/pg',
				migrationsSchema: customSchema,
			});

			// test if the custom migrations table was created
			const { rowCount } = await db.execute(sql`select * from ${sql.identifier(customSchema)}."__drizzle_migrations";`);
			expect(rowCount && rowCount > 0).toBeTruthy();

			// test if the migrated table are working as expected
			await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
			const result = await db.select().from(usersMigratorTable);
			expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

			await db.execute(sql`drop table all_columns`);
			await db.execute(sql`drop table users12`);
			await db.execute(sql`drop table ${sql.identifier(customSchema)}."__drizzle_migrations"`);
		});

		test('migrator : migrate with custom table', async ({ db }) => {
			const customTable = randomString();
			await db.execute(sql`drop table if exists all_columns`);
			await db.execute(sql`drop table if exists users12`);
			await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

			await migrate(db as any as PostgresAuroraDatabase<any>, {
				migrationsFolder: './drizzle2/pg',
				migrationsTable: customTable,
			});

			// test if the custom migrations table was created
			const { rowCount } = await db.execute(sql`select * from "drizzle".${sql.identifier(customTable)};`);
			expect(rowCount && rowCount > 0).toBeTruthy();

			// test if the migrated table are working as expected
			await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
			const result = await db.select().from(usersMigratorTable);
			expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

			await db.execute(sql`drop table all_columns`);
			await db.execute(sql`drop table users12`);
			await db.execute(sql`drop table "drizzle".${sql.identifier(customTable)}`);
		});

		test('migrator : migrate with custom table and custom schema', async ({ db }) => {
			const customTable = randomString();
			const customSchema = randomString();
			await db.execute(sql`drop table if exists all_columns`);
			await db.execute(sql`drop table if exists users12`);
			await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

			await migrate(db as any as PostgresAuroraDatabase<any>, {
				migrationsFolder: './drizzle2/pg',
				migrationsTable: customTable,
				migrationsSchema: customSchema,
			});

			// test if the custom migrations table was created
			const { rowCount } = await db.execute(
				sql`select * from ${sql.identifier(customSchema)}.${sql.identifier(customTable)};`,
			);
			expect(rowCount && rowCount > 0).toBeTruthy();

			// test if the migrated table are working as expected
			await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
			const result = await db.select().from(usersMigratorTable);
			expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

			await db.execute(sql`drop table all_columns`);
			await db.execute(sql`drop table users12`);
			await db.execute(sql`drop table ${sql.identifier(customSchema)}.${sql.identifier(customTable)}`);
		});

		test('migrator : --init', async ({ db }) => {
			const migrationsSchema = 'drzl_migrations_init';
			const migrationsTable = 'drzl_init';

			await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
			await db.execute(sql`drop schema if exists public cascade`);
			await db.execute(sql`create schema public`);

			const migratorRes = await migrate(db as any as PostgresAuroraDatabase<any>, {
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
			}) as ${sql.identifier('tableExists')};`);

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

			const migratorRes = await migrate(db as any as PostgresAuroraDatabase<any>, {
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
			}) as ${sql.identifier('tableExists')};`);

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

			await migrate(db as any as PostgresAuroraDatabase<any>, {
				migrationsFolder: './drizzle2/pg-init',
				migrationsSchema,
				migrationsTable,
			});

			const migratorRes = await migrate(db as any as PostgresAuroraDatabase<any>, {
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
			}) as ${sql.identifier('tableExists')};`);

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
			const migrationDir = './migrations/postgres-aurora';
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

			await migrate(db as any as PostgresAuroraDatabase<any>, { migrationsFolder: migrationDir });
			const res1 = await db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

			// second migration was not applied yet
			await expect(db.insert(users2).values({ name: 'John', email: '', age: 30 })).rejects.toThrow();

			// insert migration with earlier timestamp
			mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
			writeFileSync(
				`${migrationDir}/20240202020202_second/migration.sql`,
				`CREATE TABLE "migration_users2" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
			);
			await migrate(db as any as PostgresAuroraDatabase<any>, { migrationsFolder: migrationDir });

			const res2 = await db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

			const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
			expect(res1).toStrictEqual(expected);
			expect(res2).toStrictEqual(expected);

			rmSync(migrationDir, { recursive: true });
		});
	});

	describe('driver-specific', () => {
		test('all date and time columns without timezone first case mode string', async ({ kit }) => {
			const db = stringTemporalDb(kit.database!);

			const table = pgTable('all_columns', {
				id: serial('id').primaryKey(),
				timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${table}`);

			await db.execute(sql`
			create table ${table} (
						id serial primary key,
						timestamp_string timestamp(6) not null
				)
		`);

			// 1. Insert date in string format without timezone in it
			await db.insert(table).values([
				{ timestamp: '2022-01-01 02:00:00.123456' },
			]);

			// 2, Select in string format and check that values are the same
			const result = await db.select().from(table);

			expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456' }]);

			// 3. Select as raw query and check that values are the same
			const result2 = await db.execute<{
				id: number;
				timestamp_string: string;
			}>(sql`select * from ${table}`);

			expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

			await db.execute(sql`drop table if exists ${table}`);
		});

		test('all date and time columns without timezone second case mode string', async ({ kit }) => {
			const db = stringTemporalDb(kit.database!);

			const table = pgTable('all_columns', {
				id: serial('id').primaryKey(),
				timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${table}`);

			await db.execute(sql`
			create table ${table} (
						id serial primary key,
						timestamp_string timestamp(6) not null
				)
		`);

			// 1. Insert date in string format with timezone in it
			await db.insert(table).values([
				{ timestamp: '2022-01-01T02:00:00.123456-02' },
			]);

			// 2, Select as raw query and check that values are the same
			const result = await db.execute<{
				id: number;
				timestamp_string: string;
			}>(sql`select * from ${table}`);

			expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

			await db.execute(sql`drop table if exists ${table}`);
		});

		test('all date and time columns without timezone third case mode date', async ({ kit }) => {
			const db = stringTemporalDb(kit.database!);

			const table = pgTable('all_columns', {
				id: serial('id').primaryKey(),
				timestamp: timestamp('timestamp_string', { mode: 'date', precision: 3 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${table}`);

			await db.execute(sql`
			create table ${table} (
						id serial primary key,
						timestamp_string timestamp(3) not null
				)
		`);

			const insertedDate = new Date('2022-01-01 20:00:00.123+04');

			// 1. Insert date as new date
			await db.insert(table).values([
				{ timestamp: insertedDate },
			]);

			// 2, Select as raw query as string
			const result = await db.execute<{
				id: number;
				timestamp_string: string;
			}>(sql`select * from ${table}`);

			// 3. Compare both dates using orm mapping - Need to add 'Z' to tell JS that it is UTC
			expect(new Date(result.rows[0]!.timestamp_string + 'Z').getTime()).toBe(insertedDate.getTime());

			await db.execute(sql`drop table if exists ${table}`);
		});

		test('test mode string for timestamp with timezone', async ({ kit }) => {
			const db = stringTemporalDb(kit.database!);

			const table = pgTable('all_columns', {
				id: serial('id').primaryKey(),
				timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${table}`);

			await db.execute(sql`
			create table ${table} (
						id serial primary key,
						timestamp_string timestamp(6) with time zone not null
				)
		`);

			const timestampString = '2022-01-01 00:00:00.123456-0200';

			// 1. Insert date in string format with timezone in it
			await db.insert(table).values([
				{ timestamp: timestampString },
			]);

			// 2. Select date in string format and check that the values are the same
			const result = await db.select().from(table);

			// 2.1 Notice that postgres will return the date in UTC, but it is exactly the same
			expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

			// 3. Select as raw query and checke that values are the same
			const result2 = await db.execute<{
				id: number;
				timestamp_string: string;
			}>(sql`select * from ${table}`);

			// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
			expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

			await db.execute(sql`drop table if exists ${table}`);
		});

		test('test mode date for timestamp with timezone', async ({ kit }) => {
			const db = stringTemporalDb(kit.database!);

			const table = pgTable('all_columns', {
				id: serial('id').primaryKey(),
				timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${table}`);

			await db.execute(sql`
			create table ${table} (
						id serial primary key,
						timestamp_string timestamp(3) with time zone not null
				)
		`);

			const timestampString = new Date('2022-01-01 00:00:00.456-0200');

			// 1. Insert date in string format with timezone in it
			await db.insert(table).values([
				{ timestamp: timestampString },
			]);

			// 2. Select date in string format and check that the values are the same
			const result = await db.select().from(table);

			// 2.1 Notice that postgres will return the date in UTC, but it is exactly the same
			expect(result).toEqual([{ id: 1, timestamp: timestampString }]);

			// 3. Select as raw query and checke that values are the same
			const result2 = await db.execute<{
				id: number;
				timestamp_string: string;
			}>(sql`select * from ${table}`);

			// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
			expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.456+00' }]);

			await db.execute(sql`drop table if exists ${table}`);
		});

		test('insert via db.execute + select via db.execute', async ({ db, push }) => {
			const usersTable = pgTable('users_execute_raw_aurora_1', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

			await db.execute(
				sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`,
			);

			const result = await db.execute<{ id: number; name: string }>(
				sql`select id, name from ${usersTable}`,
			);
			expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
		});

		test('insert via db.execute + returning', async ({ db, push }) => {
			const usersTable = pgTable('users_execute_raw_aurora_2', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

			const inserted = await db.execute<{ id: number; name: string }>(
				sql`insert into ${usersTable} (${
					sql.identifier(
						usersTable.name.name,
					)
				}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
			);
			expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
		});

		test('insert via db.execute w/ query builder', async ({ db, push }) => {
			const usersTable = pgTable('users_execute_raw_aurora_3', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

			const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
				db
					.insert(usersTable)
					.values({ name: 'John' })
					.returning({ id: usersTable.id, name: usersTable.name }),
			);
			expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
		});

		test('test mode string for timestamp with timezone in UTC timezone', async ({ kit }) => {
			const db = stringTemporalDb(kit.database!);

			// get current timezone from db
			const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

			// set timezone to UTC
			await db.execute(sql`set time zone 'UTC'`);

			const table = pgTable('all_columns', {
				id: serial('id').primaryKey(),
				timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${table}`);

			await db.execute(sql`
			create table ${table} (
						id serial primary key,
						timestamp_string timestamp(6) with time zone not null
				)
		`);

			const timestampString = '2022-01-01 00:00:00.123456-0200';

			// 1. Insert date in string format with timezone in it
			await db.insert(table).values([
				{ timestamp: timestampString },
			]);

			// 2. Select date in string format and check that the values are the same
			const result = await db.select().from(table);

			// 2.1 Notice that postgres will return the date in UTC, but it is exactly the same
			expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

			// 3. Select as raw query and checke that values are the same
			const result2 = await db.execute<{
				id: number;
				timestamp_string: string;
			}>(sql`select * from ${table}`);

			// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
			expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

			await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

			await db.execute(sql`drop table if exists ${table}`);
		});

		test('test mode string for timestamp with timezone in different timezone', async ({ kit }) => {
			const db = stringTemporalDb(kit.database!);

			// get current timezone from db
			const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

			// set timezone to HST (UTC - 10)
			await db.execute(sql`set time zone '-10'`);

			const table = pgTable('all_columns', {
				id: serial('id').primaryKey(),
				timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${table}`);

			await db.execute(sql`
			create table ${table} (
						id serial primary key,
						timestamp_string timestamp(6) with time zone not null
				)
		`);

			const timestampString = '2022-01-01 00:00:00.123456-1000';

			// 1. Insert date in string format with timezone in it
			await db.insert(table).values([
				{ timestamp: timestampString },
			]);

			// 2. Select date in string format and check that the values are the same
			const result = await db.select().from(table);

			// 2.1 Data API sends timestamptz in UTC regardless of session timezone
			expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 10:00:00.123456+00' }]);

			// 3. Select as raw query and checke that values are the same
			const result2 = await db.execute<{
				id: number;
				timestamp_string: string;
			}>(sql`select * from ${table}`);

			// 3.1 Data API sends timestamptz in UTC regardless of session timezone
			expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 10:00:00.123456+00' }]);

			await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

			await db.execute(sql`drop table if exists ${table}`);
		});

		// Can't test shapes via generic codecs test
		test('all types ~shapes~', async ({ createDB, push }) => {
			const db = createDB({ allTypesTable }, allTypesRelations);
			await push({ en: allTypesEnum, allTypesTable });
			await db.insert(allTypesTable).values(allTypesData);

			const [flat] = await db.select().from(allTypesTable);
			expect(flat).toStrictEqual(allTypesData);

			const nested = await db.query.allTypesTable.findFirst({ with: { self: true } });
			expect(nested).toStrictEqual({ ...allTypesData, self: [allTypesData] });

			await assertAllTypesUnions(db);
			await assertAllTypesBounds(db);
		});

		// Validates functionality of base codecs provided to be overriden
		// this disables driver shape generator and falls back to mappers
		test('all types ~codecs~ override', async ({ createDB, push }) => {
			const { en, allTypesTable } = makeAllTypes('all_types_48_cdcs_ovr', 'en_49_ovr');
			const base = createDB({ allTypesTable }, allTypesRelations);
			await push({ en, allTypesTable });

			const relations = defineRelations({ allTypesTable }, allTypesRelations);
			const db = drizzleAurora({ client: (base as any).$client, relations, codecs: minipgAuroraCodecs });
			await db.insert(allTypesTable).values(allTypesData);

			const [flat] = await db.select().from(allTypesTable);
			expect(flat).toStrictEqual(allTypesData);

			const nested = await db.query.allTypesTable.findFirst({ with: { self: true } });
			expect(nested).toStrictEqual({ ...allTypesData, self: [allTypesData] });

			await assertAllTypesUnions(db, allTypesTable);
			await assertAllTypesBounds(db);
		});
	});

	describe('transaction snapshot', () => {
		test('isolates the transaction', async ({ db, peer }) => {
			await assertSnapshotIsolatesTransaction(db, peer!, expect, 'aurora');
		});

		test('rejects a malformed id', async ({ db }) => {
			await assertMalformedSnapshotRejected(db, expect);
		});

		test('does not let the id inject SQL', async ({ db }) => {
			await assertSnapshotIdNotInjectable(db, expect, 'aurora');
		});
	});
});
