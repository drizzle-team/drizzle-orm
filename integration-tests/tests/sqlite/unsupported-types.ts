import {
	exists,
	type ExtractTablesFromSchema,
	getColumns,
	getTableColumns,
	max,
	type RelationsBuilder,
	sql,
} from 'drizzle-orm';
import { customType, integer, numeric, primaryKey, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import { expect, expectTypeOf } from 'vitest';
import { UpstashTestCache } from '~/upstash-cache';
import type { AllTypes } from './all-types';
import {
	allTypesDataWith,
	allTypesInputWith,
	allTypesRelations,
	allTypesTable as allTypesCodecsTable,
	assertAllTypesBounds,
	assertAllTypesTemporalBounds,
	assertAllTypesUnions,
	boundsRelations,
	boundsSchema,
	dropAllTypes,
	makeAllTypes,
	safeIntegerBoundsData,
	safeIntegerReplacements,
} from './all-types';
import type { Test } from './instrumentation';
import { fetchDecodedQueryRows, normalizeDataWithDbCodecs } from './utils';

// Redefinitions of shared tests for drivers configured to return integers as numbers: integer `numeric` values outside of
// the safe integer range have already lost precision and throw an unsupported column type error, the copies below hold
// `null`s or safe integers in their place. Drivers skip the originals by the exported names and call the function in
// their test files.

/** Shared tests holding unsafe integers in `numeric` columns, redefined by {@link unsafeNumericTests} */
export const unsafeNumericSkips = [
	'all types',
	'all types ~codecs~',
	'all types - upstash',
	'all types ~codecs~ - upstash',
	'Column as decoder applies codecs',
	'Column as decoder applies codecs - Jit mappers',
];

/** Copies of {@link unsafeNumericSkips} with unsafe `numeric` integers replaced */
export function unsafeNumericTests(test: Test) {
	const allTypesTable = makeAllTypes('all_types');
	const input = allTypesInputWith(safeIntegerReplacements);
	const data = allTypesDataWith(safeIntegerReplacements);

	const upstashTable = makeAllTypes('all_types_upstash');
	const upstashSchema = { allTypesTable: upstashTable, ...boundsSchema };
	const upstashRelations = (r: RelationsBuilder<ExtractTablesFromSchema<typeof upstashSchema>>) => ({
		...allTypesRelations(r),
		...boundsRelations(r),
	});

	test.concurrent('all types (safe integers)', async ({ db, push }) => {
		await db.run(sql.raw(dropAllTypes('all_types')));
		await push({ allTypesTable });

		await db.insert(allTypesTable).values(input);

		const rawRes = await db.select().from(allTypesTable);

		expectTypeOf(rawRes).toEqualTypeOf<AllTypes[]>();
		expect(rawRes).toStrictEqual([data]);

		await assertAllTypesUnions(db, allTypesTable, undefined, safeIntegerReplacements);
		await assertAllTypesBounds(db, { data: safeIntegerBoundsData });
		await assertAllTypesTemporalBounds(db);
	});

	test.concurrent('all types ~codecs~ (safe integers)', async ({ createDB, push }) => {
		const allTypesTable = allTypesCodecsTable;
		const db = createDB({ allTypesTable, ...boundsSchema }, (r) => ({
			...allTypesRelations(r),
			...boundsRelations(r),
		}));

		await db.run(sql.raw(dropAllTypes('all_types_cdcs')));
		await push({ allTypesTable });

		await db.insert(allTypesTable).values(input);

		const columns = getColumns(allTypesTable);

		const queryRaw = await fetchDecodedQueryRows<Record<string, unknown>>(
			db as any,
			db.select(
				Object.fromEntries(Object.entries(getTableColumns(allTypesTable)).map(([k, v]) => [k, v.as(v.name)])),
			).from(allTypesTable).getSQL(),
		);
		const queryRes = normalizeDataWithDbCodecs({ db, columns, data: queryRaw, mode: 'query' })[0];

		const rqbRaw = await fetchDecodedQueryRows<Record<string, unknown> & { self: string }>(
			db as any,
			db.query.allTypesTable.findFirst({
				with: {
					self: true,
				},
			}).getSQL(),
		);
		const { self: relationRaw, ...rootRaw } = rqbRaw[0]!;

		const relationRes = normalizeDataWithDbCodecs({ db, columns, data: relationRaw, mode: 'json' })[0]!;
		const rootRes = normalizeDataWithDbCodecs({ db, columns, data: [rootRaw], mode: 'query' })[0]!;

		expect(queryRes).toStrictEqual(data);
		expect(relationRes).toStrictEqual(data);
		expect(rootRes).toStrictEqual(data);

		await assertAllTypesUnions(db as any, undefined, undefined, safeIntegerReplacements);
		await assertAllTypesBounds(db as any, { data: safeIntegerBoundsData, rqb: true });
		await assertAllTypesTemporalBounds(db as any, { rqb: true });
	});

	test('all types - upstash (safe integers)', async ({ createDB, push }) => {
		await using cache = new UpstashTestCache();
		const { run } = cache;
		const table = upstashTable;
		const db = createDB(upstashSchema, upstashRelations, false, false, cache);
		await db.run(sql.raw(dropAllTypes('all_types_upstash')));
		await push({ table });

		await cache.expectHits('all types', async () => {
			await run(db.insert(table).values(input));

			const query = db.select().from(table);
			expect(await run(query)).toStrictEqual([data]);
			expect(await run(() => query.all())).toStrictEqual([data]);
			expect(await run(() => query.get())).toStrictEqual(data);

			expect(await run(() => query.values())).toHaveLength(1);
		});

		// `.run()` is never read from or written to cache (checked by the cache suites), but mutations it executes still invalidate
		await db.delete(table).run();
		expect(await run(db.select().from(table))).toStrictEqual([]);
		await db.insert(table).values(input).run();

		await cache.expectHits('unions', () => assertAllTypesUnions(db as any, table, run, safeIntegerReplacements));
		await cache.expectHits('bounds', () => assertAllTypesBounds(db as any, { data: safeIntegerBoundsData, run }));
		await cache.expectHits('temporal bounds', () => assertAllTypesTemporalBounds(db as any, { run }));
	});

	test('all types ~codecs~ - upstash (safe integers)', async ({ createDB, push }) => {
		await using cache = new UpstashTestCache();
		const { run } = cache;
		const table = upstashTable;
		const db = createDB(upstashSchema, upstashRelations, false, false, cache);
		await db.run(sql.raw(dropAllTypes('all_types_upstash')));
		await push({ table });

		await cache.expectHits('all types', async () => {
			await run(db.insert(table).values(input));
			expect(await run(db.query.allTypesTable.findFirst({ with: { self: true } }))).toStrictEqual({
				...data,
				self: [data],
			});
			expect(await run(db.query.allTypesTable.findMany({ with: { self: true } }))).toStrictEqual([{
				...data,
				self: [data],
			}]);
		});
		await cache.expectHits('unions', () => assertAllTypesUnions(db as any, table, run, safeIntegerReplacements));
		await cache.expectHits(
			'bounds',
			() => assertAllTypesBounds(db as any, { data: safeIntegerBoundsData, run, rqb: true }),
		);
		await cache.expectHits('temporal bounds', () => assertAllTypesTemporalBounds(db as any, { run, rqb: true }));
	});

	test.concurrent('Column as decoder applies codecs (safe integers)', async ({ createDB, push }) => {
		let customCast = false;
		let customMap = false;

		const codecBypass = customType<{
			data: bigint;
			driverData: string;
			driverOutput: bigint;
			jsonData: string;
		}>({
			codec: 'numeric:bigint',
			dataType: () => 'numeric',
			forJsonSelect: (identifier, sql) => {
				customCast = true;
				return sql`cast(${identifier} as text)`;
			},
			fromJson: (v) => {
				customMap = true;
				return BigInt(v);
			},
			toDriver: (v) => v.toString(),
		});

		const users = sqliteTable('users_823', {
			id: integer('id').primaryKey(),
			name: text('name').notNull(),
			createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
			num: numeric('num').notNull(),
			cus: codecBypass('cus').notNull(),
		});

		const usersView = sqliteView('users_823_v').as((qb) =>
			qb.select({
				...getColumns(users),
				max: max(users.createdAt).as('max'),
				maxNum: max(users.num).as('maxNum'),
				sq: qb.select({ createdAt: users.createdAt }).from(users).as('sq'),
				sqAliased: qb.select({ createdAt: users.createdAt }).from(users).as('sq_aliased'),
				sqTag: qb.select({ tag: sql`${users.id}`.mapWith((v): string => `tag-${v}`).as('tag') }).from(users)
					.as('sq_tag'),
			}).from(users).groupBy(users.id)
		);

		const db = createDB({ users, usersView }, (r) => ({
			users: {
				self: r.one.users({
					from: r.users.id,
					to: r.users.id,
				}),
			},
			usersView: {
				self: r.one.usersView({
					from: r.usersView.id,
					to: r.usersView.id,
				}),
			},
		}));

		await db.run(sql.raw('drop view if exists users_823_v'));
		await db.run(sql.raw('drop table if exists users_823'));
		await push({ users, usersView });

		const createdAt = new Date('2025-03-12T01:32:41.000Z');
		// unsafe integers in `numeric` columns throw an unsupported column type error with this driver
		const big = 9007199254740991n;

		await db.insert(users).values({
			id: 1,
			name: 'First',
			createdAt,
			num: '475452353476',
			cus: big,
		});

		const res = await db.select({
			...getColumns(users),
			max: max(users.createdAt).as('max'),
			maxNum: max(users.num).as('maxNum'),
		}).from(users).groupBy(users.id);

		const nested = await db.query.users.findFirst({
			with: {
				self: true,
			},
		});

		const viewRes = await db.select().from(usersView);

		const viewNested = await db.query.usersView.findFirst({
			with: {
				self: true,
			},
		});

		const cols = {
			id: 1,
			name: 'First',
			createdAt,
			num: '475452353476',
			cus: big,
		};

		const aggregates = { max: createdAt, maxNum: '475452353476' };
		const subqueries = { sq: createdAt, sqAliased: createdAt, sqTag: 'tag-1' };

		expect(res).toStrictEqual([{ ...cols, ...aggregates }]);
		expect(viewRes).toStrictEqual([{ ...cols, ...aggregates, ...subqueries }]);

		expect(customCast).toBeTruthy();
		expect(customMap).toBeTruthy();

		expect(nested).toStrictEqual({ ...cols, self: cols });

		type ViewRow = typeof usersView.$inferSelect;
		type ViewNestedRow = {
			[K in keyof (ViewRow & { self: ViewRow | null })]: (ViewRow & { self: ViewRow | null })[K];
		};

		expectTypeOf(viewNested).toEqualTypeOf<ViewNestedRow | undefined>();

		expect(viewNested).toStrictEqual({
			...cols,
			...aggregates,
			...subqueries,
			self: { ...cols, ...aggregates, ...subqueries },
		});
	});

	test.concurrent('Column as decoder applies codecs - Jit mappers (safe integers)', async ({ createDB, push }) => {
		let customCast = false;
		let customMap = false;

		const codecBypass = customType<{
			data: bigint;
			driverData: string;
			driverOutput: bigint;
			jsonData: string;
		}>({
			codec: 'numeric:bigint',
			dataType: () => 'numeric',
			forJsonSelect: (identifier, sql) => {
				customCast = true;
				return sql`cast(${identifier} as text)`;
			},
			fromJson: (v) => {
				customMap = true;
				return BigInt(v);
			},
			toDriver: (v) => v.toString(),
		});

		const users = sqliteTable('users_824', {
			id: integer('id').primaryKey(),
			name: text('name').notNull(),
			createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
			num: numeric('num').notNull(),
			cus: codecBypass('cus').notNull(),
		});

		const usersView = sqliteView('users_824_v').as((qb) =>
			qb.select({
				...getColumns(users),
				max: max(users.createdAt).as('max'),
				maxNum: max(users.num).as('maxNum'),
				sq: qb.select({ createdAt: users.createdAt }).from(users).as('sq'),
				sqAliased: qb.select({ createdAt: users.createdAt }).from(users).as('sq_aliased'),
				sqTag: qb.select({ tag: sql`${users.id}`.mapWith((v): string => `tag-${v}`).as('tag') }).from(users)
					.as('sq_tag'),
			}).from(users).groupBy(users.id)
		);

		const db = createDB({ users, usersView }, (r) => ({
			users: {
				self: r.one.users({
					from: r.users.id,
					to: r.users.id,
				}),
			},
			usersView: {
				self: r.one.usersView({
					from: r.usersView.id,
					to: r.usersView.id,
				}),
			},
		}), true);

		await db.run(sql.raw('drop view if exists users_824_v'));
		await db.run(sql.raw('drop table if exists users_824'));
		await push({ users, usersView });

		const createdAt = new Date('2025-03-12T01:32:41.000Z');
		// unsafe integers in `numeric` columns throw an unsupported column type error with this driver
		const big = 9007199254740991n;

		await db.insert(users).values({
			id: 1,
			name: 'First',
			createdAt,
			num: '475452353476',
			cus: big,
		});

		const res = await db.select({
			...getColumns(users),
			max: max(users.createdAt).as('max'),
			maxNum: max(users.num).as('maxNum'),
		}).from(users).groupBy(users.id);

		const nested = await db.query.users.findFirst({
			with: {
				self: true,
			},
		});

		const viewRes = await db.select().from(usersView);

		const viewNested = await db.query.usersView.findFirst({
			with: {
				self: true,
			},
		});

		const cols = {
			id: 1,
			name: 'First',
			createdAt,
			num: '475452353476',
			cus: big,
		};

		const aggregates = { max: createdAt, maxNum: '475452353476' };
		const subqueries = { sq: createdAt, sqAliased: createdAt, sqTag: 'tag-1' };

		expect(res).toStrictEqual([{ ...cols, ...aggregates }]);
		expect(viewRes).toStrictEqual([{ ...cols, ...aggregates, ...subqueries }]);

		expect(customCast).toBeTruthy();
		expect(customMap).toBeTruthy();

		expect(nested).toStrictEqual({ ...cols, self: cols });

		type ViewRow = typeof usersView.$inferSelect;
		type ViewNestedRow = {
			[K in keyof (ViewRow & { self: ViewRow | null })]: (ViewRow & { self: ViewRow | null })[K];
		};

		expectTypeOf(viewNested).toEqualTypeOf<ViewNestedRow | undefined>();

		expect(viewNested).toStrictEqual({
			...cols,
			...aggregates,
			...subqueries,
			self: { ...cols, ...aggregates, ...subqueries },
		});
	});
}
