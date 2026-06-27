import { assert, expect, expectTypeOf, it, Vitest } from '@effect/vitest';
import {
	and,
	asc,
	eq,
	getColumns,
	gt,
	gte,
	inArray,
	lt,
	makeDefaultQueryMapper,
	makeDefaultRqbMapper,
	makeJitQueryMapper,
	makeJitRqbMapper,
	max,
	sql,
} from 'drizzle-orm';
import { EffectCache, type EffectCacheShape } from 'drizzle-orm/cache/core/cache-effect';
import { EffectLogger, type EffectLoggerShape, QueryEffectHKTBase } from 'drizzle-orm/effect-core';
import {
	alias,
	bigint,
	bigserial,
	boolean,
	bytea,
	char,
	cidr,
	customType,
	date,
	doublePrecision,
	except,
	getMaterializedViewConfig,
	inet,
	integer,
	interval,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	PgDialect,
	pgEnum,
	pgSchema,
	pgTable,
	pgView,
	point,
	primaryKey,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	union,
	unionAll,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import type { PgEffectDatabase } from 'drizzle-orm/pg-core/effect/db';
import { PgEffectSession } from 'drizzle-orm/pg-core/effect/session';
import {
	EmptyRelations,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
} from 'drizzle-orm/relations';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Ref from 'effect/Ref';
import * as Result from 'effect/Result';
import { SqlClient } from 'effect/unstable/sql/SqlClient';
import { SqlError } from 'effect/unstable/sql/SqlError';
import { relations } from './relations';
import { rqbPost, rqbUser } from './schema';
import { normalizeDataWithDbCodecs } from './utils';

export class DB extends Context.Service<DB, PgEffectDatabase<any, any, typeof relations>>()('CommonEffectPgDB') {}

let _diff!: (_: {}, schema: Record<string, unknown>, renames: []) => Promise<{ sqlStatements: string[] }>;
const getDiff = async () => {
	return _diff ??= (await import('../../../drizzle-kit/tests/postgres/mocks' as string)).diff;
};

export const push = (db: PgEffectDatabase<any, any, any>, schema: Record<string, any>) =>
	Effect.gen(function*() {
		const diff = yield* Effect.promise(() => getDiff());

		const { sqlStatements } = yield* Effect.promise(() => diff({}, schema, []));

		yield* db.transaction((tx) =>
			Effect.gen(function*() {
				for (const s of sqlStatements) {
					yield* tx.execute(s);
				}
			})
		);
	});

export interface RunCommonEffectPgTestsOptions {
	testLayer: Layer.Layer<DB | SqlClient, SqlError, never>;
	PgDrizzle: {
		make: (config?: any) => Effect.Effect<PgEffectDatabase<QueryEffectHKTBase, any, EmptyRelations>, never, any>;
		makeWithDefaults: (
			config?: any,
		) => Effect.Effect<PgEffectDatabase<QueryEffectHKTBase, any, EmptyRelations>, never, any>;
		DefaultServices: Layer.Layer<any, never, any>;
	};
	createDB: <
		TSchema extends Record<string, any>,
		TConfig extends RelationsBuilderConfig<TTables>,
		TTables extends Schema = ExtractTablesFromSchema<TSchema>,
	>(
		schema: TSchema,
		relations: (helpers: RelationsBuilder<TTables>) => TConfig,
		useJitMappers?: boolean,
	) => Effect.Effect<
		PgEffectDatabase<QueryEffectHKTBase, any, ExtractTablesWithRelations<TConfig, TTables>>,
		never,
		any
	>;
	usedSchema: string;
	skipTests?: string[];
	addTests?: (it: Vitest.MethodsNonLive<DB | SqlClient>) => void;
}

export const runCommonEffectPgTests = (opts: RunCommonEffectPgTestsOptions): void => {
	const { testLayer, usedSchema, PgDrizzle, createDB, addTests, skipTests = [] } = opts;

	it.layer(testLayer)('common', (it) => {
		// Run setup before each test.
		const _effect = it.effect;
		const effect: typeof it.effect = Object.assign(
			(testName: string, fn: () => Effect.Effect<any, any, any>, timeout?: number) =>
				_effect(testName, () =>
					Effect.andThen(
						Effect.gen(function*() {
							const db = yield* DB;

							yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(usedSchema)} CASCADE`);
							yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(`${usedSchema}_custom`)} CASCADE`);
							yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier('drizzle')} CASCADE`);
							yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier('drzl_migrations_init')} CASCADE`);
							yield* db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(usedSchema)};`);
							yield* db.execute(sql`SET search_path TO ${sql.identifier(usedSchema)};`);
							yield* db.execute(sql`SET TIME ZONE 'UTC';`);
						}),
						fn(),
					), timeout),
			it.effect,
		);
		Object.assign(it, { effect });

		it.beforeEach(({ task, skip }) => {
			if (skipTests.includes(task.name)) skip();
		});

		it.effect('all types', () =>
			Effect.gen(function*() {
				const en = pgEnum('en_48', ['enVal1', 'enVal2']);
				const allTypesTable = pgTable('all_types_48', {
					serial: serial('serial'),
					bigserial53: bigserial('bigserial53', {
						mode: 'number',
					}),
					bigserial64: bigserial('bigserial64', {
						mode: 'bigint',
					}),
					int: integer('int'),
					bigint53: bigint('bigint53', {
						mode: 'number',
					}),
					bigint64: bigint('bigint64', {
						mode: 'bigint',
					}),
					bigintString: bigint('bigint_string', {
						mode: 'string',
					}),
					bool: boolean('bool'),
					bytea: bytea('bytea'),
					char: char('char'),
					cidr: cidr('cidr'),
					date: date('date', {
						mode: 'date',
					}),
					dateStr: date('date_str', {
						mode: 'string',
					}),
					double: doublePrecision('double'),
					enum: en('enum'),
					inet: inet('inet'),
					interval: interval('interval'),
					json: json('json'),
					jsonb: jsonb('jsonb'),
					line: line('line', {
						mode: 'abc',
					}),
					lineTuple: line('line_tuple', {
						mode: 'tuple',
					}),
					macaddr: macaddr('macaddr'),
					macaddr8: macaddr8('macaddr8'),
					numeric: numeric('numeric'),
					numericNum: numeric('numeric_num', {
						mode: 'number',
					}),
					numericBig: numeric('numeric_big', {
						mode: 'bigint',
					}),
					point: point('point', {
						mode: 'xy',
					}),
					pointTuple: point('point_tuple', {
						mode: 'tuple',
					}),
					real: real('real'),
					smallint: smallint('smallint'),
					smallserial: smallserial('smallserial'),
					text: text('text'),
					time: time('time'),
					timestamp: timestamp('timestamp', {
						mode: 'date',
					}),
					timestampTz: timestamp('timestamp_tz', {
						mode: 'date',
						withTimezone: true,
					}),
					timestampStr: timestamp('timestamp_str', {
						mode: 'string',
					}),
					timestampTzStr: timestamp('timestamp_tz_str', {
						mode: 'string',
						withTimezone: true,
					}),
					uuid: uuid('uuid'),
					varchar: varchar('varchar'),
					arrint: integer('arrint').array(),
					arrbigint53: bigint('arrbigint53', {
						mode: 'number',
					}).array(),
					arrbigint64: bigint('arrbigint64', {
						mode: 'bigint',
					}).array(),
					arrbigintString: bigint('arrbigint_string', {
						mode: 'string',
					}).array(),
					arrbool: boolean('arrbool').array(),
					arrbytea: bytea('arrbytea').array(),
					arrchar: char('arrchar').array(),
					arrcidr: cidr('arrcidr').array(),
					arrdate: date('arrdate', {
						mode: 'date',
					}).array(),
					arrdateStr: date('arrdate_str', {
						mode: 'string',
					}).array(),
					arrdouble: doublePrecision('arrdouble').array(),
					arrenum: en('arrenum').array(),
					arrinet: inet('arrinet').array(),
					arrinterval: interval('arrinterval').array(),
					arrjson: json('arrjson').array(),
					arrjsonb: jsonb('arrjsonb').array(),
					arrline: line('arrline', {
						mode: 'abc',
					}).array(),
					arrlineTuple: line('arrline_tuple', {
						mode: 'tuple',
					}).array(),
					arrmacaddr: macaddr('arrmacaddr').array(),
					arrmacaddr8: macaddr8('arrmacaddr8').array(),
					arrnumeric: numeric('arrnumeric').array(),
					arrnumericNum: numeric('arrnumeric_num', {
						mode: 'number',
					}).array(),
					arrnumericBig: numeric('arrnumeric_big', {
						mode: 'bigint',
					}).array(),
					arrpoint: point('arrpoint', {
						mode: 'xy',
					}).array(),
					arrpointTuple: point('arrpoint_tuple', {
						mode: 'tuple',
					}).array(),
					arrreal: real('arrreal').array(),
					arrsmallint: smallint('arrsmallint').array(),
					arrtext: text('arrtext').array(),
					arrtime: time('arrtime').array(),
					arrtimestamp: timestamp('arrtimestamp', {
						mode: 'date',
					}).array(),
					arrtimestampTz: timestamp('arrtimestamp_tz', {
						mode: 'date',
						withTimezone: true,
					}).array(),
					arrtimestampStr: timestamp('arrtimestamp_str', {
						mode: 'string',
					}).array(),
					arrtimestampTzStr: timestamp('arrtimestamp_tz_str', {
						mode: 'string',
						withTimezone: true,
					}).array(),
					arruuid: uuid('arruuid').array(),
					arrvarchar: varchar('arrvarchar').array(),
				});

				const db = yield* DB;
				yield* push(db, { en, allTypesTable });

				yield* db.insert(allTypesTable).values({
					serial: 1,
					smallserial: 15,
					bigint53: 9007199254740991,
					bigint64: 5044565289845416380n,
					bigintString: '5044565289845416380',
					bigserial53: 9007199254740991,
					bigserial64: 5044565289845416380n,
					bool: true,
					bytea: Buffer.from('BYTES'),
					char: 'c',
					cidr: '2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128',
					inet: '192.168.0.1/24',
					macaddr: '08:00:2b:01:02:03',
					macaddr8: '08:00:2b:01:02:03:04:05',
					date: new Date(1741743161623),
					dateStr: new Date(1741743161623).toISOString(),
					double: 15.35325689124218,
					enum: 'enVal1',
					int: 621,
					interval: '2 months ago',
					json: {
						str: 'strval',
						arr: ['str', 10],
					},
					jsonb: {
						str: 'strvalb',
						arr: ['strb', 11],
					},
					line: {
						a: 1,
						b: 2,
						c: 3,
					},
					lineTuple: [1, 2, 3],
					numeric: '475452353476',
					numericNum: 9007199254740991,
					numericBig: 5044565289845416380n,
					point: {
						x: 24.5,
						y: 49.6,
					},
					pointTuple: [57.2, 94.3],
					real: 1.048596,
					smallint: 10,
					text: 'TEXT STRING',
					time: '13:59:28',
					timestamp: new Date(1741743161623),
					timestampTz: new Date(1741743161623),
					timestampStr: new Date(1741743161623).toISOString(),
					timestampTzStr: new Date(1741743161623).toISOString(),
					uuid: 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
					varchar: 'C4-',
					arrbigint53: [9007199254740991],
					arrbigint64: [5044565289845416380n],
					arrbigintString: ['5044565289845416380'],
					arrbool: [true],
					arrbytea: [Buffer.from('BYTES')],
					arrchar: ['c'],
					arrcidr: ['2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128'],
					arrinet: ['192.168.0.1/24'],
					arrmacaddr: ['08:00:2b:01:02:03'],
					arrmacaddr8: ['08:00:2b:01:02:03:04:05'],
					arrdate: [new Date(1741743161623)],
					arrdateStr: [new Date(1741743161623).toISOString()],
					arrdouble: [15.35325689124218],
					arrenum: ['enVal1'],
					arrint: [621],
					arrinterval: ['2 months ago'],
					arrjson: [{
						str: 'strval',
						arr: ['str', 10],
					}],
					arrjsonb: [{
						str: 'strvalb',
						arr: ['strb', 11],
					}],
					arrline: [{
						a: 1,
						b: 2,
						c: 3,
					}],
					arrlineTuple: [[1, 2, 3]],
					arrnumeric: ['475452353476'],
					arrnumericNum: [9007199254740991],
					arrnumericBig: [5044565289845416380n],
					arrpoint: [{
						x: 24.5,
						y: 49.6,
					}],
					arrpointTuple: [[57.2, 94.3]],
					arrreal: [1.048596],
					arrsmallint: [10],
					arrtext: ['TEXT STRING'],
					arrtime: ['13:59:28'],
					arrtimestamp: [new Date(1741743161623)],
					arrtimestampTz: [new Date(1741743161623)],
					arrtimestampStr: [new Date(1741743161623).toISOString()],
					arrtimestampTzStr: [new Date(1741743161623).toISOString()],
					arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c'],
					arrvarchar: ['C4-'],
				});

				const rawRes = yield* db.select().from(allTypesTable);

				type ExpectedType = {
					serial: number;
					bigserial53: number;
					bigserial64: bigint;
					int: number | null;
					bigint53: number | null;
					bigint64: bigint | null;
					bigintString: string | null;
					bool: boolean | null;
					bytea: Buffer | null;
					char: string | null;
					cidr: string | null;
					date: Date | null;
					dateStr: string | null;
					double: number | null;
					enum: 'enVal1' | 'enVal2' | null;
					inet: string | null;
					interval: string | null;
					json: unknown;
					jsonb: unknown;
					line: {
						a: number;
						b: number;
						c: number;
					} | null;
					lineTuple: [number, number, number] | null;
					macaddr: string | null;
					macaddr8: string | null;
					numeric: string | null;
					numericNum: number | null;
					numericBig: bigint | null;
					point: {
						x: number;
						y: number;
					} | null;
					pointTuple: [number, number] | null;
					real: number | null;
					smallint: number | null;
					smallserial: number;
					text: string | null;
					time: string | null;
					timestamp: Date | null;
					timestampTz: Date | null;
					timestampStr: string | null;
					timestampTzStr: string | null;
					uuid: string | null;
					varchar: string | null;
					arrint: number[] | null;
					arrbigint53: number[] | null;
					arrbigint64: bigint[] | null;
					arrbigintString: string[] | null;
					arrbool: boolean[] | null;
					arrbytea: Buffer[] | null;
					arrchar: string[] | null;
					arrcidr: string[] | null;
					arrdate: Date[] | null;
					arrdateStr: string[] | null;
					arrdouble: number[] | null;
					arrenum: ('enVal1' | 'enVal2')[] | null;
					arrinet: string[] | null;
					arrinterval: string[] | null;
					arrjson: unknown[] | null;
					arrjsonb: unknown[] | null;
					arrline: {
						a: number;
						b: number;
						c: number;
					}[] | null;
					arrlineTuple: [number, number, number][] | null;
					arrmacaddr: string[] | null;
					arrmacaddr8: string[] | null;
					arrnumeric: string[] | null;
					arrnumericNum: number[] | null;
					arrnumericBig: bigint[] | null;
					arrpoint: { x: number; y: number }[] | null;
					arrpointTuple: [number, number][] | null;
					arrreal: number[] | null;
					arrsmallint: number[] | null;
					arrtext: string[] | null;
					arrtime: string[] | null;
					arrtimestamp: Date[] | null;
					arrtimestampTz: Date[] | null;
					arrtimestampStr: string[] | null;
					arrtimestampTzStr: string[] | null;
					arruuid: string[] | null;
					arrvarchar: string[] | null;
				}[];

				const expectedRes: ExpectedType = [
					{
						serial: 1,
						bigserial53: 9007199254740991,
						bigserial64: 5044565289845416380n,
						int: 621,
						bigint53: 9007199254740991,
						bigint64: 5044565289845416380n,
						bigintString: '5044565289845416380',
						bool: true,
						bytea: Buffer.from('BYTES'),
						char: 'c',
						cidr: '2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128',
						date: new Date('2025-03-12T00:00:00.000Z'),
						dateStr: '2025-03-12',
						double: 15.35325689124218,
						enum: 'enVal1',
						inet: '192.168.0.1/24',
						interval: '-2 mons',
						json: { str: 'strval', arr: ['str', 10] },
						jsonb: { arr: ['strb', 11], str: 'strvalb' },
						line: { a: 1, b: 2, c: 3 },
						lineTuple: [1, 2, 3],
						macaddr: '08:00:2b:01:02:03',
						macaddr8: '08:00:2b:01:02:03:04:05',
						numeric: '475452353476',
						numericNum: 9007199254740991,
						numericBig: 5044565289845416380n,
						point: { x: 24.5, y: 49.6 },
						pointTuple: [57.2, 94.3],
						real: 1.048596,
						smallint: 10,
						smallserial: 15,
						text: 'TEXT STRING',
						time: '13:59:28',
						timestamp: new Date('2025-03-12T01:32:41.623Z'),
						timestampTz: new Date('2025-03-12T01:32:41.623Z'),
						timestampStr: '2025-03-12 01:32:41.623',
						timestampTzStr: '2025-03-12 01:32:41.623+00',
						uuid: 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
						varchar: 'C4-',
						arrint: [621],
						arrbigint53: [9007199254740991],
						arrbigint64: [5044565289845416380n],
						arrbigintString: ['5044565289845416380'],
						arrbool: [true],
						arrbytea: [Buffer.from('BYTES')],
						arrchar: ['c'],
						arrcidr: ['2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128'],
						arrdate: [new Date('2025-03-12T00:00:00.000Z')],
						arrdateStr: ['2025-03-12'],
						arrdouble: [15.35325689124218],
						arrenum: ['enVal1'],
						arrinet: ['192.168.0.1/24'],
						arrinterval: ['-2 mons'],
						arrjson: [{ str: 'strval', arr: ['str', 10] }],
						arrjsonb: [{ arr: ['strb', 11], str: 'strvalb' }],
						arrline: [{ a: 1, b: 2, c: 3 }],
						arrlineTuple: [[1, 2, 3]],
						arrmacaddr: ['08:00:2b:01:02:03'],
						arrmacaddr8: ['08:00:2b:01:02:03:04:05'],
						arrnumeric: ['475452353476'],
						arrnumericNum: [9007199254740991],
						arrnumericBig: [5044565289845416380n],
						arrpoint: [{ x: 24.5, y: 49.6 }],
						arrpointTuple: [[57.2, 94.3]],
						arrreal: [1.048596],
						arrsmallint: [10],
						arrtext: ['TEXT STRING'],
						arrtime: ['13:59:28'],
						arrtimestamp: [new Date('2025-03-12T01:32:41.623Z')],
						arrtimestampTz: [new Date('2025-03-12T01:32:41.623Z')],
						arrtimestampStr: ['2025-03-12 01:32:41.623'],
						arrtimestampTzStr: ['2025-03-12 01:32:41.623+00'],
						arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c'],
						arrvarchar: ['C4-'],
					},
				];

				expectTypeOf(rawRes).toEqualTypeOf<ExpectedType>();
				expect(rawRes).toStrictEqual(expectedRes);
			}));

		it.effect('RQB v2 simple find first - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser });

				const result = yield* db.query.rqbUser.findFirst();

				expect(result).toStrictEqual(undefined);
			}));

		it.effect('RQB v2 simple find first - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.query.rqbUser.findFirst({
					orderBy: {
						id: 'desc',
					},
				});

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			}));

		it.effect('RQB v2 simple find first - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser, rqbPost });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}]);

				const result = yield* db.query.rqbUser.findFirst({
					with: {
						posts: {
							orderBy: {
								id: 'asc',
							},
						},
					},
					orderBy: {
						id: 'asc',
					},
				});

				expect(result).toStrictEqual({
					id: 1,
					createdAt: date,
					name: 'First',
					posts: [{
						id: 1,
						userId: 1,
						createdAt: date,
						content: null,
					}, {
						id: 2,
						userId: 1,
						createdAt: date,
						content: 'Has message this time',
					}],
				});
			}));

		it.effect('RQB v2 simple find first - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const query = db.query.rqbUser.findFirst({
					where: {
						id: {
							eq: sql.placeholder('filter'),
						},
					},
					orderBy: {
						id: 'asc',
					},
				}).prepare('rqb_v2_find_first_placeholders');

				const result = yield* query.execute({
					filter: 2,
				});

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			}));

		it.effect('RQB v2 simple find many - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const result = yield* db.query.rqbUser.findMany();

				expect(result).toStrictEqual([]);
			}));

		it.effect('RQB v2 simple find many - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.query.rqbUser.findMany({
					orderBy: {
						id: 'desc',
					},
				});

				expect(result).toStrictEqual([{
					id: 2,
					createdAt: date,
					name: 'Second',
				}, {
					id: 1,
					createdAt: date,
					name: 'First',
				}]);
			}));

		it.effect('RQB v2 simple find many - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser, rqbPost });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}]);

				const result = yield* db.query.rqbPost.findMany({
					with: {
						author: true,
					},
					orderBy: {
						id: 'asc',
					},
				});

				expect(result).toStrictEqual([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
					author: {
						id: 1,
						createdAt: date,
						name: 'First',
					},
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
					author: {
						id: 1,
						createdAt: date,
						name: 'First',
					},
				}]);
			}));

		it.effect('RQB v2 simple find many - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const query = db.query.rqbUser.findMany({
					where: {
						id: {
							eq: sql.placeholder('filter'),
						},
					},
					orderBy: {
						id: 'asc',
					},
				}).prepare('rqb_v2_find_many_placeholders');

				const result = yield* query.execute({
					filter: 2,
				});

				expect(result).toStrictEqual([{
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);
			}));

		it.effect('RQB v2 transaction find first - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findFirst();

						expect(result).toStrictEqual(undefined);

						return result;
					})
				);

				expect(result).toStrictEqual(undefined);
			}));

		it.effect('RQB v2 transaction find first - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findFirst({
							orderBy: {
								id: 'desc',
							},
						});

						expect(result).toStrictEqual({
							id: 2,
							createdAt: date,
							name: 'Second',
						});

						return result;
					})
				);

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			}));

		it.effect('RQB v2 transaction find first - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser, rqbPost });
				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findFirst({
							with: {
								posts: {
									orderBy: {
										id: 'asc',
									},
								},
							},
							orderBy: {
								id: 'asc',
							},
						});

						expect(result).toStrictEqual({
							id: 1,
							createdAt: date,
							name: 'First',
							posts: [{
								id: 1,
								userId: 1,
								createdAt: date,
								content: null,
							}, {
								id: 2,
								userId: 1,
								createdAt: date,
								content: 'Has message this time',
							}],
						});

						return result;
					})
				);

				expect(result).toStrictEqual({
					id: 1,
					createdAt: date,
					name: 'First',
					posts: [{
						id: 1,
						userId: 1,
						createdAt: date,
						content: null,
					}, {
						id: 2,
						userId: 1,
						createdAt: date,
						content: 'Has message this time',
					}],
				});
			}));

		it.effect('RQB v2 transaction find first - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const query = db.query.rqbUser.findFirst({
							where: {
								id: {
									eq: sql.placeholder('filter'),
								},
							},
							orderBy: {
								id: 'asc',
							},
						}).prepare('rqb_v2_find_first_tx_placeholders');

						const result = yield* query.execute({
							filter: 2,
						});

						expect(result).toStrictEqual({
							id: 2,
							createdAt: date,
							name: 'Second',
						});

						return result;
					})
				);

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			}));

		it.effect('RQB v2 transaction find many - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findMany();

						expect(result).toStrictEqual([]);
						return result;
					})
				);

				expect(result).toStrictEqual([]);
			}));

		it.effect('RQB v2 transaction find many - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findMany({
							orderBy: {
								id: 'desc',
							},
						});

						expect(result).toStrictEqual([{
							id: 2,
							createdAt: date,
							name: 'Second',
						}, {
							id: 1,
							createdAt: date,
							name: 'First',
						}]);

						return result;
					})
				);

				expect(result).toStrictEqual([{
					id: 2,
					createdAt: date,
					name: 'Second',
				}, {
					id: 1,
					createdAt: date,
					name: 'First',
				}]);
			}));

		it.effect('RQB v2 transaction find many - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser, rqbPost });
				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbPost.findMany({
							with: {
								author: true,
							},
							orderBy: {
								id: 'asc',
							},
						});

						expect(result).toStrictEqual([{
							id: 1,
							userId: 1,
							createdAt: date,
							content: null,
							author: {
								id: 1,
								createdAt: date,
								name: 'First',
							},
						}, {
							id: 2,
							userId: 1,
							createdAt: date,
							content: 'Has message this time',
							author: {
								id: 1,
								createdAt: date,
								name: 'First',
							},
						}]);

						return result;
					})
				);

				expect(result).toStrictEqual([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
					author: {
						id: 1,
						createdAt: date,
						name: 'First',
					},
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
					author: {
						id: 1,
						createdAt: date,
						name: 'First',
					},
				}]);
			}));

		it.effect('RQB v2 transaction find many - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);
				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const query = db.query.rqbUser.findMany({
							where: {
								id: {
									eq: sql.placeholder('filter'),
								},
							},
							orderBy: {
								id: 'asc',
							},
						}).prepare('rqb_v2_find_many_placeholders_10');

						const result = yield* query.execute({
							filter: 2,
						});

						expect(result).toStrictEqual([{
							id: 2,
							createdAt: date,
							name: 'Second',
						}]);

						return result;
					})
				);
				expect(result).toStrictEqual([{
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);
			}));

		it.effect('transaction', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = pgTable('users_transactions', {
					id: serial('id').primaryKey(),
					balance: integer('balance').notNull(),
				});
				const products = pgTable('products_transactions', {
					id: serial('id').primaryKey(),
					price: integer('price').notNull(),
					stock: integer('stock').notNull(),
				});

				yield* push(db, { users, products });

				const [user] = yield* db.insert(users).values({ balance: 100 }).returning();
				const [product] = yield* db.insert(products).values({ price: 10, stock: 10 }).returning();

				yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.update(users).set({ balance: user!.balance - product!.price }).where(eq(users.id, user!.id));
						yield* tx.update(products).set({ stock: product!.stock - 1 }).where(eq(products.id, product!.id));

						// Regardless if `db` or `tx` is used, every query within the transaction effect is completed in transaction
						const nonTxRes = yield* db.select().from(users);
						expect(nonTxRes).toStrictEqual([{ id: 1, balance: 90 }]);
					})
				);

				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, balance: 90 }]);
			}));

		it.effect('transaction rollback', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = pgTable('users_transactions_rollback', {
					id: serial('id').primaryKey(),
					balance: integer('balance').notNull(),
				});

				yield* push(db, { users });

				const res = yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ balance: 100 });
						yield* tx.rollback();
					})
				).pipe(Effect.result);

				assert(Result.isFailure(res));
				assert(Predicate.isTagged(res.failure, 'EffectTransactionRollbackError'));

				const result = yield* db.select().from(users);

				expect(result).toEqual([]);
			}));

		it.effect('nested transaction', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = pgTable('users_nested_transactions', {
					id: serial('id').primaryKey(),
					balance: integer('balance').notNull(),
				});

				yield* push(db, { users });

				yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ balance: 100 });

						yield* tx.transaction((tx) =>
							Effect.gen(function*() {
								yield* tx.update(users).set({ balance: 200 });
							})
						);
					})
				);

				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, balance: 200 }]);
			}));

		it.effect('nested transaction rollback', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = pgTable('users_nested_transactions_rollback', {
					id: serial('id').primaryKey(),
					balance: integer('balance').notNull(),
				});

				yield* push(db, { users });

				yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ balance: 100 });

						const res = yield* tx.transaction((tx) =>
							Effect.gen(function*() {
								yield* tx.update(users).set({ balance: 200 });
								yield* tx.rollback();
							})
						).pipe(Effect.result);

						assert(Result.isFailure(res));
						assert(Predicate.isTagged(res.failure, 'EffectTransactionRollbackError'));
					})
				);

				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, balance: 100 }]);
			}));

		it.effect('mySchema :: materialized view', () =>
			Effect.gen(function*() {
				const mySchema = pgSchema(`${usedSchema}_custom`);

				const users = mySchema.table('users_100', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').notNull(),
				});

				const cities = mySchema.table('cities_100', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { mySchema, users, cities });

				const newYorkers1 = mySchema.materializedView('new_yorkers')
					.as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

				const newYorkers2 = mySchema.materializedView('new_yorkers', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').notNull(),
				}).as(sql`select * from ${users} where ${eq(users.cityId, 1)}`);

				const newYorkers3 = mySchema.materializedView('new_yorkers', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').notNull(),
				}).existing();

				yield* db.execute(
					sql`create materialized view ${newYorkers1} as ${getMaterializedViewConfig(newYorkers1).query}`,
				);

				yield* db.insert(cities).values([{ name: 'New York' }, { name: 'Paris' }]);

				yield* db.insert(users).values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 1 },
					{ name: 'Jack', cityId: 2 },
				]);

				{
					const result = yield* db.select().from(newYorkers1);
					expect(result).toEqual([]);
				}

				yield* db.refreshMaterializedView(newYorkers1);

				{
					const result = yield* db.select().from(newYorkers1);
					expect(result).toEqual([
						{ id: 1, name: 'John', cityId: 1 },
						{ id: 2, name: 'Jane', cityId: 1 },
					]);
				}

				{
					const result = yield* db.select().from(newYorkers2);
					expect(result).toEqual([
						{ id: 1, name: 'John', cityId: 1 },
						{ id: 2, name: 'Jane', cityId: 1 },
					]);
				}

				{
					const result = yield* db.select().from(newYorkers3);
					expect(result).toEqual([
						{ id: 1, name: 'John', cityId: 1 },
						{ id: 2, name: 'Jane', cityId: 1 },
					]);
				}

				{
					const result = yield* db.select({ name: newYorkers1.name }).from(newYorkers1);
					expect(result).toEqual([
						{ name: 'John' },
						{ name: 'Jane' },
					]);
				}
			}));

		it.effect('update ... from with join', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const states = pgTable('states_30', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});
				const cities = pgTable('cities_30', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					stateId: integer('state_id').references(() => states.id),
				});
				const users = pgTable('users_30', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').notNull().references(() => cities.id),
				});

				yield* push(db, { states, cities, users });

				yield* db.insert(states).values([
					{ name: 'New York' },
					{ name: 'Washington' },
				]);
				yield* db.insert(cities).values([
					{ name: 'New York City', stateId: 1 },
					{ name: 'Seattle', stateId: 2 },
					{ name: 'London' },
				]);
				yield* db.insert(users).values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 2 },
					{ name: 'Jack', cityId: 3 },
				]);

				const result1 = yield* db
					.update(users)
					.set({
						cityId: cities.id,
					})
					.from(cities)
					.leftJoin(states, eq(cities.stateId, states.id))
					.where(and(eq(cities.name, 'Seattle'), eq(users.name, 'John')))
					.returning();
				const result2 = yield* db
					.update(users)
					.set({
						cityId: cities.id,
					})
					.from(cities)
					.leftJoin(states, eq(cities.stateId, states.id))
					.where(and(eq(cities.name, 'London'), eq(users.name, 'Jack')))
					.returning();

				expect(result1).toStrictEqual([{
					id: 1,
					name: 'John',
					cityId: 2,
					cities_30: {
						id: 2,
						name: 'Seattle',
						stateId: 2,
					},
					states_30: {
						id: 2,
						name: 'Washington',
					},
				}]);
				expect(result2).toStrictEqual([{
					id: 3,
					name: 'Jack',
					cityId: 3,
					cities_30: {
						id: 3,
						name: 'London',
						stateId: null,
					},
					states_30: null,
				}]);
			}));

		it.effect('insert into ... select', () =>
			Effect.gen(function*() {
				const notifications = pgTable('notifications_31', {
					id: serial('id').primaryKey(),
					sentAt: timestamp('sent_at').notNull().defaultNow(),
					message: text('message').notNull(),
				});
				const users = pgTable('users_31', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});
				const userNotications = pgTable('user_notifications_31', {
					userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
					notificationId: integer('notification_id').notNull().references(() => notifications.id, {
						onDelete: 'cascade',
					}),
				}, (t) => [primaryKey({ columns: [t.userId, t.notificationId] })]);

				const db = yield* DB;

				yield* push(db, { notifications, users, userNotications });

				const newNotification = (yield* db
					.insert(notifications)
					.values({ message: 'You are one of the 3 lucky winners!' })
					.returning({ id: notifications.id }))[0]!;

				yield* db.insert(users).values([
					{ name: 'Alice' },
					{ name: 'Bob' },
					{ name: 'Charlie' },
					{ name: 'David' },
					{ name: 'Eve' },
				]);

				const sentNotifications = yield* db
					.insert(userNotications)
					.select(
						db
							.select({
								userId: users.id,
								notificationId: sql`${newNotification!.id}`.as('notification_id'),
							})
							.from(users)
							.where(inArray(users.name, ['Alice', 'Charlie', 'Eve']))
							.orderBy(asc(users.id)),
					)
					.returning();

				expect(sentNotifications).toStrictEqual([
					{ userId: 1, notificationId: newNotification!.id },
					{ userId: 3, notificationId: newNotification!.id },
					{ userId: 5, notificationId: newNotification!.id },
				]);
			}));

		it.effect('$count separate', () =>
			Effect.gen(function*() {
				const countTestTable = pgTable('count_test_33', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.$count(countTestTable);

				expect(count).toStrictEqual(4);
			}));

		it.effect('$count embedded', () =>
			Effect.gen(function*() {
				const countTestTable = pgTable('count_test_34', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.select({
					count: db.$count(countTestTable),
				}).from(countTestTable);

				expect(count).toStrictEqual([
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
				]);
			}));

		it.effect('$count separate reuse', () =>
			Effect.gen(function*() {
				const countTestTable = pgTable('count_test_35', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = db.$count(countTestTable);

				const count1 = yield* count;

				yield* db.insert(countTestTable).values({ id: 5, name: 'fifth' });

				const count2 = yield* count;

				yield* db.insert(countTestTable).values({ id: 6, name: 'sixth' });

				const count3 = yield* count;

				expect(count1).toStrictEqual(4);
				expect(count2).toStrictEqual(5);
				expect(count3).toStrictEqual(6);
			}));

		it.effect('$count embedded reuse', () =>
			Effect.gen(function*() {
				const countTestTable = pgTable('count_test_36', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = db.select({
					count: db.$count(countTestTable),
				}).from(countTestTable);

				const count1 = yield* count;

				yield* db.insert(countTestTable).values({ id: 5, name: 'fifth' });

				const count2 = yield* count;

				yield* db.insert(countTestTable).values({ id: 6, name: 'sixth' });

				const count3 = yield* count;

				expect(count1).toStrictEqual([
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
				]);
				expect(count2).toStrictEqual([
					{ count: 5 },
					{ count: 5 },
					{ count: 5 },
					{ count: 5 },
					{ count: 5 },
				]);
				expect(count3).toStrictEqual([
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
				]);
			}));

		it.effect('$count separate with filters', () =>
			Effect.gen(function*() {
				const countTestTable = pgTable('count_test_37', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.$count(countTestTable, gt(countTestTable.id, 1));
				expect(count).toStrictEqual(3);
			}));

		it.effect('$count embedded with filters', () =>
			Effect.gen(function*() {
				const countTestTable = pgTable('count_test_38', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.select({
					count: db.$count(countTestTable, gt(countTestTable.id, 1)),
				}).from(countTestTable);

				expect(count).toStrictEqual([
					{ count: 3 },
					{ count: 3 },
					{ count: 3 },
					{ count: 3 },
				]);
			}));

		it.effect('select distinct', () =>
			Effect.gen(function*() {
				const usersDistinctTable = pgTable('users_distinct_101', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
					age: integer('age').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersDistinctTable });

				yield* db.insert(usersDistinctTable).values([
					{ id: 1, name: 'John', age: 24 },
					{ id: 1, name: 'John', age: 24 },
					{ id: 2, name: 'John', age: 25 },
					{ id: 1, name: 'Jane', age: 24 },
					{ id: 1, name: 'Jane', age: 26 },
				]);
				const users1 = yield* db.selectDistinct().from(usersDistinctTable).orderBy(
					usersDistinctTable.id,
					usersDistinctTable.name,
				);
				const users2 = yield* db.selectDistinctOn([usersDistinctTable.id]).from(usersDistinctTable).orderBy(
					usersDistinctTable.id,
				);
				const users3 = yield* db.selectDistinctOn([usersDistinctTable.name], { name: usersDistinctTable.name }).from(
					usersDistinctTable,
				).orderBy(usersDistinctTable.name);
				const users4 = yield* db.selectDistinctOn([usersDistinctTable.id, usersDistinctTable.age]).from(
					usersDistinctTable,
				).orderBy(usersDistinctTable.id, usersDistinctTable.age);

				expect(users1).toEqual([
					{ id: 1, name: 'Jane', age: 24 },
					{ id: 1, name: 'Jane', age: 26 },
					{ id: 1, name: 'John', age: 24 },
					{ id: 2, name: 'John', age: 25 },
				]);

				expect(users2).toHaveLength(2);
				expect(users2[0]?.id).toBe(1);
				expect(users2[1]?.id).toBe(2);

				expect(users3).toHaveLength(2);
				expect(users3[0]?.name).toBe('Jane');
				expect(users3[1]?.name).toBe('John');

				expect(users4).toEqual([
					{ id: 1, name: 'John', age: 24 },
					{ id: 1, name: 'Jane', age: 26 },
					{ id: 2, name: 'John', age: 25 },
				]);
			}));

		it.effect('update with returning all fields', () =>
			Effect.gen(function*() {
				const users = pgTable('users_9', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
					createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const now = Date.now();

				yield* db.insert(users).values({ name: 'John' });
				const usersResult = yield* db
					.update(users)
					.set({ name: 'Jane' })
					.where(eq(users.name, 'John'))
					.returning();

				expect(usersResult[0]!.createdAt).toBeInstanceOf(Date);
				expect(Math.abs(usersResult[0]!.createdAt.getTime() - now)).toBeLessThan(300);
				expect(usersResult).toEqual([
					{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: usersResult[0]!.createdAt },
				]);
			}));

		it.effect('update with returning partial', () =>
			Effect.gen(function*() {
				const users = pgTable('users_10', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values({ name: 'John' });
				const usersResult = yield* db
					.update(users)
					.set({ name: 'Jane' })
					.where(eq(users.name, 'John'))
					.returning({
						id: users.id,
						name: users.name,
					});

				expect(usersResult).toEqual([{ id: 1, name: 'Jane' }]);
			}));

		it.effect('delete with returning all fields', () =>
			Effect.gen(function*() {
				const users = pgTable('users_11', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
					createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const now = Date.now();

				yield* db.insert(users).values({ name: 'John' });
				const usersResult = yield* db.delete(users).where(eq(users.name, 'John')).returning();

				expect(usersResult[0]!.createdAt).toBeInstanceOf(Date);
				expect(Math.abs(usersResult[0]!.createdAt.getTime() - now)).toBeLessThan(300);
				expect(usersResult).toEqual([
					{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: usersResult[0]!.createdAt },
				]);
			}));

		it.effect('delete with returning partial', () =>
			Effect.gen(function*() {
				const users = pgTable('users_12', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values({ name: 'John' });
				const usersResult = yield* db.delete(users).where(eq(users.name, 'John')).returning({
					id: users.id,
					name: users.name,
				});

				expect(usersResult).toEqual([{ id: 1, name: 'John' }]);
			}));

		it.effect('insert many', () =>
			Effect.gen(function*() {
				const users = pgTable('users_19', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db
					.insert(users)
					.values([
						{ name: 'John' },
						{ name: 'Bruce', jsonb: ['foo', 'bar'] },
						{ name: 'Jane' },
						{ name: 'Austin', verified: true },
					]);
				const result = yield* db
					.select({
						id: users.id,
						name: users.name,
						jsonb: users.jsonb,
						verified: users.verified,
					})
					.from(users);

				expect(result).toEqual([
					{ id: 1, name: 'John', jsonb: null, verified: false },
					{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
					{ id: 3, name: 'Jane', jsonb: null, verified: false },
					{ id: 4, name: 'Austin', jsonb: null, verified: true },
				]);
			}));

		it.effect('insert with returning partial', () =>
			Effect.gen(function*() {
				const users = pgTable('users_20', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const result = yield* db
					.insert(users)
					.values([
						{ name: 'John' },
						{ name: 'Bruce', jsonb: ['foo', 'bar'] },
						{ name: 'Jane' },
						{ name: 'Austin', verified: true },
					])
					.returning({
						id: users.id,
						name: users.name,
						jsonb: users.jsonb,
						verified: users.verified,
					});

				expect(result).toEqual([
					{ id: 1, name: 'John', jsonb: null, verified: false },
					{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
					{ id: 3, name: 'Jane', jsonb: null, verified: false },
					{ id: 4, name: 'Austin', jsonb: null, verified: true },
				]);
			}));

		it.effect('insert with returning all fields', () =>
			Effect.gen(function*() {
				const users = pgTable('users_20', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const result = yield* db
					.insert(users)
					.values([
						{ name: 'John' },
						{ name: 'Bruce', jsonb: ['foo', 'bar'] },
						{ name: 'Jane' },
						{ name: 'Austin', verified: true },
					])
					.returning();

				expect(result).toEqual([
					{ id: 1, name: 'John', jsonb: null, verified: false },
					{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
					{ id: 3, name: 'Jane', jsonb: null, verified: false },
					{ id: 4, name: 'Austin', jsonb: null, verified: true },
				]);
			}));

		it.effect('prepared statement reuse', () =>
			Effect.gen(function*() {
				const usersTable = pgTable('users_35', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				const stmt = db
					.insert(usersTable)
					.values({
						verified: true,
						name: sql.placeholder('name'),
					})
					.prepare('stmt2');

				for (let i = 0; i < 10; i++) {
					yield* stmt.execute({ name: `John ${i}` });
				}

				const result = yield* db
					.select({
						id: usersTable.id,
						name: usersTable.name,
						verified: usersTable.verified,
					})
					.from(usersTable);

				expect(result).toEqual([
					{ id: 1, name: 'John 0', verified: true },
					{ id: 2, name: 'John 1', verified: true },
					{ id: 3, name: 'John 2', verified: true },
					{ id: 4, name: 'John 3', verified: true },
					{ id: 5, name: 'John 4', verified: true },
					{ id: 6, name: 'John 5', verified: true },
					{ id: 7, name: 'John 6', verified: true },
					{ id: 8, name: 'John 7', verified: true },
					{ id: 9, name: 'John 8', verified: true },
					{ id: 10, name: 'John 9', verified: true },
				]);
			}));

		it.effect('prepared statement with placeholder in .where', () =>
			Effect.gen(function*() {
				const usersTable = pgTable('users_36', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				yield* db.insert(usersTable).values({ name: 'John' });
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.where(eq(usersTable.id, sql.placeholder('id')))
					.prepare('stmt3');
				const result = yield* stmt.execute({ id: 1 });

				expect(result).toEqual([{ id: 1, name: 'John' }]);
			}));

		it.effect('prepared statement with placeholder in .limit', () =>
			Effect.gen(function*() {
				const usersTable = pgTable('users_37', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				yield* db.insert(usersTable).values({ name: 'John' });
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.where(eq(usersTable.id, sql.placeholder('id')))
					.limit(sql.placeholder('limit'))
					.prepare('stmt_limit');

				const result = yield* stmt.execute({ id: 1, limit: 1 });

				expect(result).toEqual([{ id: 1, name: 'John' }]);
				expect(result).toHaveLength(1);
			}));

		it.effect('prepared statement with placeholder in .offset', () =>
			Effect.gen(function*() {
				const usersTable = pgTable('users_38', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				yield* db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.offset(sql.placeholder('offset'))
					.prepare('stmt_offset');

				const result = yield* stmt.execute({ offset: 1 });

				expect(result).toEqual([{ id: 2, name: 'John1' }]);
			}));

		it.effect('prepared statement built using $dynamic', () =>
			Effect.gen(function*() {
				const usersTable = pgTable('users_39', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				function withLimitOffset(qb: any) {
					return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
				}

				yield* db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.$dynamic();
				withLimitOffset(stmt).prepare('stmt_limit');

				const result = yield* stmt.execute({ limit: 1, offset: 1 });

				expect(result).toEqual([{ id: 2, name: 'John1' }]);
				expect(result).toHaveLength(1);
			}));

		it.effect('with ... select', () =>
			Effect.gen(function*() {
				const orders = pgTable('orders_55', {
					region: text('region').notNull(),
					product: text('product').notNull(),
					amount: integer('amount').notNull(),
					quantity: integer('quantity').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { orders });

				yield* db.insert(orders).values([
					{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
					{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 50, quantity: 5 },
				]);

				const regionalSales = db
					.$with('regional_sales')
					.as(
						db
							.select({
								region: orders.region,
								totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
							})
							.from(orders)
							.groupBy(orders.region),
					);

				const topRegions = db
					.$with('top_regions')
					.as(
						db
							.select({
								region: regionalSales.region,
							})
							.from(regionalSales)
							.where(
								gt(
									regionalSales.totalSales,
									db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
								),
							),
					);

				const result1 = yield* db
					.with(regionalSales, topRegions)
					.select({
						region: orders.region,
						product: orders.product,
						productUnits: sql<number>`sum(${orders.quantity})::int`,
						productSales: sql<number>`sum(${orders.amount})::int`,
					})
					.from(orders)
					.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
					.groupBy(orders.region, orders.product)
					.orderBy(orders.region, orders.product);
				const result2 = yield* db
					.with(regionalSales, topRegions)
					.selectDistinct({
						region: orders.region,
						product: orders.product,
						productUnits: sql<number>`sum(${orders.quantity})::int`,
						productSales: sql<number>`sum(${orders.amount})::int`,
					})
					.from(orders)
					.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
					.groupBy(orders.region, orders.product)
					.orderBy(orders.region, orders.product);
				const result3 = yield* db
					.with(regionalSales, topRegions)
					.selectDistinctOn([orders.region], {
						region: orders.region,
						productUnits: sql<number>`sum(${orders.quantity})::int`,
						productSales: sql<number>`sum(${orders.amount})::int`,
					})
					.from(orders)
					.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
					.groupBy(orders.region)
					.orderBy(orders.region);

				expect(result1).toEqual([
					{
						region: 'Europe',
						product: 'A',
						productUnits: 3,
						productSales: 30,
					},
					{
						region: 'Europe',
						product: 'B',
						productUnits: 5,
						productSales: 50,
					},
					{
						region: 'US',
						product: 'A',
						productUnits: 7,
						productSales: 70,
					},
					{
						region: 'US',
						product: 'B',
						productUnits: 9,
						productSales: 90,
					},
				]);
				expect(result2).toEqual(result1);
				expect(result3).toEqual([
					{
						region: 'Europe',
						productUnits: 8,
						productSales: 80,
					},
					{
						region: 'US',
						productUnits: 16,
						productSales: 160,
					},
				]);
			}));

		it.effect('with ... update', () =>
			Effect.gen(function*() {
				const products = pgTable('products_56', {
					id: serial('id').primaryKey(),
					price: numeric('price').notNull(),
					cheap: boolean('cheap').notNull().default(false),
				});

				const db = yield* DB;
				yield* push(db, { products });

				yield* db.insert(products).values([
					{ price: '10.99' },
					{ price: '25.85' },
					{ price: '32.99' },
					{ price: '2.50' },
					{ price: '4.59' },
				]);

				const averagePrice = db
					.$with('average_price')
					.as(
						db
							.select({
								value: sql`avg(${products.price})`.as('value'),
							})
							.from(products),
					);

				const result = yield* db
					.with(averagePrice)
					.update(products)
					.set({
						cheap: true,
					})
					.where(lt(products.price, sql`(select * from ${averagePrice})`))
					.returning({
						id: products.id,
					});

				expect(result).toEqual([
					{ id: 1 },
					{ id: 4 },
					{ id: 5 },
				]);
			}));

		it.effect('with ... insert', () =>
			Effect.gen(function*() {
				const users = pgTable('users_57', {
					username: text('username').notNull(),
					admin: boolean('admin').notNull().default(false),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const userCount = db
					.$with('user_count')
					.as(
						db
							.select({
								value: sql`count(*)`.as('value'),
							})
							.from(users),
					);

				const result = yield* db
					.with(userCount)
					.insert(users)
					.values([
						{ username: 'user1', admin: sql`((select * from ${userCount}) = 0)` },
					])
					.returning({
						admin: users.admin,
					});

				expect(result).toEqual([{ admin: true }]);
			}));

		it.effect('with ... delete', () =>
			Effect.gen(function*() {
				const orders = pgTable('orders_58', {
					id: serial('id').primaryKey(),
					region: text('region').notNull(),
					product: text('product').notNull(),
					amount: integer('amount').notNull(),
					quantity: integer('quantity').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { orders });

				yield* db.insert(orders).values([
					{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
					{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 50, quantity: 5 },
				]);

				const averageAmount = db
					.$with('average_amount')
					.as(
						db
							.select({
								value: sql`avg(${orders.amount})`.as('value'),
							})
							.from(orders),
					);

				const result = yield* db
					.with(averageAmount)
					.delete(orders)
					.where(gt(orders.amount, sql`(select * from ${averageAmount})`))
					.returning({
						id: orders.id,
					});

				expect(result).toEqual([
					{ id: 6 },
					{ id: 7 },
					{ id: 8 },
				]);
			}));

		it.effect('partial join with alias', () =>
			Effect.gen(function*() {
				const users = pgTable('users_29', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const customerAlias = alias(users, 'customer');

				yield* db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
				const result = yield* db
					.select({
						user: {
							id: users.id,
							name: users.name,
						},
						customer: {
							id: customerAlias.id,
							name: customerAlias.name,
						},
					})
					.from(users)
					.leftJoin(customerAlias, eq(customerAlias.id, 11))
					.where(eq(users.id, 10));

				expect(result).toEqual([
					{
						user: { id: 10, name: 'Ivan' },
						customer: { id: 11, name: 'Hans' },
					},
				]);
			}));

		it.effect('full join with alias', () =>
			Effect.gen(function*() {
				const users = pgTable('prefixed_users_30', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const customers = alias(users, 'customer');

				yield* db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
				const result = yield* db
					.select()
					.from(users)
					.leftJoin(customers, eq(customers.id, 11))
					.where(eq(users.id, 10));

				expect(result).toEqual([{
					prefixed_users_30: {
						id: 10,
						name: 'Ivan',
					},
					customer: {
						id: 11,
						name: 'Hans',
					},
				}]);
			}));

		it.effect('select from alias', () =>
			Effect.gen(function*() {
				const users = pgTable('prefixed_users_31', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const user = alias(users, 'user');
				const customers = alias(users, 'customer');

				yield* db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
				const result = yield* db
					.select()
					.from(user)
					.leftJoin(customers, eq(customers.id, 11))
					.where(eq(user.id, 10));

				expect(result).toEqual([{
					user: {
						id: 10,
						name: 'Ivan',
					},
					customer: {
						id: 11,
						name: 'Hans',
					},
				}]);
			}));

		it.effect('set operations (mixed) from query builder with subquery', () =>
			Effect.gen(function*() {
				const cities2Table = pgTable('cities_1', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const users2Table = pgTable('users2_1', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').references(() => cities2Table.id),
				});

				const db = yield* DB;
				yield* push(db, { cities2Table, users2Table });

				yield* db.insert(cities2Table).values([
					{ id: 1, name: 'New York' },
					{ id: 2, name: 'London' },
					{ id: 3, name: 'Tampa' },
				]);

				yield* db.insert(users2Table).values([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 2 },
					{ id: 3, name: 'Jack', cityId: 3 },
					{ id: 4, name: 'Peter', cityId: 3 },
					{ id: 5, name: 'Ben', cityId: 2 },
					{ id: 6, name: 'Jill', cityId: 1 },
					{ id: 7, name: 'Mary', cityId: 2 },
					{ id: 8, name: 'Sally', cityId: 1 },
				]);

				const sq = db
					.select()
					.from(cities2Table).where(gt(cities2Table.id, 1)).as('sq');

				const result = yield* db
					.select()
					.from(cities2Table).except(
						({ unionAll }) =>
							unionAll(
								db.select().from(sq),
								db.select().from(cities2Table).where(eq(cities2Table.id, 2)),
							),
					);

				expect(result).toHaveLength(1);

				expect(result).toEqual([
					{ id: 1, name: 'New York' },
				]);

				let err: unknown;
				try {
					yield* db
						.select()
						.from(cities2Table).except(
							({ unionAll }) =>
								unionAll(
									db
										.select({ name: cities2Table.name, id: cities2Table.id })
										.from(cities2Table).where(gt(cities2Table.id, 1)),
									db.select().from(cities2Table).where(eq(cities2Table.id, 2)),
								),
						);
				} catch (error) {
					err = error;
				}

				expect(err).toBeInstanceOf(Error);
			}));

		it.effect('set operations (mixed all) as function', () =>
			Effect.gen(function*() {
				const cities2Table = pgTable('cities_2', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const users2Table = pgTable('users2_2', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').references(() => cities2Table.id),
				});

				const db = yield* DB;
				yield* push(db, { cities2Table, users2Table });

				yield* db.insert(cities2Table).values([
					{ id: 1, name: 'New York' },
					{ id: 2, name: 'London' },
					{ id: 3, name: 'Tampa' },
				]);

				yield* db.insert(users2Table).values([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 2 },
					{ id: 3, name: 'Jack', cityId: 3 },
					{ id: 4, name: 'Peter', cityId: 3 },
					{ id: 5, name: 'Ben', cityId: 2 },
					{ id: 6, name: 'Jill', cityId: 1 },
					{ id: 7, name: 'Mary', cityId: 2 },
					{ id: 8, name: 'Sally', cityId: 1 },
				]);

				const result = yield* union(
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
					except(
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(gte(users2Table.id, 5)),
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(eq(users2Table.id, 7)),
					),
					db
						.select().from(cities2Table).where(gt(cities2Table.id, 1)),
				).orderBy(asc(sql`id`));

				expect(result).toHaveLength(6);

				expect(result).toEqual([
					{ id: 1, name: 'John' },
					{ id: 2, name: 'London' },
					{ id: 3, name: 'Tampa' },
					{ id: 5, name: 'Ben' },
					{ id: 6, name: 'Jill' },
					{ id: 8, name: 'Sally' },
				]);

				let err: unknown;
				try {
					yield* union(
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(eq(users2Table.id, 1)),
						except(
							db
								.select({ id: users2Table.id, name: users2Table.name })
								.from(users2Table).where(gte(users2Table.id, 5)),
							db
								.select({ name: users2Table.name, id: users2Table.id })
								.from(users2Table).where(eq(users2Table.id, 7)),
						),
						db
							.select().from(cities2Table).where(gt(cities2Table.id, 1)),
					);
				} catch (error) {
					err = error;
				}

				expect(err).toBeInstanceOf(Error);
			}));

		it.effect('custom EffectLogger override - user provided logger takes precedence over default', () =>
			Effect.gen(function*() {
				const loggedQueries: Array<{ query: string; params: unknown[] }> = [];

				const customLogger: EffectLoggerShape = {
					logQuery: (query: string, params: unknown[]) =>
						Effect.sync(() => {
							loggedQueries.push({ query, params });
						}),
				};
				const customLoggerLayer = Layer.succeed(EffectLogger, customLogger);

				const db = yield* PgDrizzle.make({ relations }).pipe(
					Effect.provide(customLoggerLayer),
					Effect.provide(PgDrizzle.DefaultServices),
				);

				const users = pgTable('users_custom_logger', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'John' });
				yield* db.select().from(users);

				expect(loggedQueries.length).toBeGreaterThanOrEqual(2);
				expect(loggedQueries.some((q) => q.query.toLowerCase().includes('insert'))).toBe(true);
				expect(loggedQueries.some((q) => q.query.toLowerCase().includes('select'))).toBe(true);
			}));

		it.effect('custom EffectCache override - user provided cache takes precedence over default', () =>
			Effect.gen(function*() {
				const cacheOperations = yield* Ref.make<Array<{ op: 'get' | 'put' | 'mutate'; key?: string }>>([]);

				const customCacheService: EffectCacheShape = {
					strategy: () => 'all' as const,
					get: (key: string, _tables: string[], _isTag: boolean, _isAutoInvalidate?: boolean) =>
						Effect.gen(function*() {
							yield* Ref.update(cacheOperations, (ops) => [...ops, { op: 'get' as const, key }]);
							// oxlint-disable-next-line no-useless-undefined
							return undefined;
						}),
					put: (key: string, _response: any, _tables: string[], _isTag: boolean, _config?: any) =>
						Effect.gen(function*() {
							yield* Ref.update(cacheOperations, (ops) => [...ops, { op: 'put' as const, key }]);
						}),
					onMutate: (_params: any) =>
						Effect.gen(function*() {
							yield* Ref.update(cacheOperations, (ops) => [...ops, { op: 'mutate' as const }]);
						}),
				};
				const customCacheLayer = Layer.succeed(EffectCache, customCacheService);

				const db = yield* PgDrizzle.make({ relations }).pipe(
					Effect.provide(customCacheLayer),
					Effect.provide(PgDrizzle.DefaultServices),
				);

				const users = pgTable('users_custom_cache', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'John' });
				yield* db.select().from(users).$withCache();

				const ops = yield* Ref.get(cacheOperations);
				expect(ops.some((o) => o.op === 'mutate')).toBe(true);
				expect(ops.some((o) => o.op === 'get')).toBe(true);
			}));

		it.effect('makeWithDefaults - convenience function that includes DefaultServices', () =>
			Effect.gen(function*() {
				const db = yield* PgDrizzle.makeWithDefaults({ relations });

				const users = pgTable('users_make_with_defaults', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'Alice' });
				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, name: 'Alice' }]);
			}));

		it.effect(
			'all types ~codecs~',
			() =>
				Effect.gen(function*() {
					const en = pgEnum('en_48', ['enVal1', 'enVal2']);
					const allTypesTable = pgTable('all_types_cdc_ef', {
						serial: serial('serial'),
						bigserial: bigserial('bigserial', {
							mode: 'bigint',
						}).notNull(),
						bigserialnum: bigserial('bigserialnum', {
							mode: 'number',
						}).notNull(),
						int: integer('int').notNull(),
						bigint: bigint('bigint', {
							mode: 'bigint',
						}).notNull(),
						bigintnum: bigint('bigintnum', {
							mode: 'number',
						}).notNull(),
						bigintstr: bigint('bigintstr', {
							mode: 'string',
						}).notNull(),
						bool: boolean('bool').notNull(),
						bytea: bytea('bytea').notNull(),
						char: char('char').notNull(),
						cidr: cidr('cidr').notNull(),
						date: date('date', {
							mode: 'date',
						}).notNull(),
						datestr: date('datestr', {
							mode: 'string',
						}).notNull(),
						double: doublePrecision('double').notNull(),
						enum: en('enum').notNull(),
						inet: inet('inet').notNull(),
						interval: interval('interval').notNull(),
						json: json('json').notNull(),
						jsonb: jsonb('jsonb').notNull(),
						json1: json('json1').notNull(),
						jsonb1: jsonb('jsonb1').notNull(),
						json2: json('json2').notNull(),
						jsonb2: jsonb('jsonb2').notNull(),
						json3: json('json3').notNull(),
						jsonb3: jsonb('jsonb3').notNull(),
						line: line('line', {
							mode: 'abc',
						}).notNull(),
						linetuple: line('linetuple', {
							mode: 'tuple',
						}).notNull(),
						macaddr: macaddr('macaddr').notNull(),
						macaddr8: macaddr8('macaddr8').notNull(),
						numeric: numeric('numeric').notNull(),
						numericnum: numeric('numericnum', {
							mode: 'number',
						}).notNull(),
						numericbig: numeric('numericbig', {
							mode: 'bigint',
						}).notNull(),
						point: point('point', {
							mode: 'xy',
						}).notNull(),
						pointtuple: point('pointtuple', {
							mode: 'tuple',
						}).notNull(),
						real: real('real').notNull(),
						smallint: smallint('smallint').notNull(),
						smallserial: smallserial('smallserial').notNull(),
						text: text('text').notNull(),
						time: time('time').notNull(),
						timestamp: timestamp('timestamp', {
							mode: 'date',
						}).notNull(),
						timestampTz: timestamp('timestampTz', {
							mode: 'date',
							withTimezone: true,
						}).notNull(),
						timestampstr: timestamp('timestampstr', {
							mode: 'string',
						}).notNull(),
						timestampTzstr: timestamp('timestampTzstr', {
							mode: 'string',
							withTimezone: true,
						}).notNull(),
						uuid: uuid('uuid').notNull(),
						varchar: varchar('varchar').notNull(),
						arrint: integer('arrint').array().notNull(),
						arrbigint: bigint('arrbigint', {
							mode: 'bigint',
						}).array().notNull(),
						arrbigintnum: bigint('arrbigintnum', {
							mode: 'number',
						}).array().notNull(),
						arrbigintstr: bigint('arrbigintstr', {
							mode: 'string',
						}).array().notNull(),
						arrbool: boolean('arrbool').array().notNull(),
						arrbytea: bytea('arrbytea').array().notNull(),
						mtxbytea: bytea('mtxbytea').array('[][]').notNull(),
						arrchar: char('arrchar').array().notNull(),
						arrcidr: cidr('arrcidr').array().notNull(),
						arrdate: date('arrdate', {
							mode: 'date',
						}).array().notNull(),
						arrdatestr: date('arrdatestr', {
							mode: 'string',
						}).array().notNull(),
						arrdouble: doublePrecision('arrdouble').array().notNull(),
						arrenum: en('arrenum').array().notNull(),
						arrinet: inet('arrinet').array().notNull(),
						arrinterval: interval('arrinterval').array().notNull(),
						arrjson: json('arrjson').array().notNull(),
						arrjsonb: jsonb('arrjsonb').array().notNull(),
						arrjson1: json('arrjson1').array().notNull(),
						arrjsonb1: jsonb('arrjsonb1').array().notNull(),
						arrjson2: json('arrjson2').array().notNull(),
						arrjsonb2: jsonb('arrjsonb2').array().notNull(),
						arrjson3: json('arrjson3').array().notNull(),
						arrjsonb3: jsonb('arrjsonb3').array().notNull(),
						arrline: line('arrline', {
							mode: 'abc',
						}).array().notNull(),
						arrlinetuple: line('arrlinetuple', {
							mode: 'tuple',
						}).array().notNull(),
						arrmacaddr: macaddr('arrmacaddr').array().notNull(),
						arrmacaddr8: macaddr8('arrmacaddr8').array().notNull(),
						arrnumeric: numeric('arrnumeric').array().notNull(),
						arrnumericnum: numeric('arrnumericnum', { mode: 'number' }).array().notNull(),
						arrnumericbig: numeric('arrnumericbig', { mode: 'bigint' }).array().notNull(),
						arrpoint: point('arrpoint', {
							mode: 'xy',
						}).array().notNull(),
						arrpointtuple: point('arrpointtuple', {
							mode: 'tuple',
						}).array().notNull(),
						arrreal: real('arrreal').array().notNull(),
						arrsmallint: smallint('arrsmallint').array().notNull(),
						arrtext: text('arrtext').array().notNull(),
						arrtime: time('arrtime').array().notNull(),
						arrtimestamp: timestamp('arrtimestamp', {
							mode: 'date',
						}).array().notNull(),
						arrtimestampTz: timestamp('arrtimestampTz', {
							mode: 'date',
							withTimezone: true,
						}).array().notNull(),
						arrtimestampstr: timestamp('arrtimestampstr', {
							mode: 'string',
						}).array().notNull(),
						arrtimestampTzstr: timestamp('arrtimestampTzstr', {
							mode: 'string',
							withTimezone: true,
						}).array().notNull(),
						arruuid: uuid('arruuid').array().notNull(),
						arrvarchar: varchar('arrvarchar').array().notNull(),
					});

					const db = yield* DB;
					yield* push(db, {
						en,
						allTypesTable,
					});

					type ExpectedType = {
						serial: number;
						bigserial: bigint;
						bigserialnum: number;
						int: number;
						bigint: bigint;
						bigintnum: number;
						bigintstr: string;
						bool: boolean;
						bytea: Buffer;
						char: string;
						cidr: string;
						date: Date;
						datestr: string;
						double: number;
						enum: 'enVal1' | 'enVal2';
						inet: string;
						interval: string;
						json: unknown;
						jsonb: unknown;
						json1: unknown;
						jsonb1: unknown;
						json2: unknown;
						jsonb2: unknown;
						json3: unknown;
						jsonb3: unknown;
						line: { a: number; b: number; c: number };
						linetuple: [number, number, number];
						macaddr: string;
						macaddr8: string;
						numeric: string;
						numericnum: number;
						numericbig: bigint;
						point: { x: number; y: number };
						pointtuple: [number, number];
						real: number;
						smallint: number;
						smallserial: number;
						text: string;
						time: string;
						timestamp: Date;
						timestampTz: Date;
						timestampstr: string;
						timestampTzstr: string;
						uuid: string;
						varchar: string;
						arrint: number[];
						arrbigint: bigint[];
						arrbigintnum: number[];
						arrbigintstr: string[];
						arrbool: boolean[];
						arrbytea: (Buffer)[];
						mtxbytea: (Buffer)[][];
						arrchar: string[];
						arrcidr: string[];
						arrdate: Date[];
						arrdatestr: string[];
						arrdouble: number[];
						arrenum: ('enVal1' | 'enVal2')[];
						arrinet: string[];
						arrinterval: string[];
						arrjson: unknown[];
						arrjsonb: unknown[];
						arrjson1: unknown[];
						arrjsonb1: unknown[];
						arrjson2: unknown[];
						arrjsonb2: unknown[];
						arrjson3: unknown[];
						arrjsonb3: unknown[];
						arrline: { a: number; b: number; c: number }[];
						arrlinetuple: [number, number, number][];
						arrmacaddr: string[];
						arrmacaddr8: string[];
						arrnumeric: string[];
						arrnumericnum: number[];
						arrnumericbig: bigint[];
						arrpoint: { x: number; y: number }[];
						arrpointtuple: [number, number][];
						arrreal: number[];
						arrsmallint: number[];
						arrtext: string[];
						arrtime: string[];
						arrtimestamp: Date[];
						arrtimestampTz: Date[];
						arrtimestampstr: string[];
						arrtimestampTzstr: string[];
						arruuid: string[];
						arrvarchar: string[];
					};

					const testData: ExpectedType = {
						serial: 1,
						bigserial: 5044565289845416380n,
						bigserialnum: 9007199254740991,
						int: 621,
						bigint: 5044565289845416380n,
						bigintnum: 9007199254740991,
						bigintstr: '5044565289845416380',
						bool: true,
						bytea: Buffer.from('BYTES'),
						char: 'c',
						cidr: '2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128',
						date: new Date('2025-03-12'),
						datestr: '2025-03-12',
						double: 15.35325689124218,
						enum: 'enVal1',
						inet: '192.168.0.1/24',
						interval: '-2 mons',
						json: { str: 'strval', arr: ['str', 10] },
						jsonb: { arr: ['strb', 11], str: 'strvalb' },
						json1: [{ key: 'value', num: 7 }, 'v', '11', 5],
						jsonb1: [{ key: 'value', num: 8 }, 'x', '10', 3],
						json2: 5,
						jsonb2: 7,
						json3: '5',
						jsonb3: '7',
						line: { a: 1, b: 2, c: 3 },
						linetuple: [1, 2, 3],
						macaddr: '08:00:2b:01:02:03',
						macaddr8: '08:00:2b:01:02:03:04:05',
						numeric: '5044565289845416380',
						numericnum: 9007199254740991,
						numericbig: 5044565289845416380n,
						point: { x: 24.5, y: 49.6 },
						pointtuple: [24.5, 49.6],
						real: 1.048596,
						smallint: 10,
						smallserial: 15,
						text: 'TEXT STRING',
						time: '13:59:28',
						timestamp: new Date('2025-03-12 01:32:41.623'),
						timestampTz: new Date('2025-03-12 01:32:41.623+00'),
						timestampstr: '2025-03-12 01:32:41.623',
						timestampTzstr: '2025-03-12 01:32:41.623+00',
						uuid: 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
						varchar: 'C4-',
						arrint: [621],
						arrbigint: [5044565289845416380n],
						arrbigintnum: [9007199254740991],
						arrbigintstr: ['5044565289845416380'],
						arrbool: [true],
						arrbytea: [Buffer.from('BYTES')],
						mtxbytea: [[Buffer.from('BYTES'), Buffer.from('BYTES2')], [
							Buffer.from('OTHERBYTES'),
							Buffer.from('OTHERBYTES2'),
						]],
						arrchar: ['c'],
						arrcidr: ['2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128'],
						arrdate: [new Date('2025-03-12')],
						arrdatestr: ['2025-03-12'],
						arrdouble: [15.35325689124218],
						arrenum: ['enVal1'],
						arrinet: ['192.168.0.1/24'],
						arrinterval: ['-2 mons'],
						arrjson: [{ str: 'strval', arr: ['str', 10] }],
						arrjsonb: [{ arr: ['strb', 11], str: 'strvalb' }],
						arrjson1: [[{ key: 'value', num: 7 }, 'v', '11', 5]],
						arrjsonb1: [[{ key: 'value', num: 8 }, 'x', '10', 3]],
						arrjson2: [5],
						arrjsonb2: [7],
						arrjson3: ['5'],
						arrjsonb3: ['7'],
						arrline: [{ a: 1, b: 2, c: 3 }],
						arrlinetuple: [[1, 2, 3]],
						arrmacaddr: ['08:00:2b:01:02:03'],
						arrmacaddr8: ['08:00:2b:01:02:03:04:05'],
						arrnumeric: ['5044565289845416380'],
						arrnumericnum: [9007199254740991],
						arrnumericbig: [5044565289845416380n],
						arrpoint: [{ x: 24.5, y: 49.6 }],
						arrpointtuple: [[24.5, 49.6]],
						arrreal: [1.048596],
						arrsmallint: [10],
						arrtext: ['TEXT STRING'],
						arrtime: ['13:59:28'],
						arrtimestamp: [new Date('2025-03-12 01:32:41.623')],
						arrtimestampTz: [new Date('2025-03-12 01:32:41.623+00')],
						arrtimestampstr: ['2025-03-12 01:32:41.623'],
						arrtimestampTzstr: ['2025-03-12 01:32:41.623+00'],
						arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c'],
						arrvarchar: ['C4-'],
					};

					yield* db.insert(allTypesTable).values(testData);
					const session = (<any> db).session as PgEffectSession;

					const queryRes = yield* session.objects<ExpectedType>(db.select().from(allTypesTable).getSQL()).pipe(
						Effect.map((e) =>
							normalizeDataWithDbCodecs({
								db,
								columns: getColumns(allTypesTable),
								data: e as ExpectedType[],
								mode: 'query',
							})[0]
						),
					);

					const relDb = yield* createDB({ allTypesTable }, (r) => ({
						allTypesTable: {
							self: r.many.allTypesTable({
								from: r.allTypesTable.serial,
								to: r.allTypesTable.serial,
							}),
						},
					}));

					const { relationRes, rootRes } = yield* session.objects<ExpectedType & { self: ExpectedType[] }>(
						relDb.query.allTypesTable.findFirst({
							with: {
								self: true,
							},
						}).getSQL(),
					).pipe(Effect.map((e) => {
						const { self: relationRaw, ...rootRaw } = e[0]!;

						return {
							relationRes: normalizeDataWithDbCodecs({
								db,
								columns: getColumns(allTypesTable),
								data: relationRaw as ExpectedType[],
								mode: 'json',
							})[0]!,
							rootRes: normalizeDataWithDbCodecs({
								db,
								columns: getColumns(allTypesTable),
								data: [rootRaw],
								mode: 'query',
							})[0]!,
						};
					}));

					expect(queryRes).toStrictEqual(testData);
					expect(relationRes).toStrictEqual(testData);
					expect(rootRes).toStrictEqual(testData);

					// ---- numbers ----
					expect(
						yield* unionAll(
							db.select({
								'int ∪ int': allTypesTable.int.as('int ∪ int'),
								'int ∪ smallint': allTypesTable.int.as('int ∪ smallint'),
								'int ∪ double': allTypesTable.int.as('int ∪ double'),
								'int ∪ real': allTypesTable.int.as('int ∪ real'),
								'int ∪ smallserial': allTypesTable.int.as('int ∪ smallserial'),
								'int ∪ serial': allTypesTable.int.as('int ∪ serial'),
								'int ∪ bigserialnum': allTypesTable.int.as('int ∪ bigserialnum'),
								'int ∪ bigintnum': allTypesTable.int.as('int ∪ bigintnum'),
								'int ∪ numericnum': allTypesTable.int.as('int ∪ numericnum'),
								'smallint ∪ int': allTypesTable.smallint.as('smallint ∪ int'),
								'smallint ∪ smallint': allTypesTable.smallint.as('smallint ∪ smallint'),
								'smallint ∪ double': allTypesTable.smallint.as('smallint ∪ double'),
								'smallint ∪ real': allTypesTable.smallint.as('smallint ∪ real'),
								'smallint ∪ smallserial': allTypesTable.smallint.as('smallint ∪ smallserial'),
								'smallint ∪ serial': allTypesTable.smallint.as('smallint ∪ serial'),
								'smallint ∪ bigserialnum': allTypesTable.smallint.as('smallint ∪ bigserialnum'),
								'smallint ∪ bigintnum': allTypesTable.smallint.as('smallint ∪ bigintnum'),
								'smallint ∪ numericnum': allTypesTable.smallint.as('smallint ∪ numericnum'),
								'double ∪ int': allTypesTable.double.as('double ∪ int'),
								'double ∪ smallint': allTypesTable.double.as('double ∪ smallint'),
								'double ∪ double': allTypesTable.double.as('double ∪ double'),
								'double ∪ real': allTypesTable.double.as('double ∪ real'),
								'double ∪ smallserial': allTypesTable.double.as('double ∪ smallserial'),
								'double ∪ serial': allTypesTable.double.as('double ∪ serial'),
								'double ∪ bigserialnum': allTypesTable.double.as('double ∪ bigserialnum'),
								'double ∪ bigintnum': allTypesTable.double.as('double ∪ bigintnum'),
								'double ∪ numericnum': allTypesTable.double.as('double ∪ numericnum'),
								'real ∪ int': allTypesTable.real.as('real ∪ int'),
								'real ∪ smallint': allTypesTable.real.as('real ∪ smallint'),
								'real ∪ double': allTypesTable.real.as('real ∪ double'),
								'real ∪ real': allTypesTable.real.as('real ∪ real'),
								'real ∪ smallserial': allTypesTable.real.as('real ∪ smallserial'),
								'real ∪ serial': allTypesTable.real.as('real ∪ serial'),
								'smallserial ∪ int': allTypesTable.smallserial.as('smallserial ∪ int'),
								'smallserial ∪ smallint': allTypesTable.smallserial.as('smallserial ∪ smallint'),
								'smallserial ∪ double': allTypesTable.smallserial.as('smallserial ∪ double'),
								'smallserial ∪ real': allTypesTable.smallserial.as('smallserial ∪ real'),
								'smallserial ∪ smallserial': allTypesTable.smallserial.as('smallserial ∪ smallserial'),
								'smallserial ∪ serial': allTypesTable.smallserial.as('smallserial ∪ serial'),
								'smallserial ∪ bigserialnum': allTypesTable.smallserial.as('smallserial ∪ bigserialnum'),
								'smallserial ∪ bigintnum': allTypesTable.smallserial.as('smallserial ∪ bigintnum'),
								'smallserial ∪ numericnum': allTypesTable.smallserial.as('smallserial ∪ numericnum'),
								'serial ∪ int': allTypesTable.serial.as('serial ∪ int'),
								'serial ∪ smallint': allTypesTable.serial.as('serial ∪ smallint'),
								'serial ∪ double': allTypesTable.serial.as('serial ∪ double'),
								'serial ∪ real': allTypesTable.serial.as('serial ∪ real'),
								'serial ∪ smallserial': allTypesTable.serial.as('serial ∪ smallserial'),
								'serial ∪ serial': allTypesTable.serial.as('serial ∪ serial'),
								'serial ∪ bigserialnum': allTypesTable.serial.as('serial ∪ bigserialnum'),
								'serial ∪ bigintnum': allTypesTable.serial.as('serial ∪ bigintnum'),
								'serial ∪ numericnum': allTypesTable.serial.as('serial ∪ numericnum'),
								'bigserialnum ∪ int': allTypesTable.bigserialnum.as('bigserialnum ∪ int'),
								'bigserialnum ∪ smallint': allTypesTable.bigserialnum.as('bigserialnum ∪ smallint'),
								'bigserialnum ∪ double': allTypesTable.bigserialnum.as('bigserialnum ∪ double'),
								'bigserialnum ∪ smallserial': allTypesTable.bigserialnum.as('bigserialnum ∪ smallserial'),
								'bigserialnum ∪ serial': allTypesTable.bigserialnum.as('bigserialnum ∪ serial'),
								'bigserialnum ∪ bigserialnum': allTypesTable.bigserialnum.as('bigserialnum ∪ bigserialnum'),
								'bigserialnum ∪ bigintnum': allTypesTable.bigserialnum.as('bigserialnum ∪ bigintnum'),
								'bigserialnum ∪ numericnum': allTypesTable.bigserialnum.as('bigserialnum ∪ numericnum'),
								'bigintnum ∪ int': allTypesTable.bigintnum.as('bigintnum ∪ int'),
								'bigintnum ∪ smallint': allTypesTable.bigintnum.as('bigintnum ∪ smallint'),
								'bigintnum ∪ double': allTypesTable.bigintnum.as('bigintnum ∪ double'),
								'bigintnum ∪ smallserial': allTypesTable.bigintnum.as('bigintnum ∪ smallserial'),
								'bigintnum ∪ serial': allTypesTable.bigintnum.as('bigintnum ∪ serial'),
								'bigintnum ∪ bigserialnum': allTypesTable.bigintnum.as('bigintnum ∪ bigserialnum'),
								'bigintnum ∪ bigintnum': allTypesTable.bigintnum.as('bigintnum ∪ bigintnum'),
								'bigintnum ∪ numericnum': allTypesTable.bigintnum.as('bigintnum ∪ numericnum'),
								'numericnum ∪ int': allTypesTable.numericnum.as('numericnum ∪ int'),
								'numericnum ∪ smallint': allTypesTable.numericnum.as('numericnum ∪ smallint'),
								'numericnum ∪ double': allTypesTable.numericnum.as('numericnum ∪ double'),
								'numericnum ∪ smallserial': allTypesTable.numericnum.as('numericnum ∪ smallserial'),
								'numericnum ∪ serial': allTypesTable.numericnum.as('numericnum ∪ serial'),
								'numericnum ∪ bigserialnum': allTypesTable.numericnum.as('numericnum ∪ bigserialnum'),
								'numericnum ∪ bigintnum': allTypesTable.numericnum.as('numericnum ∪ bigintnum'),
								'numericnum ∪ numericnum': allTypesTable.numericnum.as('numericnum ∪ numericnum'),
							}).from(allTypesTable),
							db.select({
								'int ∪ int': allTypesTable.int.as('int ∪ int'),
								'int ∪ smallint': allTypesTable.smallint.as('int ∪ smallint'),
								'int ∪ double': allTypesTable.double.as('int ∪ double'),
								'int ∪ real': allTypesTable.real.as('int ∪ real'),
								'int ∪ smallserial': allTypesTable.smallserial.as('int ∪ smallserial'),
								'int ∪ serial': allTypesTable.serial.as('int ∪ serial'),
								'int ∪ bigserialnum': allTypesTable.bigserialnum.as('int ∪ bigserialnum'),
								'int ∪ bigintnum': allTypesTable.bigintnum.as('int ∪ bigintnum'),
								'int ∪ numericnum': allTypesTable.numericnum.as('int ∪ numericnum'),
								'smallint ∪ int': allTypesTable.int.as('smallint ∪ int'),
								'smallint ∪ smallint': allTypesTable.smallint.as('smallint ∪ smallint'),
								'smallint ∪ double': allTypesTable.double.as('smallint ∪ double'),
								'smallint ∪ real': allTypesTable.real.as('smallint ∪ real'),
								'smallint ∪ smallserial': allTypesTable.smallserial.as('smallint ∪ smallserial'),
								'smallint ∪ serial': allTypesTable.serial.as('smallint ∪ serial'),
								'smallint ∪ bigserialnum': allTypesTable.bigserialnum.as('smallint ∪ bigserialnum'),
								'smallint ∪ bigintnum': allTypesTable.bigintnum.as('smallint ∪ bigintnum'),
								'smallint ∪ numericnum': allTypesTable.numericnum.as('smallint ∪ numericnum'),
								'double ∪ int': allTypesTable.int.as('double ∪ int'),
								'double ∪ smallint': allTypesTable.smallint.as('double ∪ smallint'),
								'double ∪ double': allTypesTable.double.as('double ∪ double'),
								'double ∪ real': allTypesTable.real.as('double ∪ real'),
								'double ∪ smallserial': allTypesTable.smallserial.as('double ∪ smallserial'),
								'double ∪ serial': allTypesTable.serial.as('double ∪ serial'),
								'double ∪ bigserialnum': allTypesTable.bigserialnum.as('double ∪ bigserialnum'),
								'double ∪ bigintnum': allTypesTable.bigintnum.as('double ∪ bigintnum'),
								'double ∪ numericnum': allTypesTable.numericnum.as('double ∪ numericnum'),
								'real ∪ int': allTypesTable.int.as('real ∪ int'),
								'real ∪ smallint': allTypesTable.smallint.as('real ∪ smallint'),
								'real ∪ double': allTypesTable.double.as('real ∪ double'),
								'real ∪ real': allTypesTable.real.as('real ∪ real'),
								'real ∪ smallserial': allTypesTable.smallserial.as('real ∪ smallserial'),
								'real ∪ serial': allTypesTable.serial.as('real ∪ serial'),
								'smallserial ∪ int': allTypesTable.int.as('smallserial ∪ int'),
								'smallserial ∪ smallint': allTypesTable.smallint.as('smallserial ∪ smallint'),
								'smallserial ∪ double': allTypesTable.double.as('smallserial ∪ double'),
								'smallserial ∪ real': allTypesTable.real.as('smallserial ∪ real'),
								'smallserial ∪ smallserial': allTypesTable.smallserial.as('smallserial ∪ smallserial'),
								'smallserial ∪ serial': allTypesTable.serial.as('smallserial ∪ serial'),
								'smallserial ∪ bigserialnum': allTypesTable.bigserialnum.as('smallserial ∪ bigserialnum'),
								'smallserial ∪ bigintnum': allTypesTable.bigintnum.as('smallserial ∪ bigintnum'),
								'smallserial ∪ numericnum': allTypesTable.numericnum.as('smallserial ∪ numericnum'),
								'serial ∪ int': allTypesTable.int.as('serial ∪ int'),
								'serial ∪ smallint': allTypesTable.smallint.as('serial ∪ smallint'),
								'serial ∪ double': allTypesTable.double.as('serial ∪ double'),
								'serial ∪ real': allTypesTable.real.as('serial ∪ real'),
								'serial ∪ smallserial': allTypesTable.smallserial.as('serial ∪ smallserial'),
								'serial ∪ serial': allTypesTable.serial.as('serial ∪ serial'),
								'serial ∪ bigserialnum': allTypesTable.bigserialnum.as('serial ∪ bigserialnum'),
								'serial ∪ bigintnum': allTypesTable.bigintnum.as('serial ∪ bigintnum'),
								'serial ∪ numericnum': allTypesTable.numericnum.as('serial ∪ numericnum'),
								'bigserialnum ∪ int': allTypesTable.int.as('bigserialnum ∪ int'),
								'bigserialnum ∪ smallint': allTypesTable.smallint.as('bigserialnum ∪ smallint'),
								'bigserialnum ∪ double': allTypesTable.double.as('bigserialnum ∪ double'),
								'bigserialnum ∪ smallserial': allTypesTable.smallserial.as('bigserialnum ∪ smallserial'),
								'bigserialnum ∪ serial': allTypesTable.serial.as('bigserialnum ∪ serial'),
								'bigserialnum ∪ bigserialnum': allTypesTable.bigserialnum.as('bigserialnum ∪ bigserialnum'),
								'bigserialnum ∪ bigintnum': allTypesTable.bigintnum.as('bigserialnum ∪ bigintnum'),
								'bigserialnum ∪ numericnum': allTypesTable.numericnum.as('bigserialnum ∪ numericnum'),
								'bigintnum ∪ int': allTypesTable.int.as('bigintnum ∪ int'),
								'bigintnum ∪ smallint': allTypesTable.smallint.as('bigintnum ∪ smallint'),
								'bigintnum ∪ double': allTypesTable.double.as('bigintnum ∪ double'),
								'bigintnum ∪ smallserial': allTypesTable.smallserial.as('bigintnum ∪ smallserial'),
								'bigintnum ∪ serial': allTypesTable.serial.as('bigintnum ∪ serial'),
								'bigintnum ∪ bigserialnum': allTypesTable.bigserialnum.as('bigintnum ∪ bigserialnum'),
								'bigintnum ∪ bigintnum': allTypesTable.bigintnum.as('bigintnum ∪ bigintnum'),
								'bigintnum ∪ numericnum': allTypesTable.numericnum.as('bigintnum ∪ numericnum'),
								'numericnum ∪ int': allTypesTable.int.as('numericnum ∪ int'),
								'numericnum ∪ smallint': allTypesTable.smallint.as('numericnum ∪ smallint'),
								'numericnum ∪ double': allTypesTable.double.as('numericnum ∪ double'),
								'numericnum ∪ smallserial': allTypesTable.smallserial.as('numericnum ∪ smallserial'),
								'numericnum ∪ serial': allTypesTable.serial.as('numericnum ∪ serial'),
								'numericnum ∪ bigserialnum': allTypesTable.bigserialnum.as('numericnum ∪ bigserialnum'),
								'numericnum ∪ bigintnum': allTypesTable.bigintnum.as('numericnum ∪ bigintnum'),
								'numericnum ∪ numericnum': allTypesTable.numericnum.as('numericnum ∪ numericnum'),
							}).from(allTypesTable),
						),
					).toEqual(expect.arrayContaining([
						{
							'int ∪ int': 621,
							'int ∪ smallint': 621,
							'int ∪ double': 621,
							'int ∪ real': 621,
							'int ∪ smallserial': 621,
							'int ∪ serial': 621,
							'int ∪ bigserialnum': 621,
							'int ∪ bigintnum': 621,
							'int ∪ numericnum': 621,
							'smallint ∪ int': 10,
							'smallint ∪ smallint': 10,
							'smallint ∪ double': 10,
							'smallint ∪ real': 10,
							'smallint ∪ smallserial': 10,
							'smallint ∪ serial': 10,
							'smallint ∪ bigserialnum': 10,
							'smallint ∪ bigintnum': 10,
							'smallint ∪ numericnum': 10,
							'double ∪ int': 15.35325689124218,
							'double ∪ smallint': 15.35325689124218,
							'double ∪ double': 15.35325689124218,
							'double ∪ real': 15.35325689124218,
							'double ∪ smallserial': 15.35325689124218,
							'double ∪ serial': 15.35325689124218,
							'double ∪ bigserialnum': 15.35325689124218,
							'double ∪ bigintnum': 15.35325689124218,
							'double ∪ numericnum': 15.35325689124218,
							'real ∪ int': 1.048596,
							'real ∪ smallint': 1.048596,
							'real ∪ double': 1.0485960245132446,
							'real ∪ real': 1.048596,
							'real ∪ smallserial': 1.048596,
							'real ∪ serial': 1.048596,
							'smallserial ∪ int': 15,
							'smallserial ∪ smallint': 15,
							'smallserial ∪ double': 15,
							'smallserial ∪ real': 15,
							'smallserial ∪ smallserial': 15,
							'smallserial ∪ serial': 15,
							'smallserial ∪ bigserialnum': 15,
							'smallserial ∪ bigintnum': 15,
							'smallserial ∪ numericnum': 15,
							'serial ∪ int': 1,
							'serial ∪ smallint': 1,
							'serial ∪ double': 1,
							'serial ∪ real': 1,
							'serial ∪ smallserial': 1,
							'serial ∪ serial': 1,
							'serial ∪ bigserialnum': 1,
							'serial ∪ bigintnum': 1,
							'serial ∪ numericnum': 1,
							'bigserialnum ∪ int': 9007199254740991,
							'bigserialnum ∪ smallint': 9007199254740991,
							'bigserialnum ∪ double': 9007199254740991,
							'bigserialnum ∪ smallserial': 9007199254740991,
							'bigserialnum ∪ serial': 9007199254740991,
							'bigserialnum ∪ bigserialnum': 9007199254740991,
							'bigserialnum ∪ bigintnum': 9007199254740991,
							'bigserialnum ∪ numericnum': 9007199254740991,
							'bigintnum ∪ int': 9007199254740991,
							'bigintnum ∪ smallint': 9007199254740991,
							'bigintnum ∪ double': 9007199254740991,
							'bigintnum ∪ smallserial': 9007199254740991,
							'bigintnum ∪ serial': 9007199254740991,
							'bigintnum ∪ bigserialnum': 9007199254740991,
							'bigintnum ∪ bigintnum': 9007199254740991,
							'bigintnum ∪ numericnum': 9007199254740991,
							'numericnum ∪ int': 9007199254740991,
							'numericnum ∪ smallint': 9007199254740991,
							'numericnum ∪ double': 9007199254740991,
							'numericnum ∪ smallserial': 9007199254740991,
							'numericnum ∪ serial': 9007199254740991,
							'numericnum ∪ bigserialnum': 9007199254740991,
							'numericnum ∪ bigintnum': 9007199254740991,
							'numericnum ∪ numericnum': 9007199254740991,
						},
						{
							'int ∪ int': 621,
							'int ∪ smallint': 10,
							'int ∪ double': 15.35325689124218,
							'int ∪ real': 1.048596,
							'int ∪ smallserial': 15,
							'int ∪ serial': 1,
							'int ∪ bigserialnum': 9007199254740991,
							'int ∪ bigintnum': 9007199254740991,
							'int ∪ numericnum': 9007199254740991,
							'smallint ∪ int': 621,
							'smallint ∪ smallint': 10,
							'smallint ∪ double': 15.35325689124218,
							'smallint ∪ real': 1.048596,
							'smallint ∪ smallserial': 15,
							'smallint ∪ serial': 1,
							'smallint ∪ bigserialnum': 9007199254740991,
							'smallint ∪ bigintnum': 9007199254740991,
							'smallint ∪ numericnum': 9007199254740991,
							'double ∪ int': 621,
							'double ∪ smallint': 10,
							'double ∪ double': 15.35325689124218,
							'double ∪ real': 1.0485960245132446,
							'double ∪ smallserial': 15,
							'double ∪ serial': 1,
							'double ∪ bigserialnum': 9007199254740991,
							'double ∪ bigintnum': 9007199254740991,
							'double ∪ numericnum': 9007199254740991,
							'real ∪ int': 621,
							'real ∪ smallint': 10,
							'real ∪ double': 15.35325689124218,
							'real ∪ real': 1.048596,
							'real ∪ smallserial': 15,
							'real ∪ serial': 1,
							'smallserial ∪ int': 621,
							'smallserial ∪ smallint': 10,
							'smallserial ∪ double': 15.35325689124218,
							'smallserial ∪ real': 1.048596,
							'smallserial ∪ smallserial': 15,
							'smallserial ∪ serial': 1,
							'smallserial ∪ bigserialnum': 9007199254740991,
							'smallserial ∪ bigintnum': 9007199254740991,
							'smallserial ∪ numericnum': 9007199254740991,
							'serial ∪ int': 621,
							'serial ∪ smallint': 10,
							'serial ∪ double': 15.35325689124218,
							'serial ∪ real': 1.048596,
							'serial ∪ smallserial': 15,
							'serial ∪ serial': 1,
							'serial ∪ bigserialnum': 9007199254740991,
							'serial ∪ bigintnum': 9007199254740991,
							'serial ∪ numericnum': 9007199254740991,
							'bigserialnum ∪ int': 621,
							'bigserialnum ∪ smallint': 10,
							'bigserialnum ∪ double': 15.35325689124218,
							'bigserialnum ∪ smallserial': 15,
							'bigserialnum ∪ serial': 1,
							'bigserialnum ∪ bigserialnum': 9007199254740991,
							'bigserialnum ∪ bigintnum': 9007199254740991,
							'bigserialnum ∪ numericnum': 9007199254740991,
							'bigintnum ∪ int': 621,
							'bigintnum ∪ smallint': 10,
							'bigintnum ∪ double': 15.35325689124218,
							'bigintnum ∪ smallserial': 15,
							'bigintnum ∪ serial': 1,
							'bigintnum ∪ bigserialnum': 9007199254740991,
							'bigintnum ∪ bigintnum': 9007199254740991,
							'bigintnum ∪ numericnum': 9007199254740991,
							'numericnum ∪ int': 621,
							'numericnum ∪ smallint': 10,
							'numericnum ∪ double': 15.35325689124218,
							'numericnum ∪ smallserial': 15,
							'numericnum ∪ serial': 1,
							'numericnum ∪ bigserialnum': 9007199254740991,
							'numericnum ∪ bigintnum': 9007199254740991,
							'numericnum ∪ numericnum': 9007199254740991,
						},
					]));

					// ---- bigint ----
					expect(
						yield* unionAll(
							db.select({
								'bigint ∪ bigint': allTypesTable.bigint.as('bigint ∪ bigint'),
								'bigint ∪ bigserial': allTypesTable.bigint.as('bigint ∪ bigserial'),
								'bigint ∪ numericbig': allTypesTable.bigint.as('bigint ∪ numericbig'),
								'bigserial ∪ bigint': allTypesTable.bigserial.as('bigserial ∪ bigint'),
								'bigserial ∪ bigserial': allTypesTable.bigserial.as('bigserial ∪ bigserial'),
								'bigserial ∪ numericbig': allTypesTable.bigserial.as('bigserial ∪ numericbig'),
								'numericbig ∪ bigint': allTypesTable.numericbig.as('numericbig ∪ bigint'),
								'numericbig ∪ bigserial': allTypesTable.numericbig.as('numericbig ∪ bigserial'),
								'numericbig ∪ numericbig': allTypesTable.numericbig.as('numericbig ∪ numericbig'),
							}).from(allTypesTable),
							db.select({
								'bigint ∪ bigint': allTypesTable.bigint.as('bigint ∪ bigint'),
								'bigint ∪ bigserial': allTypesTable.bigserial.as('bigint ∪ bigserial'),
								'bigint ∪ numericbig': allTypesTable.numericbig.as('bigint ∪ numericbig'),
								'bigserial ∪ bigint': allTypesTable.bigint.as('bigserial ∪ bigint'),
								'bigserial ∪ bigserial': allTypesTable.bigserial.as('bigserial ∪ bigserial'),
								'bigserial ∪ numericbig': allTypesTable.numericbig.as('bigserial ∪ numericbig'),
								'numericbig ∪ bigint': allTypesTable.bigint.as('numericbig ∪ bigint'),
								'numericbig ∪ bigserial': allTypesTable.bigserial.as('numericbig ∪ bigserial'),
								'numericbig ∪ numericbig': allTypesTable.numericbig.as('numericbig ∪ numericbig'),
							}).from(allTypesTable),
						),
					).toEqual(expect.arrayContaining([
						{
							'bigint ∪ bigint': 5044565289845416380n,
							'bigint ∪ bigserial': 5044565289845416380n,
							'bigint ∪ numericbig': 5044565289845416380n,
							'bigserial ∪ bigint': 5044565289845416380n,
							'bigserial ∪ bigserial': 5044565289845416380n,
							'bigserial ∪ numericbig': 5044565289845416380n,
							'numericbig ∪ bigint': 5044565289845416380n,
							'numericbig ∪ bigserial': 5044565289845416380n,
							'numericbig ∪ numericbig': 5044565289845416380n,
						},
						{
							'bigint ∪ bigint': 5044565289845416380n,
							'bigint ∪ bigserial': 5044565289845416380n,
							'bigint ∪ numericbig': 5044565289845416380n,
							'bigserial ∪ bigint': 5044565289845416380n,
							'bigserial ∪ bigserial': 5044565289845416380n,
							'bigserial ∪ numericbig': 5044565289845416380n,
							'numericbig ∪ bigint': 5044565289845416380n,
							'numericbig ∪ bigserial': 5044565289845416380n,
							'numericbig ∪ numericbig': 5044565289845416380n,
						},
					]));

					// ---- text ----
					expect(
						yield* unionAll(
							db.select({
								'varchar ∪ varchar': allTypesTable.varchar.as('varchar ∪ varchar'),
								'varchar ∪ text': allTypesTable.varchar.as('varchar ∪ text'),
								'text ∪ varchar': allTypesTable.text.as('text ∪ varchar'),
								'text ∪ text': allTypesTable.text.as('text ∪ text'),
							}).from(allTypesTable),
							db.select({
								'varchar ∪ varchar': allTypesTable.varchar.as('varchar ∪ varchar'),
								'varchar ∪ text': allTypesTable.text.as('varchar ∪ text'),
								'text ∪ varchar': allTypesTable.varchar.as('text ∪ varchar'),
								'text ∪ text': allTypesTable.text.as('text ∪ text'),
							}).from(allTypesTable),
						),
					).toEqual(expect.arrayContaining([
						{
							'varchar ∪ varchar': 'C4-',
							'varchar ∪ text': 'C4-',
							'text ∪ varchar': 'TEXT STRING',
							'text ∪ text': 'TEXT STRING',
						},
						{
							'varchar ∪ varchar': 'C4-',
							'varchar ∪ text': 'TEXT STRING',
							'text ∪ varchar': 'C4-',
							'text ∪ text': 'TEXT STRING',
						},
					]));

					// ---- numstr ----
					expect(
						yield* unionAll(
							db.select({
								'bigintstr ∪ bigintstr': allTypesTable.bigintstr.as('bigintstr ∪ bigintstr'),
								'bigintstr ∪ numeric': allTypesTable.bigintstr.as('bigintstr ∪ numeric'),
								'numeric ∪ bigintstr': allTypesTable.numeric.as('numeric ∪ bigintstr'),
								'numeric ∪ numeric': allTypesTable.numeric.as('numeric ∪ numeric'),
							}).from(allTypesTable),
							db.select({
								'bigintstr ∪ bigintstr': allTypesTable.bigintstr.as('bigintstr ∪ bigintstr'),
								'bigintstr ∪ numeric': allTypesTable.numeric.as('bigintstr ∪ numeric'),
								'numeric ∪ bigintstr': allTypesTable.bigintstr.as('numeric ∪ bigintstr'),
								'numeric ∪ numeric': allTypesTable.numeric.as('numeric ∪ numeric'),
							}).from(allTypesTable),
						),
					).toEqual(expect.arrayContaining([
						{
							'bigintstr ∪ bigintstr': '5044565289845416380',
							'bigintstr ∪ numeric': '5044565289845416380',
							'numeric ∪ bigintstr': '5044565289845416380',
							'numeric ∪ numeric': '5044565289845416380',
						},
						{
							'bigintstr ∪ bigintstr': '5044565289845416380',
							'bigintstr ∪ numeric': '5044565289845416380',
							'numeric ∪ bigintstr': '5044565289845416380',
							'numeric ∪ numeric': '5044565289845416380',
						},
					]));

					// ---- date ----
					expect(
						yield* unionAll(
							db.select({
								'date ∪ date': allTypesTable.date.as('date ∪ date'),
								'date ∪ timestamp': allTypesTable.date.as('date ∪ timestamp'),
								'date ∪ timestampTz': allTypesTable.date.as('date ∪ timestampTz'),
								'timestamp ∪ date': allTypesTable.timestamp.as('timestamp ∪ date'),
								'timestamp ∪ timestamp': allTypesTable.timestamp.as('timestamp ∪ timestamp'),
								'timestamp ∪ timestampTz': allTypesTable.timestamp.as('timestamp ∪ timestampTz'),
								'timestampTz ∪ date': allTypesTable.timestampTz.as('timestampTz ∪ date'),
								'timestampTz ∪ timestamp': allTypesTable.timestampTz.as('timestampTz ∪ timestamp'),
								'timestampTz ∪ timestampTz': allTypesTable.timestampTz.as('timestampTz ∪ timestampTz'),
							}).from(allTypesTable),
							db.select({
								'date ∪ date': allTypesTable.date.as('date ∪ date'),
								'date ∪ timestamp': allTypesTable.timestamp.as('date ∪ timestamp'),
								'date ∪ timestampTz': allTypesTable.timestampTz.as('date ∪ timestampTz'),
								'timestamp ∪ date': allTypesTable.date.as('timestamp ∪ date'),
								'timestamp ∪ timestamp': allTypesTable.timestamp.as('timestamp ∪ timestamp'),
								'timestamp ∪ timestampTz': allTypesTable.timestampTz.as('timestamp ∪ timestampTz'),
								'timestampTz ∪ date': allTypesTable.date.as('timestampTz ∪ date'),
								'timestampTz ∪ timestamp': allTypesTable.timestamp.as('timestampTz ∪ timestamp'),
								'timestampTz ∪ timestampTz': allTypesTable.timestampTz.as('timestampTz ∪ timestampTz'),
							}).from(allTypesTable),
						),
					).toEqual(expect.arrayContaining([
						{
							'date ∪ date': new Date('2025-03-12'),
							'date ∪ timestamp': new Date('2025-03-12'),
							'date ∪ timestampTz': new Date('2025-03-12'),
							'timestamp ∪ date': new Date('2025-03-12 01:32:41.623'),
							'timestamp ∪ timestamp': new Date('2025-03-12 01:32:41.623'),
							'timestamp ∪ timestampTz': new Date('2025-03-12 01:32:41.623'),
							'timestampTz ∪ date': new Date('2025-03-12 01:32:41.623+00'),
							'timestampTz ∪ timestamp': new Date('2025-03-12 01:32:41.623+00'),
							'timestampTz ∪ timestampTz': new Date('2025-03-12 01:32:41.623+00'),
						},
						{
							'date ∪ date': new Date('2025-03-12'),
							'date ∪ timestamp': new Date('2025-03-12 01:32:41.623'),
							'date ∪ timestampTz': new Date('2025-03-12 01:32:41.623+00'),
							'timestamp ∪ date': new Date('2025-03-12'),
							'timestamp ∪ timestamp': new Date('2025-03-12 01:32:41.623'),
							'timestamp ∪ timestampTz': new Date('2025-03-12 01:32:41.623+00'),
							'timestampTz ∪ date': new Date('2025-03-12'),
							'timestampTz ∪ timestamp': new Date('2025-03-12 01:32:41.623'),
							'timestampTz ∪ timestampTz': new Date('2025-03-12 01:32:41.623+00'),
						},
					]));

					// ---- json ----
					expect(
						yield* unionAll(
							db.select({
								'json ∪ json': allTypesTable.json.as('json ∪ json'),
								'json ∪ json1': allTypesTable.json.as('json ∪ json1'),
								'json ∪ json2': allTypesTable.json.as('json ∪ json2'),
								'json ∪ json3': allTypesTable.json.as('json ∪ json3'),
								'json1 ∪ json': allTypesTable.json1.as('json1 ∪ json'),
								'json1 ∪ json1': allTypesTable.json1.as('json1 ∪ json1'),
								'json1 ∪ json2': allTypesTable.json1.as('json1 ∪ json2'),
								'json1 ∪ json3': allTypesTable.json1.as('json1 ∪ json3'),
								'json2 ∪ json': allTypesTable.json2.as('json2 ∪ json'),
								'json2 ∪ json1': allTypesTable.json2.as('json2 ∪ json1'),
								'json2 ∪ json2': allTypesTable.json2.as('json2 ∪ json2'),
								'json2 ∪ json3': allTypesTable.json2.as('json2 ∪ json3'),
								'json3 ∪ json': allTypesTable.json3.as('json3 ∪ json'),
								'json3 ∪ json1': allTypesTable.json3.as('json3 ∪ json1'),
								'json3 ∪ json2': allTypesTable.json3.as('json3 ∪ json2'),
								'json3 ∪ json3': allTypesTable.json3.as('json3 ∪ json3'),
							}).from(allTypesTable),
							db.select({
								'json ∪ json': allTypesTable.json.as('json ∪ json'),
								'json ∪ json1': allTypesTable.json1.as('json ∪ json1'),
								'json ∪ json2': allTypesTable.json2.as('json ∪ json2'),
								'json ∪ json3': allTypesTable.json3.as('json ∪ json3'),
								'json1 ∪ json': allTypesTable.json.as('json1 ∪ json'),
								'json1 ∪ json1': allTypesTable.json1.as('json1 ∪ json1'),
								'json1 ∪ json2': allTypesTable.json2.as('json1 ∪ json2'),
								'json1 ∪ json3': allTypesTable.json3.as('json1 ∪ json3'),
								'json2 ∪ json': allTypesTable.json.as('json2 ∪ json'),
								'json2 ∪ json1': allTypesTable.json1.as('json2 ∪ json1'),
								'json2 ∪ json2': allTypesTable.json2.as('json2 ∪ json2'),
								'json2 ∪ json3': allTypesTable.json3.as('json2 ∪ json3'),
								'json3 ∪ json': allTypesTable.json.as('json3 ∪ json'),
								'json3 ∪ json1': allTypesTable.json1.as('json3 ∪ json1'),
								'json3 ∪ json2': allTypesTable.json2.as('json3 ∪ json2'),
								'json3 ∪ json3': allTypesTable.json3.as('json3 ∪ json3'),
							}).from(allTypesTable),
						),
					).toEqual(expect.arrayContaining([
						{
							'json ∪ json': { str: 'strval', arr: ['str', 10] },
							'json ∪ json1': { str: 'strval', arr: ['str', 10] },
							'json ∪ json2': { str: 'strval', arr: ['str', 10] },
							'json ∪ json3': { str: 'strval', arr: ['str', 10] },
							'json1 ∪ json': [{ key: 'value', num: 7 }, 'v', '11', 5],
							'json1 ∪ json1': [{ key: 'value', num: 7 }, 'v', '11', 5],
							'json1 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
							'json1 ∪ json3': [{ key: 'value', num: 7 }, 'v', '11', 5],
							'json2 ∪ json': 5,
							'json2 ∪ json1': 5,
							'json2 ∪ json2': 5,
							'json2 ∪ json3': 5,
							'json3 ∪ json': '5',
							'json3 ∪ json1': '5',
							'json3 ∪ json2': '5',
							'json3 ∪ json3': '5',
						},
						{
							'json ∪ json': { str: 'strval', arr: ['str', 10] },
							'json ∪ json1': [{ key: 'value', num: 7 }, 'v', '11', 5],
							'json ∪ json2': 5,
							'json ∪ json3': '5',
							'json1 ∪ json': { str: 'strval', arr: ['str', 10] },
							'json1 ∪ json1': [{ key: 'value', num: 7 }, 'v', '11', 5],
							'json1 ∪ json2': 5,
							'json1 ∪ json3': '5',
							'json2 ∪ json': { str: 'strval', arr: ['str', 10] },
							'json2 ∪ json1': [{ key: 'value', num: 7 }, 'v', '11', 5],
							'json2 ∪ json2': 5,
							'json2 ∪ json3': '5',
							'json3 ∪ json': { str: 'strval', arr: ['str', 10] },
							'json3 ∪ json1': [{ key: 'value', num: 7 }, 'v', '11', 5],
							'json3 ∪ json2': 5,
							'json3 ∪ json3': '5',
						},
					]));

					// ---- jsonb ----
					expect(
						yield* unionAll(
							db.select({
								'jsonb ∪ jsonb': allTypesTable.jsonb.as('jsonb ∪ jsonb'),
								'jsonb ∪ jsonb1': allTypesTable.jsonb.as('jsonb ∪ jsonb1'),
								'jsonb ∪ jsonb2': allTypesTable.jsonb.as('jsonb ∪ jsonb2'),
								'jsonb ∪ jsonb3': allTypesTable.jsonb.as('jsonb ∪ jsonb3'),
								'jsonb1 ∪ jsonb': allTypesTable.jsonb1.as('jsonb1 ∪ jsonb'),
								'jsonb1 ∪ jsonb1': allTypesTable.jsonb1.as('jsonb1 ∪ jsonb1'),
								'jsonb1 ∪ jsonb2': allTypesTable.jsonb1.as('jsonb1 ∪ jsonb2'),
								'jsonb1 ∪ jsonb3': allTypesTable.jsonb1.as('jsonb1 ∪ jsonb3'),
								'jsonb2 ∪ jsonb': allTypesTable.jsonb2.as('jsonb2 ∪ jsonb'),
								'jsonb2 ∪ jsonb1': allTypesTable.jsonb2.as('jsonb2 ∪ jsonb1'),
								'jsonb2 ∪ jsonb2': allTypesTable.jsonb2.as('jsonb2 ∪ jsonb2'),
								'jsonb2 ∪ jsonb3': allTypesTable.jsonb2.as('jsonb2 ∪ jsonb3'),
								'jsonb3 ∪ jsonb': allTypesTable.jsonb3.as('jsonb3 ∪ jsonb'),
								'jsonb3 ∪ jsonb1': allTypesTable.jsonb3.as('jsonb3 ∪ jsonb1'),
								'jsonb3 ∪ jsonb2': allTypesTable.jsonb3.as('jsonb3 ∪ jsonb2'),
								'jsonb3 ∪ jsonb3': allTypesTable.jsonb3.as('jsonb3 ∪ jsonb3'),
							}).from(allTypesTable),
							db.select({
								'jsonb ∪ jsonb': allTypesTable.jsonb.as('jsonb ∪ jsonb'),
								'jsonb ∪ jsonb1': allTypesTable.jsonb1.as('jsonb ∪ jsonb1'),
								'jsonb ∪ jsonb2': allTypesTable.jsonb2.as('jsonb ∪ jsonb2'),
								'jsonb ∪ jsonb3': allTypesTable.jsonb3.as('jsonb ∪ jsonb3'),
								'jsonb1 ∪ jsonb': allTypesTable.jsonb.as('jsonb1 ∪ jsonb'),
								'jsonb1 ∪ jsonb1': allTypesTable.jsonb1.as('jsonb1 ∪ jsonb1'),
								'jsonb1 ∪ jsonb2': allTypesTable.jsonb2.as('jsonb1 ∪ jsonb2'),
								'jsonb1 ∪ jsonb3': allTypesTable.jsonb3.as('jsonb1 ∪ jsonb3'),
								'jsonb2 ∪ jsonb': allTypesTable.jsonb.as('jsonb2 ∪ jsonb'),
								'jsonb2 ∪ jsonb1': allTypesTable.jsonb1.as('jsonb2 ∪ jsonb1'),
								'jsonb2 ∪ jsonb2': allTypesTable.jsonb2.as('jsonb2 ∪ jsonb2'),
								'jsonb2 ∪ jsonb3': allTypesTable.jsonb3.as('jsonb2 ∪ jsonb3'),
								'jsonb3 ∪ jsonb': allTypesTable.jsonb.as('jsonb3 ∪ jsonb'),
								'jsonb3 ∪ jsonb1': allTypesTable.jsonb1.as('jsonb3 ∪ jsonb1'),
								'jsonb3 ∪ jsonb2': allTypesTable.jsonb2.as('jsonb3 ∪ jsonb2'),
								'jsonb3 ∪ jsonb3': allTypesTable.jsonb3.as('jsonb3 ∪ jsonb3'),
							}).from(allTypesTable),
						),
					).toEqual(expect.arrayContaining([
						{
							'jsonb ∪ jsonb': { arr: ['strb', 11], str: 'strvalb' },
							'jsonb ∪ jsonb1': { arr: ['strb', 11], str: 'strvalb' },
							'jsonb ∪ jsonb2': { arr: ['strb', 11], str: 'strvalb' },
							'jsonb ∪ jsonb3': { arr: ['strb', 11], str: 'strvalb' },
							'jsonb1 ∪ jsonb': [{ key: 'value', num: 8 }, 'x', '10', 3],
							'jsonb1 ∪ jsonb1': [{ key: 'value', num: 8 }, 'x', '10', 3],
							'jsonb1 ∪ jsonb2': [{ key: 'value', num: 8 }, 'x', '10', 3],
							'jsonb1 ∪ jsonb3': [{ key: 'value', num: 8 }, 'x', '10', 3],
							'jsonb2 ∪ jsonb': 7,
							'jsonb2 ∪ jsonb1': 7,
							'jsonb2 ∪ jsonb2': 7,
							'jsonb2 ∪ jsonb3': 7,
							'jsonb3 ∪ jsonb': '7',
							'jsonb3 ∪ jsonb1': '7',
							'jsonb3 ∪ jsonb2': '7',
							'jsonb3 ∪ jsonb3': '7',
						},
						{
							'jsonb ∪ jsonb': { arr: ['strb', 11], str: 'strvalb' },
							'jsonb ∪ jsonb1': [{ key: 'value', num: 8 }, 'x', '10', 3],
							'jsonb ∪ jsonb2': 7,
							'jsonb ∪ jsonb3': '7',
							'jsonb1 ∪ jsonb': { arr: ['strb', 11], str: 'strvalb' },
							'jsonb1 ∪ jsonb1': [{ key: 'value', num: 8 }, 'x', '10', 3],
							'jsonb1 ∪ jsonb2': 7,
							'jsonb1 ∪ jsonb3': '7',
							'jsonb2 ∪ jsonb': { arr: ['strb', 11], str: 'strvalb' },
							'jsonb2 ∪ jsonb1': [{ key: 'value', num: 8 }, 'x', '10', 3],
							'jsonb2 ∪ jsonb2': 7,
							'jsonb2 ∪ jsonb3': '7',
							'jsonb3 ∪ jsonb': { arr: ['strb', 11], str: 'strvalb' },
							'jsonb3 ∪ jsonb1': [{ key: 'value', num: 8 }, 'x', '10', 3],
							'jsonb3 ∪ jsonb2': 7,
							'jsonb3 ∪ jsonb3': '7',
						},
					]));

					// ---- self-only ----
					expect(
						yield* unionAll(
							db.select({
								'char ∪ char': allTypesTable.char.as('char ∪ char'),
								'cidr ∪ cidr': allTypesTable.cidr.as('cidr ∪ cidr'),
								'inet ∪ inet': allTypesTable.inet.as('inet ∪ inet'),
								'macaddr ∪ macaddr': allTypesTable.macaddr.as('macaddr ∪ macaddr'),
								'macaddr8 ∪ macaddr8': allTypesTable.macaddr8.as('macaddr8 ∪ macaddr8'),
								'uuid ∪ uuid': allTypesTable.uuid.as('uuid ∪ uuid'),
								'interval ∪ interval': allTypesTable.interval.as('interval ∪ interval'),
								'time ∪ time': allTypesTable.time.as('time ∪ time'),
								'datestr ∪ datestr': allTypesTable.datestr.as('datestr ∪ datestr'),
								'timestampstr ∪ timestampstr': allTypesTable.timestampstr.as('timestampstr ∪ timestampstr'),
								'timestampTzstr ∪ timestampTzstr': allTypesTable.timestampTzstr.as('timestampTzstr ∪ timestampTzstr'),
								'bool ∪ bool': allTypesTable.bool.as('bool ∪ bool'),
								'bytea ∪ bytea': allTypesTable.bytea.as('bytea ∪ bytea'),
								'enum ∪ enum': allTypesTable.enum.as('enum ∪ enum'),
								'line ∪ line': allTypesTable.line.as('line ∪ line'),
								'linetuple ∪ linetuple': allTypesTable.linetuple.as('linetuple ∪ linetuple'),
								'point ∪ point': allTypesTable.point.as('point ∪ point'),
								'pointtuple ∪ pointtuple': allTypesTable.pointtuple.as('pointtuple ∪ pointtuple'),
							}).from(allTypesTable),
							db.select({
								'char ∪ char': allTypesTable.char.as('char ∪ char'),
								'cidr ∪ cidr': allTypesTable.cidr.as('cidr ∪ cidr'),
								'inet ∪ inet': allTypesTable.inet.as('inet ∪ inet'),
								'macaddr ∪ macaddr': allTypesTable.macaddr.as('macaddr ∪ macaddr'),
								'macaddr8 ∪ macaddr8': allTypesTable.macaddr8.as('macaddr8 ∪ macaddr8'),
								'uuid ∪ uuid': allTypesTable.uuid.as('uuid ∪ uuid'),
								'interval ∪ interval': allTypesTable.interval.as('interval ∪ interval'),
								'time ∪ time': allTypesTable.time.as('time ∪ time'),
								'datestr ∪ datestr': allTypesTable.datestr.as('datestr ∪ datestr'),
								'timestampstr ∪ timestampstr': allTypesTable.timestampstr.as('timestampstr ∪ timestampstr'),
								'timestampTzstr ∪ timestampTzstr': allTypesTable.timestampTzstr.as('timestampTzstr ∪ timestampTzstr'),
								'bool ∪ bool': allTypesTable.bool.as('bool ∪ bool'),
								'bytea ∪ bytea': allTypesTable.bytea.as('bytea ∪ bytea'),
								'enum ∪ enum': allTypesTable.enum.as('enum ∪ enum'),
								'line ∪ line': allTypesTable.line.as('line ∪ line'),
								'linetuple ∪ linetuple': allTypesTable.linetuple.as('linetuple ∪ linetuple'),
								'point ∪ point': allTypesTable.point.as('point ∪ point'),
								'pointtuple ∪ pointtuple': allTypesTable.pointtuple.as('pointtuple ∪ pointtuple'),
							}).from(allTypesTable),
						),
					).toEqual(expect.arrayContaining([
						{
							'char ∪ char': 'c',
							'cidr ∪ cidr': '2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128',
							'inet ∪ inet': '192.168.0.1/24',
							'macaddr ∪ macaddr': '08:00:2b:01:02:03',
							'macaddr8 ∪ macaddr8': '08:00:2b:01:02:03:04:05',
							'uuid ∪ uuid': 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
							'interval ∪ interval': '-2 mons',
							'time ∪ time': '13:59:28',
							'datestr ∪ datestr': '2025-03-12',
							'timestampstr ∪ timestampstr': '2025-03-12 01:32:41.623',
							'timestampTzstr ∪ timestampTzstr': '2025-03-12 01:32:41.623+00',
							'bool ∪ bool': true,
							'bytea ∪ bytea': Buffer.from('BYTES'),
							'enum ∪ enum': 'enVal1',
							'line ∪ line': { a: 1, b: 2, c: 3 },
							'linetuple ∪ linetuple': [1, 2, 3],
							'point ∪ point': { x: 24.5, y: 49.6 },
							'pointtuple ∪ pointtuple': [24.5, 49.6],
						},
						{
							'char ∪ char': 'c',
							'cidr ∪ cidr': '2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128',
							'inet ∪ inet': '192.168.0.1/24',
							'macaddr ∪ macaddr': '08:00:2b:01:02:03',
							'macaddr8 ∪ macaddr8': '08:00:2b:01:02:03:04:05',
							'uuid ∪ uuid': 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
							'interval ∪ interval': '-2 mons',
							'time ∪ time': '13:59:28',
							'datestr ∪ datestr': '2025-03-12',
							'timestampstr ∪ timestampstr': '2025-03-12 01:32:41.623',
							'timestampTzstr ∪ timestampTzstr': '2025-03-12 01:32:41.623+00',
							'bool ∪ bool': true,
							'bytea ∪ bytea': Buffer.from('BYTES'),
							'enum ∪ enum': 'enVal1',
							'line ∪ line': { a: 1, b: 2, c: 3 },
							'linetuple ∪ linetuple': [1, 2, 3],
							'point ∪ point': { x: 24.5, y: 49.6 },
							'pointtuple ∪ pointtuple': [24.5, 49.6],
						},
					]));
				}),
		);

		it.effect('Mappers: - correct mappers enabled', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const jitDb = yield* createDB({}, () => ({}), true);

				const dialect: PgDialect = (<any> db).dialect;
				const jitDialect: PgDialect = (<any> jitDb).dialect;

				expect(dialect.mapperGenerators.relationalRows === makeDefaultRqbMapper).toStrictEqual(true);
				expect(dialect.mapperGenerators.rows === makeDefaultQueryMapper).toStrictEqual(true);
				expect(jitDialect.mapperGenerators.relationalRows === makeJitRqbMapper).toStrictEqual(true);
				expect(jitDialect.mapperGenerators.rows === makeJitQueryMapper).toStrictEqual(true);
			}));

		const mappersDate = new Date('2026-04-02T00:00:00.000Z');

		it.effect('Mappers: simple select - no rows', () =>
			Effect.gen(function*() {
				const users = pgTable('mappers_users_1', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const db = yield* DB;
				yield* push(db, { users });

				const result = yield* db.select().from(users);

				expect(result).toStrictEqual([]);
			}));

		it.effect('Mappers: select - nothing to decode - text', () =>
			Effect.gen(function*() {
				const users = pgTable('mappers_users_2', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}]).returning();

				const selected = yield* db.select({ name: users.name }).from(users);

				expect(selected).toStrictEqual([{ name: 'First' }]);
			}));

		it.effect('Mappers: select - nothing to decode - null', () =>
			Effect.gen(function*() {
				const users = pgTable('mappers_users_3', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}]).returning();

				const selected = yield* db.select({ isBanned: users.isBanned }).from(users);

				expect(selected).toStrictEqual([{ isBanned: null }]);
			}));

		it.effect('Mappers: insert returning all + select + update returning + delete returning', () =>
			Effect.gen(function*() {
				const users = pgTable('mappers_users_4', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const db = yield* DB;
				yield* push(db, { users });

				const inserted = yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
				}]).returning();

				const selected = yield* db.select().from(users);

				const updated = yield* db.update(users).set({
					isBanned: false,
				}).where(eq(users.id, 2)).returning();

				const deleted = yield* db.delete(users).returning();

				expect(inserted).toStrictEqual([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]);
				expect(selected).toStrictEqual([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]);
				expect(updated).toStrictEqual([{
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: false,
				}]);
				expect(deleted).toStrictEqual(expect.arrayContaining([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: false,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]));
			}));

		it.effect('Mappers: select complex selections', () =>
			Effect.gen(function*() {
				const users = pgTable('mappers_users_5', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const posts = pgTable('mappers_posts_1', (t) => ({
					id: t.integer('id').primaryKey(),
					authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
					content: t.text('content'),
				}));

				const db = yield* DB;
				yield* push(db, { users, posts });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
				}]).returning();
				yield* db.insert(posts).values({
					id: 1,
					authorId: 1,
					content: 'p1',
				});

				const selected1 = yield* db.select({ user: users, post: posts }).from(users).leftJoin(
					posts,
					eq(users.id, posts.authorId),
				);
				const selected2 = yield* db.select({ user: users, post: posts }).from(users).innerJoin(
					posts,
					eq(users.id, posts.authorId),
				);
				const selected3 = yield* db.select({
					userId: users.id,
					postId: posts.id,
					name: users.name,
					isBanned: users.isBanned,
					content: posts.content,
					createdAt: users.createdAt,
				}).from(users).leftJoin(
					posts,
					eq(users.id, posts.authorId),
				);
				const selected4 = yield* db.select({
					userId: users.id,
					postId: posts.id,
					name: users.name,
					isBanned: users.isBanned,
					content: posts.content,
					createdAt: users.createdAt,
				}).from(users).innerJoin(
					posts,
					eq(users.id, posts.authorId),
				);

				expect(selected1).toStrictEqual([{
					user: {
						id: 1,
						name: 'First',
						createdAt: mappersDate,
						isBanned: null,
					},
					post: {
						id: 1,
						authorId: 1,
						content: 'p1',
					},
				}, {
					user: {
						id: 2,
						name: 'Second',
						createdAt: mappersDate,
						isBanned: true,
					},
					post: null,
				}, {
					user: {
						id: 3,
						name: 'Third',
						createdAt: mappersDate,
						isBanned: null,
					},
					post: null,
				}]);
				expect(selected2).toStrictEqual([{
					user: {
						id: 1,
						name: 'First',
						createdAt: mappersDate,
						isBanned: null,
					},
					post: {
						id: 1,
						authorId: 1,
						content: 'p1',
					},
				}]);
				expect(selected3).toStrictEqual([
					{
						content: 'p1',
						createdAt: mappersDate,
						isBanned: null,
						name: 'First',
						postId: 1,
						userId: 1,
					},
					{
						content: null,
						createdAt: mappersDate,
						isBanned: true,
						name: 'Second',
						postId: null,
						userId: 2,
					},
					{
						content: null,
						createdAt: mappersDate,
						isBanned: null,
						name: 'Third',
						postId: null,
						userId: 3,
					},
				]);
				expect(selected4).toStrictEqual([
					{
						content: 'p1',
						createdAt: mappersDate,
						isBanned: null,
						name: 'First',
						postId: 1,
						userId: 1,
					},
				]);
			}));

		it.effect('Mappers: relational', () =>
			Effect.gen(function*() {
				const users = pgTable('mappers_users_6', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const posts = pgTable('mappers_posts_2', (t) => ({
					id: t.integer('id').primaryKey(),
					authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
					content: t.text('content'),
				}));

				const db = yield* createDB(
					{ users, posts },
					(r) => ({
						users: {
							post: r.one.posts({
								from: r.users.id,
								to: r.posts.authorId,
							}),
							posts: r.one.posts({
								from: r.users.id,
								to: r.posts.authorId,
							}),
						},
						posts: {
							author: r.one.users({
								from: r.posts.authorId,
								to: r.users.id,
							}),
							authors: r.many.users({
								from: r.posts.authorId,
								to: r.users.id,
							}),
						},
					}),
					false,
				);
				yield* push(db, { users, posts });

				const empty1 = yield* db.query.users.findFirst();
				const empty2 = yield* db.query.users.findMany();

				expect(empty1).toStrictEqual(undefined);
				expect(empty2).toStrictEqual([]);

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
				}]).returning();
				yield* db.insert(posts).values({
					id: 1,
					authorId: 1,
					content: 'p1',
				});

				const simple1 = yield* db.query.users.findFirst();
				const simple2 = yield* db.query.users.findMany();

				expect(simple1).toStrictEqual(
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
					},
				);
				expect(simple2).toStrictEqual([
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
					},
					{
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
					},
					{
						createdAt: mappersDate,
						id: 3,
						isBanned: null,
						name: 'Third',
					},
				]);

				const extra1 = yield* db.query.users.findFirst({
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				});
				const extra2 = yield* db.query.users.findMany({
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				});

				expect(extra1).toStrictEqual(
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
				);
				expect(extra2).toStrictEqual([
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
						id: 3,
						isBanned: null,
						name: 'Third',
						sql: 1,
						sqlWrapper: 2,
					},
				]);

				const nested1 = yield* db.query.users.findFirst({
					with: {
						post: {
							with: {
								author: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
									where: {
										RAW: sql`false`,
									},
								},
								authors: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
									where: {
										RAW: sql`false`,
									},
								},
							},
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
						posts: {
							with: {
								author: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
								},
								authors: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
								},
							},
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				});
				const nested2 = yield* db.query.users.findMany({
					with: {
						post: {
							with: {
								author: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
									where: {
										RAW: sql`false`,
									},
								},
								authors: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
									where: {
										RAW: sql`false`,
									},
								},
							},
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
						posts: {
							with: {
								author: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
								},
								authors: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
								},
							},
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				});

				expect(nested1).toStrictEqual(
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						post: {
							author: null,
							authorId: 1,
							authors: [],
							content: 'p1',
							id: 1,
							sql: 1,
							sqlWrapper: 2,
						},
						posts: {
							author: {
								createdAt: mappersDate,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
							authorId: 1,
							authors: [
								{
									createdAt: mappersDate,
									id: 1,
									isBanned: null,
									name: 'First',
									sql: 1,
									sqlWrapper: 2,
								},
							],
							content: 'p1',
							id: 1,
							sql: 1,
							sqlWrapper: 2,
						},
						sql: 1,
						sqlWrapper: 2,
					},
				);
				expect(nested2).toStrictEqual([
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						post: {
							author: null,
							authorId: 1,
							authors: [],
							content: 'p1',
							id: 1,
							sql: 1,
							sqlWrapper: 2,
						},
						posts: {
							author: {
								createdAt: mappersDate,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
							authorId: 1,
							authors: [
								{
									createdAt: mappersDate,
									id: 1,
									isBanned: null,
									name: 'First',
									sql: 1,
									sqlWrapper: 2,
								},
							],
							content: 'p1',
							id: 1,
							sql: 1,
							sqlWrapper: 2,
						},
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
						post: null,
						posts: null,
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
						id: 3,
						isBanned: null,
						name: 'Third',
						post: null,
						posts: null,
						sql: 1,
						sqlWrapper: 2,
					},
				]);
			}));

		it.effect('Jit mappers: - simple select - no rows', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_1', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users });

				const result = yield* db.select().from(users);

				expect(result).toStrictEqual([]);
			}));

		it.effect('Jit mappers: - select - nothing to decode - text', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_2', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}]).returning();

				const selected = yield* db.select({ name: users.name }).from(users);

				expect(selected).toStrictEqual([{ name: 'First' }]);
			}));

		it.effect('Jit mappers: - select - nothing to decode - null', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_3', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}]).returning();

				const selected = yield* db.select({ isBanned: users.isBanned }).from(users);

				expect(selected).toStrictEqual([{ isBanned: null }]);
			}));

		it.effect('Jit mappers: - insert returning all + select + update returning + delete returning', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_4', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users });

				const inserted = yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
				}]).returning();

				const selected = yield* db.select().from(users);

				const updated = yield* db.update(users).set({
					isBanned: false,
				}).where(eq(users.id, 2)).returning();

				const deleted = yield* db.delete(users).returning();

				expect(inserted).toStrictEqual([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]);
				expect(selected).toStrictEqual([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]);
				expect(updated).toStrictEqual([{
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: false,
				}]);
				expect(deleted).toStrictEqual(expect.arrayContaining([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: false,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]));
			}));

		it.effect('Jit mappers: - select complex selections', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_5', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const posts = pgTable('jit_mappers_posts_1', (t) => ({
					id: t.integer('id').primaryKey(),
					authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
					content: t.text('content'),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users, posts });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
				}]).returning();
				yield* db.insert(posts).values({
					id: 1,
					authorId: 1,
					content: 'p1',
				});

				const selected1 = yield* db.select({ user: users, post: posts }).from(users).leftJoin(
					posts,
					eq(users.id, posts.authorId),
				);
				const selected2 = yield* db.select({ user: users, post: posts }).from(users).innerJoin(
					posts,
					eq(users.id, posts.authorId),
				);
				const selected3 = yield* db.select({
					userId: users.id,
					postId: posts.id,
					name: users.name,
					isBanned: users.isBanned,
					content: posts.content,
					createdAt: users.createdAt,
				}).from(users).leftJoin(
					posts,
					eq(users.id, posts.authorId),
				);
				const selected4 = yield* db.select({
					userId: users.id,
					postId: posts.id,
					name: users.name,
					isBanned: users.isBanned,
					content: posts.content,
					createdAt: users.createdAt,
				}).from(users).innerJoin(
					posts,
					eq(users.id, posts.authorId),
				);

				expect(selected1).toStrictEqual([{
					user: {
						id: 1,
						name: 'First',
						createdAt: mappersDate,
						isBanned: null,
					},
					post: {
						id: 1,
						authorId: 1,
						content: 'p1',
					},
				}, {
					user: {
						id: 2,
						name: 'Second',
						createdAt: mappersDate,
						isBanned: true,
					},
					post: null,
				}, {
					user: {
						id: 3,
						name: 'Third',
						createdAt: mappersDate,
						isBanned: null,
					},
					post: null,
				}]);
				expect(selected2).toStrictEqual([{
					user: {
						id: 1,
						name: 'First',
						createdAt: mappersDate,
						isBanned: null,
					},
					post: {
						id: 1,
						authorId: 1,
						content: 'p1',
					},
				}]);
				expect(selected3).toStrictEqual([
					{
						content: 'p1',
						createdAt: mappersDate,
						isBanned: null,
						name: 'First',
						postId: 1,
						userId: 1,
					},
					{
						content: null,
						createdAt: mappersDate,
						isBanned: true,
						name: 'Second',
						postId: null,
						userId: 2,
					},
					{
						content: null,
						createdAt: mappersDate,
						isBanned: null,
						name: 'Third',
						postId: null,
						userId: 3,
					},
				]);
				expect(selected4).toStrictEqual([
					{
						content: 'p1',
						createdAt: mappersDate,
						isBanned: null,
						name: 'First',
						postId: 1,
						userId: 1,
					},
				]);
			}));

		it.effect('Jit mappers: - relational', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_6', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const posts = pgTable('jit_mappers_posts_2', (t) => ({
					id: t.integer('id').primaryKey(),
					authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
					content: t.text('content'),
				}));

				const db = yield* createDB(
					{ users, posts },
					(r) => ({
						users: {
							post: r.one.posts({
								from: r.users.id,
								to: r.posts.authorId,
							}),
							posts: r.one.posts({
								from: r.users.id,
								to: r.posts.authorId,
							}),
						},
						posts: {
							author: r.one.users({
								from: r.posts.authorId,
								to: r.users.id,
							}),
							authors: r.many.users({
								from: r.posts.authorId,
								to: r.users.id,
							}),
						},
					}),
					true,
				);
				yield* push(db, { users, posts });

				const empty1 = yield* db.query.users.findFirst();
				const empty2 = yield* db.query.users.findMany();

				expect(empty1).toStrictEqual(undefined);
				expect(empty2).toStrictEqual([]);

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
				}]).returning();
				yield* db.insert(posts).values({
					id: 1,
					authorId: 1,
					content: 'p1',
				});

				const simple1 = yield* db.query.users.findFirst();
				const simple2 = yield* db.query.users.findMany();

				expect(simple1).toStrictEqual(
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
					},
				);
				expect(simple2).toStrictEqual([
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
					},
					{
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
					},
					{
						createdAt: mappersDate,
						id: 3,
						isBanned: null,
						name: 'Third',
					},
				]);

				const extra1 = yield* db.query.users.findFirst({
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				});
				const extra2 = yield* db.query.users.findMany({
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				});

				expect(extra1).toStrictEqual(
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
				);
				expect(extra2).toStrictEqual([
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
						id: 3,
						isBanned: null,
						name: 'Third',
						sql: 1,
						sqlWrapper: 2,
					},
				]);

				const nested1 = yield* db.query.users.findFirst({
					with: {
						post: {
							with: {
								author: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
									where: {
										RAW: sql`false`,
									},
								},
								authors: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
									where: {
										RAW: sql`false`,
									},
								},
							},
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
						posts: {
							with: {
								author: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
								},
								authors: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
								},
							},
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				});
				const nested2 = yield* db.query.users.findMany({
					with: {
						post: {
							with: {
								author: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
									where: {
										RAW: sql`false`,
									},
								},
								authors: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
									where: {
										RAW: sql`false`,
									},
								},
							},
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
						posts: {
							with: {
								author: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
								},
								authors: {
									extras: {
										sql: sql`SELECT 1`.mapWith(Number),
										sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
									},
								},
							},
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				});

				expect(nested1).toStrictEqual(
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						post: {
							author: null,
							authorId: 1,
							authors: [],
							content: 'p1',
							id: 1,
							sql: 1,
							sqlWrapper: 2,
						},
						posts: {
							author: {
								createdAt: mappersDate,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
							authorId: 1,
							authors: [
								{
									createdAt: mappersDate,
									id: 1,
									isBanned: null,
									name: 'First',
									sql: 1,
									sqlWrapper: 2,
								},
							],
							content: 'p1',
							id: 1,
							sql: 1,
							sqlWrapper: 2,
						},
						sql: 1,
						sqlWrapper: 2,
					},
				);
				expect(nested2).toStrictEqual([
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						post: {
							author: null,
							authorId: 1,
							authors: [],
							content: 'p1',
							id: 1,
							sql: 1,
							sqlWrapper: 2,
						},
						posts: {
							author: {
								createdAt: mappersDate,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
							authorId: 1,
							authors: [
								{
									createdAt: mappersDate,
									id: 1,
									isBanned: null,
									name: 'First',
									sql: 1,
									sqlWrapper: 2,
								},
							],
							content: 'p1',
							id: 1,
							sql: 1,
							sqlWrapper: 2,
						},
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
						post: null,
						posts: null,
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
						id: 3,
						isBanned: null,
						name: 'Third',
						post: null,
						posts: null,
						sql: 1,
						sqlWrapper: 2,
					},
				]);
			}));

		it.effect('Column as decoder applies codecs', () =>
			Effect.gen(function*() {
				let customCast = false;
				let customMap = false;

				const codecBypass = customType<{
					data: Date;
					driverData: string;
					jsonData: string;
				}>({
					codec: 'timestamptz',
					dataType: () => 'timestamptz(3)',
					forJsonSelect: (identifier, sql, arrayDimensions) => {
						customCast = true;
						return sql`${identifier}::text${arrayDimensions ? sql.raw('[]'.repeat(arrayDimensions)) : undefined}`;
					},
					fromJson: (v) => {
						customMap = true;
						return new Date(v);
					},
					toDriver: (v) => v.toISOString(),
				});

				const users = pgTable('users_823', (t) => ({
					id: t.integer().primaryKey(),
					name: t.text().notNull(),
					createdAt: t.timestamp('created_at').notNull(),
					createdAtStr: t.timestamp('created_at_str', { mode: 'string' }).notNull(),
					arrCreatedAt: t.timestamp('arr_created_at').notNull().array(),
					arrCreatedAtStr: t.timestamp('arr_created_at_str', { mode: 'string' }).notNull().array(),
					cus: codecBypass('custom').notNull(),
					arrCus: codecBypass('arr_custom').notNull().array(),
				}));

				const usersView = pgView('users_823_v').as((qb) =>
					qb.select({
						...getColumns(users),
						max: max(users.createdAt).as('max'),
						maxStr: max(users.createdAtStr).as('max_str'),
						arrMax: max(users.arrCreatedAt).as('arr_max'),
						arrMaxStr: max(users.arrCreatedAtStr).as('arr_max_str'),
						sq: qb.select({ createdAt: users.createdAt }).from(users).as('sq'),
					}).from(users).groupBy(users.id)
				);

				const db = yield* createDB({ users, usersView }, (r) => ({
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
				yield* push(db, { users, usersView });

				const exDateStr = '1970-01-16 16:45:46.351';
				const exDate = new Date(exDateStr);

				yield* db.insert(users).values({
					id: 1,
					name: 'First',
					createdAt: exDate,
					createdAtStr: exDateStr,
					arrCreatedAt: [exDate],
					arrCreatedAtStr: [exDateStr],
					cus: exDate,
					arrCus: [exDate],
				});

				const res = yield* db.select({
					...getColumns(users),
					max: max(users.createdAt).as('max'),
					maxStr: max(users.createdAtStr).as('max_str'),
					arrMax: max(users.arrCreatedAt).as('arr_max'),
					arrMaxStr: max(users.arrCreatedAtStr).as('arr_max_str'),
					sq: db.select({ createdAt: users.createdAt }).from(users).as('sq'),
				}).from(users).groupBy(users.id);

				const viewRes = yield* db.select().from(usersView);

				const nested = yield* db.query.users.findFirst({
					with: {
						self: {
							extras: {
								max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
								maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
								arrMax: () => sql`select max(${users.arrCreatedAt}) from ${users}`.mapWith(users.arrCreatedAt),
								arrMaxStr: () => sql`select max(${users.arrCreatedAtStr}) from ${users}`.mapWith(users.arrCreatedAtStr),
							},
						},
					},
					extras: {
						max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
						maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
						arrMax: () => sql`select max(${users.arrCreatedAt}) from ${users}`.mapWith(users.arrCreatedAt),
						arrMaxStr: () => sql`select max(${users.arrCreatedAtStr}) from ${users}`.mapWith(users.arrCreatedAtStr),
					},
				});

				const viewNested = yield* db.query.usersView.findFirst({
					columns: {
						sq: false, // TODO: re-enable when supported in RQBv2
					},
					with: {
						self: {
							columns: {
								sq: false, // TODO: re-enable when supported in RQBv2
							},
						},
					},
				});

				expect(res).toStrictEqual([
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						sq: exDate,
						cus: exDate,
						arrCus: [exDate],
					},
				]);
				expect(viewRes).toStrictEqual([
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						sq: exDate,
						cus: exDate,
						arrCus: [exDate],
					},
				]);

				expect(customCast).toBeTruthy();
				expect(customMap).toBeTruthy();

				expect(nested).toStrictEqual(
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						cus: exDate,
						arrCus: [exDate],
						self: {
							id: 1,
							name: 'First',
							createdAt: exDate,
							createdAtStr: exDateStr,
							arrCreatedAt: [exDate],
							arrCreatedAtStr: [exDateStr],
							max: exDate,
							maxStr: exDateStr,
							arrMax: [exDate],
							arrMaxStr: [exDateStr],
							cus: exDate,
							arrCus: [exDate],
						},
					},
				);
				expect(viewNested).toStrictEqual(
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						cus: exDate,
						arrCus: [exDate],
						self: {
							id: 1,
							name: 'First',
							createdAt: exDate,
							createdAtStr: exDateStr,
							arrCreatedAt: [exDate],
							arrCreatedAtStr: [exDateStr],
							max: exDate,
							maxStr: exDateStr,
							arrMax: [exDate],
							arrMaxStr: [exDateStr],
							cus: exDate,
							arrCus: [exDate],
						},
					},
				);
			}));

		it.effect('Column as decoder applies codecs - Jit mappers', () =>
			Effect.gen(function*() {
				let customCast = false;
				let customMap = false;

				const codecBypass = customType<{
					data: Date;
					driverData: string;
					jsonData: string;
				}>({
					codec: 'timestamptz',
					dataType: () => 'timestamptz(3)',
					forJsonSelect: (identifier, sql, arrayDimensions) => {
						customCast = true;
						return sql`${identifier}::text${arrayDimensions ? sql.raw('[]'.repeat(arrayDimensions)) : undefined}`;
					},
					fromJson: (v) => {
						customMap = true;
						return new Date(v);
					},
					toDriver: (v) => v.toISOString(),
				});

				const users = pgTable('users_823_jit', (t) => ({
					id: t.integer().primaryKey(),
					name: t.text().notNull(),
					createdAt: t.timestamp('created_at').notNull(),
					createdAtStr: t.timestamp('created_at_str', { mode: 'string' }).notNull(),
					arrCreatedAt: t.timestamp('arr_created_at').notNull().array(),
					arrCreatedAtStr: t.timestamp('arr_created_at_str', { mode: 'string' }).notNull().array(),
					cus: codecBypass('custom').notNull(),
					arrCus: codecBypass('arr_custom').notNull().array(),
				}));

				const usersView = pgView('users_823_v_jit').as((qb) =>
					qb.select({
						...getColumns(users),
						max: max(users.createdAt).as('max'),
						maxStr: max(users.createdAtStr).as('max_str'),
						arrMax: max(users.arrCreatedAt).as('arr_max'),
						arrMaxStr: max(users.arrCreatedAtStr).as('arr_max_str'),
						sq: qb.select({ createdAt: users.createdAt }).from(users).as('sq'),
					}).from(users).groupBy(users.id)
				);

				const db = yield* createDB({ users, usersView }, (r) => ({
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
				yield* push(db, { users, usersView });

				const exDateStr = '1970-01-16 16:45:46.351';
				const exDate = new Date(exDateStr);

				yield* db.insert(users).values({
					id: 1,
					name: 'First',
					createdAt: exDate,
					createdAtStr: exDateStr,
					arrCreatedAt: [exDate],
					arrCreatedAtStr: [exDateStr],
					cus: exDate,
					arrCus: [exDate],
				});

				const res = yield* db.select({
					...getColumns(users),
					max: max(users.createdAt).as('max'),
					maxStr: max(users.createdAtStr).as('max_str'),
					arrMax: max(users.arrCreatedAt).as('arr_max'),
					arrMaxStr: max(users.arrCreatedAtStr).as('arr_max_str'),
					sq: db.select({ createdAt: users.createdAt }).from(users).as('sq'),
				}).from(users).groupBy(users.id);

				const viewRes = yield* db.select().from(usersView);

				const nested = yield* db.query.users.findFirst({
					with: {
						self: {
							extras: {
								max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
								maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
								arrMax: () => sql`select max(${users.arrCreatedAt}) from ${users}`.mapWith(users.arrCreatedAt),
								arrMaxStr: () => sql`select max(${users.arrCreatedAtStr}) from ${users}`.mapWith(users.arrCreatedAtStr),
							},
						},
					},
					extras: {
						max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
						maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
						arrMax: () => sql`select max(${users.arrCreatedAt}) from ${users}`.mapWith(users.arrCreatedAt),
						arrMaxStr: () => sql`select max(${users.arrCreatedAtStr}) from ${users}`.mapWith(users.arrCreatedAtStr),
					},
				});

				const viewNested = yield* db.query.usersView.findFirst({
					columns: {
						sq: false, // TODO: re-enable when supported in RQBv2
					},
					with: {
						self: {
							columns: {
								sq: false, // TODO: re-enable when supported in RQBv2
							},
						},
					},
				});

				expect(res).toStrictEqual([
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						sq: exDate,
						cus: exDate,
						arrCus: [exDate],
					},
				]);
				expect(viewRes).toStrictEqual([
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						sq: exDate,
						cus: exDate,
						arrCus: [exDate],
					},
				]);

				expect(customCast).toBeTruthy();
				expect(customMap).toBeTruthy();

				expect(nested).toStrictEqual(
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						cus: exDate,
						arrCus: [exDate],
						self: {
							id: 1,
							name: 'First',
							createdAt: exDate,
							createdAtStr: exDateStr,
							arrCreatedAt: [exDate],
							arrCreatedAtStr: [exDateStr],
							max: exDate,
							maxStr: exDateStr,
							arrMax: [exDate],
							arrMaxStr: [exDateStr],
							cus: exDate,
							arrCus: [exDate],
						},
					},
				);
				expect(viewNested).toStrictEqual(
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						cus: exDate,
						arrCus: [exDate],
						self: {
							id: 1,
							name: 'First',
							createdAt: exDate,
							createdAtStr: exDateStr,
							arrCreatedAt: [exDate],
							arrCreatedAtStr: [exDateStr],
							max: exDate,
							maxStr: exDateStr,
							arrMax: [exDate],
							arrMaxStr: [exDateStr],
							cus: exDate,
							arrCus: [exDate],
						},
					},
				);
			}));

		addTests?.(it);
	});
};

export { relations } from './relations';
export { rqbPost, rqbUser } from './schema';
