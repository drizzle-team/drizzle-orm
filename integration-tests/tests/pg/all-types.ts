import type { RelationsBuilder } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	boolean,
	bytea,
	char,
	cidr,
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
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';

export const makeAllTypes = <TTable extends string, TEnum extends string>(tableName: TTable, enumName: TEnum) => {
	const en = pgEnum(enumName, ['enVal1', 'enVal2']);
	const allTypesTable = makeAllTypesTable(tableName, en);
	return { en, allTypesTable };
};

const makeAllTypesTable = <TTable extends string>(
	tableName: TTable,
	en: ReturnType<typeof pgEnum<string, ['enVal1', 'enVal2']>>,
) =>
	pgTable(tableName, {
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
