// Redefinitions of shared all-types tests for drivers that can't decode some column types without losing data: those
// drivers throw on such columns' non-null values, the copies below use nullable columns filled with `null`, which never
// reaches a decoder, or values the drivers return intact. Drivers skip the originals by the exported names and call the
// function in their own test files.
import {
	allTypesRelations,
	type AllTypesReplacements,
	assertAllTypesWithReplacements,
	makeAllTypes,
} from './all-types';
import type { Test } from './instrumentation';

/** Shared all-types tests, redefined by {@link allTypesWithReplacementsTests} */
export const allTypesWithReplacementsSkips = [
	'all types',
	'all types ~codecs~',
];

/**
 * All-types round trips with values replaced - `null`s for column types a driver throws on, decodable values for values
 * it can't return. Unions, bounds and temporal bounds of the original tests aren't repeated
 */
export function allTypesWithReplacementsTests(test: Test, replacements: AllTypesReplacements) {
	test('all types (with replacements)', async ({ createDB, push }) => {
		const { en, allTypesTable } = makeAllTypes('all_types_replaced', 'en_replaced');
		await push({ en, allTypesTable });
		const db = createDB({ allTypesTable }, allTypesRelations as any);

		await assertAllTypesWithReplacements(db, allTypesTable as any, replacements, { rqb: true });
	});
}
