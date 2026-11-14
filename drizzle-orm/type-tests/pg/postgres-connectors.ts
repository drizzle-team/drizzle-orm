// Result types of the Drizzle Postgres connectors' own methods: batch and pipeline on the async connector
// (drizzle-orm/postgres), and batch, pipeline and the bulk writes on the Effect one (drizzle-orm/effect-drizzle-postgres).
import type { BatchMetrics } from '#postgres';
import type { DrizzlePostgresClient } from '#postgres/effect/core';
import type * as Effect from 'effect/Effect';
import type * as Result from 'effect/Result';
import type { SqlError } from 'effect/sql/SqlError';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { SettledQueryResult } from '~/batch.ts';
import type { EffectCacheError } from '~/cache/core/cache-effect.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectPostgresDatabase } from '~/effect-drizzle-postgres/index.ts';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { drizzle, type PostgresBulkResult } from '~/postgres/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';

const items = pgTable('items', { id: integer().primaryKey(), name: text().notNull(), note: text() });
type Item = { id: number; name: string; note: string | null };
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// ---- async connector ----

const db = drizzle.mock();

async function asyncConnector() {
	// batch: a tuple of results, in order
	const batched = await db.batch([
		db.select().from(items),
		db.insert(items).values({ id: 1, name: 'a' }).returning({ id: items.id }),
		db.update(items).set({ note: 'n' }).where(eq(items.id, 1)).returning({ note: items.note }),
	]);
	Expect<Equal<typeof batched, [Item[], { id: number }[], { note: string | null }[]]>>;

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

	// pipeline: the same tuple, the first failure fails it; Effect.result keeps each outcome
	const piped = edb.pipeline([edb.select().from(items), edb.delete(items).returning({ id: items.id })]);
	Expect<
		Equal<
			typeof piped,
			Effect.Effect<[Item[], { id: number }[]], EffectDrizzleQueryError | SqlError, never>
		>
	>;
}

declare const resultOf: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<Result.Result<A, E>, never, R>;

{
	const settled = edb.pipeline([resultOf(edb.select().from(items))]);
	Expect<Equal<typeof settled, Effect.Effect<[Result.Result<Item[], EffectDrizzleQueryError>], SqlError, never>>>;
}

{
	// Bulk writes. Unlike queries, whose cache failures arrive inside EffectDrizzleQueryError, a failed cache
	// invalidation after a bulk write fails with EffectCacheError itself.
	type BulkFailure = DrizzlePostgresClient.BulkError | EffectCacheError;
	const inserted = edb.bulkInsert(items, [{ id: 1, name: 'a' }, { id: 2, name: 'b', note: null }]);
	Expect<Equal<typeof inserted, Effect.Effect<PostgresBulkResult, BulkFailure, never>>>;

	const updated = edb.bulkUpdate(items, [{ id: 1, name: 'b' }], { by: items.id });
	Expect<Equal<typeof updated, Effect.Effect<PostgresBulkResult, BulkFailure, never>>>;

	// @ts-expect-error - missing required column
	edb.bulkInsert(items, [{ id: 1 }]);
	// @ts-expect-error - missing key column
	edb.bulkUpdate(items, [{ name: 'b' }], { by: items.id });
}
