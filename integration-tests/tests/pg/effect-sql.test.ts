import { PgClient } from '@effect/sql-pg';
import { expect, expectTypeOf, it } from '@effect/vitest';
import { and, asc, eq, gt, gte, inArray, lt, sql } from 'drizzle-orm';
import { TaggedTransactionRollbackError } from 'drizzle-orm/effect-core/errors';
import { drizzle, EffectPgDatabase } from 'drizzle-orm/effect-postgres';
import { migrate } from 'drizzle-orm/effect-postgres/migrator';
import {
	alias,
	bigint,
	bigserial,
	boolean,
	bytea,
	char,
	cidr,
	date,
	doublePrecision,
	except,
	getMaterializedViewConfig,
	getTableConfig,
	inet,
	integer,
	interval,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	pgEnum,
	pgSchema,
	pgTable,
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
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { Effect, Redacted } from 'effect';
import { types } from 'pg';
import { randomString } from '~/utils';
import { relations } from './relations';
import { rqbPost, rqbUser, usersMigratorTable } from './schema';

const connectionStr = Redacted.make(
	process.env['PG_CONNECTION_STRING'] ?? 'postgres://postgres:postgres@localhost:55433/drizzle',
);
const clientLayer = PgClient.layer({
	url: connectionStr,
	types: {
		getTypeParser: (typeId, format) => {
			// timestamptz
			if (typeId === 1184) {
				return (val: any) => val;
			}
			// timestamp
			if (typeId === 1114) {
				return (val: any) => val;
			}
			// date
			if (typeId === 1082) {
				return (val: any) => val;
			}
			// interval
			if (typeId === 1186) {
				return (val: any) => val;
			}
			// numeric[]
			if (typeId as number === 1231) {
				return (val: any) => val;
			}
			// timestamp[]
			if (typeId as number === 1115) {
				return (val: any) => val;
			}
			// timestamp with timezone[]
			if (typeId as number === 1185) {
				return (val: any) => val;
			}
			// interval[]
			if (typeId as number === 1187) {
				return (val: any) => val;
			}
			// date[]
			if (typeId as number === 1182) {
				return (val: any) => val;
			}

			return types.getTypeParser(typeId, format);
		},
	},
});

const ENABLE_LOGGING = false;
const usedSchema = 'effect_pg_test';
const getDb = Effect.gen(function*() {
	const client = yield* PgClient.PgClient;
	const db = drizzle(client, { logger: ENABLE_LOGGING, relations });

	yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(usedSchema)} CASCADE`);
	yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(`${usedSchema}_custom`)} CASCADE`);
	yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier('drizzle')} CASCADE`);
	yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier('drzl_migrations_init')} CASCADE`);
	yield* db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(usedSchema)};`);
	yield* db.execute(sql`SET search_path TO ${sql.identifier(usedSchema)};`);
	yield* db.execute(sql`SET TIME ZONE 'UTC';`);
	return db;
});

let _diff!: (_: {}, schema: Record<string, unknown>, renames: []) => Promise<{ sqlStatements: string[] }>;
const getDiff = async () => {
	return _diff ??= (await import('../../../drizzle-kit/tests/postgres/mocks' as string)).diff;
};

const push = (db: EffectPgDatabase, schema: Record<string, any>) =>
	Effect.gen(function*() {
		const diff = yield* Effect.promise(() => getDiff());

		const { sqlStatements } = yield* Effect.promise(() => diff({}, schema, []));

		const result = yield* db.transaction((tx) =>
			Effect.gen(function*() {
				for (const s of sqlStatements) {
					yield* tx.execute(s);
				}
			})
		);
	});

it.layer(clientLayer)((it) => {
	it.effect('execute', () =>
		Effect.gen(function*() {
			const db = yield* getDb;
			const res = yield* db.execute<{ '1': 1 }>(sql`SELECT 1 as "1"`);

			expect(res).toStrictEqual([{ '1': 1 }]);
		}));

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

			const db = yield* getDb;
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
			const db = yield* getDb;

			yield* push(db, { rqbUser });

			const result = yield* db.query.rqbUser.findFirst();

			expect(result).toStrictEqual(undefined);
		}));

	it.effect('RQB v2 simple find first - multiple rows', () =>
		Effect.gen(function*() {
			const db = yield* getDb;
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
			const db = yield* getDb;

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
			const db = yield* getDb;
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
			const db = yield* getDb;
			yield* push(db, { rqbUser });

			const result = yield* db.query.rqbUser.findMany();

			expect(result).toStrictEqual([]);
		}));

	it.effect('RQB v2 simple find many - multiple rows', () =>
		Effect.gen(function*() {
			const db = yield* getDb;
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
			const db = yield* getDb;
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
			const db = yield* getDb;
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
			const db = yield* getDb;
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
			const db = yield* getDb;
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
			const db = yield* getDb;

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
			const db = yield* getDb;
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
			const db = yield* getDb;
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
			const db = yield* getDb;
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
			const db = yield* getDb;

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
			const db = yield* getDb;
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
			const db = yield* getDb;

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
			const db = yield* getDb;

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
			).pipe(Effect.catchTag('TransactionRollbackError', (e) => Effect.succeed(e)));

			const result = yield* db.select().from(users);

			expect(result).toEqual([]);
			expect(res).toBeInstanceOf(TaggedTransactionRollbackError);
		}));

	it.effect('nested transaction', () =>
		Effect.gen(function*() {
			const db = yield* getDb;

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
			const db = yield* getDb;

			const users = pgTable('users_nested_transactions_rollback', {
				id: serial('id').primaryKey(),
				balance: integer('balance').notNull(),
			});

			yield* push(db, { users });

			yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.insert(users).values({ balance: 100 });

					expect(
						yield* tx.transaction((tx) =>
							Effect.gen(function*() {
								yield* tx.update(users).set({ balance: 200 });
								yield* tx.rollback();
							})
						).pipe(Effect.catchTag('TransactionRollbackError', (e) => Effect.succeed(e))),
					).toBeInstanceOf(TaggedTransactionRollbackError);
				})
			);

			const result = yield* db.select().from(users);

			expect(result).toEqual([{ id: 1, balance: 100 }]);
		}));

	it.effect('migrator : default migration strategy', () =>
		Effect.gen(function*() {
			const db = yield* getDb;

			yield* migrate(db, { migrationsFolder: './drizzle2/pg' });

			yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

			const result = yield* db.select().from(usersMigratorTable);

			expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		}));

	it.effect('migrator : migrate with custom schema', () =>
		Effect.gen(function*() {
			const db = yield* getDb;
			const customSchema = randomString();

			yield* migrate(db, { migrationsFolder: './drizzle2/pg', migrationsSchema: customSchema });

			// test if the custom migrations table was created
			const res = yield* db.execute<{ count: number }>(
				sql`select count(*) as ${sql.identifier('count')} from ${sql.identifier(customSchema)}.${
					sql.identifier('__drizzle_migrations')
				} limit 1;`,
			);
			expect((res[0]?.count ?? 0) > 0).toBeTruthy();

			// test if the migrated table are working as expected
			yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
			const result = yield* db.select().from(usersMigratorTable);
			expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

			yield* db.execute(sql`DROP SCHEMA ${sql.identifier(customSchema)} CASCADE;`);
		}));

	it.effect('migrator : migrate with custom table', () =>
		Effect.gen(function*() {
			const db = yield* getDb;
			const customTable = randomString();

			const r1 = yield* migrate(db, { migrationsFolder: './drizzle2/pg', migrationsTable: customTable });

			// test if the custom migrations table was created
			const res = yield* db.execute<{ count: number }>(
				sql`select count(*) as ${sql.identifier('count')} from ${sql.identifier('drizzle')}.${
					sql.identifier(customTable)
				} limit 1;`,
			);
			expect((res[0]?.count ?? 0) > 0).toBeTruthy();

			// test if the migrated table are working as expected
			yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
			const result = yield* db.select().from(usersMigratorTable);
			expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		}));

	it.effect('migrator : migrate with custom table and custom schema', () =>
		Effect.gen(function*() {
			const db = yield* getDb;
			const customTable = randomString();
			const customSchema = randomString();

			yield* migrate(db, {
				migrationsFolder: './drizzle2/pg',
				migrationsTable: customTable,
				migrationsSchema: customSchema,
			});

			// test if the custom migrations table was created
			const res = yield* db.execute<{ count: number }>(
				sql`select count(*) as ${sql.identifier('count')} from ${sql.identifier(customSchema)}.${
					sql.identifier(customTable)
				} limit 1;`,
			);
			expect((res[0]?.count ?? 0) > 0).toBeTruthy();

			// test if the migrated table are working as expected
			yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
			const result = yield* db.select().from(usersMigratorTable);
			expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

			yield* db.execute(sql`DROP SCHEMA ${sql.identifier(customSchema)} CASCADE;`);
		}));

	it.effect('migrator : --init', () =>
		Effect.gen(function*() {
			const db = yield* getDb;
			const migrationsSchema = 'drzl_migrations_init';
			const migrationsTable = 'drzl_init';

			const migratorRes = yield* migrate(db, {
				migrationsFolder: './drizzle2/pg-init',
				migrationsTable,
				migrationsSchema,
				// @ts-ignore - internal param
				init: true,
			});

			const meta = yield* db.select({
				hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
				createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
			}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

			const res = yield* db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
						SELECT 1
						FROM pg_tables
						WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? usedSchema} AND tablename = ${
				getTableConfig(usersMigratorTable).name
			}
					) as ${sql.identifier('tableExists')};`);

			expect(migratorRes).toStrictEqual(undefined);
			expect(meta.length).toStrictEqual(1);
			expect(res[0]?.['tableExists']).toStrictEqual(false);
		}));

	it.effect('migrator : --init - local migrations error', () =>
		Effect.gen(function*() {
			const db = yield* getDb;
			const migrationsSchema = 'drzl_migrations_init';
			const migrationsTable = 'drzl_init';

			const migratorRes = yield* migrate(db, {
				migrationsFolder: './drizzle2/pg',
				migrationsTable,
				migrationsSchema,
				// @ts-ignore - internal param
				init: true,
			});

			const meta = yield* db.select({
				hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
				createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
			}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

			const res = yield* db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
						SELECT 1
						FROM pg_tables
						WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? usedSchema} AND tablename = ${
				getTableConfig(usersMigratorTable).name
			}
					) as ${sql.identifier('tableExists')};`);

			expect(migratorRes).toStrictEqual({ exitCode: 'localMigrations' });
			expect(meta.length).toStrictEqual(0);
			expect(res[0]?.['tableExists']).toStrictEqual(false);
		}));

	it.effect('migrator : --init - db migrations error', () =>
		Effect.gen(function*() {
			const db = yield* getDb;
			const migrationsSchema = 'drzl_migrations_init';
			const migrationsTable = 'drzl_init';

			yield* migrate(db, {
				migrationsFolder: './drizzle2/pg-init',
				migrationsSchema,
				migrationsTable,
			});

			const migratorRes = yield* migrate(db, {
				migrationsFolder: './drizzle2/pg',
				migrationsTable,
				migrationsSchema,
				// @ts-ignore - internal param
				init: true,
			});

			const meta = yield* db.select({
				hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
				createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
			}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

			const res = yield* db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
						SELECT 1
						FROM pg_tables
						WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? usedSchema} AND tablename = ${
				getTableConfig(usersMigratorTable).name
			}
					) as ${sql.identifier('tableExists')};`);

			expect(migratorRes).toStrictEqual({ exitCode: 'databaseMigrations' });
			expect(meta.length).toStrictEqual(1);
			expect(res[0]?.['tableExists']).toStrictEqual(true);
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

			const db = yield* getDb;
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
			const db = yield* getDb;
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

			const db = yield* getDb;

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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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

			const db = yield* getDb;
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
});
