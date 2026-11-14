import { assert, expect, expectTypeOf, vi } from '@effect/vitest';
import {
	defineRelations,
	ExtractTablesFromSchema,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
	sql,
} from 'drizzle-orm';
import type { Cache } from 'drizzle-orm/cache/core';
import { EffectCache } from 'drizzle-orm/cache/core/cache-effect';
import * as PostgresDrizzle from 'drizzle-orm/effect-drizzle-postgres';
import { migrate } from 'drizzle-orm/effect-drizzle-postgres/migrator';
import { integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';
import { DrizzlePostgresClient } from 'drizzle-orm/postgres/client/effect';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Result from 'effect/Result';
import { Client as PgPeerClient } from 'pg';
import { DB, runCommonEffectPgTests } from './effect-common';
import { TestCache } from './instrumentation';
import { relations } from './relations';
import { usersMigratorTable } from './schema';

const connectionStr = Redacted.make(
	process.env['PG_CONNECTION_STRING'] ?? 'postgres://postgres:postgres@localhost:55433/drizzle',
);
const ClientLive = DrizzlePostgresClient.layer({ url: connectionStr });

const DBLive = Layer.effect(DB, PostgresDrizzle.makeWithDefaults({ relations }));

const createDB = <
	TSchema extends Record<string, any>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relations: (helpers: RelationsBuilder<TTables>) => TConfig,
	useJitMappers?: boolean,
	cache?: Cache,
) =>
	PostgresDrizzle.make({ relations: defineRelations(schema, relations), jit: useJitMappers }).pipe(
		Effect.provide(cache ? EffectCache.layerFromDrizzle(cache) : Layer.empty),
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

		it.effect('transaction snapshot isolates the transaction', () =>
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

				const failed = yield* db.batch([
					db.insert(bulkUsers).values({ id: 2, name: 'Jane' }),
					db.insert(bulkUsers).values({ id: 1, name: 'Duplicate' }),
				]).pipe(Effect.result);
				assert(Result.isFailure(failed));
				assert(Predicate.isTagged(failed.failure, 'EffectDrizzleQueryError'));
				expect(failed.failure.query).toContain('insert');
				expect(yield* db.select({ id: bulkUsers.id }).from(bulkUsers)).toStrictEqual([{ id: 1 }]);
			}));

		it.effect('pipeline commits each query on its own', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);

				const [first, duplicate, selected] = yield* db.pipeline([
					Effect.result(db.insert(bulkUsers).values({ id: 1, name: 'John' })),
					Effect.result(db.insert(bulkUsers).values({ id: 1, name: 'Duplicate' })),
					Effect.result(db.select({ id: bulkUsers.id, name: bulkUsers.name }).from(bulkUsers)),
				]);
				assert(Result.isSuccess(first));
				assert(Result.isFailure(duplicate));
				assert(Predicate.isTagged(duplicate.failure, 'EffectDrizzleQueryError'));
				assert(Result.isSuccess(selected));
				expect(selected.success).toStrictEqual([{ id: 1, name: 'John' }]);
			}));

		it.effect('batch and pipeline send statements in order when the cache is on', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.make().pipe(
					Effect.provide(EffectCache.layerFromDrizzle(new TestCache('all'))),
					Effect.provide(PostgresDrizzle.DefaultServices),
				);
				yield* createBulkUsers(db);

				const [beforeBatchInsert] = yield* db.batch([
					db.select({ id: bulkUsers.id }).from(bulkUsers),
					db.insert(bulkUsers).values({ id: 1, name: 'John' }),
				]);
				expect(beforeBatchInsert).toStrictEqual([]);

				const [beforePipelineInsert] = yield* db.pipeline([
					db.select({ id: bulkUsers.id }).from(bulkUsers).where(sql`${bulkUsers.id} > 1`),
					db.insert(bulkUsers).values({ id: 2, name: 'Jane' }),
				]);
				expect(beforePipelineInsert).toStrictEqual([]);
			}));

		// Statements of a batch or a pipeline are never answered from the cache or stored in it. The ones that
		// change data, and bulk writes, make cached queries stale, the same as a write that is run on its own
		it.effect('batch, pipeline and bulk writes invalidate cached queries; their selects stay out of the cache', () =>
			Effect.gen(function*() {
				const cache = new TestCache('all');
				const db = yield* PostgresDrizzle.make().pipe(
					Effect.provide(EffectCache.layerFromDrizzle(cache)),
					Effect.provide(PostgresDrizzle.DefaultServices),
				);
				// writes that the cache does not hear about
				const plain = yield* PostgresDrizzle.makeWithDefaults();
				yield* createBulkUsers(db);

				const select = db.select({ id: bulkUsers.id }).from(bulkUsers).orderBy(bulkUsers.id);
				const ids = Effect.map(select, (rows) => rows.map((row) => row.id));
				const unseen = (id: number) => plain.insert(bulkUsers).values({ id, name: 'Unseen' });

				expect(yield* ids).toStrictEqual([]);
				yield* unseen(1);
				expect(yield* ids, 'answered from the cache').toStrictEqual([]);

				const get = vi.spyOn(cache, 'get');
				const put = vi.spyOn(cache, 'put');
				const [inBatch] = yield* db.batch([select]);
				const [inPipeline] = yield* db.pipeline([select]);
				expect(inBatch).toStrictEqual([{ id: 1 }]);
				expect(inPipeline).toStrictEqual([{ id: 1 }]);
				expect(get).not.toHaveBeenCalled();
				expect(put).not.toHaveBeenCalled();
				get.mockRestore();
				put.mockRestore();
				expect(yield* ids, 'what was cached is still there').toStrictEqual([]);

				yield* db.batch([db.insert(bulkUsers).values({ id: 2, name: 'John' }), select]);
				expect(yield* ids, 'after a batch').toStrictEqual([1, 2]);

				yield* unseen(3);
				expect(yield* ids).toStrictEqual([1, 2]);
				yield* db.pipeline([db.insert(bulkUsers).values({ id: 4, name: 'Jane' }), select]);
				expect(yield* ids, 'after a pipeline').toStrictEqual([1, 2, 3, 4]);

				yield* unseen(5);
				expect(yield* ids).toStrictEqual([1, 2, 3, 4]);
				yield* db.bulkInsert(bulkUsers, [{ id: 6, name: 'Bulk' }]);
				expect(yield* ids, 'after bulkInsert').toStrictEqual([1, 2, 3, 4, 5, 6]);

				yield* unseen(7);
				expect(yield* ids).toStrictEqual([1, 2, 3, 4, 5, 6]);
				yield* db.bulkUpdate(bulkUsers, [{ id: 6, name: 'Bulky' }], { by: bulkUsers.id });
				expect(yield* ids, 'after bulkUpdate').toStrictEqual([1, 2, 3, 4, 5, 6, 7]);

				// one invalidation for a batch, after its commit: another connection sees the rows by then
				const context = yield* Effect.context<never>();
				const seenAtInvalidation: number[][] = [];
				const afterCommit = vi.spyOn(cache, 'onMutate').mockImplementation(async () => {
					const rows = await Effect.runPromiseWith(context)(
						plain.select({ id: bulkUsers.id }).from(bulkUsers).orderBy(bulkUsers.id),
					);
					seenAtInvalidation.push(rows.map((row) => row.id));
				});
				yield* db.batch([
					db.insert(bulkUsers).values({ id: 8, name: 'First' }),
					db.insert(bulkUsers).values({ id: 9, name: 'Second' }),
				]);
				expect(seenAtInvalidation).toStrictEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9]]);
				afterCommit.mockRestore();

				// a failed write invalidates nothing
				const onMutate = vi.spyOn(cache, 'onMutate');
				const failed = yield* db.batch([db.insert(bulkUsers).values({ id: 1, name: 'Twice' })]).pipe(Effect.result);
				assert(Result.isFailure(failed));
				expect(onMutate).not.toHaveBeenCalled();
				onMutate.mockRestore();
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

		it.effect('migrator : default migration strategy', () =>
			Effect.gen(function*() {
				const db = yield* PostgresDrizzle.makeWithDefaults();

				yield* migrate(db, { migrationsFolder: './drizzle2/pg' });
				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

				expect(yield* db.select().from(usersMigratorTable)).toEqual([{ id: 1, name: 'John', email: 'email' }]);
			}));
	},
});
