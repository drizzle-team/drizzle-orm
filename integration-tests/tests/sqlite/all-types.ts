import { sql } from 'drizzle-orm';
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core';
import { expect, expectTypeOf } from 'vitest';
import type { AllTypes, AllTypesTable, BoundsRow, RunQuery, TemporalBoundsRow } from './all-types.data';
import {
	allTypesData,
	allTypesInput,
	allTypesTable as defaultAllTypesTable,
	allTypesUnionCases,
	boundsData,
	boundsTable,
	createBounds,
	createTemporalBounds,
	dropBounds,
	dropTemporalBounds,
	temporalBoundsData,
	temporalBoundsTable,
} from './all-types.data';

export * from './all-types.data';

const awaitQuery: RunQuery = (query) => query;

/** Replacements of {@link allTypesInput} / {@link allTypesData} values for drivers that can't decode some of them */
export type AllTypesReplacements = { [K in keyof AllTypes]?: AllTypes[K] };

/**
 * Values of integer `numeric` columns outside of the safe integer range replaced with `null`: drivers configured to
 * return integers as numbers have already lost their precision and throw an unsupported column type error
 */
export const safeIntegerReplacements: AllTypesReplacements = { numericBig: null };

export const allTypesInputWith = (replacements: AllTypesReplacements): AllTypes => ({
	...allTypesInput,
	...replacements,
});
export const allTypesDataWith = (replacements: AllTypesReplacements): AllTypes => ({
	...allTypesData,
	...replacements,
});

const isUnsafeInteger = (value: unknown) =>
	(typeof value === 'bigint' || (typeof value === 'string' && /^-?\d+$/.test(value)))
	&& !Number.isSafeInteger(Number(value));

/** {@link boundsData} with `numeric` values outside of the safe integer range replaced with `null` */
export const safeIntegerBoundsData: BoundsRow[] = boundsData.map((row) => ({
	...row,
	numericBig: isUnsafeInteger(row.numericBig) ? null : row.numericBig,
	numericStr: isUnsafeInteger(row.numericStr) ? null : row.numericStr,
}));

export async function assertAllTypesUnions(
	db: SQLiteAsyncDatabase<any, any, any>,
	allTypesTable: AllTypesTable = defaultAllTypesTable,
	run: RunQuery = awaitQuery,
	/** Replacements the table's row was inserted with: `'a ∪ b'` takes `a`'s value from the left branch, `b`'s from the right */
	replacements: AllTypesReplacements = {},
) {
	for (const { query, expected } of allTypesUnionCases(db, allTypesTable)) {
		const [left, right] = expected;
		const replaced = [left, right].map((row, branch) =>
			Object.fromEntries(
				Object.entries(row!).map(([key, value]) => {
					const source = key.split(' ∪ ')[branch] as keyof AllTypes;
					return [key, source in replacements ? replacements[source] : value];
				}),
			)
		);
		expect(await run(query)).toEqual(expect.arrayContaining(replaced));
	}
}

export async function assertAllTypesBounds(
	db: SQLiteAsyncDatabase<any, any, any>,
	{ run = awaitQuery, rqb = false, data = boundsData }: { run?: RunQuery; rqb?: boolean; data?: BoundsRow[] } = {},
) {
	await run(db.run(sql.raw(dropBounds())));
	await run(db.run(sql.raw(createBounds())));

	try {
		await run(db.insert(boundsTable).values(data));

		const query = db.select().from(boundsTable).orderBy(boundsTable.id);
		expectTypeOf<(typeof query)['_']['result']>().toEqualTypeOf<BoundsRow[]>();

		expect(await run(query)).toStrictEqual(data);
		if (rqb) {
			expect(
				await run((<any> db).query.boundsTable.findMany({ orderBy: { id: 'asc' }, with: { self: true } })),
			).toStrictEqual(data.map((row) => ({ ...row, self: [row] })));
		}
	} finally {
		await run(db.run(sql.raw(dropBounds())));
	}
}

export async function assertAllTypesTemporalBounds(
	db: SQLiteAsyncDatabase<any, any, any>,
	{ run = awaitQuery, rqb = false }: { run?: RunQuery; rqb?: boolean } = {},
) {
	await run(db.run(sql.raw(dropTemporalBounds())));
	await run(db.run(sql.raw(createTemporalBounds())));

	try {
		await run(db.insert(temporalBoundsTable).values(temporalBoundsData));

		const query = db.select().from(temporalBoundsTable).orderBy(temporalBoundsTable.id);
		expectTypeOf<(typeof query)['_']['result']>().toEqualTypeOf<TemporalBoundsRow[]>();

		expect(await run(query)).toStrictEqual(temporalBoundsData);
		if (rqb) {
			expect(
				await run((<any> db).query.temporalBoundsTable.findMany({ orderBy: { id: 'asc' }, with: { self: true } })),
			).toStrictEqual(temporalBoundsData.map((row) => ({ ...row, self: [row] })));
		}
	} finally {
		await run(db.run(sql.raw(dropTemporalBounds())));
	}
}
