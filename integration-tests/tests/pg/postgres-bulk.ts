import { sql } from 'drizzle-orm';
import { Cache, type MutationOption } from 'drizzle-orm/cache/core';
import {
	customType,
	integer,
	jsonb,
	type PgCodecs,
	pgEnum,
	pgSchema,
	pgTable,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { postgresCodecs, type PostgresDatabase } from 'drizzle-orm/postgres';
import { describe, expect, type TestContext } from 'vitest';
import { allTypesData, makeAllTypes, makeAllTypesColumns } from './all-types';
import type { PgTestFixtures, Test } from './instrumentation';

export type BulkDrizzle = (config: { client: any; codecs?: PgCodecs; cache?: Cache }) => PostgresDatabase<any>;

export type BulkVariant = {
	name: string;
	drizzle: BulkDrizzle;
	client?: (kit: PgTestFixtures['kit']) => Promise<{ client: any; close: () => Promise<void> }>;
};

type Ctx = Pick<PgTestFixtures, 'kit' | 'push'> & Pick<TestContext, 'onTestFinished'>;

const SCALAR_KEYS = [
	'serial',
	'bigserial',
	'bigserialnum',
	'int',
	'bigint',
	'bigintnum',
	'bigintstr',
	'bool',
	'bytea',
	'char',
	'date',
	'datestr',
	'double',
	'interval',
	'json',
	'jsonb',
	'json1',
	'jsonb1',
	'json2',
	'jsonb2',
	'json3',
	'jsonb3',
	'numeric',
	'numericnum',
	'numericbig',
	'real',
	'smallint',
	'smallserial',
	'text',
	'time',
	'timestamp',
	'timestampTz',
	'timestampstr',
	'timestampTzstr',
	'uuid',
	'varchar',
] as const;

const pick = <T extends Record<string, any>, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> =>
	Object.fromEntries(keys.map((key) => [key, source[key]])) as Pick<T, K>;

/** Every type that can travel as an `unnest` array, in every mode */
const makeScalarTable = (name: string) =>
	pgTable(name, pick(makeAllTypesColumns(pgEnum(`${name}_unused`, ['enVal1', 'enVal2'])), SCALAR_KEYS));

const scalarData = pick(allTypesData, SCALAR_KEYS);

const scalarAltData: Omit<typeof scalarData, 'serial'> = {
	bigserial: 1n,
	bigserialnum: 2,
	int: -1,
	bigint: -9223372036854775808n,
	bigintnum: -9007199254740991,
	bigintstr: '-1',
	bool: false,
	bytea: Buffer.from('OTHER'),
	char: 'z',
	date: new Date('1990-01-01'),
	datestr: '1990-01-01',
	double: -0.5,
	interval: '1 year 2 mons',
	json: { other: [1, 'x'] },
	jsonb: { other: [2, 'y'] },
	json1: [1, 'a'],
	jsonb1: ['b', 2],
	json2: -1,
	jsonb2: 0,
	json3: 'str',
	jsonb3: '',
	numeric: '-0.0001',
	numericnum: -1.5,
	numericbig: -170141183460469231731687303715884105728n,
	real: -2.5,
	smallint: -20,
	smallserial: 3,
	text: 'with, comma and "quote" and \\ backslash',
	time: '00:00:00',
	timestamp: new Date('1990-01-01 00:00:00.000'),
	timestampTz: new Date('1990-01-01 00:00:00.000+00'),
	timestampstr: '1990-01-01 00:00:00',
	timestampTzstr: '1990-01-01 00:00:00+00',
	uuid: '00000000-0000-0000-0000-000000000000',
	varchar: 'second',
};

const withNullElements = <T extends Record<string, unknown>>(data: T): T =>
	Object.fromEntries(
		Object.entries(data).map(([key, value]) => {
			if (key.startsWith('arr')) {
				const arr = value as unknown[];
				return [key, [arr[0], null, ...arr.slice(1)]];
			}
			if (key.startsWith('mtx')) return [key, (value as unknown[][]).map((row) => [...row, null])];
			return [key, value];
		}),
	) as T;

const tagged = customType<{ data: { v: string }; driverData: string }>({
	dataType: () => 'text',
	toDriver: (value) => value.v,
	fromDriver: (value) => ({ v: value }),
});

const counter = customType<{ data: { n: bigint }; driverData: string }>({
	codec: 'bigint',
	dataType: () => 'bigint',
	toDriver: (value) => value.n.toString(),
	fromDriver: (value) => ({ n: BigInt(value) }),
});

const sqlMapped = customType<{ data: string; driverData: string }>({
	dataType: () => 'text',
	toDriver: (value) => sql`upper(${value})` as any,
});

class MutationsCache extends Cache {
	readonly mutations: MutationOption[] = [];

	override strategy() {
		return 'all' as const;
	}
	override async get(): Promise<any[] | undefined> {
		return undefined;
	}
	override async put(): Promise<void> {}
	override async onMutate(params: MutationOption): Promise<void> {
		this.mutations.push(params);
	}
}

const rejection = async (promise: Promise<unknown>): Promise<any> => {
	try {
		await promise;
	} catch (e) {
		return e;
	}
	throw new Error('expected a rejection, but the promise resolved');
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

const rowsOf = <T>(length: number, map: (i: number) => T): T[] => {
	const rows = new Array<T>(length);
	for (let i = 0; i < length; ++i) rows[i] = map(i);
	return rows;
};

export function bulkTests(test: Test, variant: BulkVariant) {
	const p = `bulk_${variant.name}`;

	const setup = async (
		{ kit, push, onTestFinished }: Ctx,
		schema: Record<string, unknown> | undefined,
		config: { codecs?: PgCodecs; cache?: Cache } = {},
	) => {
		if (schema) await push(schema);

		const own = variant.client ? await variant.client(kit) : undefined;
		if (own) onTestFinished(() => own.close());
		const client = own?.client ?? kit.client;

		const db = variant.drizzle({ client, ...config });

		// Pass-through wrappers recording which driver path every call took
		// (not `vi.spyOn`: concurrent tests reset each other's mock records)
		const record = (method: 'bulkInsert' | 'bulkUpdate') => {
			const calls: any[][] = [];
			const original = client[method];
			client[method] = (...args: any[]) => {
				calls.push(args);
				return original.apply(client, args);
			};
			onTestFinished(() => {
				client[method] = original;
			});
			return calls;
		};
		const insertCalls = record('bulkInsert');
		const updateCalls = record('bulkUpdate');
		const insertPaths = () => insertCalls.map((call) => call[3].defaults ? 'values' : 'unnest');
		const insertColumns = () => insertCalls.map((call) => call[1]);

		return { db, client, insertCalls, updateCalls, insertPaths, insertColumns };
	};

	describe(`bulk (${variant.name})`, () => {
		describe('bulkInsert paths', () => {
			test.concurrent('unnest: single chunk', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_ins_unnest`, {
					id: integer().primaryKey(),
					name: text().notNull(),
					note: text(),
				});
				const { db, insertPaths, insertColumns } = await setup({ kit, push, onTestFinished }, { users });

				const chunks: number[] = [];
				const res = await db.bulkInsert(users, [{ id: 1, name: 'a', note: 'x' }, { id: 2, name: 'b', note: null }], {
					onProgress: (progress) => chunks.push(progress.chunks),
				});

				expect(res).toMatchObject({ rowCount: 2, command: 'INSERT' });
				expect(insertPaths()).toStrictEqual(['unnest']);
				expect(insertColumns()).toStrictEqual([{ id: 'int4', name: 'text', note: 'text' }]);
				expect(chunks).toStrictEqual([1]);
				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, name: 'a', note: 'x' },
					{ id: 2, name: 'b', note: null },
				]);
			});

			test.concurrent('unnest: atomic chunks', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_ins_unnest_atomic`, { id: integer().primaryKey(), name: text().notNull() });
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { users });

				const progress: [number, number][] = [];
				const rows = rowsOf(5, (i) => ({ id: i + 1, name: `n${i + 1}` }));
				const res = await db.bulkInsert(users, rows, {
					chunk: 2,
					onProgress: ({ chunk, chunks }) => progress.push([chunk, chunks]),
				});

				expect(res.rowCount).toBe(5);
				expect(insertPaths()).toStrictEqual(['unnest']);
				expect(progress).toStrictEqual([[1, 3], [2, 3], [3, 3]]);
				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual(rows);

				// A failing chunk rolls every chunk back
				const failing = rowsOf(5, (i) => ({ id: i + 10, name: 'f' }));
				failing[4]!.id = 10;
				const error = await rejection(db.bulkInsert(users, failing, { chunk: 2 }));
				expect(error).toMatchObject({ code: '23505' });
				expect(await db.$count(users)).toBe(5);
			});

			test.concurrent('unnest: non-atomic chunks', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_ins_unnest_nonatomic`, { id: integer().primaryKey(), name: text().notNull() });
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { users });

				const rows = rowsOf(5, (i) => ({ id: i + 1, name: 'n' }));
				rows[4]!.id = 1;
				const error = await rejection(db.bulkInsert(users, rows, { chunk: 2, atomic: false }));

				expect(insertPaths()).toStrictEqual(['unnest']);
				expect(error).toMatchObject({ code: '23505', insertedRows: 4 });
				expect((await db.select({ id: users.id }).from(users).orderBy(users.id)).map(({ id }) => id))
					.toStrictEqual([1, 2, 3, 4]);
			});

			test.concurrent('values: cells left to the database default in some rows only', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_ins_values_mixed`, {
					id: integer().primaryKey(),
					name: text().notNull().default('dflt'),
					note: text(),
				});
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { users });

				const res = await db.bulkInsert(users, [{ id: 1, name: 'a' }, { id: 2 }, {
					id: 3,
					name: undefined,
					note: 'n',
				}]);

				expect(res.rowCount).toBe(3);
				expect(insertPaths()).toStrictEqual(['values']);
				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, name: 'a', note: null },
					{ id: 2, name: 'dflt', note: null },
					{ id: 3, name: 'dflt', note: 'n' },
				]);
			});

			test.concurrent('values: column types that unnest arrays cannot carry', async ({ kit, push, onTestFinished }) => {
				const mood = pgEnum(`${p}_mood`, ['sad', 'ok']);
				const users = pgTable(`${p}_ins_values_types`, {
					id: integer().primaryKey(),
					mood: mood().notNull(),
					tags: text().array().notNull(),
					custom: tagged().notNull(),
				});
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { mood, users });

				await db.bulkInsert(users, [{ id: 1, mood: 'ok', tags: [], custom: { v: 'a' } }]);
				await db.bulkInsert(users, [{ id: 2, mood: 'sad', tags: ['a'], custom: { v: 'b' } }]);
				await db.bulkInsert(users, [{ id: 3, mood: 'sad', tags: ['b'], custom: { v: 'c' } }]);

				expect(insertPaths()).toStrictEqual(['values', 'values', 'values']);
				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, mood: 'ok', tags: [], custom: { v: 'a' } },
					{ id: 2, mood: 'sad', tags: ['a'], custom: { v: 'b' } },
					{ id: 3, mood: 'sad', tags: ['b'], custom: { v: 'c' } },
				]);
			});

			test.concurrent('values: every cell left to the database default', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_ins_values_defaults`, {
					id: serial().primaryKey(),
					name: text().notNull().default('dflt'),
				});
				const { db, insertPaths, insertColumns } = await setup({ kit, push, onTestFinished }, { users });

				const res = await db.bulkInsert(users, [{}, {}, {}]);

				expect(res.rowCount).toBe(3);
				expect(insertPaths()).toStrictEqual(['values']);
				expect(Object.keys(insertColumns()[0])).toStrictEqual(['id', 'name']);
				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, name: 'dflt' },
					{ id: 2, name: 'dflt' },
					{ id: 3, name: 'dflt' },
				]);
			});

			test.concurrent('values: atomic and non-atomic chunks', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_ins_values_chunks`, {
					id: integer().primaryKey(),
					name: text().notNull().default('dflt'),
				});
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { users });

				const progress: number[] = [];
				const rows = [{ id: 1 }, { id: 2, name: 'b' }, { id: 3 }, { id: 4, name: 'd' }, { id: 5 }];
				await db.bulkInsert(users, rows, { chunk: 2, onProgress: ({ chunk }) => progress.push(chunk) });
				expect(progress).toStrictEqual([1, 2, 3]);
				expect(await db.$count(users)).toBe(5);

				const atomic = await rejection(
					db.bulkInsert(users, [{ id: 6 }, { id: 7, name: 'g' }, { id: 6 }], { chunk: 2 }),
				);
				expect(atomic).toMatchObject({ code: '23505' });
				expect(await db.$count(users)).toBe(5);

				const nonAtomic = await rejection(
					db.bulkInsert(users, [{ id: 6 }, { id: 7, name: 'g' }, { id: 6 }], { chunk: 2, atomic: false }),
				);
				expect(nonAtomic).toMatchObject({ code: '23505', insertedRows: 2 });
				expect(await db.$count(users)).toBe(7);

				expect(insertPaths()).toStrictEqual(['values', 'values', 'values']);
			});

			test.concurrent('empty rows', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_ins_empty`, { id: integer().primaryKey() });
				const { db, insertCalls, updateCalls } = await setup({ kit, push, onTestFinished }, { users });

				expect(await db.bulkInsert(users, [])).toStrictEqual({ rows: [], columns: [], rowCount: 0, command: 'INSERT' });
				expect(await db.bulkUpdate(users, [], { by: users.id })).toStrictEqual({
					rows: [],
					columns: [],
					rowCount: 0,
					command: 'UPDATE',
				});
				expect(insertCalls).toStrictEqual([]);
				expect(updateCalls).toStrictEqual([]);
			});
		});

		describe('bulkUpdate paths', () => {
			test.concurrent('single chunk', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_upd_single`, {
					id: integer().primaryKey(),
					name: text().notNull(),
					note: text(),
				});
				const { db, updateCalls } = await setup({ kit, push, onTestFinished }, { users });
				await db.insert(users).values([{ id: 1, name: 'a', note: 'x' }, { id: 2, name: 'b', note: 'y' }, {
					id: 3,
					name: 'c',
					note: 'z',
				}]);

				const res = await db.bulkUpdate(users, [{ id: 1, name: 'A' }, { id: 3, name: 'C' }, { id: 99, name: 'none' }], {
					by: users.id,
				});

				expect(res).toMatchObject({ rowCount: 2, command: 'UPDATE' });
				expect(updateCalls[0]!.slice(1, 2)).toStrictEqual([{ id: 'int4', name: 'text' }]);
				expect(updateCalls[0]![3]).toMatchObject({ by: ['id'] });
				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, name: 'A', note: 'x' },
					{ id: 2, name: 'b', note: 'y' },
					{ id: 3, name: 'C', note: 'z' },
				]);
			});

			test.concurrent('composite key', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_upd_composite`, {
					org: integer().notNull(),
					id: integer().notNull(),
					name: text().notNull(),
				});
				const { db } = await setup({ kit, push, onTestFinished }, { users });
				await db.insert(users).values([{ org: 1, id: 1, name: 'a' }, { org: 2, id: 1, name: 'b' }]);

				const res = await db.bulkUpdate(users, [{ org: 2, id: 1, name: 'B' }, { org: 3, id: 1, name: 'none' }], {
					by: [users.org, users.id],
				});

				expect(res.rowCount).toBe(1);
				expect(await db.select().from(users).orderBy(users.org)).toStrictEqual([
					{ org: 1, id: 1, name: 'a' },
					{ org: 2, id: 1, name: 'B' },
				]);
			});

			test.concurrent('atomic and non-atomic chunks', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_upd_chunks`, {
					id: integer().primaryKey(),
					code: text().notNull().unique(),
				});
				const { db } = await setup({ kit, push, onTestFinished }, { users });
				await db.insert(users).values(rowsOf(5, (i) => ({ id: i + 1, code: `c${i + 1}` })));

				const progress: number[] = [];
				const res = await db.bulkUpdate(
					users,
					rowsOf(5, (i) => ({ id: i + 1, code: `u${i + 1}` })),
					{ by: users.id, chunk: 2, onProgress: ({ chunk }) => progress.push(chunk) },
				);
				expect(res.rowCount).toBe(5);
				expect(progress).toStrictEqual([1, 2, 3]);

				const codes = async () => (await db.select().from(users).orderBy(users.id)).map(({ code }) => code);
				// the last chunk collides with the code the first chunk sets
				const failing = [{ id: 1, code: 'x1' }, { id: 2, code: 'x2' }, { id: 3, code: 'x3' }, { id: 4, code: 'x4' }, {
					id: 5,
					code: 'x1',
				}];

				const atomic = await rejection(db.bulkUpdate(users, failing, { by: users.id, chunk: 2 }));
				expect(atomic).toMatchObject({ code: '23505' });
				expect(await codes()).toStrictEqual(['u1', 'u2', 'u3', 'u4', 'u5']);

				const nonAtomic = await rejection(
					db.bulkUpdate(users, [failing[1]!, failing[2]!, { id: 5, code: 'u1' }], {
						by: users.id,
						chunk: 2,
						atomic: false,
					}),
				);
				expect(nonAtomic).toMatchObject({ code: '23505', updatedRows: 2 });
				expect(await codes()).toStrictEqual(['u1', 'x2', 'x3', 'u4', 'u5']);
			});
		});

		describe('transactions', () => {
			test.concurrent('bulk operations join the transaction', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_tx`, { id: integer().primaryKey(), name: text().notNull() });
				const { db } = await setup({ kit, push, onTestFinished }, { users });

				const rolledBack = new Error('rollback');
				const error = await rejection(db.transaction(async (tx) => {
					await tx.bulkInsert(users, [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }], { chunk: 2 });
					expect(await tx.$count(users)).toBe(3);
					throw rolledBack;
				}));
				expect(error).toBe(rolledBack);
				expect(await db.$count(users)).toBe(0);

				await db.transaction(async (tx) => {
					await tx.bulkInsert(users, [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }], { chunk: 2 });
					await tx.bulkUpdate(users, [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], {
						by: users.id,
						chunk: 2,
					});
				});
				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, name: 'A' },
					{ id: 2, name: 'B' },
					{ id: 3, name: 'C' },
				]);
			});

			test.concurrent('non-atomic chunks are rejected inside a transaction', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_tx_nonatomic`, { id: integer().primaryKey(), name: text().notNull() });
				const { db } = await setup({ kit, push, onTestFinished }, { users });

				await db.transaction(async (tx) => {
					const insert = await rejection(
						tx.bulkInsert(users, [{ id: 1, name: 'a' }, { id: 2, name: 'b' }], { chunk: 1, atomic: false }),
					);
					expect(insert.message).toContain('atomic:false inside an open transaction');

					const update = await rejection(
						tx.bulkUpdate(users, [{ id: 1, name: 'a' }, { id: 2, name: 'b' }], {
							by: users.id,
							chunk: 1,
							atomic: false,
						}),
					);
					expect(update.message).toContain('atomic:false inside an open transaction');
				});
				expect(await db.$count(users)).toBe(0);
			});
		});

		describe('column default functions', () => {
			test.concurrent('insert: value source precedence', async ({ kit, push, onTestFinished }) => {
				const calls: string[] = [];
				const fn = (name: string) => () => {
					calls.push(name);
					return name;
				};
				const users = pgTable(`${p}_fn_precedence`, {
					id: integer().primaryKey(),
					// $defaultFn wins over $onUpdateFn
					both: text().$defaultFn(fn('both:default')).$onUpdateFn(fn('both:update')),
					// a database default wins over $onUpdateFn
					dbAndUpdate: text().default('db').$onUpdateFn(fn('dbAndUpdate:update')),
					// $onUpdateFn fills inserts without other defaults
					update: text().$onUpdateFn(fn('update:update')),
					db: text().default('db'),
					plain: text(),
				});
				const { db, insertPaths, insertColumns } = await setup({ kit, push, onTestFinished }, { users });

				await db.bulkInsert(users, [{ id: 1 }, { id: 2 }]);

				expect(insertPaths()).toStrictEqual(['unnest']);
				expect(Object.keys(insertColumns()[0])).toStrictEqual(['id', 'both', 'update']);
				expect(calls).toStrictEqual(['both:default', 'update:update', 'both:default', 'update:update']);

				// Provided values - `null` included - skip every function
				calls.length = 0;
				await db.bulkInsert(users, [
					{ id: 3, both: 'v', dbAndUpdate: 'v', update: 'v', db: 'v', plain: 'v' },
					{ id: 4, both: null, dbAndUpdate: null, update: null, db: null, plain: null },
				]);
				expect(calls).toStrictEqual([]);

				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, both: 'both:default', dbAndUpdate: 'db', update: 'update:update', db: 'db', plain: null },
					{ id: 2, both: 'both:default', dbAndUpdate: 'db', update: 'update:update', db: 'db', plain: null },
					{ id: 3, both: 'v', dbAndUpdate: 'v', update: 'v', db: 'v', plain: 'v' },
					{ id: 4, both: null, dbAndUpdate: null, update: null, db: null, plain: null },
				]);
			});

			test.concurrent('insert: functions are called in the same order as by db.insert', async ({ kit, push, onTestFinished }) => {
				let seq = 0;
				const columns = () => ({
					id: integer().primaryKey(),
					a: integer().$defaultFn(() => ++seq),
					b: integer().$onUpdateFn(() => ++seq),
					c: integer().$defaultFn(() => ++seq),
				});
				const bulk = pgTable(`${p}_fn_order_bulk`, columns());
				const regular = pgTable(`${p}_fn_order_regular`, columns());
				const { db } = await setup({ kit, push, onTestFinished }, { bulk, regular });

				const rows = [{ id: 1 }, { id: 2, b: 100 }, { id: 3, a: 200, c: 300 }, { id: 4 }];

				seq = 0;
				await db.bulkInsert(bulk, rows);
				seq = 0;
				await db.insert(regular).values(rows);

				const expected = [
					{ id: 1, a: 1, b: 2, c: 3 },
					{ id: 2, a: 4, b: 100, c: 5 },
					{ id: 3, a: 200, b: 6, c: 300 },
					{ id: 4, a: 7, b: 8, c: 9 },
				];
				expect(await db.select().from(bulk).orderBy(bulk.id)).toStrictEqual(expected);
				expect(await db.select().from(regular).orderBy(regular.id)).toStrictEqual(expected);
			});

			test.concurrent('insert: function results are mapped like provided values', async ({ kit, push, onTestFinished }) => {
				const at = new Date('2025-01-02T03:04:05.678Z');
				const users = pgTable(`${p}_fn_mapping`, {
					id: integer().primaryKey(),
					at: timestamp({ withTimezone: true }).$defaultFn(() => at),
					meta: jsonb().$type<{ tags: string[] }>().$defaultFn(() => ({ tags: ['a', 'b'] })),
					count: counter().$defaultFn(() => ({ n: 9007199254740993n })),
				});
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { users });

				await db.bulkInsert(users, [{ id: 1 }]);

				expect(insertPaths()).toStrictEqual(['unnest']);
				expect(await db.select().from(users)).toStrictEqual([
					{ id: 1, at, meta: { tags: ['a', 'b'] }, count: { n: 9007199254740993n } },
				]);
			});

			test.concurrent('update: $onUpdateFn fills every row, in row order', async ({ kit, push, onTestFinished }) => {
				let seq = 0;
				const users = pgTable(`${p}_fn_update`, {
					id: integer().primaryKey(),
					name: text().notNull(),
					a: integer().$onUpdateFn(() => ++seq),
					b: integer().default(0).$onUpdateFn(() => ++seq),
					untouched: text(),
				});
				const { db, updateCalls } = await setup({ kit, push, onTestFinished }, { users });
				await db.insert(users).values([{ id: 1, name: 'a', a: 0, b: 0, untouched: 'u' }, {
					id: 2,
					name: 'b',
					a: 0,
					b: 0,
					untouched: 'u',
				}, { id: 3, name: 'c', a: 0, b: 0, untouched: 'u' }]);

				seq = 0;
				await db.bulkUpdate(users, [{ id: 1, name: 'A' }, { id: 2, name: 'B', a: 100 }, { id: 3, name: 'C' }], {
					by: users.id,
				});

				expect(Object.keys(updateCalls[0]![1] as object)).toStrictEqual(['id', 'name', 'a', 'b']);
				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, name: 'A', a: 1, b: 2, untouched: 'u' },
					{ id: 2, name: 'B', a: 100, b: 3, untouched: 'u' },
					{ id: 3, name: 'C', a: 4, b: 5, untouched: 'u' },
				]);

				// Rows providing only keys still get every `$onUpdateFn` column
				seq = 10;
				await db.bulkUpdate(users, [{ id: 1 }], { by: users.id });
				expect(await db.select().from(users).where(sql`${users.id} = 1`)).toStrictEqual([
					{ id: 1, name: 'A', a: 11, b: 12, untouched: 'u' },
				]);
			});
		});

		describe('types', () => {
			test.concurrent('insert & update: every unnest type', async ({ kit, push, onTestFinished }) => {
				const table = makeScalarTable(`${p}_types_scalar`);
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { table });

				await db.bulkInsert(table, [scalarData, { ...scalarAltData, serial: 2 }]);
				expect(insertPaths()).toStrictEqual(['unnest']);
				expect(await db.select().from(table).orderBy(table.serial)).toStrictEqual([
					scalarData,
					{ ...scalarAltData, serial: 2 },
				]);

				const res = await db.bulkUpdate(table, [{ ...scalarAltData, serial: 1 }, { ...scalarData, serial: 2 }], {
					by: table.serial,
				});
				expect(res.rowCount).toBe(2);
				expect(await db.select().from(table).orderBy(table.serial)).toStrictEqual([
					{ ...scalarAltData, serial: 1 },
					{ ...scalarData, serial: 2 },
				]);
			});

			test.concurrent('insert & update: every unnest type as a key', async ({ kit, push, onTestFinished }) => {
				const table = makeScalarTable(`${p}_types_keys`);
				const { db } = await setup({ kit, push, onTestFinished }, { table });
				await db.insert(table).values(scalarData);

				// json has no equality operator, `text` is the column being set
				const keys = SCALAR_KEYS.filter((key) => !key.startsWith('json') && key !== 'text');
				for (const key of keys) {
					const res = await db.bulkUpdate(
						table,
						[{ ...pick(scalarData, [key]), text: `matched by ${key}` }] as any,
						{ by: table[key] },
					);
					expect(res.rowCount, key).toBe(1);
				}

				expect(await db.select({ text: table.text }).from(table)).toStrictEqual([
					{ text: `matched by ${keys.at(-1)}` },
				]);
			});

			test.concurrent('insert: every type', async ({ kit, push, onTestFinished }) => {
				const { en, allTypesTable } = makeAllTypes(`${p}_types_all`, `${p}_types_all_en`);
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { en, allTypesTable });

				await db.bulkInsert(allTypesTable, [allTypesData]);

				expect(insertPaths()).toStrictEqual(['values']);
				expect(await db.select().from(allTypesTable)).toStrictEqual([allTypesData]);
			});

			test.concurrent('custom types', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_types_custom`, {
					id: integer().primaryKey(),
					count: counter().notNull(),
					label: tagged(),
				});
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { users });

				// codec-backed custom types travel as unnest arrays, others fall back to values
				await db.bulkInsert(users, [{ id: 1, count: { n: 1n } }, { id: 2, count: { n: 2n } }]);
				await db.bulkInsert(users, [{ id: 3, count: { n: 3n }, label: { v: 'c' } }]);
				expect(insertPaths()).toStrictEqual(['unnest', 'values']);

				await db.bulkUpdate(users, [{ id: 1, count: { n: -9223372036854775808n } }, { id: 2, count: { n: 0n } }], {
					by: users.id,
				});

				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, count: { n: -9223372036854775808n }, label: null },
					{ id: 2, count: { n: 0n }, label: null },
					{ id: 3, count: { n: 3n }, label: { v: 'c' } },
				]);
			});

			test.concurrent('custom types: codec picks the array type', async ({ kit, push, onTestFinished }) => {
				const mood = pgEnum(`${p}_custom_mood`, ['sad', 'ok']);
				// alias spelling resolves like the built-in codecs
				const aliasInt = customType<{ data: number; driverData: number }>({
					dataType: () => 'integer',
					codec: 'integer',
				});
				// codec differing from the SQL type: the array is typed by the codec, the database assigns it to the column
				const bigintNumeric = customType<{ data: string; driverData: string }>({
					dataType: () => 'numeric(20, 0)',
					codec: 'bigint',
				});
				const jsonbDoc = customType<{ data: { a: number }; driverData: string }>({
					dataType: () => 'jsonb',
					codec: 'jsonb',
				});
				// codec without an unnest array type
				const enumMood = customType<{ data: 'sad' | 'ok'; driverData: string }>({
					dataType: () => `${p}_custom_mood`,
					codec: 'enum',
				});
				const users = pgTable(`${p}_types_custom_codec`, {
					id: integer().primaryKey(),
					num: aliasInt(),
					big: bigintNumeric(),
					doc: jsonbDoc(),
					mood: enumMood(),
				});
				const { db, insertPaths, insertColumns } = await setup({ kit, push, onTestFinished }, { mood, users });

				await db.bulkInsert(users, [
					{ id: 1, num: 1, big: '9223372036854775807', doc: { a: 1 } },
					{ id: 2, num: 2, big: '-1', doc: { a: 2 } },
				]);
				await db.bulkInsert(users, [{ id: 3, mood: 'ok' }]);
				expect(insertPaths()).toStrictEqual(['unnest', 'values']);
				expect(insertColumns()[0]).toStrictEqual({ id: 'int4', num: 'int4', big: 'int8', doc: 'jsonb' });

				await db.bulkUpdate(users, [
					{ id: 1, num: 10, big: '0', doc: { a: 10 } },
					{ id: 3, num: 30, big: '3', doc: { a: 30 } },
				], { by: users.id });
				const update = await rejection(db.bulkUpdate(users, [{ id: 1, mood: 'sad' }], { by: users.id }));
				expect(update.message).toBe(
					`\`bulkUpdate\`: column "mood" of type "${p}_custom_mood" can't be sent as an \`unnest\` array`,
				);

				const rows = await db.execute<{ id: number; num: number; big: string; doc: string; mood: string }>(
					sql`select id, num, big::text, doc::text, mood::text from ${users} order by id`,
				);
				expect(rows.rows).toStrictEqual([
					{ id: 1, num: 10, big: '0', doc: '{"a": 10}', mood: null },
					{ id: 2, num: 2, big: '-1', doc: '{"a": 2}', mood: null },
					{ id: 3, num: 30, big: '3', doc: '{"a": 30}', mood: 'ok' },
				]);
			});
		});

		describe('null & undefined', () => {
			test.concurrent('insert: null is NULL, undefined is the default', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_null_insert`, {
					id: integer().primaryKey(),
					dflt: text().default('db'),
					fn: text().$defaultFn(() => 'fn'),
					meta: jsonb(),
				});
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { users });

				// uniform: every row sets `null` (unnest), `meta` is left out
				await db.bulkInsert(users, [{ id: 1, dflt: null, fn: null }, { id: 2, dflt: null, fn: null }]);
				// mixed: `null` and `undefined` in one column (values)
				await db.bulkInsert(users, [{ id: 3, dflt: null, fn: undefined, meta: null }, {
					id: 4,
					dflt: undefined,
					fn: null,
					meta: { a: null },
				}]);
				// keys present with `undefined` are the same as missing ones
				await db.bulkInsert(users, [{ id: 5, dflt: undefined, fn: undefined, meta: undefined }]);

				expect(insertPaths()).toStrictEqual(['unnest', 'values', 'unnest']);
				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, dflt: null, fn: null, meta: null },
					{ id: 2, dflt: null, fn: null, meta: null },
					{ id: 3, dflt: null, fn: 'fn', meta: null },
					{ id: 4, dflt: 'db', fn: null, meta: { a: null } },
					{ id: 5, dflt: 'db', fn: 'fn', meta: null },
				]);
			});

			test.concurrent('insert: null array elements', async ({ kit, push, onTestFinished }) => {
				const bulk = makeAllTypes(`${p}_null_elems_bulk`, `${p}_null_elems_bulk_en`);
				const regular = makeAllTypes(`${p}_null_elems_regular`, `${p}_null_elems_regular_en`);
				const { db } = await setup({ kit, push, onTestFinished }, {
					bulkEn: bulk.en,
					bulkTable: bulk.allTypesTable,
					regularEn: regular.en,
					regularTable: regular.allTypesTable,
				});

				const data = withNullElements(allTypesData);
				await db.bulkInsert(bulk.allTypesTable, [data]);
				await db.insert(regular.allTypesTable).values(data);

				const [bulkRow] = await db.select().from(bulk.allTypesTable);
				const [regularRow] = await db.select().from(regular.allTypesTable);
				expect(bulkRow).toStrictEqual(regularRow);
				expect(bulkRow!.arrint).toStrictEqual([621, null, -5]);
				expect(bulkRow!.arrjsonb).toStrictEqual([{ arr: ['strb', 11], str: 'strvalb' }, null, { other: [4, 5, 6] }]);
				expect(bulkRow!.mtxbytea).toStrictEqual([
					[Buffer.from('BYTES'), Buffer.from('BYTES2'), null],
					[Buffer.from('OTHERBYTES'), Buffer.from('OTHERBYTES2'), null],
				]);
			});

			test.concurrent('update: null sets NULL, undefined everywhere leaves the column alone', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_null_update`, {
					id: integer().primaryKey(),
					name: text(),
					note: text(),
				});
				const { db, updateCalls } = await setup({ kit, push, onTestFinished }, { users });
				await db.insert(users).values([{ id: 1, name: 'a', note: 'x' }, { id: 2, name: 'b', note: 'y' }]);

				await db.bulkUpdate(users, [{ id: 1, name: null, note: undefined }, { id: 2, name: null }], { by: users.id });

				expect(Object.keys(updateCalls[0]![1] as object)).toStrictEqual(['id', 'name']);
				expect(await db.select().from(users).orderBy(users.id)).toStrictEqual([
					{ id: 1, name: null, note: 'x' },
					{ id: 2, name: null, note: 'y' },
				]);
			});

			test.concurrent('update: null keys match nothing', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_null_key`, { id: integer(), name: text() });
				const { db } = await setup({ kit, push, onTestFinished }, { users });
				await db.insert(users).values([{ id: null, name: 'a' }, { id: 1, name: 'b' }]);

				const res = await db.bulkUpdate(users, [{ id: null as unknown as number, name: 'A' }, { id: 1, name: 'B' }], {
					by: users.id,
				});

				expect(res.rowCount).toBe(1);
				expect(await db.select().from(users).orderBy(users.name)).toStrictEqual([
					{ id: 1, name: 'B' },
					{ id: null, name: 'a' },
				]);
			});
		});

		describe('errors', () => {
			test.concurrent('SQL values', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_err_sql`, {
					id: integer().primaryKey(),
					name: text(),
					mapped: sqlMapped(),
				});
				const sqlDefault = pgTable(`${p}_err_sql_default`, {
					id: integer().primaryKey(),
					at: timestamp().$defaultFn(() => sql`now()`),
				});
				const sqlUpdate = pgTable(`${p}_err_sql_update`, {
					id: integer().primaryKey(),
					name: text(),
					at: timestamp().$onUpdateFn(() => sql`now()`),
				});
				const { db, insertCalls, updateCalls } = await setup({ kit, push, onTestFinished }, {
					users,
					sqlDefault,
					sqlUpdate,
				});

				const errors = [
					await rejection(db.bulkInsert(users, [{ id: 1, name: sql`'x'` as any }])),
					await rejection(db.bulkUpdate(users, [{ id: 1, name: sql`'x'` as any }], { by: users.id })),
					await rejection(db.bulkInsert(users, [{ id: 1, mapped: 'x' }])),
					await rejection(db.bulkInsert(sqlDefault, [{ id: 1 }])),
					await rejection(db.bulkInsert(sqlUpdate, [{ id: 1 }])),
					await rejection(db.bulkUpdate(sqlUpdate, [{ id: 1, name: 'x' }], { by: sqlUpdate.id })),
				];

				expect(errors.map((e) => e.message)).toStrictEqual([
					'`bulkInsert`: column "name" received an SQL expression, bulk operations only accept values',
					'`bulkUpdate`: column "name" received an SQL expression, bulk operations only accept values',
					'`bulkInsert`: column "mapped" maps its value to an SQL expression, bulk operations only accept values',
					'`bulkInsert`: column "at" received an SQL expression, bulk operations only accept values',
					'`bulkInsert`: column "at" received an SQL expression, bulk operations only accept values',
					'`bulkUpdate`: column "at" received an SQL expression, bulk operations only accept values',
				]);
				expect(insertCalls).toStrictEqual([]);
				expect(updateCalls).toStrictEqual([]);
			});

			test.concurrent('invalid bulkUpdate input', async ({ kit, push, onTestFinished }) => {
				const mood = pgEnum(`${p}_err_mood`, ['sad', 'ok']);
				const users = pgTable(`${p}_err_update`, {
					id: integer().primaryKey(),
					name: text(),
					note: text(),
					tags: text().array(),
					mood: mood(),
					label: tagged(),
				});
				const other = pgTable(`${p}_err_update_other`, { key: integer() });
				const { db, updateCalls } = await setup({ kit, push, onTestFinished }, { mood, users, other });

				const errors = [
					await rejection(db.bulkUpdate(users, [{ id: 1, name: 'x' }] as any, { by: other.key } as any)),
					await rejection(db.bulkUpdate(users, [{ id: 1, name: 'x' }] as any, { by: [] } as any)),
					await rejection(db.bulkUpdate(users, [{ id: 1, name: 'x' }, { name: 'y' } as any], { by: users.id })),
					await rejection(db.bulkUpdate(users, [{ id: 1, name: 'x' }, { id: 2, note: 'y' }], { by: users.id })),
					await rejection(db.bulkUpdate(users, [{ id: 1 }, { id: 2 }], { by: users.id })),
					await rejection(db.bulkUpdate(users, [{ id: 1, tags: ['a'] }], { by: users.id })),
					await rejection(db.bulkUpdate(users, [{ id: 1, mood: 'ok' }], { by: users.id })),
					await rejection(db.bulkUpdate(users, [{ id: 1, label: { v: 'a' } }], { by: users.id })),
				];

				expect(errors.map((e) => e.message)).toStrictEqual([
					'`bulkUpdate`: `by` column "key" doesn\'t belong to the table',
					'`bulkUpdate`: `by` must contain at least one column',
					'`bulkUpdate`: row 1 is missing key column "id"',
					'`bulkUpdate`: row 0 doesn\'t set column "note", which other rows set - every row must set the same columns',
					'No values to set',
					'`bulkUpdate`: column "tags" of type "text[]" can\'t be sent as an `unnest` array',
					`\`bulkUpdate\`: column "mood" of type "${p}_err_mood" can't be sent as an \`unnest\` array`,
					'`bulkUpdate`: column "label" of type "text" can\'t be sent as an `unnest` array',
				]);
				expect(updateCalls).toStrictEqual([]);
			});

			test.concurrent('codecs with parameter casts', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_err_cast`, { id: integer().primaryKey(), name: text() });
				const { db, insertCalls, updateCalls } = await setup({ kit, push, onTestFinished }, { users }, {
					codecs: { ...postgresCodecs, text: { castParam: (param) => `${param}::text` } },
				});

				const insert = await rejection(db.bulkInsert(users, [{ id: 1 }]));
				const update = await rejection(db.bulkUpdate(users, [{ id: 1, name: 'x' }], { by: users.id }));

				expect(insert.message).toBe(
					'`bulkInsert`: column "name" requires a parameter cast, which bulk operations can\'t apply',
				);
				expect(update.message).toBe(
					'`bulkUpdate`: column "name" requires a parameter cast, which bulk operations can\'t apply',
				);
				expect(insertCalls).toStrictEqual([]);
				expect(updateCalls).toStrictEqual([]);
			});

			test.concurrent('database errors keep their driver error', async ({ kit, push, onTestFinished }) => {
				const users = pgTable(`${p}_err_db`, { id: integer().primaryKey(), name: text().notNull() });
				const { db } = await setup({ kit, push, onTestFinished }, { users });

				expect(await rejection(db.bulkInsert(users, [{ id: 1, name: null as any }]))).toMatchObject({
					code: '23502',
				});
				await db.bulkInsert(users, [{ id: 1, name: 'a' }]);
				expect(await rejection(db.bulkInsert(users, [{ id: 1, name: 'a' }]))).toMatchObject({ code: '23505' });
				expect(await rejection(db.bulkUpdate(users, [{ id: 1, name: null as any }], { by: users.id })))
					.toMatchObject({ code: '23502' });
			});
		});

		describe('identifiers', () => {
			test.concurrent('table, schema and column names are not injectable', async ({ kit, push, onTestFinished }) => {
				const victimName = `${p}_victim`;
				const payload = (q: string) => `x${q}; drop table "${victimName}"; --`;
				const schemaName = payload(`"`);
				const tableName = payload(`'`) + `"`;
				const keyName = payload(`")`);
				const valueName = payload(`"`) + `'`;
				const enumName = payload(`'`);

				const victim = pgTable(victimName, { id: integer() });
				const evilSchema = pgSchema(schemaName);
				const mood = evilSchema.enum(enumName, ['ok']);
				const evil = evilSchema.table(tableName, {
					key: integer(keyName).primaryKey(),
					value: text(valueName).notNull().default('dflt'),
					mood: mood('mood'),
				});

				await kit.query(`create schema ${quote(schemaName)}`);
				await kit.query(`create type ${quote(schemaName)}.${quote(enumName)} as enum ('ok')`);
				await kit.query(
					`create table ${quote(schemaName)}.${quote(tableName)} (${quote(keyName)} integer primary key, ${
						quote(valueName)
					} text not null default 'dflt', "mood" ${quote(schemaName)}.${quote(enumName)})`,
				);
				const { db, insertPaths } = await setup({ kit, push, onTestFinished }, { victim });
				await db.insert(victim).values({ id: 1 });

				await db.bulkInsert(evil, [{ key: 1, value: 'a' }, { key: 2, value: `'); drop table "${victimName}"; --` }]);
				await db.bulkInsert(evil, [{ key: 3 }, { key: 4, value: 'd', mood: 'ok' }]);
				await db.bulkUpdate(evil, [{ key: 1, value: 'A' }, { key: 3, value: 'C' }], { by: evil.key });

				expect(insertPaths()).toStrictEqual(['unnest', 'values']);
				expect(await db.select().from(evil).orderBy(evil.key)).toStrictEqual([
					{ key: 1, value: 'A', mood: null },
					{ key: 2, value: `'); drop table "${victimName}"; --`, mood: null },
					{ key: 3, value: 'C', mood: null },
					{ key: 4, value: 'd', mood: 'ok' },
				]);
				expect(await db.select().from(victim)).toStrictEqual([{ id: 1 }]);
			});

			test.concurrent('dotted names are rejected before reaching the database', async ({ kit, push, onTestFinished }) => {
				const dotted = pgTable(`${p}.dotted`, { id: integer().primaryKey(), name: text() });
				const dottedSchema = pgSchema(`${p}.schema`).table(`${p}_dotted`, { id: integer().primaryKey(), name: text() });
				const { db, insertCalls, updateCalls } = await setup({ kit, push, onTestFinished }, undefined);

				const errors = [
					await rejection(db.bulkInsert(dotted, [{ id: 1 }])),
					await rejection(db.bulkUpdate(dotted, [{ id: 1, name: 'x' }], { by: dotted.id })),
					await rejection(db.bulkInsert(dottedSchema, [{ id: 1 }])),
					await rejection(db.bulkUpdate(dottedSchema, [{ id: 1, name: 'x' }], { by: dottedSchema.id })),
				];

				expect(errors.map((e) => e.message)).toStrictEqual([
					'`bulkInsert`: table and schema names containing "." are not supported',
					'`bulkUpdate`: table and schema names containing "." are not supported',
					'`bulkInsert`: table and schema names containing "." are not supported',
					'`bulkUpdate`: table and schema names containing "." are not supported',
				]);
				expect(insertCalls).toStrictEqual([]);
				expect(updateCalls).toStrictEqual([]);
			});
		});

		test.concurrent('cache invalidation', async ({ kit, push, onTestFinished }) => {
			const users = pgTable(`${p}_cache`, { id: integer().primaryKey(), name: text() });
			const cache = new MutationsCache();
			const { db } = await setup({ kit, push, onTestFinished }, { users }, { cache });

			await db.bulkInsert(users, [{ id: 1, name: 'a' }]);
			await db.bulkUpdate(users, [{ id: 1, name: 'b' }], { by: users.id });
			await rejection(db.bulkInsert(users, [{ id: 1, name: 'a' }]));

			expect(cache.mutations).toStrictEqual([{ tables: [`${p}_cache`] }, { tables: [`${p}_cache`] }]);
		});
	});
}
