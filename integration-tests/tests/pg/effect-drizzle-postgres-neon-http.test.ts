import { createProvider } from '@drizzle/test-utils';
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
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { DrizzlePostgresHttpClient } from 'drizzle-orm/postgres/client/effect/neon-http';
import * as PostgresHttpDrizzle from 'drizzle-orm/postgres/effect/http';
import * as PostgresNeonHttpDrizzle from 'drizzle-orm/postgres/effect/neon-http';
import { migrate } from 'drizzle-orm/postgres/effect/neon-http/migrator';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { beforeAll, describe } from 'vitest';
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
import {
	DB as CommonDB,
	pushStatements as push,
	relations as commonRelations,
	runCommonEffectPgTests,
} from './effect-common';
import { neonPoolDatabases, preparePostgresNeonHttpClient } from './instrumentation';
import { usersMigratorTable } from './schema';

/**
 * The databases the tests take turns on, one test at a time each: `db10`-`db14` of `provideForNetlifyDb` (their
 * per-driver counterparts on the local proxy), five slots like every other Neon suite's. `test:neon` runs it's suites
 * one file at a time and this file after `netlify-db.test.ts`, so no other suite uses them meanwhile
 */
const DATABASES = neonPoolDatabases(['db10', 'db11', 'db12', 'db13', 'db14'], process.env['NEON_CONNECTION_STRING']);

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
	useJitMappers?: boolean,
) => PostgresNeonHttpDrizzle.makeWithDefaults({ relations: defineRelations(schema, relationsOf), jit: useJitMappers });

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

class DBTag extends Context.Service<DBTag, PostgresNeonHttpDrizzle.EffectPostgresNeonHttpDatabase<typeof relations>>()(
	'EffectPostgresNeonHttpDB',
) {}

interface Database {
	readonly db: PostgresNeonHttpDrizzle.EffectPostgresNeonHttpDatabase<typeof relations>;
	/** The database with the relations of the common suite */
	readonly commonDb: PostgresNeonHttpDrizzle.EffectPostgresNeonHttpDatabase<typeof commonRelations>;
	readonly client: DrizzlePostgresHttpClient.DrizzlePostgresHttpClient;
}

/** The databases, each prepared like `provideForPostgresNeonHttp`'s (schemas reset), handed out one test at a time */
let databases: Promise<() => Promise<Database & { release: () => void }>> | undefined;
const provideDatabase = () =>
	databases ??= (async () => {
		const prepared: Database[] = [];
		for (const name of DATABASES) {
			const client = DrizzlePostgresHttpClient.fromClient((await preparePostgresNeonHttpClient(name)).client);
			const [db, commonDb] = await Effect.runPromise(
				Effect.all([
					PostgresNeonHttpDrizzle.makeWithDefaults({ relations }),
					PostgresNeonHttpDrizzle.makeWithDefaults({ relations: commonRelations }),
				]).pipe(Effect.provideService(DrizzlePostgresHttpClient.DrizzlePostgresHttpClient, client)),
			);
			prepared.push({ db, commonDb, client });
		}
		return createProvider(prepared);
	})();

/** A database of the pool for the scope of a test, it's schemas recreated */
const database = Effect.acquireRelease(
	Effect.promise(async () => (await provideDatabase())()),
	(taken) => Effect.sync(() => taken.release()),
);

beforeAll(async () => {
	await provideDatabase();
}, 180_000);

runCommonEffectPgTests<DBTag | DrizzlePostgresHttpClient.DrizzlePostgresHttpClient>({
	// Each test on a database of the pool
	provideTest: (test) =>
		Effect.scoped(Effect.gen(function*() {
			const { db, commonDb, client } = yield* database;
			return yield* test.pipe(
				Effect.provideService(CommonDB, commonDb),
				Effect.provideService(DBTag, db),
				Effect.provideService(DrizzlePostgresHttpClient.DrizzlePostgresHttpClient, client),
			);
		})),
	PgDrizzle: PostgresNeonHttpDrizzle,
	createDB,
	usedSchema: 'public',
	push,
	// No interactive transactions, and no session to set a time zone in
	skipTests: [
		'transaction',
		'transaction rollback',
		'nested transaction',
		'nested transaction rollback',
		'transaction with an empty options object',
		'transaction with options (accessMode read only)',
		'transaction with options (deferrable)',
		'transaction with options (set isolationLevel)',
		'transaction snapshot: does not let the id inject SQL',
		'transaction snapshot: rejects a malformed id',
		'transaction: an interrupt in the body rolls back, and the database stays usable',
		'transaction: the body runs in the caller fiber and sees its services',
		'Query error params - transaction',
		'RQB v2 one shape run again with other values',
		'RQB v2 transaction find first - no rows',
		'RQB v2 transaction find first - multiple rows',
		'RQB v2 transaction find first - with relation',
		'RQB v2 transaction find first - placeholders',
		'RQB v2 transaction find many - no rows',
		'RQB v2 transaction find many - multiple rows',
		'RQB v2 transaction find many - with relation',
		'RQB v2 transaction find many - placeholders',
		'time zones are preserved - non-UTC session',
		// The driver decodes values through the shape, so raw rows without one do not match the codec normalization
		'all types ~codecs~',
	],
	addTests: (it) => {
		const pushUsers = Effect.gen(function*() {
			const db = yield* DBTag;
			yield* push(db, { usersTable, postsTable });
			return db;
		});

		it.effect('raw db.execute type matches returned data', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const table = sql.identifier('raw_execute_types');

				const created = yield* db.execute<never>(
					sql`create table ${table} ("id" integer primary key, "name" text not null)`,
				);
				expectTypeOf(created).toEqualTypeOf<
					{ rows: never[]; columns: string[]; command: string | null; rowCount: number | null }
				>();
				expect(created).toEqual(expect.objectContaining({ rows: [], command: expect.any(String) }));

				const inserted = yield* db.execute<never>(sql`insert into ${table} values (1, 'John')`);
				expect(inserted).toEqual(expect.objectContaining({ rows: [], rowCount: 1 }));

				const selected = yield* db.execute<{ id: number; name: string }>(
					sql`select "id", "name" from ${table} order by "id"`,
				);
				expect(selected).toEqual(expect.objectContaining({ rows: [{ id: 1, name: 'John' }], columns: ['id', 'name'] }));
			}));

		it.effect('interactive transactions are rejected', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const exit = yield* Effect.exit(db.transaction(() => Effect.void));

				assert(Exit.isFailure(exit));
				expect(String(exit.cause)).toMatch(/No interactive transactions/);
			}));

		it.effect('backend errors keep their SQLSTATE across the HTTP hop', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;
				const error = yield* Effect.flip(db.execute(sql`select * from definitely_not_a_table`));

				expect(error._tag).toBe('EffectDrizzleQueryError');
				expect(errorMessages(error)).toMatch(/does not exist/i);
				expect(sqlState(error)).toBe('42P01');
			}));

		it.effect('the gateway database rejects a Neon client', () =>
			Effect.gen(function*() {
				const exit = yield* Effect.exit(PostgresHttpDrizzle.makeWithDefaults());

				assert(Exit.isFailure(exit));
				expect(String(exit.cause)).toContain(
					'`drizzle-orm/postgres/effect/http` needs a gateway `DrizzlePostgresHttpClient`, but got a Neon HTTP one',
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

		it.effect('batch api example', () =>
			Effect.gen(function*() {
				const db = yield* pushUsers;

				const batchResponse = yield* db.batch([
					db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
					db.insert(usersTable).values({ id: 2, name: 'Dan' }),
					db.select().from(usersTable).orderBy(usersTable.id),
					db.query.usersTable.findFirst({ columns: { id: true, name: true }, where: { id: 2 } }),
				]);

				expect(batchResponse[0]).toEqual([{ id: 1 }]);
				expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });
				expect(batchResponse[2]).toEqual([
					{ id: 1, name: 'John', verified: 0 },
					{ id: 2, name: 'Dan', verified: 0 },
				]);
				expect(batchResponse[3]).toEqual({ id: 2, name: 'Dan' });
			}));

		it.effect('batch: rolls the whole set back on error', () =>
			Effect.gen(function*() {
				const db = yield* pushUsers;
				yield* db.insert(usersTable).values({ id: 1, name: 'Survivor' });

				const error = yield* Effect.flip(db.batch([
					db.insert(usersTable).values({ id: 2, name: 'Doomed' }),
					db.insert(postsTable).values(orphanPost),
				]));
				expect(errorMessages(error)).toMatch(/foreign key|violates/i);

				expect(yield* db.select({ name: usersTable.name }).from(usersTable)).toEqual([{ name: 'Survivor' }]);
			}));

		it.effect('batch: honours transaction options', () =>
			Effect.gen(function*() {
				const db = yield* pushUsers;
				yield* db.insert(usersTable).values({ id: 1, name: 'ReadMe' });

				const res = yield* db.batch(
					[db.select({ name: usersTable.name }).from(usersTable)],
					{ isolation: 'serializable', readOnly: true },
				);
				expect(res[0]).toEqual([{ name: 'ReadMe' }]);

				const error = yield* Effect.flip(db.batch([db.insert(usersTable).values({ id: 2, name: 'Nope' })], {
					readOnly: true,
				}));
				expect(errorMessages(error)).toMatch(/read-only|read only/i);
			}));

		// ---- parallel ----

		it.effect('parallel api example', () =>
			Effect.gen(function*() {
				const db = yield* pushUsers;
				yield* db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]);

				const response = yield* db.parallel([
					db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
						.where(inArray(usersTable.id, [1, 2])).orderBy(usersTable.id),
					db.insert(usersTable).values({ id: 3, name: 'Jane' }).returning({ id: usersTable.id }),
					db.query.usersTable.findFirst({ columns: { id: true, name: true }, where: { id: 2 } }),
					db.execute<{ one: number }>(sql`select 1 as one`),
				]);

				expectTypeOf(response[1]).toEqualTypeOf<Result.Result<{ id: number }[], EffectDrizzleQueryError>>();
				expect(response[0]).toStrictEqual(Result.succeed([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]));
				expect(response[1]).toStrictEqual(Result.succeed([{ id: 3 }]));
				expect(response[2]).toStrictEqual(Result.succeed({ id: 2, name: 'Dan' }));
				assert(Result.isSuccess(response[3]));
				expect(response[3].success).toMatchObject({ rows: [{ one: 1 }] });
			}));

		it.effect('parallel: failures come back as failed Results, the rest still commit', () =>
			Effect.gen(function*() {
				const db = yield* pushUsers;

				const failing = db.insert(postsTable).values(orphanPost);
				const response = yield* db.parallel([
					failing,
					db.insert(usersTable).values({ id: 1, name: 'Survivor' }).returning({ id: usersTable.id }),
					db.execute(sql`select 1/0`),
				]);

				expect(response.map((r: Result.Result<unknown, unknown>) => Result.isSuccess(r))).toEqual([false, true, false]);
				assert(Result.isFailure(response[0]));
				expectQueryError(response[0].failure, failing.toSQL().sql, '23503');
				expect(response[1]).toStrictEqual(Result.succeed([{ id: 1 }]));
				assert(Result.isFailure(response[2]));
				expectQueryError(response[2].failure, 'select 1/0', '22012');

				expect(yield* db.select({ name: usersTable.name }).from(usersTable)).toEqual([{ name: 'Survivor' }]);
			}));

		// ---- migrator ----

		it.effect('migrator : default migration strategy', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;

				yield* migrate(db, { migrationsFolder: './drizzle2/pg' });
				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

				expect(yield* db.select().from(usersMigratorTable)).toEqual([{ id: 1, name: 'John', email: 'email' }]);
			}));

		it.effect('migrator : a failing migration leaves nothing applied', () =>
			Effect.gen(function*() {
				const db = yield* DBTag;

				const migrationDir = './migrations/effect-drizzle-postgres-neon-http-fail';
				if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
				mkdirSync(`${migrationDir}/20240101010101_ok`, { recursive: true });
				writeFileSync(`${migrationDir}/20240101010101_ok/migration.sql`, 'CREATE TABLE "neon_mig_ok" ("id" integer);');
				mkdirSync(`${migrationDir}/20240202020202_bad`, { recursive: true });
				writeFileSync(`${migrationDir}/20240202020202_bad/migration.sql`, 'CREATE TABLE "neon_mig_ok" ("id" integer);');

				const error = yield* Effect.flip(migrate(db, { migrationsFolder: migrationDir }));
				rmSync(migrationDir, { recursive: true });
				expect(errorMessages(error)).toMatch(/already exists/i);

				const present = yield* db.execute<{ present: boolean }>(
					sql`select to_regclass('public.neon_mig_ok') is not null as present`,
				);
				expect(present.rows[0]!.present).toBe(false);

				const applied = yield* db.execute<{ n: number }>(
					sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
				);
				expect(applied.rows[0]!.n).toBe(0);
			}));
	},
});
