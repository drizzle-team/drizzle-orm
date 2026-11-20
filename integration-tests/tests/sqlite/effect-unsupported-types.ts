import { expect, expectTypeOf, it, Vitest } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import { SqlClient } from 'effect/sql/SqlClient';
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
export const unsafeNumericSkips = ['all types'];

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
};
