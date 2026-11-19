// drizzle-orm/effect-drizzle-postgres/http over the httpostgres gateway. HTTP holds no session, so every statement is
// a request of it's own: there are no interactive transactions, and session settings (`search_path`, `time zone`) do
// not stick. The tests run in a database of their own, with `public` recreated before each test.
import { client as createHttpClient, type HttpClient } from '@drizzle-team/postgres/http';
import { assert, expect, expectTypeOf, it } from '@effect/vitest';
import {
	defineRelations,
	type ExtractTablesFromSchema,
	inArray,
	type RelationsBuilder,
	type RelationsBuilderConfig,
	type Schema,
	sql,
} from 'drizzle-orm';
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core';
import * as PostgresHttpDrizzle from 'drizzle-orm/effect-drizzle-postgres/http';
import { migrate } from 'drizzle-orm/effect-drizzle-postgres/http/migrator';
import * as PostgresNeonHttpDrizzle from 'drizzle-orm/effect-drizzle-postgres/http/neon';
import { boolean, getTableConfig, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { DrizzlePostgresHttpClient } from 'drizzle-orm/postgres/client/effect/http';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { Client as PgPeerClient } from 'pg';
import { beforeAll } from 'vitest';
import { randomString } from '~/utils';
import {
	allTypesData,
	allTypesEnum,
	allTypesRelations,
	allTypesTable,
	assertAllTypesBounds,
	assertAllTypesEmptyArrays,
	assertAllTypesNullArrayElements,
	assertAllTypesTemporalBounds,
	assertAllTypesUnions,
	boundsRelations,
	boundsSchema,
} from './all-types';
import { recreateDatabases, testDatabase } from './instrumentation';
import { usersMigratorTable } from './schema';

const DATABASE = testDatabase('db26');

const databaseUrl = () => {
	const url = new URL(process.env['PG_CONNECTION_STRING']!);
	url.pathname = `/${DATABASE}`;
	return url.toString();
};

/** A gateway client for the suite's database: the gateway takes the database from the connection string header */
const gatewayClient = (config: { temporal?: 'string' } = {}): HttpClient => {
	const connectionString = databaseUrl();
	return createHttpClient({
		url: process.env['PG_HTTP_GATEWAY_URL']!,
		...config,
		fetch: ((input: any, init: any) => {
			const headers = new Headers(init?.headers);
			headers.set('Neon-Connection-String', connectionString);
			return fetch(input, { ...init, headers });
		}) as any,
	});
};

const clientLayer = (client: HttpClient) =>
	Layer.succeed(DrizzlePostgresHttpClient.DrizzlePostgresHttpClient, DrizzlePostgresHttpClient.fromClient(client));

const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified').notNull().default(0),
});
const postsTable = pgTable('posts', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	ownerId: integer('owner_id').references(() => usersTable.id),
});
const relations = defineRelations({ usersTable, postsTable }, (r) => ({
	usersTable: { posts: r.many.postsTable() },
	postsTable: { owner: r.one.usersTable({ from: r.postsTable.ownerId, to: r.usersTable.id }) },
}));
/** A post whose owner does not exist: fails it's foreign key */
const orphanPost = { id: 1, content: 'orphan', ownerId: 9999 };

const createDB = <
	TSchema extends Record<string, any>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relationsOf: (helpers: RelationsBuilder<TTables>) => TConfig,
) => PostgresHttpDrizzle.makeWithDefaults({ relations: defineRelations(schema, relationsOf) });

let _diff!: (_: {}, schema: Record<string, unknown>, renames: []) => Promise<{ sqlStatements: string[] }>;
const getDiff = async () => _diff ??= (await import('../../../drizzle-kit/tests/postgres/mocks' as string)).diff;

/** Creates the schema's entities one statement at a time: HTTP runs no interactive transaction to group them in */
const push = (db: PostgresHttpDrizzle.EffectPostgresHttpDatabase<any>, schema: Record<string, unknown>) =>
	Effect.gen(function*() {
		const diff = yield* Effect.promise(() => getDiff());
		const { sqlStatements } = yield* Effect.promise(() => diff({}, schema, []));
		for (const statement of sqlStatements) yield* db.execute(statement);
	});

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

/** The SQLSTATE of the backend error along an error's `reason` / `cause` chain */
const sqlState = (error: unknown): string | undefined => {
	const seen = new Set<unknown>();
	let e: any = error;
	while (e && typeof e === 'object' && !seen.has(e)) {
		seen.add(e);
		if (typeof e.code === 'string') return e.code;
		e = e.reason ?? (Array.isArray(e.cause?.reasons) ? e.cause.reasons[0]?.error : e.cause);
	}
	return undefined;
};

const expectQueryError = (error: unknown, query: string, code: string) => {
	assert(Predicate.isTagged(error, 'EffectDrizzleQueryError'));
	expect((error as any).query).toBe(query);
	expect(sqlState(error)).toBe(code);
};

class DBTag extends Context.Service<DBTag, PostgresHttpDrizzle.EffectPostgresHttpDatabase<typeof relations>>()(
	'EffectPostgresHttpDB',
) {}

const DBLive = Layer.effect(DBTag, PostgresHttpDrizzle.makeWithDefaults({ relations }));
const ClientLive = clientLayer(gatewayClient());
const TestLive = Layer.merge(ClientLive, DBLive.pipe(Layer.provide(ClientLive)));

beforeAll(async () => {
	await recreateDatabases([DATABASE]);
});

it.layer(TestLive)('effect-drizzle-postgres/http', (it) => {
	/** Runs a test on a recreated `public` schema */
	const test = (
		name: string,
		body: () => Effect.Effect<unknown, unknown, DBTag | DrizzlePostgresHttpClient.DrizzlePostgresHttpClient>,
	) =>
		it.effect(name, () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				yield* db.execute(sql`drop schema if exists public cascade`);
				yield* db.execute(sql`drop schema if exists "drizzle" cascade`);
				yield* db.execute(sql`drop schema if exists "drzl_migrations_init" cascade`);
				yield* db.execute(sql`create schema public`);
				yield* body();
			}));

	const pushUsers = Effect.gen(function*() {
		const db = yield* DBTag;
		yield* push(db, { usersTable, postsTable });
		return db;
	});

	test('raw db.execute type matches returned data', () =>
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
			expect(created).toEqual({ rows: [], columns: [], command: 'CREATE', rowCount: null });

			// `insert` without returning
			const inserted = yield* db.execute<never>(sql`insert into ${table} values (1, 'John')`);
			expect(inserted).toEqual({ rows: [], columns: [], command: 'INSERT', rowCount: 1 });

			// Simple select
			const selected = yield* db.execute<{ id: number; name: string }>(
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
		}));

	test('interactive transactions are rejected', () =>
		Effect.gen(function*() {
			const db = yield* DBTag;
			const exit = yield* Effect.exit(db.transaction(() => Effect.void));

			assert(Exit.isFailure(exit));
			expect(String(exit.cause)).toMatch(/No interactive transactions/);
		}));

	test('backend errors keep their SQLSTATE across the HTTP hop', () =>
		Effect.gen(function*() {
			const db = yield* DBTag;
			const error = yield* Effect.flip(db.execute(sql`select * from definitely_not_a_table`));

			expect(error._tag).toBe('EffectDrizzleQueryError');
			expect(errorMessages(error)).toMatch(/does not exist/i);
			expect(sqlState(error)).toBe('42P01');
		}));

	test('insert via db.execute + select via db.execute', () =>
		Effect.gen(function*() {
			const db = yield* DBTag;
			const users = pgTable('users_execute_raw_http_1', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});
			yield* push(db, { users });

			yield* db.execute(sql`insert into ${users} (${sql.identifier(users.name.name)}) values (${'John'})`);

			const result = yield* db.execute<{ id: number; name: string }>(sql`select id, name from ${users}`);
			expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
		}));

	test('insert via db.execute w/ query builder', () =>
		Effect.gen(function*() {
			const db = yield* DBTag;
			const users = pgTable('users_execute_raw_http_3', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});
			yield* push(db, { users });

			const inserted = yield* db.execute<Pick<typeof users.$inferSelect, 'id' | 'name'>>(
				db.insert(users).values({ name: 'John' }).returning({ id: users.id, name: users.name }),
			);
			expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
		}));

	test('all date and time columns without timezone first case mode string', () =>
		Effect.gen(function*() {
			const db = yield* PostgresHttpDrizzle.makeWithDefaults().pipe(
				Effect.provide(clientLayer(gatewayClient({ temporal: 'string' }))),
			);
			const table = pgTable('all_columns', {
				id: serial('id').primaryKey(),
				timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
			});
			yield* db.execute(sql`create table ${table} (id serial primary key, timestamp_string timestamp(6) not null)`);

			yield* db.insert(table).values([{ timestamp: '2022-01-01 02:00:00.123456' }]);

			expect(yield* db.select().from(table)).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456' }]);
			const result = yield* db.execute<{ id: number; timestamp_string: string }>(
				sql`select "id", "timestamp_string"::text from ${table}`,
			);
			expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);
		}));

	test('test mode string for timestamp with timezone', () =>
		Effect.gen(function*() {
			const db = yield* PostgresHttpDrizzle.makeWithDefaults().pipe(
				Effect.provide(clientLayer(gatewayClient({ temporal: 'string' }))),
			);
			const table = pgTable('all_columns', {
				id: serial('id').primaryKey(),
				timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
			});
			yield* db.execute(
				sql`create table ${table} (id serial primary key, timestamp_string timestamp(6) with time zone not null)`,
			);

			yield* db.insert(table).values([{ timestamp: '2022-01-01 00:00:00.123456-0200' }]);

			// postgres returns the date in UTC, but it is exactly the same
			expect(yield* db.select().from(table)).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);
		}));

	// Can't test shapes via generic codecs test
	test('all types ~shapes~', () =>
		Effect.gen(function*() {
			const db = yield* createDB({ allTypesTable, ...boundsSchema }, (r) => ({
				...allTypesRelations(r),
				...boundsRelations(r),
			}));
			yield* push(db, { en: allTypesEnum, allTypesTable });
			yield* db.insert(allTypesTable).values(allTypesData);

			const [flat] = yield* db.select().from(allTypesTable);
			expect(flat).toStrictEqual(allTypesData);

			const nested = yield* db.query.allTypesTable.findFirst({ with: { self: true } });
			expect(nested).toStrictEqual({ ...allTypesData, self: [allTypesData] });

			const context = yield* Effect.context<never>();
			const run = (query: any) => Effect.runPromiseWith(context)(query);
			const asyncDb = db as any;
			yield* Effect.promise(() => assertAllTypesUnions(asyncDb, allTypesTable, run));
			yield* Effect.promise(() => assertAllTypesBounds(asyncDb, { run, rqb: true }));
			yield* Effect.promise(() => assertAllTypesNullArrayElements(asyncDb, { run, rqb: true }));
			yield* Effect.promise(() => assertAllTypesTemporalBounds(asyncDb, { run, rqb: true }));
			yield* Effect.promise(() => assertAllTypesEmptyArrays(asyncDb, allTypesTable, { run, rqb: true }));
		}));

	// ---- batch ----

	test('batch api example', () =>
		Effect.gen(function*() {
			const db = yield* pushUsers;

			const batchResponse = yield* db.batch([
				db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
				db.insert(usersTable).values({ id: 2, name: 'Dan' }),
				db.select().from(usersTable),
				db.query.usersTable.findFirst({ columns: { id: true, name: true }, where: { id: 2 } }),
			]);

			expectTypeOf(batchResponse).toEqualTypeOf<[
				{ id: number }[],
				{ rows: never[]; columns: string[]; command: string | null; rowCount: number | null },
				{ id: number; name: string; verified: number }[],
				{ id: number; name: string } | undefined,
			]>();

			expect(batchResponse[0]).toEqual([{ id: 1 }]);
			expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });
			expect(batchResponse[2]).toEqual([
				{ id: 1, name: 'John', verified: 0 },
				{ id: 2, name: 'Dan', verified: 0 },
			]);
			expect(batchResponse[3]).toEqual({ id: 2, name: 'Dan' });
		}));

	test('batch: rolls the whole set back on error', () =>
		Effect.gen(function*() {
			const db = yield* pushUsers;
			yield* db.insert(usersTable).values({ id: 1, name: 'Survivor' });

			const failing = db.insert(postsTable).values(orphanPost);
			const error = yield* Effect.flip(db.batch([
				db.insert(usersTable).values({ id: 2, name: 'Doomed' }),
				failing,
				// runs in the already-aborted transaction and fails too - must not be the one reported
				db.select().from(usersTable),
			]));
			expectQueryError(error, failing.toSQL().sql, '23503');

			expect(yield* db.select({ name: usersTable.name }).from(usersTable)).toEqual([{ name: 'Survivor' }]);
		}));

	test('batch: honours transaction options', () =>
		Effect.gen(function*() {
			const db = yield* pushUsers;
			yield* db.insert(usersTable).values({ id: 1, name: 'ReadMe' });

			const res = yield* db.batch(
				[db.select({ name: usersTable.name }).from(usersTable)],
				{ isolation: 'serializable', readOnly: true },
			);
			expect(res[0]).toEqual([{ name: 'ReadMe' }]);

			const failing = db.insert(usersTable).values({ id: 2, name: 'Nope' });
			const error = yield* Effect.flip(db.batch([failing], { readOnly: true }));
			expectQueryError(error, failing.toSQL().sql, '25006');
		}));

	test('batch: runs on an exported snapshot', () =>
		Effect.gen(function*() {
			const db = yield* pushUsers;
			yield* db.insert(usersTable).values({ id: 1, name: 'Before' });

			const exporter = new PgPeerClient({ connectionString: databaseUrl() });
			yield* Effect.promise(() => exporter.connect());
			const body = Effect.gen(function*() {
				yield* Effect.promise(() => exporter.query('begin isolation level repeatable read'));
				const snapshot = (yield* Effect.promise(() =>
					exporter.query<{ s: string }>('select pg_export_snapshot() as s')
				)).rows[0]!.s;
				// committed after the export: invisible to the snapshot
				yield* db.insert(usersTable).values({ id: 2, name: 'After' });

				const res = yield* db.batch([
					db.select({ name: usersTable.name }).from(usersTable).orderBy(usersTable.id),
					db.execute<{ iso: string }>(sql`select current_setting('transaction_isolation') as iso`),
				], { snapshot, isolation: 'repeatable read' });
				expect(res[0]).toEqual([{ name: 'Before' }]);
				expect(res[1].rows).toEqual([{ iso: 'repeatable read' }]);

				yield* Effect.promise(() => exporter.query('commit'));
			});
			yield* body.pipe(Effect.ensuring(Effect.promise(() => exporter.end())));

			expect(yield* db.select({ name: usersTable.name }).from(usersTable).orderBy(usersTable.id)).toEqual([
				{ name: 'Before' },
				{ name: 'After' },
			]);
		}));

	test('batch: an error that belongs to no query (COMMIT) is not remapped', () =>
		Effect.gen(function*() {
			const db = yield* DBTag;
			yield* db.execute(sql`create table http_batch_deferred (
				id integer primary key,
				ref integer references http_batch_deferred (id) deferrable initially deferred
			)`);

			// every statement succeeds; the deferred FK is only checked, and fails, at COMMIT
			const error = yield* Effect.flip(db.batch([
				db.execute(sql`insert into http_batch_deferred values (1, 9999)`),
				db.execute(sql`select 1`),
			]));
			expect(Predicate.isTagged(error, 'EffectDrizzleQueryError')).toBe(false);
			expect(Predicate.isTagged(error, 'SqlError')).toBe(true);
			expect(sqlState(error)).toBe('23503');
		}));

	// ---- pipeline ----

	test('pipeline api example', () =>
		Effect.gen(function*() {
			const db = yield* pushUsers;
			yield* db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]);

			const response = yield* db.pipeline([
				db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).orderBy(usersTable.id),
				db.insert(usersTable).values({ id: 3, name: 'Jane' }).returning({ id: usersTable.id }),
				db.query.usersTable.findFirst({ columns: { id: true, name: true }, where: { id: 2 } }),
			]);

			expect(response.map((r: Result.Result<unknown, unknown>) => Result.isSuccess(r))).toEqual([true, true, true]);
			expect(response[0]).toStrictEqual(Result.succeed([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]));
			expect(response[1]).toStrictEqual(Result.succeed([{ id: 3 }]));
			expect(response[2]).toStrictEqual(Result.succeed({ id: 2, name: 'Dan' }));
		}));

	test('pipeline: every query runs, failures come back as failed Results', () =>
		Effect.gen(function*() {
			const db = yield* pushUsers;

			const failing = db.insert(postsTable).values(orphanPost);
			const response = yield* db.pipeline([
				db.insert(usersTable).values({ id: 1, name: 'Survivor' }),
				failing,
				db.insert(usersTable).values({ id: 2, name: 'After' }).returning({ id: usersTable.id }),
				db.execute(sql`select 1/0`),
			]);

			expect(response.map((r: Result.Result<unknown, unknown>) => Result.isSuccess(r))).toEqual([
				true,
				false,
				true,
				false,
			]);
			assert(Result.isFailure(response[1]));
			expectTypeOf(response[1].failure._tag).toEqualTypeOf<'EffectDrizzleQueryError'>();
			expectQueryError(response[1].failure, failing.toSQL().sql, '23503');
			expect(response[2]).toStrictEqual(Result.succeed([{ id: 2 }]));
			assert(Result.isFailure(response[3]));
			expectQueryError(response[3].failure, 'select 1/0', '22012');

			// no transaction: nothing is rolled back
			expect(yield* db.select({ name: usersTable.name }).from(usersTable).orderBy(usersTable.id)).toEqual([
				{ name: 'Survivor' },
				{ name: 'After' },
			]);
		}));

	test('pipeline settles exactly like parallel', () =>
		Effect.gen(function*() {
			const db = yield* pushUsers;
			yield* db.insert(usersTable).values({ id: 1, name: 'John' });
			const set = () =>
				[
					db.select({ id: usersTable.id }).from(usersTable).orderBy(usersTable.id),
					db.insert(postsTable).values(orphanPost),
					db.execute<{ one: number }>(sql`select 1 as one`),
					db.execute(sql`select 1/0`),
				] as const;

			const piped = yield* db.pipeline(set());
			const fanned = yield* db.parallel(set());
			expectTypeOf(piped).toEqualTypeOf(fanned);

			// same outcomes and values; errors compared by what they name
			const strip = (response: typeof piped) =>
				response.map((r: Result.Result<unknown, any>) =>
					Result.isSuccess(r)
						? { ok: true, value: r.success }
						: { ok: false, query: r.failure.query, code: sqlState(r.failure) }
				);
			expect(strip(piped)).toMatchObject(strip(fanned));
			expect(strip(fanned)).toMatchObject(strip(piped));
			expect(piped.map((r: Result.Result<unknown, unknown>) => Result.isSuccess(r))).toEqual([
				true,
				false,
				true,
				false,
			]);
		}));

	// ---- parallel ----

	test('parallel api example', () =>
		Effect.gen(function*() {
			const db = yield* pushUsers;
			yield* db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]);

			const response = yield* db.parallel([
				db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
					.where(inArray(usersTable.id, [1, 2])).orderBy(usersTable.id),
				db.insert(usersTable).values({ id: 3, name: 'Jane' }).returning({ id: usersTable.id }),
				db.update(usersTable).set({ verified: 1 }).where(sql`${usersTable.id} = 1`),
				db.query.usersTable.findFirst({ columns: { id: true, name: true }, where: { id: 2 } }),
				db.execute<{ one: number }>(sql`select 1 as one`),
			]);

			expectTypeOf(response).toEqualTypeOf<[
				Result.Result<{ id: number; name: string }[], EffectDrizzleQueryError>,
				Result.Result<{ id: number }[], EffectDrizzleQueryError>,
				Result.Result<
					{ rows: never[]; columns: string[]; command: string | null; rowCount: number | null },
					EffectDrizzleQueryError
				>,
				Result.Result<{ id: number; name: string } | undefined, EffectDrizzleQueryError>,
				Result.Result<
					{ rows: { one: number }[]; columns: string[]; command: string | null; rowCount: number | null },
					EffectDrizzleQueryError
				>,
			]>();

			expect(response[0]).toStrictEqual(Result.succeed([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]));
			expect(response[1]).toStrictEqual(Result.succeed([{ id: 3 }]));
			assert(Result.isSuccess(response[2]));
			expect(response[2].success).toMatchObject({ rows: [], rowCount: 1 });
			expect(response[3]).toStrictEqual(Result.succeed({ id: 2, name: 'Dan' }));
			assert(Result.isSuccess(response[4]));
			expect(response[4].success).toMatchObject({ rows: [{ one: 1 }] });

			expect(
				yield* db.select({ id: usersTable.id, verified: usersTable.verified }).from(usersTable).orderBy(usersTable.id),
			).toEqual([
				{ id: 1, verified: 1 },
				{ id: 2, verified: 0 },
				{ id: 3, verified: 0 },
			]);
		}));

	test('parallel: failures come back as failed Results, the rest still commit', () =>
		Effect.gen(function*() {
			const db = yield* pushUsers;

			const failing = db.insert(postsTable).values(orphanPost);
			const response = yield* db.parallel([
				failing,
				db.execute(sql`select pg_sleep(0.2)`),
				db.insert(usersTable).values({ id: 1, name: 'Survivor' }).returning({ id: usersTable.id }),
				db.execute(sql`select 1/0`),
			]);

			expect(response.map((r: Result.Result<unknown, unknown>) => Result.isSuccess(r))).toEqual([
				false,
				true,
				true,
				false,
			]);
			assert(Result.isFailure(response[0]));
			expectQueryError(response[0].failure, failing.toSQL().sql, '23503');
			expect(response[2]).toStrictEqual(Result.succeed([{ id: 1 }]));
			assert(Result.isFailure(response[3]));
			expectQueryError(response[3].failure, 'select 1/0', '22012');

			expect(yield* db.select({ name: usersTable.name }).from(usersTable)).toEqual([{ name: 'Survivor' }]);
		}));

	test('the Neon database rejects a gateway client', () =>
		Effect.gen(function*() {
			const exit = yield* Effect.exit(PostgresNeonHttpDrizzle.makeWithDefaults());

			assert(Exit.isFailure(exit));
			expect(String(exit.cause)).toContain(
				'`drizzle-orm/effect-drizzle-postgres/http/neon` needs a Neon HTTP `DrizzlePostgresHttpClient`, but got a gateway one',
			);
		}));

	// ---- migrator ----

	test('migrator : default migration strategy', () =>
		Effect.gen(function*() {
			const db = yield* DBTag;

			yield* migrate(db, { migrationsFolder: './drizzle2/pg' });
			yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

			expect(yield* db.select().from(usersMigratorTable)).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		}));

	test('migrator : migrate with custom table and custom schema', () =>
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

	test('migrator : --init', () =>
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

	test('migrator : --init - db migrations error', () =>
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

	test('migrator : a failing migration leaves nothing applied', () =>
		Effect.gen(function*() {
			const db = yield* DBTag;

			const migrationDir = './migrations/effect-drizzle-postgres-http-fail';
			if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
			mkdirSync(`${migrationDir}/20240101010101_ok`, { recursive: true });
			writeFileSync(`${migrationDir}/20240101010101_ok/migration.sql`, 'CREATE TABLE "http_mig_ok" ("id" integer);');
			mkdirSync(`${migrationDir}/20240202020202_bad`, { recursive: true });
			writeFileSync(`${migrationDir}/20240202020202_bad/migration.sql`, 'CREATE TABLE "http_mig_ok" ("id" integer);');

			const error = yield* Effect.flip(migrate(db, { migrationsFolder: migrationDir }));
			rmSync(migrationDir, { recursive: true });

			assert(Predicate.isTagged(error, 'EffectDrizzleQueryError'));
			expect(errorMessages(error)).toMatch(/already exists/i);

			const present = yield* db.execute<{ present: boolean }>(
				sql`select to_regclass('public.http_mig_ok') is not null as present`,
			);
			expect(present.rows[0]!.present).toBe(false);

			const applied = yield* db.execute<{ n: number }>(
				sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
			);
			expect(applied.rows[0]!.n).toBe(0);
		}));
});
