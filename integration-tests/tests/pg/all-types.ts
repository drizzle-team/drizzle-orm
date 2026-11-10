import type { RelationsBuilder } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core';
import {
	bigint,
	bigserial,
	boolean,
	bytea,
	char,
	cidr,
	customType,
	date,
	doublePrecision,
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
	pgTable,
	point,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	unionAll,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { expect, expectTypeOf } from 'vitest';

export const makeAllTypes = <TTable extends string, TEnum extends string>(tableName: TTable, enumName: TEnum) => {
	const en = pgEnum(enumName, ['enVal1', 'enVal2']);
	const allTypesTable = makeAllTypesTable(tableName, en);
	return { en, allTypesTable };
};

const makeAllTypesTable = <TTable extends string>(
	tableName: TTable,
	en: ReturnType<typeof pgEnum<string, ['enVal1', 'enVal2']>>,
) => pgTable(tableName, makeAllTypesColumns(en));

export const makeAllTypesColumns = (en: ReturnType<typeof pgEnum<string, ['enVal1', 'enVal2']>>) => ({
	serial: serial('serial').notNull(),
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

export const { en: allTypesEnum, allTypesTable } = makeAllTypes('all_types_48_cdcs', 'en_49');

export type AllTypesTable = ReturnType<typeof makeAllTypes>['allTypesTable'];

export const allTypesRelations = (r: RelationsBuilder<{ allTypesTable: AllTypesTable }>) => ({
	allTypesTable: {
		self: r.many.allTypesTable({
			from: r.allTypesTable.serial,
			to: r.allTypesTable.serial,
		}),
	},
});

export type AllTypes = {
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

export const allTypesData: AllTypes = {
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
	arrint: [621, -5],
	arrbigint: [5044565289845416380n, -9223372036854775808n],
	arrbigintnum: [9007199254740991, -42],
	arrbigintstr: ['5044565289845416380', '-9223372036854775808'],
	arrbool: [true, false],
	arrbytea: [Buffer.from('BYTES'), Buffer.from('BYTES2')],
	mtxbytea: [[Buffer.from('BYTES'), Buffer.from('BYTES2')], [
		Buffer.from('OTHERBYTES'),
		Buffer.from('OTHERBYTES2'),
	]],
	arrchar: ['c', 'd'],
	arrcidr: ['2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128', '192.168.100.128/25'],
	arrdate: [new Date('2025-03-12'), new Date('1990-01-01')],
	arrdatestr: ['2025-03-12', '1990-01-01'],
	arrdouble: [15.35325689124218, -0.5],
	arrenum: ['enVal1', 'enVal2'],
	arrinet: ['192.168.0.1/24', '10.0.0.1/8'],
	arrinterval: ['-2 mons', '1 year 2 mons'],
	arrjson: [{ str: 'strval', arr: ['str', 10] }, { other: [1, 2, 3] }],
	arrjsonb: [{ arr: ['strb', 11], str: 'strvalb' }, { other: [4, 5, 6] }],
	arrjson1: [[{ key: 'value', num: 7 }, 'v', '11', 5], ['second', 2]],
	arrjsonb1: [[{ key: 'value', num: 8 }, 'x', '10', 3], ['secondb', 3]],
	arrjson2: [5, 6],
	arrjsonb2: [7, 8],
	arrjson3: ['5', '6'],
	arrjsonb3: ['7', '8'],
	arrline: [{ a: 1, b: 2, c: 3 }, { a: -4, b: 5.5, c: 6 }],
	arrlinetuple: [[1, 2, 3], [-4, 5.5, 6]],
	arrmacaddr: ['08:00:2b:01:02:03', '00:1a:2b:3c:4d:5e'],
	arrmacaddr8: ['08:00:2b:01:02:03:04:05', '00:1a:2b:3c:4d:5e:6f:70'],
	arrnumeric: ['5044565289845416380', '-0.0001'],
	arrnumericnum: [9007199254740991, -1.5],
	arrnumericbig: [5044565289845416380n, -170141183460469231731687303715884105728n],
	arrpoint: [{ x: 24.5, y: 49.6 }, { x: -1.5, y: 0 }],
	arrpointtuple: [[24.5, 49.6], [-1.5, 0]],
	arrreal: [1.048596, -2.5],
	arrsmallint: [10, -20],
	arrtext: ['TEXT STRING', 'with, comma and "quote" and \\ backslash'],
	arrtime: ['13:59:28', '00:00:00'],
	arrtimestamp: [new Date('2025-03-12 01:32:41.623'), new Date('1990-01-01 00:00:00.000')],
	arrtimestampTz: [new Date('2025-03-12 01:32:41.623+00'), new Date('1990-01-01 00:00:00.000+00')],
	arrtimestampstr: ['2025-03-12 01:32:41.623', '1990-01-01 00:00:00'],
	arrtimestampTzstr: ['2025-03-12 01:32:41.623+00', '1990-01-01 00:00:00+00'],
	arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c', '00000000-0000-0000-0000-000000000000'],
	arrvarchar: ['C4-', 'second'],
};

export const withEmptyArrays = <T extends Record<string, unknown>>(data: T): T =>
	Object.fromEntries(
		Object.entries(data).map(([key, value]) => [key, /^(arr|mtx)/.test(key) ? [] : value]),
	) as T;

export const allTypesEmptyArraysData = withEmptyArrays(allTypesData);

export type RunQuery = (query: any) => Promise<any>;
const awaitQuery: RunQuery = (query) => query;

const defaultAllTypesTable = allTypesTable;
export async function assertAllTypesUnions(
	db: PgAsyncDatabase<any, any>,
	allTypesTable: AllTypesTable = defaultAllTypesTable,
	run: RunQuery = awaitQuery,
) {
	// ---- numbers ----
	expect(
		await run(unionAll(
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
		)),
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
		await run(unionAll(
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
		)),
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
		await run(unionAll(
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
		)),
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
		await run(unionAll(
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
		)),
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
		await run(unionAll(
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
		)),
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
		await run(unionAll(
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
		)),
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
		await run(unionAll(
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
		)),
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
		await run(unionAll(
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
		)),
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
}

const TABLE = 'all_types_bounds';

export const boundsTable = pgTable(TABLE, {
	id: integer('id').primaryKey(),
	bigintBig: bigint('bigint_big', { mode: 'bigint' }),
	bigintStr: bigint('bigint_str', { mode: 'string' }),
	bigintNum: bigint('bigint_num', { mode: 'number' }),
	bigserialBig: bigserial('bigserial_big', { mode: 'bigint' }),
	bigserialNum: bigserial('bigserial_num', { mode: 'number' }),
	numericBig: numeric('numeric_big', { mode: 'bigint' }),
	numericStr: numeric('numeric_str', { mode: 'string' }),
	numericNum: numeric('numeric_num', { mode: 'number' }),
});

export type BoundsRow = {
	id: number;
	bigintBig: bigint | null;
	bigintStr: string | null;
	bigintNum: number | null;
	bigserialBig: bigint;
	bigserialNum: number;
	numericBig: bigint | null;
	numericStr: string | null;
	numericNum: number | null;
};

export const createBounds = (tableName: string = TABLE) =>
	`create table "${tableName}" (
		"id" integer primary key,
		"bigint_big" bigint,
		"bigint_str" bigint,
		"bigint_num" bigint,
		"bigserial_big" bigint not null,
		"bigserial_num" bigint not null,
		"numeric_big" numeric,
		"numeric_str" numeric,
		"numeric_num" numeric
	)`;

export const dropBounds = (tableName: string = TABLE) => `drop table if exists "${tableName}"`;

/*
	int8 columns get the two boundaries that matter - the last exactly representable double
	(2^53 - 1) and the first value past it - plus the full int8 range. Number-mode columns stay
	inside the safe range because anything past it is lossy by design, so the assertion there is
	that the safe boundary itself survives.
	`numeric` is arbitrary precision, so it also carries a value no 64-bit integer can hold.
*/
export const boundsData: BoundsRow[] = [
	{
		id: 1,
		bigintBig: 1n,
		bigintStr: '1',
		bigintNum: 1,
		bigserialBig: 1n,
		bigserialNum: 1,
		numericBig: 1n,
		numericStr: '1',
		numericNum: 1,
	},
	{
		id: 2,
		bigintBig: 9007199254740991n,
		bigintStr: '9007199254740991',
		bigintNum: 9007199254740991,
		bigserialBig: 9007199254740991n,
		bigserialNum: 9007199254740991,
		numericBig: 9007199254740991n,
		numericStr: '9007199254740991',
		numericNum: 9007199254740991,
	},
	{
		id: 3,
		bigintBig: 9007199254740993n,
		bigintStr: '9007199254740993',
		bigintNum: -9007199254740991,
		bigserialBig: 9007199254740993n,
		bigserialNum: -9007199254740991,
		numericBig: 9007199254740993n,
		numericStr: '9007199254740993',
		numericNum: -9007199254740991,
	},
	{
		id: 4,
		bigintBig: 5044565289845416380n,
		bigintStr: '5044565289845416380',
		bigintNum: 0,
		bigserialBig: 5044565289845416380n,
		bigserialNum: 0,
		numericBig: 5044565289845416380n,
		numericStr: '5044565289845416380',
		numericNum: 0,
	},
	{
		id: 5,
		bigintBig: -9007199254740993n,
		bigintStr: '-9007199254740993',
		bigintNum: -1,
		bigserialBig: -9007199254740993n,
		bigserialNum: -1,
		numericBig: -9007199254740993n,
		numericStr: '-9007199254740993',
		numericNum: -1,
	},
	{
		id: 6,
		bigintBig: 9223372036854775807n,
		bigintStr: '9223372036854775807',
		bigintNum: 123456789,
		bigserialBig: 9223372036854775807n,
		bigserialNum: 123456789,
		numericBig: 170141183460469231731687303715884105727n,
		numericStr: '170141183460469231731687303715884105727',
		numericNum: 123456789,
	},
	{
		id: 7,
		bigintBig: -9223372036854775808n,
		bigintStr: '-9223372036854775808',
		bigintNum: -123456789,
		bigserialBig: -9223372036854775808n,
		bigserialNum: -123456789,
		numericBig: -170141183460469231731687303715884105728n,
		numericStr: '-170141183460469231731687303715884105728',
		numericNum: -123456789,
	},
	{
		id: 8,
		bigintBig: null,
		bigintStr: null,
		bigintNum: null,
		bigserialBig: 0n,
		bigserialNum: 0,
		numericBig: null,
		numericStr: null,
		numericNum: null,
	},
];

/** Replaces the table's contents with {@link allTypesEmptyArraysData} and reads it back, through RQB as well when given */
export async function assertAllTypesEmptyArrays(
	db: PgAsyncDatabase<any, any>,
	allTypesTable: AllTypesTable = defaultAllTypesTable,
	{ run = awaitQuery, rqb = false }: { run?: RunQuery; rqb?: boolean } = {},
) {
	await run(db.delete(allTypesTable));
	await run(db.insert(allTypesTable).values(allTypesEmptyArraysData));

	expect(await run(db.select().from(allTypesTable))).toStrictEqual([allTypesEmptyArraysData]);
	if (rqb) {
		expect(await run((<any> db).query.allTypesTable.findFirst({ with: { self: true } }))).toStrictEqual({
			...allTypesEmptyArraysData,
			self: [allTypesEmptyArraysData],
		});
	}
}

export async function assertAllTypesBounds(
	db: PgAsyncDatabase<any, any>,
	{ run = awaitQuery, rqb = false }: { run?: RunQuery; rqb?: boolean } = {},
) {
	await run(db.execute(sql.raw(dropBounds())));
	await run(db.execute(sql.raw(createBounds())));

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
		await run(db.execute(sql.raw(dropBounds())));
	}
}

const TEMPORAL_TABLE = 'all_types_temporal_bounds';

export const temporalBoundsTable = pgTable(TEMPORAL_TABLE, {
	id: integer('id').primaryKey(),
	date: date('date', { mode: 'date' }),
	dateStr: date('date_str', { mode: 'string' }),
	timestamp: timestamp('timestamp', { mode: 'date', precision: 3 }),
	timestampTz: timestamp('timestamp_tz', { mode: 'date', precision: 6, withTimezone: true }),
	timestampStr: timestamp('timestamp_str', { mode: 'string', precision: 6 }),
	timestampTzStr: timestamp('timestamp_tz_str', { mode: 'string', precision: 6, withTimezone: true }),
	time: time('time', { precision: 6 }),
	arrTimestampTz: timestamp('arr_timestamp_tz', { mode: 'date', precision: 3, withTimezone: true }).array(),
});

export type TemporalBoundsRow = {
	id: number;
	date: Date | null;
	dateStr: string | null;
	timestamp: Date | null;
	timestampTz: Date | null;
	timestampStr: string | null;
	timestampTzStr: string | null;
	time: string | null;
	arrTimestampTz: Date[] | null;
};

export const createTemporalBounds = (tableName: string = TEMPORAL_TABLE) =>
	`create table "${tableName}" (
		"id" integer primary key,
		"date" date,
		"date_str" date,
		"timestamp" timestamp(3),
		"timestamp_tz" timestamp(6) with time zone,
		"timestamp_str" timestamp(6),
		"timestamp_tz_str" timestamp(6) with time zone,
		"time" time(6),
		"arr_timestamp_tz" timestamp(3) with time zone[]
	)`;

export const dropTemporalBounds = (tableName: string = TEMPORAL_TABLE) => `drop table if exists "${tableName}"`;

/*
	- the epoch and the millisecond before it (negative epoch offsets)
	- years 1 and 99, which non-ISO date parsing reads as two-digit years (0099 -> 1999)
	- 9999 / 10000, where `toISOString` switches to the expanded `+0YYYYY` year form postgres rejects
	- the last instant a JS `Date` can hold (postgres goes on to 294276 AD)
	- year 1 BC, which `toISOString` writes as year `0000` and postgres prints with a `BC` suffix
	- 2 BC and earlier, which `toISOString` writes as negative `-0YYYYY` years
	- 4714-11-24 BC, the earliest value postgres holds, and the BC leap day 0001-02-29 BC
	- 1880, printed with seconds-precision LMT offsets in non-UTC sessions (`+02:02:04` in `Europe/Kyiv`)
	- 1-digit fractions (`.5`), and 6-digit ones in `timestamp_tz` (see `fillTemporalBounds`)
	- values outside 1714 - 2285, where int64 microseconds since 2000 no longer fit a double exactly: `.999999` and
	  `.789999` round up into the next millisecond (`9999-12-31 23:59:59.999999` -> year 10000), whole milliseconds
	  past 4283 / before 284 BC and whole seconds past 10000 round down below it
*/
export const temporalBoundsData: TemporalBoundsRow[] = [
	{
		id: 1,
		date: new Date('1970-01-01T00:00:00.000Z'),
		dateStr: '1970-01-01',
		timestamp: new Date('1970-01-01T00:00:00.000Z'),
		timestampTz: new Date('1970-01-01T00:00:00.000Z'),
		timestampStr: '1970-01-01 00:00:00',
		timestampTzStr: '1970-01-01 00:00:00+00',
		time: '00:00:00',
		arrTimestampTz: [new Date('1970-01-01T00:00:00.000Z')],
	},
	{
		id: 2,
		date: new Date('1969-12-31T00:00:00.000Z'),
		dateStr: '1969-12-31',
		timestamp: new Date('1969-12-31T23:59:59.999Z'),
		timestampTz: new Date('1969-12-31T23:59:59.999Z'),
		timestampStr: '1969-12-31 23:59:59.999999',
		timestampTzStr: '1969-12-31 23:59:59.999999+00',
		time: '23:59:59.999999',
		arrTimestampTz: [new Date('1969-12-31T23:59:59.999Z')],
	},
	{
		id: 3,
		date: new Date('2024-02-29T00:00:00.000Z'),
		dateStr: '2024-02-29',
		timestamp: new Date('2024-02-29T12:34:56.500Z'),
		timestampTz: new Date('2024-02-29T12:34:56.789Z'),
		timestampStr: '2024-02-29 12:34:56.789',
		timestampTzStr: '2024-02-29 12:34:56.789+00',
		time: '24:00:00',
		arrTimestampTz: [new Date('2024-02-29T12:34:56.789Z'), new Date('1970-01-01T00:00:00.000Z')],
	},
	{
		id: 4,
		date: new Date('0001-01-01T00:00:00.000Z'),
		dateStr: '0001-01-01',
		timestamp: new Date('0001-01-01T00:00:00.500Z'),
		timestampTz: new Date('0001-01-01T00:00:00.000Z'),
		timestampStr: '0001-01-01 00:00:00',
		timestampTzStr: '0001-01-01 00:00:00+00',
		time: null,
		arrTimestampTz: [new Date('0001-01-01T00:00:00.000Z')],
	},
	{
		id: 5,
		date: new Date('0099-12-31T00:00:00.000Z'),
		dateStr: '0099-12-31',
		timestamp: new Date('0099-12-31T23:59:59.999Z'),
		timestampTz: new Date('0099-12-31T23:59:59.999Z'),
		timestampStr: '0099-12-31 23:59:59.999999',
		timestampTzStr: '0099-12-31 23:59:59.999999+00',
		time: null,
		arrTimestampTz: [new Date('0099-12-31T23:59:59.999Z')],
	},
	{
		id: 6,
		date: new Date('9999-12-31T00:00:00.000Z'),
		dateStr: '9999-12-31',
		timestamp: new Date('9999-12-31T23:59:59.999Z'),
		timestampTz: new Date('9999-12-31T23:59:59.999Z'),
		timestampStr: '9999-12-31 23:59:59.999999',
		timestampTzStr: '9999-12-31 23:59:59.999999+00',
		time: null,
		arrTimestampTz: [new Date('9999-12-31T23:59:59.999Z')],
	},
	{
		id: 7,
		date: new Date('+010000-01-01T00:00:00.000Z'),
		dateStr: '10000-01-01',
		timestamp: new Date('+010000-01-01T00:00:00.000Z'),
		timestampTz: new Date('+010000-01-01T00:00:00.000Z'),
		timestampStr: '10000-01-01 00:00:00',
		timestampTzStr: '10000-01-01 00:00:00+00',
		time: null,
		arrTimestampTz: [new Date('+010000-01-01T00:00:00.000Z'), new Date('+059009-01-01T00:00:00.000Z')],
	},
	{
		id: 8,
		date: new Date('+275760-09-13T00:00:00.000Z'),
		dateStr: '275760-09-13',
		timestamp: new Date('+275760-09-13T00:00:00.000Z'),
		timestampTz: new Date('+275760-09-13T00:00:00.000Z'),
		timestampStr: '275760-09-13 00:00:00',
		timestampTzStr: '275760-09-13 00:00:00+00',
		time: null,
		arrTimestampTz: [new Date('+275760-09-13T00:00:00.000Z')],
	},
	{
		id: 9,
		date: new Date('0000-01-01T00:00:00.000Z'),
		dateStr: '0001-01-01 BC',
		timestamp: new Date('0000-01-01T00:00:00.000Z'),
		timestampTz: new Date('0000-01-01T00:00:00.000Z'),
		timestampStr: '0001-01-01 00:00:00 BC',
		timestampTzStr: '0001-01-01 00:00:00+00 BC',
		time: null,
		arrTimestampTz: [new Date('0000-01-01T00:00:00.000Z')],
	},
	{
		id: 10,
		date: null,
		dateStr: 'infinity',
		timestamp: null,
		timestampTz: null,
		timestampStr: '-infinity',
		timestampTzStr: 'infinity',
		time: null,
		arrTimestampTz: [],
	},
	{
		id: 11,
		date: null,
		dateStr: null,
		timestamp: null,
		timestampTz: null,
		timestampStr: null,
		timestampTzStr: null,
		time: null,
		arrTimestampTz: null,
	},
	{
		id: 12,
		date: new Date('-000001-12-31T00:00:00.000Z'),
		dateStr: '0002-12-31 BC',
		timestamp: new Date('-000001-12-31T23:59:59.999Z'),
		timestampTz: new Date('-000001-12-31T23:59:59.999Z'),
		timestampStr: '0002-12-31 23:59:59.999 BC',
		timestampTzStr: '0002-12-31 23:59:59.999+00 BC',
		time: null,
		arrTimestampTz: [new Date('-000001-12-31T23:59:59.999Z')],
	},
	{
		id: 13,
		date: new Date('-004713-11-24T00:00:00.000Z'),
		dateStr: '4714-11-24 BC',
		timestamp: new Date('-004713-11-24T00:00:00.000Z'),
		timestampTz: new Date('-004713-11-24T00:00:00.000Z'),
		timestampStr: '4714-11-24 00:00:00 BC',
		timestampTzStr: '4714-11-24 00:00:00+00 BC',
		time: null,
		arrTimestampTz: [new Date('-004713-11-24T00:00:00.000Z')],
	},
	{
		id: 14,
		date: new Date('0000-02-29T00:00:00.000Z'),
		dateStr: '0001-02-29 BC',
		timestamp: new Date('0000-02-29T12:00:00.000Z'),
		timestampTz: new Date('0000-02-29T12:00:00.000Z'),
		timestampStr: '0001-02-29 12:00:00 BC',
		timestampTzStr: '0001-02-29 12:00:00+00 BC',
		time: null,
		arrTimestampTz: [new Date('0000-02-29T12:00:00.000Z')],
	},
	{
		id: 15,
		date: new Date('1880-01-01T00:00:00.000Z'),
		dateStr: '1880-01-01',
		timestamp: new Date('1880-01-01T00:00:00.000Z'),
		timestampTz: new Date('1880-01-01T00:00:00.000Z'),
		timestampStr: '1880-01-01 00:00:00',
		timestampTzStr: '1880-01-01 00:00:00+00',
		time: null,
		arrTimestampTz: [new Date('1880-01-01T00:00:00.000Z')],
	},
	{
		id: 16,
		date: new Date('2300-06-15T00:00:00.000Z'),
		dateStr: '2300-06-15',
		timestamp: new Date('2300-06-15T12:34:56.789Z'),
		timestampTz: new Date('2300-06-15T12:34:56.789Z'),
		timestampStr: '2300-06-15 12:34:56.789999',
		timestampTzStr: '2300-06-15 12:34:56.789999+00',
		time: null,
		arrTimestampTz: [new Date('2300-06-15T12:34:56.789Z')],
	},
	{
		id: 17,
		date: new Date('2999-12-31T00:00:00.000Z'),
		dateStr: '2999-12-31',
		timestamp: new Date('2999-12-31T23:59:59.999Z'),
		timestampTz: new Date('2999-12-31T23:59:59.999Z'),
		timestampStr: '2999-12-31 23:59:59.999999',
		timestampTzStr: '2999-12-31 23:59:59.999999+00',
		time: null,
		arrTimestampTz: [new Date('2999-12-31T23:59:59.999Z')],
	},
	{
		id: 18,
		date: new Date('1500-01-01T00:00:00.000Z'),
		dateStr: '1500-01-01',
		timestamp: new Date('1500-01-01T00:00:00.999Z'),
		timestampTz: new Date('1500-01-01T00:00:00.999Z'),
		timestampStr: '1500-01-01 00:00:00.999999',
		timestampTzStr: '1500-01-01 00:00:00.999999+00',
		time: null,
		arrTimestampTz: [new Date('1500-01-01T00:00:00.999Z')],
	},
	{
		id: 19,
		date: new Date('6000-03-15T00:00:00.000Z'),
		dateStr: '6000-03-15',
		timestamp: new Date('6000-03-15T10:20:30.125Z'),
		timestampTz: new Date('6000-03-15T10:20:30.125Z'),
		timestampStr: '6000-03-15 10:20:30.125',
		timestampTzStr: '6000-03-15 10:20:30.125+00',
		time: null,
		arrTimestampTz: [new Date('6000-03-15T10:20:30.125Z')],
	},
	{
		id: 20,
		date: new Date('-000999-07-01T00:00:00.000Z'),
		dateStr: '1000-07-01 BC',
		timestamp: new Date('-000999-07-01T08:00:00.001Z'),
		timestampTz: new Date('-000999-07-01T08:00:00.001Z'),
		timestampStr: '1000-07-01 08:00:00.001 BC',
		timestampTzStr: '1000-07-01 08:00:00.001+00 BC',
		time: null,
		arrTimestampTz: [new Date('-000999-07-01T08:00:00.001Z')],
	},
	{
		id: 21,
		date: new Date('+050000-01-01T00:00:00.000Z'),
		dateStr: '50000-01-01',
		timestamp: new Date('+050000-01-01T00:00:02.000Z'),
		timestampTz: new Date('+050000-01-01T00:00:02.000Z'),
		timestampStr: '50000-01-01 00:00:02',
		timestampTzStr: '50000-01-01 00:00:02+00',
		time: null,
		arrTimestampTz: [new Date('+050000-01-01T00:00:02.000Z')],
	},
	{
		id: 22,
		date: new Date('+200000-06-01T00:00:00.000Z'),
		dateStr: '200000-06-01',
		timestamp: new Date('+200000-06-01T12:00:08.000Z'),
		timestampTz: new Date('+200000-06-01T12:00:08.000Z'),
		timestampStr: '200000-06-01 12:00:08',
		timestampTzStr: '200000-06-01 12:00:08+00',
		time: null,
		arrTimestampTz: [new Date('+200000-06-01T12:00:08.000Z')],
	},
];

/**
 * Fills the temporal bounds table; `timestamp_tz` values then get 999 microseconds added, so they're printed with
 * 6 fractional digits that have to be truncated, not rounded, to milliseconds on decoding
 */
async function fillTemporalBounds(db: PgAsyncDatabase<any, any>, run: RunQuery, data: TemporalBoundsRow[]) {
	await run(db.insert(temporalBoundsTable).values(data));
	await run(
		db.execute(
			sql.raw(
				`update "${TEMPORAL_TABLE}" set "timestamp_tz" = "timestamp_tz" + interval '999 microseconds' where "timestamp_tz" is not null`,
			),
		),
	);
}

export async function assertAllTypesTemporalBounds(
	db: PgAsyncDatabase<any, any>,
	{ run = awaitQuery, rqb = false, data = temporalBoundsData }: {
		run?: RunQuery;
		rqb?: boolean;
		/** Replaces {@link temporalBoundsData}, e.g. to exclude values a driver is known to misdecode */
		data?: TemporalBoundsRow[];
	} = {},
) {
	await run(db.execute(sql.raw(dropTemporalBounds())));
	await run(db.execute(sql.raw(createTemporalBounds())));

	try {
		await fillTemporalBounds(db, run, data);

		const query = db.select().from(temporalBoundsTable).orderBy(temporalBoundsTable.id);
		expectTypeOf<(typeof query)['_']['result']>().toEqualTypeOf<TemporalBoundsRow[]>();

		expect(await run(query)).toStrictEqual(data);
		if (rqb) {
			expect(
				await run((<any> db).query.temporalBoundsTable.findMany({ orderBy: { id: 'asc' }, with: { self: true } })),
			).toStrictEqual(data.map((row) => ({ ...row, self: [row] })));
		}
	} finally {
		await run(db.execute(sql.raw(dropTemporalBounds())));
	}
}

export type TemporalSession = { timeZone: string; dateStyle?: string };

export const sessionTimeZones: TemporalSession[] = [
	{ timeZone: 'Europe/Kyiv' },
	{ timeZone: 'Asia/Kathmandu' },
	{ timeZone: 'America/St_Johns' },
];

/** https://github.com/drizzle-team/drizzle-orm/issues/6496 */
export const sessionDateStyles: TemporalSession[] = [
	{ timeZone: 'Asia/Tokyo', dateStyle: 'SQL, DMY' },
	{ timeZone: 'UTC', dateStyle: 'SQL, MDY' },
	{ timeZone: 'America/St_Johns', dateStyle: 'Postgres, DMY' },
	{ timeZone: 'Europe/Kyiv', dateStyle: 'German' },
];

export async function assertAllTypesTemporalBoundsInSessions(
	db: PgAsyncDatabase<any, any>,
	{ rqb = false, data = temporalBoundsData, sessions = sessionTimeZones }: {
		rqb?: boolean;
		/** Replaces {@link temporalBoundsData}, e.g. to exclude values a driver is known to misdecode */
		data?: TemporalBoundsRow[];
		sessions?: TemporalSession[];
	} = {},
) {
	const table = temporalBoundsTable;
	const columns = { id: true, date: true, timestamp: true, timestampTz: true, arrTimestampTz: true } as const;
	const expected = data.map(({ id, date, timestamp, timestampTz, arrTimestampTz }) => ({
		id,
		date,
		timestamp,
		timestampTz,
		arrTimestampTz,
	}));

	await db.execute(sql.raw(dropTemporalBounds()));
	await db.execute(sql.raw(createTemporalBounds()));

	try {
		for (const { timeZone, dateStyle } of sessions) {
			const label = dateStyle === undefined ? timeZone : `${timeZone}, ${dateStyle}`;
			// `set local` keeps the setting within transaction, which also holds the session for pooled drivers
			await db.transaction(async (tx) => {
				await tx.execute(sql.raw(`set local time zone '${timeZone}'`));
				if (dateStyle !== undefined) await tx.execute(sql.raw(`set local datestyle = '${dateStyle}'`));

				await tx.delete(table);
				await fillTemporalBounds(<any> tx, awaitQuery, data);

				expect(
					await tx.select({
						id: table.id,
						date: table.date,
						timestamp: table.timestamp,
						timestampTz: table.timestampTz,
						arrTimestampTz: table.arrTimestampTz,
					}).from(table).orderBy(table.id),
					label,
				).toStrictEqual(expected);
				if (rqb) {
					expect(
						await (<any> tx).query.temporalBoundsTable.findMany({
							columns,
							orderBy: { id: 'asc' },
							with: { self: { columns } },
						}),
						label,
					).toStrictEqual(expected.map((row) => ({ ...row, self: [row] })));
				}
			});
		}
	} finally {
		await db.execute(sql.raw(dropTemporalBounds()));
	}
}

// https://github.com/drizzle-team/drizzle-orm/issues/6460
const NULL_ELEMENTS_TABLE = 'all_types_null_elements';
const NULL_ELEMENTS_ENUM = 'en_null_elements';

const nullElementsEnum = pgEnum(NULL_ELEMENTS_ENUM, ['enVal1', 'enVal2']);

export const nullElementsTable = pgTable(NULL_ELEMENTS_TABLE, {
	id: integer('id').primaryKey(),
	arrint: integer('arrint').array().notNull().$type<number | null>(),
	mtxint: integer('mtxint').array('[][]').notNull().$type<number | null>(),
	arrbigint: bigint('arrbigint', { mode: 'bigint' }).array().notNull().$type<bigint | null>(),
	mtxbigint: bigint('mtxbigint', { mode: 'bigint' }).array('[][]').notNull().$type<bigint | null>(),
	arrbigintnum: bigint('arrbigintnum', { mode: 'number' }).array().notNull().$type<number | null>(),
	arrbigintstr: bigint('arrbigintstr', { mode: 'string' }).array().notNull().$type<string | null>(),
	arrbool: boolean('arrbool').array().notNull().$type<boolean | null>(),
	arrbytea: bytea('arrbytea').array().notNull().$type<Buffer | null>(),
	mtxbytea: bytea('mtxbytea').array('[][]').notNull().$type<Buffer | null>(),
	arrchar: char('arrchar').array().notNull().$type<string | null>(),
	arrcidr: cidr('arrcidr').array().notNull().$type<string | null>(),
	arrdate: date('arrdate', { mode: 'date' }).array().notNull().$type<Date | null>(),
	arrdatestr: date('arrdatestr', { mode: 'string' }).array().notNull().$type<string | null>(),
	arrdouble: doublePrecision('arrdouble').array().notNull().$type<number | null>(),
	arrenum: nullElementsEnum('arrenum').array().notNull().$type<'enVal1' | 'enVal2' | null>(),
	arrinet: inet('arrinet').array().notNull().$type<string | null>(),
	arrinterval: interval('arrinterval').array().notNull().$type<string | null>(),
	arrjson: json('arrjson').array().notNull().$type<unknown | null>(),
	arrjsonb: jsonb('arrjsonb').array().notNull().$type<unknown | null>(),
	arrline: line('arrline', { mode: 'abc' }).array().notNull().$type<{ a: number; b: number; c: number } | null>(),
	arrlinetuple: line('arrlinetuple', { mode: 'tuple' }).array().notNull().$type<[number, number, number] | null>(),
	arrmacaddr: macaddr('arrmacaddr').array().notNull().$type<string | null>(),
	arrmacaddr8: macaddr8('arrmacaddr8').array().notNull().$type<string | null>(),
	arrnumeric: numeric('arrnumeric').array().notNull().$type<string | null>(),
	arrnumericnum: numeric('arrnumericnum', { mode: 'number' }).array().notNull().$type<number | null>(),
	arrnumericbig: numeric('arrnumericbig', { mode: 'bigint' }).array().notNull().$type<bigint | null>(),
	arrpoint: point('arrpoint', { mode: 'xy' }).array().notNull().$type<{ x: number; y: number } | null>(),
	arrpointtuple: point('arrpointtuple', { mode: 'tuple' }).array().notNull().$type<[number, number] | null>(),
	arrreal: real('arrreal').array().notNull().$type<number | null>(),
	arrsmallint: smallint('arrsmallint').array().notNull().$type<number | null>(),
	arrtext: text('arrtext').array().notNull().$type<string | null>(),
	arrtime: time('arrtime').array().notNull().$type<string | null>(),
	arrtimestamp: timestamp('arrtimestamp', { mode: 'date' }).array().notNull().$type<Date | null>(),
	mtxtimestamp: timestamp('mtxtimestamp', { mode: 'date' }).array('[][]').notNull().$type<Date | null>(),
	arrtimestampTz: timestamp('arrtimestampTz', { mode: 'date', withTimezone: true }).array().notNull().$type<
		Date | null
	>(),
	arrtimestampstr: timestamp('arrtimestampstr', { mode: 'string' }).array().notNull().$type<string | null>(),
	arrtimestampTzstr: timestamp('arrtimestampTzstr', { mode: 'string', withTimezone: true }).array().notNull().$type<
		string | null
	>(),
	arruuid: uuid('arruuid').array().notNull().$type<string | null>(),
	arrvarchar: varchar('arrvarchar').array().notNull().$type<string | null>(),
});

export type NullElementsRow = {
	id: number;
	arrint: (number | null)[];
	mtxint: (number | null)[][];
	arrbigint: (bigint | null)[];
	mtxbigint: (bigint | null)[][];
	arrbigintnum: (number | null)[];
	arrbigintstr: (string | null)[];
	arrbool: (boolean | null)[];
	arrbytea: (Buffer | null)[];
	mtxbytea: (Buffer | null)[][];
	arrchar: (string | null)[];
	arrcidr: (string | null)[];
	arrdate: (Date | null)[];
	arrdatestr: (string | null)[];
	arrdouble: (number | null)[];
	arrenum: ('enVal1' | 'enVal2' | null)[];
	arrinet: (string | null)[];
	arrinterval: (string | null)[];
	arrjson: (unknown | null)[];
	arrjsonb: (unknown | null)[];
	arrline: ({ a: number; b: number; c: number } | null)[];
	arrlinetuple: ([number, number, number] | null)[];
	arrmacaddr: (string | null)[];
	arrmacaddr8: (string | null)[];
	arrnumeric: (string | null)[];
	arrnumericnum: (number | null)[];
	arrnumericbig: (bigint | null)[];
	arrpoint: ({ x: number; y: number } | null)[];
	arrpointtuple: ([number, number] | null)[];
	arrreal: (number | null)[];
	arrsmallint: (number | null)[];
	arrtext: (string | null)[];
	arrtime: (string | null)[];
	arrtimestamp: (Date | null)[];
	mtxtimestamp: (Date | null)[][];
	arrtimestampTz: (Date | null)[];
	arrtimestampstr: (string | null)[];
	arrtimestampTzstr: (string | null)[];
	arruuid: (string | null)[];
	arrvarchar: (string | null)[];
};

export const createNullElements = (tableName: string = NULL_ELEMENTS_TABLE) => [
	`create type "${NULL_ELEMENTS_ENUM}" as enum ('enVal1', 'enVal2')`,
	`create table "${tableName}" (
		"id" integer primary key,
		"arrint" integer[] not null,
		"mtxint" integer[][] not null,
		"arrbigint" bigint[] not null,
		"mtxbigint" bigint[][] not null,
		"arrbigintnum" bigint[] not null,
		"arrbigintstr" bigint[] not null,
		"arrbool" boolean[] not null,
		"arrbytea" bytea[] not null,
		"mtxbytea" bytea[][] not null,
		"arrchar" char[] not null,
		"arrcidr" cidr[] not null,
		"arrdate" date[] not null,
		"arrdatestr" date[] not null,
		"arrdouble" double precision[] not null,
		"arrenum" "${NULL_ELEMENTS_ENUM}"[] not null,
		"arrinet" inet[] not null,
		"arrinterval" interval[] not null,
		"arrjson" json[] not null,
		"arrjsonb" jsonb[] not null,
		"arrline" line[] not null,
		"arrlinetuple" line[] not null,
		"arrmacaddr" macaddr[] not null,
		"arrmacaddr8" macaddr8[] not null,
		"arrnumeric" numeric[] not null,
		"arrnumericnum" numeric[] not null,
		"arrnumericbig" numeric[] not null,
		"arrpoint" point[] not null,
		"arrpointtuple" point[] not null,
		"arrreal" real[] not null,
		"arrsmallint" smallint[] not null,
		"arrtext" text[] not null,
		"arrtime" time[] not null,
		"arrtimestamp" timestamp[] not null,
		"mtxtimestamp" timestamp[][] not null,
		"arrtimestampTz" timestamptz[] not null,
		"arrtimestampstr" timestamp[] not null,
		"arrtimestampTzstr" timestamptz[] not null,
		"arruuid" uuid[] not null,
		"arrvarchar" varchar[] not null
	)`,
];

export const dropNullElements = (tableName: string = NULL_ELEMENTS_TABLE) => [
	`drop table if exists "${tableName}"`,
	`drop type if exists "${NULL_ELEMENTS_ENUM}"`,
];

export const nullElementsData: NullElementsRow[] = [
	{
		id: 1,
		arrint: [621, null, -5],
		mtxint: [[1, null], [null, 2]],
		arrbigint: [5044565289845416380n, null, -9223372036854775808n],
		mtxbigint: [[5044565289845416380n, null], [null, -9223372036854775808n]],
		arrbigintnum: [9007199254740991, null, -42],
		arrbigintstr: ['5044565289845416380', null, '-9223372036854775808'],
		arrbool: [true, null, false],
		arrbytea: [Buffer.from('BYTES'), null, Buffer.from('BYTES2')],
		mtxbytea: [[Buffer.from('BYTES'), null], [null, Buffer.from('BYTES2')]],
		arrchar: ['c', null, 'd'],
		arrcidr: ['2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128', null, '192.168.100.128/25'],
		arrdate: [new Date('2025-03-12'), null, new Date('1990-01-01')],
		arrdatestr: ['2025-03-12', null, '1990-01-01'],
		arrdouble: [15.35325689124218, null, -0.5],
		arrenum: ['enVal1', null, 'enVal2'],
		arrinet: ['192.168.0.1/24', null, '10.0.0.1/8'],
		arrinterval: ['-2 mons', null, '1 year 2 mons'],
		arrjson: [{ str: 'strval', arr: ['str', 10] }, null, { other: [1, 2, 3] }],
		arrjsonb: [{ arr: ['strb', 11], str: 'strvalb' }, null, { other: [4, 5, 6] }],
		arrline: [{ a: 1, b: 2, c: 3 }, null, { a: -4, b: 5.5, c: 6 }],
		arrlinetuple: [[1, 2, 3], null, [-4, 5.5, 6]],
		arrmacaddr: ['08:00:2b:01:02:03', null, '00:1a:2b:3c:4d:5e'],
		arrmacaddr8: ['08:00:2b:01:02:03:04:05', null, '00:1a:2b:3c:4d:5e:6f:70'],
		arrnumeric: ['5044565289845416380', null, '-0.0001'],
		arrnumericnum: [9007199254740991, null, -1.5],
		arrnumericbig: [5044565289845416380n, null, -170141183460469231731687303715884105728n],
		arrpoint: [{ x: 24.5, y: 49.6 }, null, { x: -1.5, y: 0 }],
		arrpointtuple: [[24.5, 49.6], null, [-1.5, 0]],
		arrreal: [1.048596, null, -2.5],
		arrsmallint: [10, null, -20],
		arrtext: ['TEXT STRING', null, 'NULL'],
		arrtime: ['13:59:28', null, '00:00:00'],
		arrtimestamp: [new Date('2025-03-12 01:32:41.623'), null, new Date('1990-01-01 00:00:00.000')],
		mtxtimestamp: [[new Date('2025-03-12 01:32:41.623'), null], [null, new Date('1990-01-01 00:00:00.000')]],
		arrtimestampTz: [new Date('2025-03-12 01:32:41.623+00'), null, new Date('1990-01-01 00:00:00.000+00')],
		arrtimestampstr: ['2025-03-12 01:32:41.623', null, '1990-01-01 00:00:00'],
		arrtimestampTzstr: ['2025-03-12 01:32:41.623+00', null, '1990-01-01 00:00:00+00'],
		arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c', null, '00000000-0000-0000-0000-000000000000'],
		arrvarchar: ['C4-', null, 'second'],
	},
	{
		id: 2,
		arrint: [null],
		mtxint: [[null]],
		arrbigint: [null],
		mtxbigint: [[null]],
		arrbigintnum: [null],
		arrbigintstr: [null],
		arrbool: [null],
		arrbytea: [null],
		mtxbytea: [[null]],
		arrchar: [null],
		arrcidr: [null],
		arrdate: [null],
		arrdatestr: [null],
		arrdouble: [null],
		arrenum: [null],
		arrinet: [null],
		arrinterval: [null],
		arrjson: [null],
		arrjsonb: [null],
		arrline: [null],
		arrlinetuple: [null],
		arrmacaddr: [null],
		arrmacaddr8: [null],
		arrnumeric: [null],
		arrnumericnum: [null],
		arrnumericbig: [null],
		arrpoint: [null],
		arrpointtuple: [null],
		arrreal: [null],
		arrsmallint: [null],
		arrtext: [null],
		arrtime: [null],
		arrtimestamp: [null],
		mtxtimestamp: [[null]],
		arrtimestampTz: [null],
		arrtimestampstr: [null],
		arrtimestampTzstr: [null],
		arruuid: [null],
		arrvarchar: [null],
	},
];

export async function assertAllTypesNullArrayElements(
	db: PgAsyncDatabase<any, any>,
	{ run = awaitQuery, rqb = false }: { run?: RunQuery; rqb?: boolean } = {},
) {
	const drop = async () => {
		for (const statement of dropNullElements()) await run(db.execute(sql.raw(statement)));
	};

	await drop();
	for (const statement of createNullElements()) await run(db.execute(sql.raw(statement)));

	try {
		await run(db.insert(nullElementsTable).values(nullElementsData));

		expect(
			await run(
				db.select({ id: nullElementsTable.id }).from(nullElementsTable).where(sql`\
array_position(${nullElementsTable.arrtext}, null) is not null \
and array_position(${nullElementsTable.arrjson}::text[], null) is not null \
and array_position(${nullElementsTable.arrjsonb}, null) is not null`).orderBy(nullElementsTable.id),
			),
		).toStrictEqual([{ id: 1 }, { id: 2 }]);

		const query = db.select().from(nullElementsTable).orderBy(nullElementsTable.id);
		expectTypeOf<(typeof query)['_']['result']>().toEqualTypeOf<NullElementsRow[]>();

		expect(await run(query)).toStrictEqual(nullElementsData);
		if (rqb) {
			expect(
				await run((<any> db).query.nullElementsTable.findMany({ orderBy: { id: 'asc' }, with: { self: true } })),
			).toStrictEqual(nullElementsData.map((row) => ({ ...row, self: [row] })));
		}
	} finally {
		await drop();
	}
}

type Tagged = { v: string };
type Counter = { n: bigint };

const taggedType = customType<{ data: Tagged; driverData: string }>({
	dataType: () => 'text',
	toDriver: (value) => value.v,
	fromDriver: (value) => ({ v: value }),
});

const counterType = customType<{ data: Counter; driverData: string }>({
	codec: 'bigint',
	dataType: () => 'bigint',
	toDriver: (value) => value.n.toString(),
	fromDriver: (value) => ({ n: value as unknown as bigint }),
});

let taggedFromJsonCalls = 0;
const taggedJsonType = customType<{ data: Tagged; driverData: string; jsonData: string }>({
	dataType: () => 'text',
	toDriver: (value) => value.v,
	fromDriver: (value) => ({ v: value }),
	fromJson: (value) => {
		taggedFromJsonCalls++;
		return { v: value };
	},
});

const CUSTOM_NULL_ELEMENTS_TABLE = 'custom_null_elements';

export const customNullElementsTable = pgTable(CUSTOM_NULL_ELEMENTS_TABLE, {
	id: integer('id').primaryKey(),
	tagged: taggedType('tagged').array().notNull().$type<Tagged | null>(),
	taggedMtx: taggedType('tagged_mtx').array('[][]').notNull().$type<Tagged | null>(),
	counter: counterType('counter').array().notNull().$type<Counter | null>(),
	taggedJson: taggedJsonType('tagged_json').array().notNull().$type<Tagged | null>(),
});

export type CustomNullElementsRow = {
	id: number;
	tagged: (Tagged | null)[];
	taggedMtx: (Tagged | null)[][];
	counter: (Counter | null)[];
	taggedJson: (Tagged | null)[];
};

export const createCustomNullElements = (tableName: string = CUSTOM_NULL_ELEMENTS_TABLE) =>
	`create table "${tableName}" (
		"id" integer primary key,
		"tagged" text[] not null,
		"tagged_mtx" text[][] not null,
		"counter" int8[] not null,
		"tagged_json" text[] not null
	)`;

export const dropCustomNullElements = (tableName: string = CUSTOM_NULL_ELEMENTS_TABLE) =>
	`drop table if exists "${tableName}"`;

export const customNullElementsData: CustomNullElementsRow[] = [
	{
		id: 1,
		tagged: [{ v: 'a' }, null, { v: 'NULL' }],
		taggedMtx: [[{ v: 'a' }, null], [null, { v: 'b' }]],
		counter: [{ n: 5044565289845416380n }, null, { n: -1n }],
		taggedJson: [{ v: 'a' }, null, { v: 'b' }],
	},
	{
		id: 2,
		tagged: [null],
		taggedMtx: [[null]],
		counter: [null],
		taggedJson: [null],
	},
];

export async function assertCustomTypeNullArrayElements(
	db: PgAsyncDatabase<any, any>,
	{ run = awaitQuery, rqb = false }: { run?: RunQuery; rqb?: boolean } = {},
) {
	await run(db.execute(sql.raw(dropCustomNullElements())));
	await run(db.execute(sql.raw(createCustomNullElements())));

	try {
		await run(db.insert(customNullElementsTable).values(customNullElementsData));

		expect(
			await run(
				db.select({ id: customNullElementsTable.id }).from(customNullElementsTable).where(sql`\
array_position(${customNullElementsTable.tagged}, null) is not null \
and array_position(${customNullElementsTable.counter}, null) is not null \
and array_position(${customNullElementsTable.taggedJson}, null) is not null`).orderBy(customNullElementsTable.id),
			),
		).toStrictEqual([{ id: 1 }, { id: 2 }]);

		const query = db.select().from(customNullElementsTable).orderBy(customNullElementsTable.id);
		expectTypeOf<(typeof query)['_']['result']>().toEqualTypeOf<CustomNullElementsRow[]>();

		expect(await run(query)).toStrictEqual(customNullElementsData);
		if (rqb) {
			taggedFromJsonCalls = 0;
			expect(
				await run(
					(<any> db).query.customNullElementsTable.findMany({ orderBy: { id: 'asc' }, with: { self: true } }),
				),
			).toStrictEqual(customNullElementsData.map((row) => ({ ...row, self: [row] })));
			expect(taggedFromJsonCalls).toStrictEqual(2);
		}
	} finally {
		await run(db.execute(sql.raw(dropCustomNullElements())));
	}
}

export const boundsSchema = { boundsTable, temporalBoundsTable, nullElementsTable, customNullElementsTable };

export const boundsRelations = (r: RelationsBuilder<typeof boundsSchema>) => ({
	boundsTable: {
		self: r.many.boundsTable({ from: r.boundsTable.id, to: r.boundsTable.id }),
	},
	temporalBoundsTable: {
		self: r.many.temporalBoundsTable({ from: r.temporalBoundsTable.id, to: r.temporalBoundsTable.id }),
	},
	nullElementsTable: {
		self: r.many.nullElementsTable({ from: r.nullElementsTable.id, to: r.nullElementsTable.id }),
	},
	customNullElementsTable: {
		self: r.many.customNullElementsTable({ from: r.customNullElementsTable.id, to: r.customNullElementsTable.id }),
	},
});
