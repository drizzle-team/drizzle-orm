// drizzle-orm/effect-drizzle-postgres/aurora over the Data API (local-data-api emulator). The Data API holds no
// session outside a transaction: every statement is a request of it's own, so session settings (`search_path`,
// `time zone`) do not stick. The tests run in a database of their own, with `public` recreated before each test.
import { createPool as createAuroraClient } from '@drizzle-team/postgres/aurora';
import { assert, expect, expectTypeOf, it } from '@effect/vitest';
import {
	defineRelations,
	type ExtractTablesFromSchema,
	type RelationsBuilder,
	type RelationsBuilderConfig,
	type Schema,
	sql,
} from 'drizzle-orm';
import * as PostgresAuroraDrizzle from 'drizzle-orm/effect-drizzle-postgres/aurora';
import { migrate } from 'drizzle-orm/effect-drizzle-postgres/aurora/migrator';
import { getTableConfig, integer, pgTable, serial, text, time, timestamp } from 'drizzle-orm/pg-core';
import { DrizzleAuroraClient } from 'drizzle-orm/postgres/client/effect/aurora';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import { Client as PgPeerClient } from 'pg';
import { beforeAll } from 'vitest';
import { randomString } from '~/utils';
import {
	allTypesEnum,
	allTypesRelations,
	type AllTypesReplacements,
	allTypesTable,
	assertAllTypesBounds,
	assertAllTypesWithReplacements,
	boundsRelations,
	boundsSchema,
	makeAllTypes,
} from './all-types';
import {
	DB as CommonDB,
	pushStatements as push,
	relations as commonRelations,
	runCommonEffectPgTests,
} from './effect-common';
import { allTypesWithReplacementsSkips, allTypesWithReplacementsTests } from './effect-unsupported-types';
import { awsDataApiConfig, recreateDatabases, testDatabase } from './instrumentation';
import { usersMigratorTable } from './schema';

const DATABASE = testDatabase('db40');

const databaseUrl = () => {
	const url = new URL(process.env['PG_CONNECTION_STRING']!);
	url.pathname = `/${DATABASE}`;
	return url.toString();
};

const auroraClient = (config: { temporal?: 'string' } = {}) =>
	createAuroraClient({
		...awsDataApiConfig,
		database: DATABASE,
		endpoint: process.env['AWS_DATA_API_URL']!,
		...config,
	});

const createDB = <
	TSchema extends Record<string, any>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relationsOf: (helpers: RelationsBuilder<TTables>) => TConfig,
	useJitMappers?: boolean,
) => PostgresAuroraDrizzle.makeWithDefaults({ relations: defineRelations(schema, relationsOf), jit: useJitMappers });

/** The messages along an error's `reason` / `cause` chain */
const errorMessages = (error: unknown): string => {
	const seen = new Set<unknown>();
	const messages: string[] = [];
	let e: any = error;
	while (e && typeof e === 'object' && !seen.has(e)) {
		seen.add(e);
		if (typeof e.message === 'string') messages.push(e.message);
		e = e.reason ?? (Array.isArray(e.cause?.reasons) ? e.cause.reasons[0]?.error : e.cause);
	}
	return messages.join(' | ');
};

class DBTag extends Context.Service<DBTag, PostgresAuroraDrizzle.EffectPostgresAuroraDatabase>()(
	'EffectPostgresAuroraDB',
) {}

const ClientLive = DrizzleAuroraClient.layerFromClient(auroraClient());
const TestLive = Layer.merge(
	ClientLive,
	Layer.effect(DBTag, PostgresAuroraDrizzle.makeWithDefaults()).pipe(Layer.provide(ClientLive)),
);

beforeAll(async () => {
	await recreateDatabases([DATABASE]);
	// local-data-api opens it's connection to a database on first use, which takes long enough to break timeouts
	await auroraClient().query('select 1');
});

runCommonEffectPgTests<DBTag | DrizzleAuroraClient.DrizzleAuroraClient>({
	testLayer: Layer.merge(
		TestLive,
		Layer.effect(CommonDB, PostgresAuroraDrizzle.makeWithDefaults({ relations: commonRelations })).pipe(
			Layer.provide(ClientLive),
		),
	),
	PgDrizzle: PostgresAuroraDrizzle,
	createDB,
	usedSchema: 'public',
	skipTests: [
		// string-mode `timestamptz` and `bytea[]` throw an unsupported column type error with Data API, tests holding their
		// values are redefined with `null`s below
		...allTypesWithReplacementsSkips,
		// local-data-api fails (HTTP 500) reading `timestamptz` arrays in non-UTC sessions and `timetz` arrays; these tests
		// also hold `timetz`, string-mode `timestamptz` values, which throw an unsupported column type error
		'time zones are preserved',
		'time zones are preserved - non-UTC session',
	],
	addTests: (it) => {
		allTypesWithReplacementsTests(it, createDB, {
			// Data API converts `timestamptz` to UTC dropping the session's offset and has no binary arrays: those column
			// types throw an unsupported column type error, `null`s never reach a decoder
			timestampTzstr: null,
			arrtimestampTzstr: null,
			arrbytea: null,
			mtxbytea: null,
		});
		it.effect('raw db.execute type matches returned data', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const table = sql.identifier('raw_execute_types');

				// DDL
				const created = yield* db.execute<never>(
					sql`create table ${table} ("id" integer primary key, "name" text not null)`,
				);
				expectTypeOf(created).toEqualTypeOf<
					{ rows: never[]; columns: string[]; command: string | null; rowCount: number | null }
				>();
				expect(created).toEqual({ rows: [], columns: [], command: 'CREATE', rowCount: 0 });

				// `insert` without returning
				const inserted = yield* db.execute<never>(sql`insert into ${table} values (1, 'John')`);
				expect(inserted).toEqual({ rows: [], columns: [], command: 'INSERT', rowCount: 1 });

				// Simple select
				const selected = yield* db.execute<{ id: number; name: string }>(
					sql`select "id", "name" from ${table} order by "id"`,
				);
				expect(selected).toEqual({
					rows: [{ id: 1, name: 'John' }],
					columns: ['id', 'name'],
					command: 'SELECT',
					rowCount: 1,
				});
			}));

		it.effect('2 consecutive use of .toSQL - :pN placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const t1 = pgTable('table', (t) => ({ id: t.text().primaryKey() }));
				expect(db.insert(t1).values({ id: '1' }).toSQL()).toStrictEqual({
					sql: 'insert into "table" ("id") values (:p1)',
					params: ['1'],
				});

				const t2 = pgTable('table', (t) => ({ id: t.text().primaryKey(), name: t.text() }));
				expect(db.insert(t2).values({ id: '1', name: 'test' }).toSQL()).toStrictEqual({
					sql: 'insert into "table" ("id", "name") values (:p1, :p2)',
					params: ['1', 'test'],
				});
			}));

		it.effect('insert, select and update run with :pN params', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const users = pgTable('aurora_users', { id: serial('id').primaryKey(), name: text('name').notNull() });
				yield* push(db, { users });

				expect(yield* db.insert(users).values({ name: 'John' }).returning()).toStrictEqual([{ id: 1, name: 'John' }]);
				yield* db.update(users).set({ name: 'Jane' }).where(sql`${users.id} = ${1}`);
				expect(yield* db.select().from(users)).toStrictEqual([{ id: 1, name: 'Jane' }]);
			}));

		it.effect('transaction commits and rolls back', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const users = pgTable('aurora_tx_users', { id: integer('id').primaryKey(), name: text('name').notNull() });
				yield* push(db, { users });

				yield* db.transaction((tx) => tx.insert(users).values({ id: 1, name: 'Kept' }));

				const rolledBack = yield* Effect.result(db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ id: 2, name: 'Dropped' });
						return yield* tx.rollback();
					})
				));
				assert(Result.isFailure(rolledBack));

				expect(yield* db.select().from(users)).toStrictEqual([{ id: 1, name: 'Kept' }]);
			}));

		it.effect('test mode string for timestamp with timezone', () =>
			Effect.gen(function*() {
				const db = yield* PostgresAuroraDrizzle.makeWithDefaults().pipe(
					Effect.provide(DrizzleAuroraClient.layerFromClient(auroraClient({ temporal: 'string' }))),
				);
				const table = pgTable('all_columns', {
					id: serial('id').primaryKey(),
					timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
				});
				yield* db.execute(sql`create table ${table} (id serial primary key, timestamp_string timestamp(6) not null)`);

				yield* db.insert(table).values([{ timestamp: '2022-01-01 02:00:00.123456' }]);

				expect(yield* db.select().from(table)).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456' }]);
			}));

		it.effect('timetz is an unsupported column type', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const times = pgTable('times', {
					id: integer('id').primaryKey(),
					time: time('time', { withTimezone: true }).notNull(),
				});
				yield* push(db, { times });
				yield* db.insert(times).values({ id: 1, time: '12:00:00.5-02' });

				// Data API converts `timetz` scalars to UTC dropping the offset, with no per-query alternative
				const error = yield* Effect.flip(db.select({ id: times.id, time: times.time }).from(times));
				expect(errorMessages(error)).toContain(
					'Column type "time with time zone" is not supported with the postgres/aurora driver',
				);
			}));

		// Can't test shapes via generic codecs test
		it.effect('all types ~shapes~', () =>
			Effect.gen(function*() {
				const db = yield* createDB({ allTypesTable, ...boundsSchema }, (r) => ({
					...allTypesRelations(r),
					...boundsRelations(r),
				}));
				yield* push(db, { en: allTypesEnum, allTypesTable });
				// Data API converts `timestamptz` to UTC dropping the session's offset and has no binary arrays: those column
				// types throw an unsupported column type error and are filled with `null`s, which never reach a decoder
				const replacements = {
					timestampTzstr: null,
					arrtimestampTzstr: null,
					arrbytea: null,
					mtxbytea: null,
				} satisfies AllTypesReplacements;
				const { en, allTypesTable: table } = makeAllTypes('all_types_shapes', 'en_shapes');
				const shaped = yield* createDB({ allTypesTable: table }, allTypesRelations as any);
				yield* push(db, { en, table });

				const context = yield* Effect.context<never>();
				const run = (query: any) => Effect.runPromiseWith(context)(query);
				yield* Effect.promise(() =>
					assertAllTypesWithReplacements(shaped as any, table as any, replacements, { run, rqb: true })
				);
				yield* Effect.promise(() => assertAllTypesBounds(db as any, { run, rqb: true }));
			}));

		it.effect('transaction snapshot: isolates the transaction', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const table = sql.identifier('aurora_snapshot');

				const peer = new PgPeerClient({ connectionString: databaseUrl() });
				yield* Effect.promise(() => peer.connect());
				const peerQuery = (query: string) => Effect.promise(() => peer.query(query).then((r) => r.rows));

				const body = Effect.gen(function*() {
					yield* db.execute(sql`create table ${table} (id integer)`);
					yield* db.execute(sql`insert into ${table} values (1)`);

					yield* peerQuery('begin isolation level repeatable read');
					const [{ snapshot }] = yield* peerQuery('select pg_export_snapshot() as snapshot');

					yield* db.execute(sql`insert into ${table} values (2)`);

					yield* db.transaction((tx) =>
						Effect.gen(function*() {
							const res = yield* tx.execute<{ id: number }>(sql`select id from ${table} order by id`, 'objects');
							expect(res).toEqual([{ id: 1 }]);
						}), { isolationLevel: 'repeatable read', snapshot });
				});

				yield* body.pipe(
					Effect.ensuring(Effect.promise(() => peer.query('commit').catch(() => null))),
					Effect.ensuring(Effect.promise(() => peer.end())),
				);
			}));

		it.effect('migrator : default migration strategy', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;

				yield* migrate(db, { migrationsFolder: './drizzle2/pg' });
				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

				expect(yield* db.select().from(usersMigratorTable)).toEqual([{ id: 1, name: 'John', email: 'email' }]);
			}));

		it.effect('migrator : migrate with custom table and custom schema', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const customTable = randomString();
				const customSchema = randomString();

				yield* migrate(db, {
					migrationsFolder: './drizzle2/pg',
					migrationsTable: customTable,
					migrationsSchema: customSchema,
				});

				const { rowCount } = yield* db.execute(
					sql`select * from ${sql.identifier(customSchema)}.${sql.identifier(customTable)};`,
				);
				expect(rowCount && rowCount > 0).toBeTruthy();

				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
				expect(yield* db.select().from(usersMigratorTable)).toEqual([{ id: 1, name: 'John', email: 'email' }]);

				yield* db.execute(sql`drop schema ${sql.identifier(customSchema)} cascade`);
			}));

		it.effect('migrator : --init', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const migrationsSchema = 'drzl_migrations_init';
				const migrationsTable = 'drzl_init';

				const migratorRes = yield* migrate(db, {
					migrationsFolder: './drizzle2/pg-init',
					migrationsTable,
					migrationsSchema,
					// @ts-ignore - internal param
					init: true,
				});

				const meta = yield* db.select({ hash: sql<string>`${sql.identifier('hash')}`.as('hash') })
					.from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);
				const res = yield* db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
				SELECT 1 FROM pg_tables
				WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? 'public'}
				AND tablename = ${getTableConfig(usersMigratorTable).name}
			) as ${sql.identifier('tableExists')};`);

				expect(migratorRes).toStrictEqual(undefined);
				expect(meta.length).toStrictEqual(1);
				expect(res.rows[0]?.['tableExists']).toStrictEqual(false);
			}));

		it.effect('migrator : --init - db migrations error', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const migrationsSchema = 'drzl_migrations_init';
				const migrationsTable = 'drzl_init';

				yield* migrate(db, { migrationsFolder: './drizzle2/pg-init', migrationsSchema, migrationsTable });

				const migratorRes = yield* migrate(db, {
					migrationsFolder: './drizzle2/pg',
					migrationsTable,
					migrationsSchema,
					// @ts-ignore - internal param
					init: true,
				}).pipe(Effect.result);

				assert(Result.isFailure(migratorRes));
				assert(Predicate.isTagged(migratorRes.failure, 'MigratorInitError'));
				expect(migratorRes.failure.exitCode).toBe('databaseMigrations');
			}));
	},
});
