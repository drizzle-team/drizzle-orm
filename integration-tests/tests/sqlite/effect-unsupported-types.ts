import { expect, expectTypeOf, it, Vitest } from '@effect/vitest';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { withUpstashCache } from '~/upstash-cache';
import type { AllTypes } from './all-types';
import {
	allTypesDataWith,
	allTypesInputWith,
	assertAllTypesBounds,
	assertAllTypesTemporalBounds,
	assertAllTypesUnions,
	makeAllTypes,
	safeIntegerBoundsData,
	safeIntegerReplacements,
} from './all-types';
import { DB, push, type RunCommonEffectSQLiteTestsOptions } from './effect-common';

// Redefinitions of shared Effect tests for drivers returning integers as numbers: integer `numeric` values outside of the
// safe integer range have already lost precision and throw (an unsupported column type error, or the driver's own error),
// the copies below hold `null`s or safe integers in their place. Drivers skip the originals by the exported names and
// register the copies via `addTests`.

/** Shared tests holding unsafe integers in `numeric` columns, redefined by {@link unsafeNumericTests} */
export const unsafeNumericSkips = ['all types', 'all types - upstash'];

/** Copies of {@link unsafeNumericSkips} with unsafe `numeric` integers replaced */
export const unsafeNumericTests = (
	it: Vitest.MethodsNonLive<DB | SqlClient>,
	createDB: RunCommonEffectSQLiteTestsOptions['createDB'],
) => {
	const input = allTypesInputWith(safeIntegerReplacements);
	const data = allTypesDataWith(safeIntegerReplacements);

	it.effect('all types (safe integers)', () =>
		Effect.gen(function*() {
			const allTypesTable = makeAllTypes('all_types');

			const db = yield* DB;
			yield* push(db, { allTypesTable });

			yield* db.insert(allTypesTable).values(input);

			const rawRes = yield* db.select().from(allTypesTable);

			expectTypeOf(rawRes).toEqualTypeOf<AllTypes[]>();
			expect(rawRes).toStrictEqual([data]);

			const context = yield* Effect.context<never>();
			const run = (query: any) => Effect.runPromiseWith(context)(query);

			yield* Effect.promise(() => assertAllTypesUnions(db as any, allTypesTable, run, safeIntegerReplacements));
			yield* Effect.promise(() => assertAllTypesBounds(db as any, { run, data: safeIntegerBoundsData }));
			yield* Effect.promise(() => assertAllTypesTemporalBounds(db as any, { run }));
		}));

	it.effect('all types - upstash (safe integers)', () =>
		withUpstashCache((cache, run) =>
			Effect.gen(function*() {
				const allTypesTable = makeAllTypes('all_types_upstash');
				const db = yield* createDB({ allTypesTable }, () => ({}), false, cache);
				yield* db.run(sql`drop table if exists ${allTypesTable}`);
				yield* push(db, { allTypesTable });

				const query = db.select().from(allTypesTable);
				yield* Effect.promise(async () => {
					await cache.expectHits('all types', async () => {
						await run(db.insert(allTypesTable).values(input));

						expect(await run(query)).toStrictEqual([data]);
						expect(await run(query.all())).toStrictEqual([data]);
						expect(await run(query.get())).toStrictEqual(data);
						expect(await run(query.values())).toHaveLength(1);
					});
				});

				// `.run()` is never read from or written to cache (checked by the cache suites), but mutations it executes still invalidate
				yield* db.delete(allTypesTable).run();
				yield* Effect.promise(async () => {
					expect(await run(query)).toStrictEqual([]);
				});
				yield* db.insert(allTypesTable).values(input).run();

				yield* Effect.promise(async () => {
					await cache.expectHits(
						'unions',
						() => assertAllTypesUnions(db as any, allTypesTable, run, safeIntegerReplacements),
					);
					await cache.expectHits('bounds', () => assertAllTypesBounds(db as any, { run, data: safeIntegerBoundsData }));
					await cache.expectHits('temporal bounds', () => assertAllTypesTemporalBounds(db as any, { run }));
				});
			})
		));
};
