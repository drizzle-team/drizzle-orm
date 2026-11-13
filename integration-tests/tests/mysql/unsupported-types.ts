// Redefinitions of shared all-types tests for drivers that can't return some values as stored: the copies below
// replace them - `null`s (nullable columns, `null` never reaches a decoder) or values the drivers return intact. Drivers
// skip the originals by the exported names and call the function in their test files.
import { UpstashTestCache } from '~/upstash-cache';
import { type AllTypesReplacements, assertAllTypesWithReplacements, makeAllTypes } from './all-types';
import type { Test } from './instrumentation';

/** Shared all-types tests, redefined by {@link allTypesWithReplacementsTests} */
export const allTypesWithReplacementsSkips = [
	'all types',
	'all types - upstash',
	'all types ~codecs~',
	'all types ~codecs~ - upstash',
];

/**
 * All-types round trips with values replaced. Unions, bounds and temporal bounds of the original tests aren't repeated
 */
export function allTypesWithReplacementsTests(test: Test, replacements: AllTypesReplacements, { rqb = true } = {}) {
	const config = (allTypesTable: ReturnType<typeof makeAllTypes>, cache?: UpstashTestCache) => ({
		schema: { allTypesTable },
		cb: (r: any) => ({
			allTypesTable: {
				self: r.many.allTypesTable({ from: r.allTypesTable.serial, to: r.allTypesTable.serial }),
			},
		}),
		cache,
	});

	test('all types (with replacements)', async ({ createDB, push }) => {
		const table = makeAllTypes('all_types_replaced');
		await push({ table });
		const db = createDB(config(table) as any);

		await assertAllTypesWithReplacements(db as any, table as any, replacements, { rqb });
	});

	test('all types (with replacements) - upstash', async ({ createDB, push }) => {
		await using cache = new UpstashTestCache();
		const table = makeAllTypes('all_types_replaced_upstash');
		await push({ table });
		const db = createDB(config(table, cache) as any);

		await cache.expectHits(
			'all types',
			() => assertAllTypesWithReplacements(db as any, table as any, replacements, { run: cache.run, rqb }),
		);
	});
}
