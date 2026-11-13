import 'dotenv/config';
import { type ExtractTablesFromSchema, getColumns, type RelationsBuilder } from 'drizzle-orm';
import { SingleStoreSession } from 'drizzle-orm/singlestore-core';
import { expect, expectTypeOf } from 'vitest';
import { UpstashTestCache } from '~/upstash-cache';
import {
	type AllTypes,
	allTypesData,
	allTypesRelations,
	allTypesTable,
	assertAllTypesBounds,
	assertAllTypesTemporalBounds,
	boundsRelations,
	boundsSchema,
	makeAllTypes,
} from './all-types';
import type { Test } from './instrumentation';
import { normalizeDataWithDbCodecs } from './utils';

// Redefinitions of shared all-types tests for drivers that read results in the text protocol: SingleStore rounds `float`
// to 6 significant digits there and drivers have no per-query alternative (a driver quirk). The copies below hold a
// `float` value that rounds to itself, and leave out the original tests' unions, which pair `float` with other columns.
// Drivers skip the originals by the exported names and call the function in their test files.

/** Shared tests holding `float` values, redefined by {@link floatReplacedTests} */
export const floatReplacedSkips = [
	'all types',
	'all types ~codecs~',
	'all types - upstash',
	'all types ~codecs~ - upstash',
];

/** Copies of {@link floatReplacedSkips} with `float` values replaced with `null` */
export function floatReplacedTests(test: Test) {
	const data: AllTypes = { ...allTypesData, float: 1.0486 };

	const upstashTable = makeAllTypes('all_types_upstash');
	const upstashCodecsTable = makeAllTypes('all_types_cdcs_upstash');
	const upstashSchema = { allTypesTable: upstashTable, ...boundsSchema };
	const upstashCodecsSchema = { allTypesTable: upstashCodecsTable, ...boundsSchema };
	const upstashRelations = (r: RelationsBuilder<ExtractTablesFromSchema<typeof upstashSchema>>) => ({
		...allTypesRelations(r),
		...boundsRelations(r),
	});

	test.concurrent('all types (float replaced)', async ({ db, push }) => {
		const allTypesTable = makeAllTypes('all_types');
		await push({ allTypesTable });

		await db.insert(allTypesTable).values(data);

		const rawRes = await db.select().from(allTypesTable);

		expectTypeOf(rawRes).toEqualTypeOf<AllTypes[]>();
		expect(rawRes).toStrictEqual([data]);

		await assertAllTypesBounds(db);
		await assertAllTypesTemporalBounds(db);
	});

	test.concurrent('all types ~codecs~ (float replaced)', async ({ createDB, push }) => {
		const db = createDB({ allTypesTable, ...boundsSchema }, (r) => ({
			...allTypesRelations(r),
			...boundsRelations(r),
		}));
		await push({ allTypesTable });

		await db.insert(allTypesTable).values(data);

		const session = (<any> db).session as SingleStoreSession;
		// query-path raw values come from a mapped prepared query, so that per-query parser overrides apply as for regular selects
		const queryRes = await (<any> session).prepareQuery(
			(<any> db).dialect.sqlToQuery(db.select().from(allTypesTable).getSQL()),
			'arrays',
			(rows: unknown[][]) => rows,
		).execute().then((e: unknown[][]) =>
			normalizeDataWithDbCodecs({
				db,
				columns: getColumns(allTypesTable),
				data: e,
				mode: 'query',
			})[0]
		);

		const { relationRes, rootRes } = await (<any> session).prepareQuery(
			// with a mapper, as drizzle runs its queries: the driver returns raw text for codecs only then
			(<any> db).dialect.sqlToQuery(
				db.query.allTypesTable.findFirst({
					with: {
						self: true,
					},
				}).getSQL(),
			),
			'objects',
			(rows: unknown[]) => rows,
		).execute().then((e: (AllTypes & { self: string })[]) => {
			const { self: relationRaw, ...rootRaw } = e[0]!;

			return {
				relationRes: normalizeDataWithDbCodecs({
					db,
					columns: getColumns(allTypesTable),
					data: relationRaw,
					mode: 'json',
				})[0]!,
				rootRes: normalizeDataWithDbCodecs({
					db,
					columns: getColumns(allTypesTable),
					data: [rootRaw],
					mode: 'query',
				})[0]!,
			};
		});

		expect(queryRes).toStrictEqual(data);
		expect(relationRes).toStrictEqual(data);
		expect(rootRes).toStrictEqual(data);

		await assertAllTypesBounds(db, { rqb: true });
		await assertAllTypesTemporalBounds(db, { rqb: true });
	});

	test('all types - upstash (float replaced)', async ({ createDB, push }) => {
		await using cache = new UpstashTestCache();
		const { run } = cache;
		const table = upstashTable;
		const db = createDB(upstashSchema, upstashRelations, false, false, cache);
		await push({ table });

		await cache.expectHits('all types', async () => {
			await run(db.insert(table).values(data));
			expect(await run(db.select().from(table))).toStrictEqual([data]);
		});
		await cache.expectHits('bounds', () => assertAllTypesBounds(db, { run }));
		await cache.expectHits('temporal bounds', () => assertAllTypesTemporalBounds(db, { run }));
	});

	test('all types ~codecs~ - upstash (float replaced)', async ({ createDB, push }) => {
		await using cache = new UpstashTestCache();
		const { run } = cache;
		const table = upstashCodecsTable;
		const db = createDB(
			upstashCodecsSchema,
			(r) => ({
				...allTypesRelations(r),
				...boundsRelations(r),
			}),
			false,
			false,
			cache,
		);
		await push({ table });

		await cache.expectHits('all types', async () => {
			await run(db.insert(table).values(data));
			expect(await run(db.query.allTypesTable.findFirst({ with: { self: true } }))).toStrictEqual({
				...data,
				self: [data],
			});
		});
		await cache.expectHits('bounds', () => assertAllTypesBounds(db, { run, rqb: true }));
		await cache.expectHits('temporal bounds', () => assertAllTypesTemporalBounds(db, { run, rqb: true }));
	});
}
