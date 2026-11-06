import { sql } from 'drizzle-orm';
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core';
import { expect, expectTypeOf } from 'vitest';
import type { AllTypesTable, BoundsRow, RunQuery, TemporalBoundsRow } from './all-types.data';
import {
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
	{ run = awaitQuery, rqb = false }: { run?: RunQuery; rqb?: boolean } = {},
) {
	await run(db.run(sql.raw(dropBounds())));
	await run(db.run(sql.raw(createBounds())));

	try {
		await run(db.insert(boundsTable).values(boundsData));

		const query = db.select().from(boundsTable).orderBy(boundsTable.id);
		expectTypeOf<(typeof query)['_']['result']>().toEqualTypeOf<BoundsRow[]>();

		expect(await run(query)).toStrictEqual(boundsData);
		if (rqb) {
			expect(
				await run((<any> db).query.boundsTable.findMany({ orderBy: { id: 'asc' }, with: { self: true } })),
			).toStrictEqual(boundsData.map((row) => ({ ...row, self: [row] })));
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
