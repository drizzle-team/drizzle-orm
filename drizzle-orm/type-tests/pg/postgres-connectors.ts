// Result types of the Drizzle Postgres connectors' own methods: batch and pipeline on the async connector
// (drizzle-orm/postgres), batch, pipeline and the bulk writes on the Effect one (drizzle-orm/effect-drizzle-postgres), and
// the Effect Aurora and HTTP branches (drizzle-orm/effect-drizzle-postgres/aurora, drizzle-orm/effect-drizzle-postgres/http).
import type { BatchMetrics } from '#postgres';
import { DrizzleAuroraClient } from '#postgres/effect/aurora';
import type { DrizzlePostgresClient } from '#postgres/effect/core';
import { DrizzlePostgresHttpClient } from '#postgres/effect/http';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import type * as Result from 'effect/Result';
import type { SqlError } from 'effect/sql/SqlError';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { SettledQueryResult } from '~/batch.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import * as PostgresAuroraDrizzle from '~/effect-drizzle-postgres/aurora/index.ts';
import * as PostgresHttpDrizzle from '~/effect-drizzle-postgres/http/index.ts';
import * as PostgresNeonHttpDrizzle from '~/effect-drizzle-postgres/http/neon.ts';
import type { EffectPostgresDatabase } from '~/effect-drizzle-postgres/index.ts';
import { drizzle as drizzleNeonHttp } from '~/neon-http/index.ts';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { drizzle, type PostgresBulkResult } from '~/postgres/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';

const items = pgTable('items', { id: integer().primaryKey(), name: text().notNull(), note: text() });
type Item = { id: number; name: string; note: string | null };
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// ---- async connector ----

const db = drizzle.mock();
const neonDb = drizzleNeonHttp.mock();

async function asyncConnector() {
	// batch: a tuple of results, in order
	const batched = await db.batch([
		db.select().from(items),
		db.insert(items).values({ id: 1, name: 'a' }).returning({ id: items.id }),
		db.update(items).set({ note: 'n' }).where(eq(items.id, 1)).returning({ note: items.note }),
	]);
	Expect<Equal<typeof batched, [Item[], { id: number }[], { note: string | null }[]]>>;

	// `$count` runs in a batch like any builder, resolving to the count
	const counted = await db.batch([db.$count(items), db.$count(items, eq(items.id, 1)), db.select().from(items)]);
	Expect<Equal<typeof counted, [number, number, Item[]]>>;
	const countedPipeline = await db.pipeline([
		db.$count(items),
		db.execute<{ n: number }>(sql`select 1 as n`, 'objects'),
	]);
	Expect<Equal<typeof countedPipeline, [SettledQueryResult<number>, SettledQueryResult<{ n: number }[]>]>>;

	const neonCounted = await neonDb.batch([neonDb.$count(items), neonDb.select({ id: items.id }).from(items)]);
	Expect<Equal<typeof neonCounted, [number, { id: number }[]]>>;

	// Prepared and bound statements in a batch give what executing them gives
	const getItem = db.select({ name: items.name }).from(items).where(eq(items.id, sql.placeholder('id'))).prepare(
		'get_item',
	);
	const bound = await db.batch([getItem.bind({ id: 1 }), getItem.bind({ id: 2 })]);
	const executed = await getItem.execute({ id: 1 });
	// Checked element by element: the tuple prints as `[{ name: string }[], { name: string }[]]` and each element is
	// identical to it, but Equal's identity check fails on the tuple as a whole, which comes out of a mapped type
	Expect<Equal<typeof bound['length'], 2>>;
	Expect<Equal<typeof bound[0], { name: string }[]>>;
	Expect<Equal<typeof bound[1], { name: string }[]>>;
	Expect<Equal<typeof bound[0], typeof executed>>;
	Expect<MutuallyAssignable<typeof bound, [{ name: string }[], { name: string }[]]>>;

	// With metrics, the tuple also carries the batch's telemetry
	const measured = await db.batch([db.select().from(items)], { metrics: true });
	Expect<Equal<typeof measured[0], Item[]>>;
	Expect<Equal<typeof measured.metrics, BatchMetrics>>;

	// pipeline: each statement's outcome, settled
	const piped = await db.pipeline([db.select().from(items), db.delete(items).returning({ id: items.id })]);
	Expect<Equal<typeof piped, [SettledQueryResult<Item[]>, SettledQueryResult<{ id: number }[]>]>>;
}
asyncConnector;

// ---- Effect connector ----

declare const edb: EffectPostgresDatabase;

{
	// batch: one transaction, a tuple of results
	const batched = edb.batch([
		edb.select().from(items),
		edb.insert(items).values({ id: 1, name: 'a' }).returning({ id: items.id }),
	]);
	Expect<
		Equal<
			typeof batched,
			Effect.Effect<[Item[], { id: number }[]], EffectDrizzleQueryError | SqlError, never>
		>
	>;

	// pipeline: one connection, no transaction; each query settles on it's own
	const piped = edb.pipeline([edb.select().from(items), edb.delete(items).returning({ id: items.id })]);
	Expect<
		Equal<
			typeof piped,
			Effect.Effect<
				[Result.Result<Item[], EffectDrizzleQueryError>, Result.Result<{ id: number }[], EffectDrizzleQueryError>],
				SqlError,
				never
			>
		>
	>;

	// parallel: fanned out across pooled connections; each query settles on it's own, and nothing fails the whole
	const fanned = edb.parallel([edb.select().from(items), edb.delete(items).returning({ id: items.id })]);
	Expect<
		Equal<
			typeof fanned,
			Effect.Effect<
				[Result.Result<Item[], EffectDrizzleQueryError>, Result.Result<{ id: number }[], EffectDrizzleQueryError>],
				never,
				never
			>
		>
	>;

	// batch options: the transaction settings of the async driver
	edb.batch([edb.select().from(items)], {
		isolation: 'repeatable read',
		snapshot: '00000003-0000001B-1',
		readOnly: true,
	});
	// @ts-expect-error - `snapshot` needs `isolation: 'repeatable read' | 'serializable'`
	edb.batch([edb.select().from(items)], { isolation: 'read committed', snapshot: 's' });
}

{
	// prepared queries, and prepared queries with bound placeholder values, run under their statement name
	const byId = edb.select().from(items).where(eq(items.id, sql.placeholder('id'))).prepare('by_id');
	const counted = edb.batch([byId.bind({ id: 1 }), byId, edb.$count(items)]);
	Expect<Equal<typeof counted, Effect.Effect<[Item[], Item[], number], EffectDrizzleQueryError | SqlError, never>>>;

	const settled = edb.pipeline([byId.bind({ id: 2 })]);
	Expect<Equal<typeof settled, Effect.Effect<[Result.Result<Item[], EffectDrizzleQueryError>], SqlError, never>>>;
}

{
	// Effects are not batch items: as in the async driver, they take builders and prepared queries
	// @ts-expect-error - an arbitrary Effect
	edb.batch([Effect.succeed(1)]);
	// @ts-expect-error - a query's Effect once run with `.execute()`
	edb.pipeline([edb.select().from(items).prepare('p').execute()]);
	// @ts-expect-error - Effect.result of a query
	edb.parallel([Effect.result(edb.select().from(items))]);
}

{
	// Bulk writes
	type BulkFailure = DrizzlePostgresClient.BulkError;
	const inserted = edb.bulkInsert(items, [{ id: 1, name: 'a' }, { id: 2, name: 'b', note: null }]);
	Expect<Equal<typeof inserted, Effect.Effect<PostgresBulkResult, BulkFailure, never>>>;

	const updated = edb.bulkUpdate(items, [{ id: 1, name: 'b' }], { by: items.id });
	Expect<Equal<typeof updated, Effect.Effect<PostgresBulkResult, BulkFailure, never>>>;

	// @ts-expect-error - missing required column
	edb.bulkInsert(items, [{ id: 1 }]);
	// @ts-expect-error - missing key column
	edb.bulkUpdate(items, [{ name: 'b' }], { by: items.id });
}

// ---- Effect Aurora branch ----

{
	const dbEffect = PostgresAuroraDrizzle.make();
	Expect<
		Equal<
			typeof dbEffect,
			Effect.Effect<
				PostgresAuroraDrizzle.EffectPostgresAuroraDatabase<{}> & {
					$client: DrizzleAuroraClient.DrizzleAuroraClient & import('effect/sql/SqlClient').SqlClient;
				},
				never,
				DrizzleAuroraClient.DrizzleAuroraClient | import('~/effect-core/logger.ts').EffectLogger
			>
		>
	>;

	// `$client` keeps the full service shape, so it can be re-provided through the native service API
	Effect.gen(function*() {
		const adb = yield* PostgresAuroraDrizzle.makeWithDefaults();
		return Context.make(DrizzleAuroraClient.DrizzleAuroraClient, adb.$client);
	});
}

declare const adb: PostgresAuroraDrizzle.EffectPostgresAuroraDatabase;

{
	const selected = adb.select().from(items);
	Expect<Equal<Effect.Success<typeof selected>, Item[]>>;
	Expect<Equal<Effect.Error<typeof selected>, EffectDrizzleQueryError>>;

	// the Data API runs no batch of statements of it's own
	// @ts-expect-error - no batch
	adb.batch;
	// @ts-expect-error - no bulk writes
	adb.bulkInsert;
}

// ---- Effect HTTP branch ----

{
	const dbEffect = PostgresHttpDrizzle.make();
	Expect<
		Equal<
			typeof dbEffect,
			Effect.Effect<
				PostgresHttpDrizzle.EffectPostgresHttpDatabase<{}> & {
					$client: DrizzlePostgresHttpClient.DrizzlePostgresHttpClient;
				},
				never,
				DrizzlePostgresHttpClient.DrizzlePostgresHttpClient | import('~/effect-core/logger.ts').EffectLogger
			>
		>
	>;

	Effect.gen(function*() {
		const hdb = yield* PostgresHttpDrizzle.makeWithDefaults();
		return Context.make(DrizzlePostgresHttpClient.DrizzlePostgresHttpClient, hdb.$client);
	});
}

declare const hdb: PostgresHttpDrizzle.EffectPostgresHttpDatabase;

{
	// batch: builders, not Effects - one transaction in one request, a tuple of results
	const batched = hdb.batch([
		hdb.select().from(items),
		hdb.insert(items).values({ id: 1, name: 'a' }).returning({ id: items.id }),
		hdb.$count(items),
		hdb.execute<{ id: number }>(sql`select 1 as id`, 'objects'),
	], { isolation: 'serializable', readOnly: false });
	Expect<
		Equal<
			typeof batched,
			Effect.Effect<[Item[], { id: number }[], number, { id: number }[]], EffectDrizzleQueryError | SqlError, never>
		>
	>;

	// pipeline: each query settles on it's own
	const piped = hdb.pipeline([hdb.select().from(items), hdb.delete(items).returning({ id: items.id })]);
	Expect<
		Equal<
			typeof piped,
			Effect.Effect<
				[Result.Result<Item[], EffectDrizzleQueryError>, Result.Result<{ id: number }[], EffectDrizzleQueryError>],
				SqlError,
				never
			>
		>
	>;

	// parallel: each query is it's own request, and never fails the whole
	const fanned = hdb.parallel([hdb.select().from(items), hdb.delete(items).returning({ id: items.id })]);
	Expect<
		Equal<
			typeof fanned,
			Effect.Effect<
				[Result.Result<Item[], EffectDrizzleQueryError>, Result.Result<{ id: number }[], EffectDrizzleQueryError>],
				never,
				never
			>
		>
	>;

	// @ts-expect-error - Effects are not batch items: HTTP sends built statements
	hdb.batch([Effect.succeed(1)]);
	// @ts-expect-error - no bulk writes over HTTP
	hdb.bulkInsert;
}

declare const ndb: PostgresNeonHttpDrizzle.EffectPostgresNeonHttpDatabase;

{
	const dbEffect = PostgresNeonHttpDrizzle.make();
	Expect<
		Equal<
			Effect.Success<typeof dbEffect>,
			PostgresNeonHttpDrizzle.EffectPostgresNeonHttpDatabase<{}> & {
				$client: DrizzlePostgresHttpClient.DrizzlePostgresHttpClient;
			}
		>
	>;

	const batched = ndb.batch([ndb.select().from(items), ndb.$count(items)]);
	Expect<Equal<typeof batched, Effect.Effect<[Item[], number], EffectDrizzleQueryError | SqlError, never>>>;

	const fanned = ndb.parallel([ndb.select().from(items)]);
	Expect<Equal<typeof fanned, Effect.Effect<[Result.Result<Item[], EffectDrizzleQueryError>], never, never>>>;

	// No `pipeline`: Neon's multi-statement endpoint always wraps the set in a transaction (that is `batch`)
	// @ts-expect-error - no pipeline on Neon
	ndb.pipeline;
}
