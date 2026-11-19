import { assert, expect, expectTypeOf } from '@effect/vitest';
import {
	defineRelations,
	ExtractTablesFromSchema,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
	sql,
} from 'drizzle-orm';
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
					db.insert(bulkUsers).values({ id: 1, name: 'John' }),
					db.insert(bulkUsers).values({ id: 1, name: 'Duplicate' }),
					db.select({ id: bulkUsers.id, name: bulkUsers.name }).from(bulkUsers),
				]);
				assert(Result.isSuccess(first));
				assert(Result.isFailure(duplicate));
				assert(Predicate.isTagged(duplicate.failure, 'EffectDrizzleQueryError'));
				assert(Result.isSuccess(selected));
				expect(selected.success).toStrictEqual([{ id: 1, name: 'John' }]);
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
