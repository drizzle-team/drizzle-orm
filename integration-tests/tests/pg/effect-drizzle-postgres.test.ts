import { type BatchMetrics, createPool as createPostgresPool } from '@drizzle-team/postgres';
import { assert, expect, expectTypeOf } from '@effect/vitest';
import {
	defineRelations,
	eq,
	ExtractTablesFromSchema,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
	sql,
} from 'drizzle-orm';
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core';
import * as PostgresDrizzle from 'drizzle-orm/effect-drizzle-postgres';
import { migrate } from 'drizzle-orm/effect-drizzle-postgres/migrator';
import {
	boolean,
	getTableConfig,
	integer,
	jsonb,
	pgSchema,
	pgTable,
	serial,
	text,
	time,
	timestamp,
} from 'drizzle-orm/pg-core';
import { DrizzlePostgresClient } from 'drizzle-orm/postgres/client/effect';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Result from 'effect/Result';
import { SqlError } from 'effect/sql/SqlError';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { Client as PgPeerClient } from 'pg';
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
import { DB, push, runCommonEffectPgTests } from './effect-common';
import { relations } from './relations';
import { usersMigratorTable } from './schema';

const connectionStr = Redacted.make(
	process.env['PG_CONNECTION_STRING'] ?? 'postgres://postgres:postgres@localhost:55433/drizzle',
);
const ClientLive = DrizzlePostgresClient.layer({ url: connectionStr });

/** A db on a client of it's own that decodes temporal values as text, with one connection so session settings stick */
const withStringTemporalDB = <A, E>(f: (db: PostgresDrizzle.EffectPostgresDatabase) => Effect.Effect<A, E>) =>
	Effect.flatMap(PostgresDrizzle.makeWithDefaults(), f).pipe(
		Effect.provide(DrizzlePostgresClient.layer({ url: connectionStr, temporal: 'string', maxConnections: 1 })),
	);

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

const DBLive = Layer.effect(DB, PostgresDrizzle.makeWithDefaults({ relations }));

const createDB = <
	TSchema extends Record<string, any>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relations: (helpers: RelationsBuilder<TTables>) => TConfig,
	useJitMappers?: boolean,
) =>
	PostgresDrizzle.make({ relations: defineRelations(schema, relations), jit: useJitMappers }).pipe(
		Effect.provide(PostgresDrizzle.DefaultServices),
	);

const TestLive = Layer.merge(ClientLive, DBLive.pipe(Layer.provide(ClientLive)));
const usedSchema = 'effect_drizzle_postgres_test';

const bulkUsers = pgSchema(usedSchema).table('bulk_users', {
	id: integer().primaryKey(),
	name: text().notNull(),
	createdAt: timestamp('created_at').$defaultFn(() => new Date()),
});
const createBulkUsers = (db: PostgresDrizzle.EffectPostgresDatabase) =>
	db.execute(sql`create table ${bulkUsers} (id integer primary key, name text not null, created_at timestamp)`);

runCommonEffectPgTests({
	testLayer: TestLive,
	PgDrizzle: PostgresDrizzle,
	createDB,
	usedSchema,
	// The driver decodes values through the shape, so raw rows without one do not match the codec normalization.
	skipTests: ['all types ~codecs~'],
	addTests: (it) => {
		it.effect('raw db.execute returns the Drizzle Postgres result', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				const table = sql.identifier('raw_execute_types');

				yield* db.execute(sql`drop table if exists ${table}`);
				yield* db.execute(sql`create table ${table} ("id" integer primary key, "name" text not null)`);

				const inserted = yield* db.execute<never>(sql`insert into ${table} values (1, 'John')`);
				expect(inserted).toEqual(expect.objectContaining({ command: 'INSERT', rowCount: 1, rows: [] }));

				const selected = yield* db.execute<{ id: number; name: string }>(
					sql`select "id", "name" from ${table} order by "id"`,
				);
				expectTypeOf(selected.rows).toEqualTypeOf<{ id: number; name: string }[]>();
				expect(selected).toEqual(
					expect.objectContaining({ command: 'SELECT', rowCount: 1, rows: [{ id: 1, name: 'John' }] }),
				);

				yield* db.execute(sql`drop table ${table}`);
			}));

		it.effect('transaction snapshot: isolates the transaction', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = sql.identifier('ef_snapshot');

				const peerClient = new PgPeerClient(Redacted.value(connectionStr));
				yield* Effect.promise(() => peerClient.connect());
				const peerQuery = (query: string) => Effect.promise(() => peerClient.query(query).then((r) => r.rows));

				const body = Effect.gen(function*() {
					yield* db.execute(sql`drop table if exists ${table}`);
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

					yield* db.transaction((tx) =>
						Effect.gen(function*() {
							const res = yield* tx.execute<{ id: number }>(sql`select id from ${table} order by id`, 'objects');
							expect(res).toEqual([{ id: 1 }, { id: 2 }]);
						}), { isolationLevel: 'repeatable read' });
				});

				yield* body.pipe(
					Effect.ensuring(Effect.promise(() => peerClient.query('commit').catch(() => null))),
					Effect.ensuring(db.execute(sql`drop table if exists ${table}`).pipe(Effect.ignore)),
					Effect.ensuring(Effect.promise(() => peerClient.end())),
				);
			}));

		it.effect('batch runs all queries in one transaction', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);

				const [inserted, selected] = yield* db.batch([
					db.insert(bulkUsers).values({ id: 1, name: 'John' }).returning({ id: bulkUsers.id }),
					db.select({ id: bulkUsers.id, name: bulkUsers.name }).from(bulkUsers),
				]);
				expectTypeOf(selected).toEqualTypeOf<{ id: number; name: string }[]>();
				expect(inserted).toStrictEqual([{ id: 1 }]);
				expect(selected).toStrictEqual([{ id: 1, name: 'John' }]);

				const failing = db.insert(bulkUsers).values({ id: 1, name: 'Duplicate' });
				const error = yield* Effect.flip(db.batch([
					db.insert(bulkUsers).values({ id: 2, name: 'Jane' }),
					failing,
					// runs in the already-aborted transaction and fails too - must not be the one reported
					db.select().from(bulkUsers),
				]));
				assert(Predicate.isTagged(error, 'EffectDrizzleQueryError'));
				expect(error.query).toBe(failing.toSQL().sql);
				expect(yield* db.select({ id: bulkUsers.id }).from(bulkUsers)).toStrictEqual([{ id: 1 }]);
			}));

		it.effect('batch honours transaction options', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);
				yield* db.insert(bulkUsers).values({ id: 1, name: 'ReadMe' });

				const [rows, isolation] = yield* db.batch([
					db.select({ name: bulkUsers.name }).from(bulkUsers),
					db.execute<{ iso: string }>(sql`select current_setting('transaction_isolation') as iso`),
				], { isolation: 'serializable', readOnly: true });
				expect(rows).toStrictEqual([{ name: 'ReadMe' }]);
				expect(isolation.rows).toStrictEqual([{ iso: 'serializable' }]);

				const error = yield* Effect.flip(db.batch([db.insert(bulkUsers).values({ id: 2, name: 'Nope' })], {
					readOnly: true,
				}));
				expect(errorMessages(error)).toContain('read-only transaction');
			}));

		it.effect('batch runs on an exported snapshot', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);
				yield* db.insert(bulkUsers).values({ id: 1, name: 'Before' });

				const exporter = new PgPeerClient(Redacted.value(connectionStr));
				yield* Effect.promise(() => exporter.connect());
				const body = Effect.gen(function*() {
					yield* Effect.promise(() => exporter.query('begin isolation level repeatable read'));
					const snapshot = (yield* Effect.promise(() =>
						exporter.query<{ s: string }>('select pg_export_snapshot() as s')
					)).rows[0]!
						.s;
					// committed after the export: invisible to the snapshot
					yield* db.insert(bulkUsers).values({ id: 2, name: 'After' });

					const [rows] = yield* db.batch([
						db.select({ name: bulkUsers.name }).from(bulkUsers).orderBy(bulkUsers.id),
					], { snapshot, isolation: 'repeatable read' });
					expect(rows).toStrictEqual([{ name: 'Before' }]);
				});
				yield* body.pipe(
					Effect.ensuring(Effect.promise(() => exporter.query('commit').catch(() => null))),
					Effect.ensuring(Effect.promise(() => exporter.end())),
				);

				expect(yield* db.select({ name: bulkUsers.name }).from(bulkUsers).orderBy(bulkUsers.id)).toStrictEqual([
					{ name: 'Before' },
					{ name: 'After' },
				]);
			}));

		it.effect('batch metrics: the response carries the batch telemetry', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);

				const insertUser = db.insert(bulkUsers)
					.values({ id: sql.placeholder('id'), name: sql.placeholder('name') })
					.prepare('edp_metrics_insert');
				const getUser = db.select({ name: bulkUsers.name }).from(bulkUsers)
					.where(eq(bulkUsers.id, sql.placeholder('id')))
					.prepare('edp_metrics_get');
				const run = (id: number, metrics: true | 'us') =>
					db.batch([insertUser.bind({ id, name: `user ${id}` }), getUser.bind({ id })], { metrics });

				const first = yield* run(1, true);
				expectTypeOf(first.metrics).toEqualTypeOf<BatchMetrics>();
				expect([...first]).toMatchObject([{ rowCount: 1 }, [{ name: 'user 1' }]]);
				// BEGIN, the two queries and COMMIT, pipelined in one round trip
				expect(first.metrics).toMatchObject({ unit: 'ms', statements: 4, roundTrips: 1, parsed: 2, reused: 0 });
				expect(first.metrics.queries.map((m) => m.statementName)).toEqual(['edp_metrics_insert', 'edp_metrics_get']);

				// the same connection already holds both statements: no Parse, just Bind and Execute
				const again = yield* run(2, 'us');
				expect([...again]).toMatchObject([{ rowCount: 1 }, [{ name: 'user 2' }]]);
				expect(again.metrics).toMatchObject({ unit: 'us', statements: 4, roundTrips: 1, parsed: 0, reused: 2 });

				// builders stay unnamed, and the options still apply
				const builders = yield* db.batch([db.select().from(bulkUsers), db.$count(bulkUsers)], {
					metrics: 'ms',
					readOnly: true,
				});
				expect(builders[1]).toBe(2);
				expect(builders.metrics).toMatchObject({ unit: 'ms', statements: 4, roundTrips: 1, unnamed: 2 });

				// without metrics the response is the plain tuple
				const plain = yield* db.batch([db.select().from(bulkUsers)]);
				expect('metrics' in plain).toBe(false);
			}));

		it.effect('batch: an error of no query fails it with a SqlError', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				const deferred = pgSchema(usedSchema).table('deferred_users', { id: integer().notNull() });
				yield* db.execute(
					sql`create table ${deferred} (id integer not null, constraint deferred_users_id unique (id) deferrable initially deferred)`,
				);

				// the duplicate is only caught at COMMIT, which belongs to no query
				const atCommit = yield* Effect.flip(db.batch([
					db.insert(deferred).values({ id: 1 }),
					db.insert(deferred).values({ id: 1 }),
				]));
				assert(Predicate.isTagged(atCommit, 'SqlError'));
				expect(errorMessages(atCommit)).toContain('deferred_users_id');
				expect(yield* db.select().from(deferred)).toStrictEqual([]);

				// and so is the snapshot import
				const atSnapshot = yield* Effect.flip(db.batch([db.select().from(deferred)], {
					isolation: 'repeatable read',
					snapshot: '00000003-0000001B-1',
				}));
				assert(Predicate.isTagged(atSnapshot, 'SqlError'));
				expect(errorMessages(atSnapshot)).toMatch(/snapshot .* does not exist/);
			}));

		it.effect('batch and pipeline: a query error carries a SqlError, as the query run on its own does', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);
				yield* db.insert(bulkUsers).values({ id: 1, name: 'John' });

				const failing = () => db.insert(bulkUsers).values({ id: 1, name: 'Duplicate' });
				/** The driver's error a query's error carries */
				const reasonOf = (error: unknown): SqlError => {
					assert(Predicate.isTagged(error, 'EffectDrizzleQueryError'));
					const { cause } = error as EffectDrizzleQueryError;
					assert(Cause.isCause(cause));
					const reason = cause.reasons[0];
					assert(reason !== undefined && Cause.isFailReason(reason) && reason.error instanceof SqlError);
					return reason.error;
				};

				const alone = reasonOf(yield* Effect.flip(failing()));
				const batched = reasonOf(yield* Effect.flip(db.batch([failing()])));
				const [piped] = yield* db.pipeline([failing()]);
				assert(Result.isFailure(piped));

				for (const reason of [batched, reasonOf(piped.failure)]) {
					expect(reason.reason._tag).toBe(alone.reason._tag);
					expect((reason.reason.cause as { code?: string }).code).toBe('23505');
				}
			}));

		it.effect('pipeline: no connection to run on fails it with a SqlError', () =>
			Effect.gen(function*() {
				const pool = createPostgresPool({ url: Redacted.value(connectionStr) });
				const db = yield* PostgresDrizzle.makeWithDefaults().pipe(
					Effect.provide(DrizzlePostgresClient.layerFromPool(pool)),
				);
				// the layer has connected: the pool has nothing to run on from here
				yield* Effect.promise(() => pool.end());

				const error = yield* Effect.flip(db.pipeline([db.select().from(bulkUsers)]));
				assert(Predicate.isTagged(error, 'SqlError'));
				expect(error.reason._tag).toBe('ConnectionError');
			}));

		it.effect('pipeline commits each query on its own', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);

				const [first, duplicate, selected] = yield* db.pipeline([
					db.insert(bulkUsers).values({ id: 1, name: 'John' }),
					db.insert(bulkUsers).values({ id: 1, name: 'Duplicate' }),
					db.select({ id: bulkUsers.id, name: bulkUsers.name }).from(bulkUsers),
				]);
				expectTypeOf(selected).toEqualTypeOf<
					Result.Result<{ id: number; name: string }[], EffectDrizzleQueryError>
				>();
				assert(Result.isSuccess(first));
				assert(Result.isFailure(duplicate));
				assert(Predicate.isTagged(duplicate.failure, 'EffectDrizzleQueryError'));
				expect(selected).toStrictEqual(Result.succeed([{ id: 1, name: 'John' }]));
			}));

		it.effect('parallel fans the queries out across pooled connections', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				const pid = () => db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid, pg_sleep(0.05)`, 'objects');
				const pidOf = (result: Result.Result<{ pid: number }[], EffectDrizzleQueryError>) => {
					assert(Result.isSuccess(result));
					return result.success[0]!.pid;
				};

				// pipeline keeps it's statements on one connection, parallel gives each a connection of it's own
				const piped = yield* db.pipeline([pid(), pid(), pid(), pid()]);
				expect(new Set(piped.map(pidOf)).size).toBe(1);
				const fanned = yield* db.parallel([pid(), pid(), pid(), pid()]);
				expect(new Set(fanned.map(pidOf)).size).toBeGreaterThan(1);
			}));

		it.effect('parallel commits each query on its own', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);

				const response = yield* db.parallel([
					db.insert(bulkUsers).values({ id: 1, name: 'John' }),
					db.execute(sql`select 1/0`),
					db.insert(bulkUsers).values({ id: 2, name: 'Jane' }).returning({ id: bulkUsers.id }),
				]);

				expect(response.map((r: Result.Result<unknown, unknown>) => Result.isSuccess(r))).toEqual([true, false, true]);
				assert(Result.isFailure(response[1]));
				assert(Predicate.isTagged(response[1].failure, 'EffectDrizzleQueryError'));
				expect(response[1].failure.query).toBe('select 1/0');
				expect(response[2]).toStrictEqual(Result.succeed([{ id: 2 }]));

				// no transaction: nothing is rolled back
				expect(yield* db.select({ id: bulkUsers.id }).from(bulkUsers).orderBy(bulkUsers.id)).toStrictEqual([
					{ id: 1 },
					{ id: 2 },
				]);
			}));

		it.effect('parallel inside a transaction runs on the transaction', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);

				const rolledBack = yield* Effect.result(db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(bulkUsers).values({ id: 1, name: 'John' });
						const [rows, inserted] = yield* db.parallel([
							db.select({ id: bulkUsers.id }).from(bulkUsers),
							db.insert(bulkUsers).values({ id: 2, name: 'Jane' }).returning({ id: bulkUsers.id }),
						]);
						// sees the transaction's uncommitted row
						expect(rows).toStrictEqual(Result.succeed([{ id: 1 }]));
						expect(inserted).toStrictEqual(Result.succeed([{ id: 2 }]));
						return yield* tx.rollback();
					})
				));
				assert(Result.isFailure(rolledBack));

				// rolled back with the transaction
				expect(yield* db.select({ id: bulkUsers.id }).from(bulkUsers)).toStrictEqual([]);
			}));

		// The Effect form of common-prepared-names.ts. In a transaction, so the statements and the
		// pg_prepared_statements read share a connection.
		it.effect('a name given to prepare() is the name of the statement on the server', () =>
			Effect.gen(function*() {
				const db = yield* createDB({ bulkUsers }, () => ({}));
				yield* createBulkUsers(db);
				const prefix = `pn_${Math.random().toString(36).slice(2, 8)}`;
				const id = sql.placeholder('id');

				const { results, names } = yield* db.transaction((tx) =>
					Effect.gen(function*() {
						const results = [
							yield* tx.insert(bulkUsers).values({ id: 1, name: sql.placeholder('name') })
								.returning({ id: bulkUsers.id, name: bulkUsers.name })
								.prepare(`${prefix}_insert`).execute({ name: 'John' }),
							yield* tx.select({ id: bulkUsers.id, name: bulkUsers.name }).from(bulkUsers)
								.where(sql`${bulkUsers.id} = ${id}`)
								.prepare(`${prefix}_select`).execute({ id: 1 }),
							yield* tx.update(bulkUsers).set({ name: 'Jane' }).where(sql`${bulkUsers.id} = ${id}`)
								.returning({ id: bulkUsers.id, name: bulkUsers.name })
								.prepare(`${prefix}_update`).execute({ id: 1 }),
							yield* tx.query.bulkUsers.findFirst({ columns: { id: true, name: true }, where: { id: { eq: id } } })
								.prepare(`${prefix}_find_first`).execute({ id: 1 }),
							yield* tx.delete(bulkUsers).where(sql`${bulkUsers.id} = ${id}`)
								.returning({ id: bulkUsers.id, name: bulkUsers.name })
								.prepare(`${prefix}_delete`).execute({ id: 1 }),
						];
						const names = yield* tx.select({ name: sql<string>`name` }).from(sql`pg_prepared_statements`)
							.where(sql`name like ${prefix + '\\_%'}`).orderBy(sql`name`);
						return { results, names: names.map((row) => row.name) };
					})
				);

				expect(results).toStrictEqual([
					[{ id: 1, name: 'John' }],
					[{ id: 1, name: 'John' }],
					[{ id: 1, name: 'Jane' }],
					{ id: 1, name: 'Jane' },
					[{ id: 1, name: 'Jane' }],
				]);
				expect(names).toStrictEqual(
					['delete', 'find_first', 'insert', 'select', 'update'].map((kind) => `${prefix}_${kind}`),
				);
			}));

		it.effect('a prepared statement in batch and pipeline runs under its name', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);
				yield* db.insert(bulkUsers).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
				const name = `pn_multi_${Math.random().toString(36).slice(2, 8)}`;
				const byId = db.select({ id: bulkUsers.id, name: bulkUsers.name }).from(bulkUsers)
					.where(sql`${bulkUsers.id} = ${sql.placeholder('id')}`).prepare(name);
				const named = db.select({ name: sql<string>`name` }).from(sql`pg_prepared_statements`)
					.where(sql`name = ${name}`);

				// batch and pipeline each keep their statements on one connection, in order
				const batched = yield* db.batch([byId.bind({ id: 1 }), byId.bind({ id: 2 }), named]);
				expect(batched).toStrictEqual([[{ id: 1, name: 'John' }], [{ id: 2, name: 'Jane' }], [{ name }]]);

				const piped = yield* db.pipeline([byId.bind({ id: 2 }), named]);
				expect(piped).toStrictEqual([Result.succeed([{ id: 2, name: 'Jane' }]), Result.succeed([{ name }])]);

				// a prepared query with placeholders and no bound values dies, as `.execute()` without them does
				const unbound = yield* Effect.exit(db.pipeline([byId]));
				assert(Exit.isFailure(unbound));
				expect(String(unbound.cause)).toContain('No value for placeholder "id" was provided');
			}));

		it.effect('bulkInsert and bulkUpdate', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);

				const inserted = yield* db.bulkInsert(bulkUsers, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
				expect(inserted.rowCount).toBe(2);

				const updated = yield* db.bulkUpdate(bulkUsers, [{ id: 1, name: 'Johnny' }, { id: 2, name: 'Janet' }], {
					by: bulkUsers.id,
				});
				expect(updated.rowCount).toBe(2);

				const rows = yield* db.select().from(bulkUsers).orderBy(bulkUsers.id);
				expect(rows.map(({ id, name }) => ({ id, name }))).toStrictEqual([
					{ id: 1, name: 'Johnny' },
					{ id: 2, name: 'Janet' },
				]);
				expect(rows.every(({ createdAt }) => createdAt instanceof Date)).toBe(true);
			}));

		// Can't test shapes via generic codecs test
		it.effect('all types ~shapes~', () =>
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

		it.effect('migrator : default migration strategy', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();

				yield* migrate(db, { migrationsFolder: './drizzle2/pg' });
				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

				expect(yield* db.select().from(usersMigratorTable)).toEqual([{ id: 1, name: 'John', email: 'email' }]);
			}));

		it.effect('transaction snapshot: rejects a malformed id', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const error = yield* Effect.flip(
					db.transaction(() => Effect.void, { isolationLevel: 'repeatable read', snapshot: 'not-a-snapshot' }),
				);
				expect(errorMessages(error)).toContain('invalid snapshot identifier: "not-a-snapshot"');
			}));

		it.effect('transaction snapshot: does not let the id inject SQL', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = sql.identifier('ef_snapshot_injection');

				yield* db.execute(sql`drop table if exists ${table}`);
				yield* db.execute(sql`create table ${table} (id integer)`);

				const body = Effect.gen(function*() {
					const payload = `x'; drop table ef_snapshot_injection; --`;
					const error = yield* Effect.flip(
						db.transaction(() => Effect.void, { isolationLevel: 'repeatable read', snapshot: payload }),
					);
					expect(errorMessages(error)).toContain(`invalid snapshot identifier: "${payload}"`);

					const res = yield* db.execute<{ c: number }>(sql`select count(*)::int as c from ${table}`, 'objects');
					expect(res[0]?.c).toBe(0);
				});

				yield* body.pipe(Effect.ensuring(db.execute(sql`drop table if exists ${table}`).pipe(Effect.ignore)));
			}));

		it.effect('execute', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const res = yield* db.execute<{ '1': number }>(sql`SELECT 1 as "1"`);

				expect(res.rows).toStrictEqual([{ '1': 1 }]);
			}));

		it.effect('all date and time columns without timezone first case mode string', () =>
			withStringTemporalDB((db) =>
				Effect.gen(function*() {
					const table = pgTable('all_columns', {
						id: serial('id').primaryKey(),
						timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
					});

					yield* db.execute(sql`drop table if exists ${table}`);
					yield* db.execute(sql`create table ${table} (id serial primary key, timestamp_string timestamp(6) not null)`);

					// 1. Insert date in string format without timezone in it
					yield* db.insert(table).values([{ timestamp: '2022-01-01 02:00:00.123456' }]);

					// 2. Select in string format and check that values are the same
					expect(yield* db.select().from(table)).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456' }]);

					// 3. Select as raw query and check that values are the same
					const result = yield* db.execute<{ id: number; timestamp_string: string }>(
						sql`select "id", "timestamp_string"::text from ${table}`,
					);
					expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

					yield* db.execute(sql`drop table if exists ${table}`);
				})
			));

		it.effect('all date and time columns without timezone second case mode string', () =>
			withStringTemporalDB((db) =>
				Effect.gen(function*() {
					const table = pgTable('all_columns', {
						id: serial('id').primaryKey(),
						timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
					});

					yield* db.execute(sql`drop table if exists ${table}`);
					yield* db.execute(sql`create table ${table} (id serial primary key, timestamp_string timestamp(6) not null)`);

					// 1. Insert date in string format with timezone in it
					yield* db.insert(table).values([{ timestamp: '2022-01-01T02:00:00.123456-02' }]);

					// 2. Select as raw query and check that values are the same
					const result = yield* db.execute<{ id: number; timestamp_string: string }>(
						sql`select "id", "timestamp_string"::text from ${table}`,
					);
					expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

					yield* db.execute(sql`drop table if exists ${table}`);
				})
			));

		it.effect('all date and time columns without timezone third case mode date', () =>
			withStringTemporalDB((db) =>
				Effect.gen(function*() {
					const table = pgTable('all_columns', {
						id: serial('id').primaryKey(),
						timestamp: timestamp('timestamp_string', { mode: 'date', precision: 3 }).notNull(),
					});

					yield* db.execute(sql`drop table if exists ${table}`);
					yield* db.execute(sql`create table ${table} (id serial primary key, timestamp_string timestamp(3) not null)`);

					const insertedDate = new Date('2022-01-01 20:00:00.123+04');

					// 1. Insert date as new date
					yield* db.insert(table).values([{ timestamp: insertedDate }]);

					// 2. Select as raw query as string
					const result = yield* db.execute<{ id: number; timestamp_string: string }>(
						sql`select "id", "timestamp_string"::text from ${table}`,
					);

					// 3. Compare both dates using orm mapping - Need to add 'Z' to tell JS that it is UTC
					expect(new Date(result.rows[0]!.timestamp_string + 'Z').getTime()).toBe(insertedDate.getTime());

					yield* db.execute(sql`drop table if exists ${table}`);
				})
			));

		it.effect('test mode string for timestamp with timezone', () =>
			withStringTemporalDB((db) =>
				Effect.gen(function*() {
					const table = pgTable('all_columns', {
						id: serial('id').primaryKey(),
						timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
					});

					yield* db.execute(sql`drop table if exists ${table}`);
					yield* db.execute(
						sql`create table ${table} (id serial primary key, timestamp_string timestamp(6) with time zone not null)`,
					);

					// 1. Insert date in string format with timezone in it
					yield* db.insert(table).values([{ timestamp: '2022-01-01 00:00:00.123456-0200' }]);

					// 2. Select date in string format: postgres returns the date in UTC, but it is exactly the same
					expect(yield* db.select().from(table)).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

					// 3. Select as raw query and check that values are the same
					const result = yield* db.execute<{ id: number; timestamp_string: string }>(
						sql`select "id", "timestamp_string"::text from ${table}`,
					);
					expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

					yield* db.execute(sql`drop table if exists ${table}`);
				})
			));

		it.effect('test mode date for timestamp with timezone', () =>
			withStringTemporalDB((db) =>
				Effect.gen(function*() {
					const table = pgTable('all_columns', {
						id: serial('id').primaryKey(),
						timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
					});

					yield* db.execute(sql`drop table if exists ${table}`);
					yield* db.execute(
						sql`create table ${table} (id serial primary key, timestamp_string timestamp(3) with time zone not null)`,
					);

					const insertedDate = new Date('2022-01-01 00:00:00.456-0200');

					// 1. Insert date with timezone in it
					yield* db.insert(table).values([{ timestamp: insertedDate }]);

					// 2. Select date: postgres returns the date in UTC, but it is exactly the same
					expect(yield* db.select().from(table)).toEqual([{ id: 1, timestamp: insertedDate }]);

					// 3. Select as raw query and check that values are the same
					const result = yield* db.execute<{ id: number; timestamp_string: string }>(
						sql`select "id", "timestamp_string"::text from ${table}`,
					);
					expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.456+00' }]);

					yield* db.execute(sql`drop table if exists ${table}`);
				})
			));

		it.effect('test mode string for timestamp with timezone in UTC timezone', () =>
			withStringTemporalDB((db) =>
				Effect.gen(function*() {
					// one connection: the session time zone applies to the statements below
					yield* db.execute(sql`set time zone 'UTC'`);

					const table = pgTable('all_columns', {
						id: serial('id').primaryKey(),
						timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
					});

					yield* db.execute(sql`drop table if exists ${table}`);
					yield* db.execute(
						sql`create table ${table} (id serial primary key, timestamp_string timestamp(6) with time zone not null)`,
					);

					// 1. Insert date in string format with timezone in it
					yield* db.insert(table).values([{ timestamp: '2022-01-01 00:00:00.123456-0200' }]);

					// 2. Select date in string format: postgres returns the date in UTC, but it is exactly the same
					expect(yield* db.select().from(table)).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

					// 3. Select as raw query and check that values are the same
					const result = yield* db.execute<{ id: number; timestamp_string: string }>(
						sql`select "id", "timestamp_string"::text from ${table}`,
					);
					expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

					yield* db.execute(sql`drop table if exists ${table}`);
				})
			));

		it.effect('test mode string for timestamp with timezone in different timezone', () =>
			withStringTemporalDB((db) =>
				Effect.gen(function*() {
					// one connection: the session time zone (HST, UTC - 10) applies to the statements below
					yield* db.execute(sql`set time zone '-10'`);

					const table = pgTable('all_columns', {
						id: serial('id').primaryKey(),
						timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
					});

					yield* db.execute(sql`drop table if exists ${table}`);
					yield* db.execute(
						sql`create table ${table} (id serial primary key, timestamp_string timestamp(6) with time zone not null)`,
					);

					yield* db.insert(table).values([{ timestamp: '2022-01-01 00:00:00.123456-1000' }]);

					expect(yield* db.select().from(table)).toEqual([{ id: 1, timestamp: '2022-01-01 00:00:00.123456-10' }]);

					const result = yield* db.execute<{ id: number; timestamp_string: string }>(
						sql`select "id", "timestamp_string"::text from ${table}`,
					);
					expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 00:00:00.123456-10' }]);

					yield* db.execute(sql`drop table if exists ${table}`);
				})
			));

		it.effect('insert via db.execute + select via db.execute', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const usersTable = pgTable('users_execute_raw_postgres_1', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
					createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
				});

				yield* push(db, { usersTable });

				yield* db.execute(sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`);

				const result = yield* db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
				expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
			}));

		it.effect('insert via db.execute + returning', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const usersTable = pgTable('users_execute_raw_postgres_2', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
					createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
				});

				yield* push(db, { usersTable });

				const inserted = yield* db.execute<{ id: number; name: string }>(
					sql`insert into ${usersTable} (${
						sql.identifier(usersTable.name.name)
					}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
				);
				expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
			}));

		it.effect('insert via db.execute w/ query builder', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const usersTable = pgTable('users_execute_raw_postgres_3', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
					createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
				});

				yield* push(db, { usersTable });

				const inserted = yield* db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
					db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
				);
				expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
			}));

		it.effect('timetz keeps offset', () =>
			Effect.gen(function*() {
				const times = pgTable('times', {
					id: integer('id').primaryKey(),
					time: time('time', { withTimezone: true }).notNull(),
					arr: time('arr', { withTimezone: true }).array().notNull(),
					mtx: time('mtx', { withTimezone: true }).array('[][]').notNull(),
				});

				const db = yield* createDB({ times }, () => ({}));
				yield* push(db, { times });

				const value = {
					id: 1,
					time: '12:00:00.5-02',
					arr: ['12:00:00.5-02', '23:59:59+05:30'],
					mtx: [['12:00:00.5-02'], ['23:59:59+05:30']],
				};
				yield* db.insert(times).values(value);

				expect(yield* db.select().from(times)).toStrictEqual([value]);
			}));

		it.effect('migrator : migrate with custom schema', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				const customSchema = randomString();

				yield* migrate(db, { migrationsFolder: './drizzle2/pg', migrationsSchema: customSchema });

				// test if the custom migrations table was created
				const res = yield* db.execute<{ count: number }>(
					sql`select count(*)::int as ${sql.identifier('count')} from ${sql.identifier(customSchema)}.${
						sql.identifier('__drizzle_migrations')
					} limit 1;`,
				);
				expect((res.rows[0]?.count ?? 0) > 0).toBeTruthy();

				// test if the migrated table are working as expected
				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
				expect(yield* db.select().from(usersMigratorTable)).toEqual([{ id: 1, name: 'John', email: 'email' }]);

				yield* db.execute(sql`DROP SCHEMA ${sql.identifier(customSchema)} CASCADE;`);
			}));

		it.effect('migrator : migrate with custom table', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				const customTable = randomString();

				yield* migrate(db, { migrationsFolder: './drizzle2/pg', migrationsTable: customTable });

				// test if the custom migrations table was created
				const res = yield* db.execute<{ count: number }>(
					sql`select count(*)::int as ${sql.identifier('count')} from ${sql.identifier('drizzle')}.${
						sql.identifier(customTable)
					} limit 1;`,
				);
				expect((res.rows[0]?.count ?? 0) > 0).toBeTruthy();

				// test if the migrated table are working as expected
				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
				expect(yield* db.select().from(usersMigratorTable)).toEqual([{ id: 1, name: 'John', email: 'email' }]);
			}));

		it.effect('migrator : migrate with custom table and custom schema', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				const customTable = randomString();
				const customSchema = randomString();

				yield* migrate(db, {
					migrationsFolder: './drizzle2/pg',
					migrationsTable: customTable,
					migrationsSchema: customSchema,
				});

				// test if the custom migrations table was created
				const res = yield* db.execute<{ count: number }>(
					sql`select count(*)::int as ${sql.identifier('count')} from ${sql.identifier(customSchema)}.${
						sql.identifier(customTable)
					} limit 1;`,
				);
				expect((res.rows[0]?.count ?? 0) > 0).toBeTruthy();

				// test if the migrated table are working as expected
				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
				expect(yield* db.select().from(usersMigratorTable)).toEqual([{ id: 1, name: 'John', email: 'email' }]);

				yield* db.execute(sql`DROP SCHEMA ${sql.identifier(customSchema)} CASCADE;`);
			}));

		it.effect('migrator : --init', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				const migrationsSchema = 'drzl_migrations_init';
				const migrationsTable = 'drzl_init';

				const migratorRes = yield* migrate(db, {
					migrationsFolder: './drizzle2/pg-init',
					migrationsTable,
					migrationsSchema,
					// @ts-ignore - internal param
					init: true,
				});

				const meta = yield* db.select({
					hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
					createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
				}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

				const res = yield* db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
						SELECT 1
						FROM pg_tables
						WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? usedSchema} AND tablename = ${
					getTableConfig(usersMigratorTable).name
				}
					) as ${sql.identifier('tableExists')};`);

				expect(migratorRes).toStrictEqual(undefined);
				expect(meta.length).toStrictEqual(1);
				expect(res.rows[0]?.['tableExists']).toStrictEqual(false);
			}));

		it.effect('migrator : --init - local migrations error', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				const migrationsSchema = 'drzl_migrations_init';
				const migrationsTable = 'drzl_init';

				const migratorRes = yield* migrate(db, {
					migrationsFolder: './drizzle2/pg',
					migrationsTable,
					migrationsSchema,
					// @ts-ignore - internal param
					init: true,
				}).pipe(Effect.result);

				const meta = yield* db.select({
					hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
					createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
				}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

				const res = yield* db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
						SELECT 1
						FROM pg_tables
						WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? usedSchema} AND tablename = ${
					getTableConfig(usersMigratorTable).name
				}
					) as ${sql.identifier('tableExists')};`);

				assert(Result.isFailure(migratorRes));
				assert(Predicate.isTagged(migratorRes.failure, 'MigratorInitError'));
				expect(migratorRes.failure.exitCode).toBe('localMigrations');
				expect(meta.length).toStrictEqual(0);
				expect(res.rows[0]?.['tableExists']).toStrictEqual(false);
			}));

		it.effect('migrator : --init - db migrations error', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
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

				const meta = yield* db.select({
					hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
					createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
				}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

				const res = yield* db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
						SELECT 1
						FROM pg_tables
						WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? usedSchema} AND tablename = ${
					getTableConfig(usersMigratorTable).name
				}
					) as ${sql.identifier('tableExists')};`);

				assert(Result.isFailure(migratorRes));
				assert(Predicate.isTagged(migratorRes.failure, 'MigratorInitError'));
				expect(migratorRes.failure.exitCode).toBe('databaseMigrations');
				expect(meta.length).toStrictEqual(1);
				expect(res.rows[0]?.['tableExists']).toStrictEqual(true);
			}));

		it.effect('migrator : local migration is unapplied. Migrations timestamp is less than last db migration', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();

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

				yield* db.execute(sql`drop schema if exists "drizzle" cascade;`);
				yield* db.execute(sql`drop table if exists ${users}`);
				yield* db.execute(sql`drop table if exists ${users2}`);

				// create migration directory
				const migrationDir = './migrations/effect-drizzle-postgres';
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

				yield* migrate(db, { migrationsFolder: migrationDir });
				const res1 = yield* db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

				// second migration was not applied yet
				const insertResult = yield* db.insert(users2).values({ name: 'John', email: '', age: 30 }).pipe(Effect.result);
				assert(Result.isFailure(insertResult));
				assert(Predicate.isTagged(insertResult.failure, 'EffectDrizzleQueryError'));

				// insert migration with earlier timestamp
				mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
				writeFileSync(
					`${migrationDir}/20240202020202_second/migration.sql`,
					`CREATE TABLE "migration_users2" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
				);
				yield* migrate(db, { migrationsFolder: migrationDir });

				const res2 = yield* db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

				const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
				expect(res1).toStrictEqual(expected);
				expect(res2).toStrictEqual(expected);

				rmSync(migrationDir, { recursive: true });
			}));
	},
});
