import { sql } from 'drizzle-orm';
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core';
import { expect, expectTypeOf } from 'vitest';
import type { AllTypesTable, BoundsRow, RunQuery } from './all-types.data';
import {
	allTypesTable as defaultAllTypesTable,
	allTypesUnionCases,
	boundsData,
	boundsTable,
	createBounds,
	dropBounds,
} from './all-types.data';

export * from './all-types.data';

const awaitQuery: RunQuery = (query) => query;

export async function assertAllTypesUnions(
	db: SQLiteAsyncDatabase<any, any, any>,
	allTypesTable: AllTypesTable = defaultAllTypesTable,
	run: RunQuery = awaitQuery,
) {
	for (const { query, expected } of allTypesUnionCases(db, allTypesTable)) {
		expect(await run(query)).toEqual(expect.arrayContaining(expected));
	}
}

export async function assertAllTypesBounds(
	db: SQLiteAsyncDatabase<any, any, any>,
	run: RunQuery = awaitQuery,
) {
	await run(db.run(sql.raw(dropBounds())));
	await run(db.run(sql.raw(createBounds())));

	try {
		await run(db.insert(boundsTable).values(boundsData));

		const query = db.select().from(boundsTable).orderBy(boundsTable.id);
		expectTypeOf<(typeof query)['_']['result']>().toEqualTypeOf<BoundsRow[]>();

		expect(await run(query)).toStrictEqual(boundsData);
	} finally {
		await run(db.run(sql.raw(dropBounds())));
	}
}
