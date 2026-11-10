import type { RelationsBuilder } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { CockroachDatabase } from 'drizzle-orm/cockroach-core';
import {
	bigint,
	bit,
	bool,
	char,
	cockroachEnum,
	cockroachTable,
	customType,
	date,
	doublePrecision,
	float,
	inet,
	int4,
	interval,
	jsonb,
	numeric,
	real,
	smallint,
	string,
	text,
	time,
	timestamp,
	unionAll,
	uuid,
	varbit,
	varchar,
} from 'drizzle-orm/cockroach-core';
import { expect, expectTypeOf } from 'vitest';

export const makeAllTypes = <TTable extends string, TEnum extends string>(tableName: TTable, enumName: TEnum) => {
	const en = cockroachEnum(enumName, ['enVal1', 'enVal2']);
	const allTypesTable = makeAllTypesTable(tableName, en);
	return { en, allTypesTable };
};

const makeAllTypesTable = <TTable extends string>(
	tableName: TTable,
	en: ReturnType<typeof cockroachEnum<string, ['enVal1', 'enVal2']>>,
) =>
	cockroachTable(tableName, {
		int4: int4('int4').notNull(),
		bigint53: bigint('bigint53', { mode: 'number' }).notNull(),
		bigint64: bigint('bigint64', { mode: 'bigint' }).notNull(),
		bit: bit('bit').notNull(),
		bool: bool('bool').notNull(),
		boolean: bool('boolean').notNull(),
		char: char('char').notNull(),
		date: date('date', { mode: 'date' }).notNull(),
		dateStr: date('dateStr', { mode: 'string' }).notNull(),
		double: doublePrecision('double').notNull(),
		enum: en('enum').notNull(),
		float: float('float').notNull(),
		inet: inet('inet').notNull(),
		interval: interval('interval').notNull(),
		jsonb: jsonb('jsonb').notNull(),
		numeric: numeric('numeric').notNull(),
		numericNum: numeric('numericNum', { mode: 'number' }).notNull(),
		numericBig: numeric('numericBig', { mode: 'bigint' }).notNull(),
		real: real('real').notNull(),
		smallint: smallint('smallint').notNull(),
		string: string('string').notNull(),
		text: text('text').notNull(),
		time: time('time').notNull(),
		timestamp: timestamp('timestamp', { mode: 'date' }).notNull(),
		timestampTz: timestamp('timestampTz', { mode: 'date', withTimezone: true }).notNull(),
		timestampStr: timestamp('timestampStr', { mode: 'string' }).notNull(),
		timestampTzStr: timestamp('timestampTzStr', { mode: 'string', withTimezone: true }).notNull(),
		uuid: uuid('uuid').notNull(),
		varbit: varbit('varbit').notNull(),
		varchar: varchar('varchar').notNull(),
		arrint: int4('arrint').array().notNull(),
		arrbigint53: bigint('arrbigint53', { mode: 'number' }).array().notNull(),
		arrbigint64: bigint('arrbigint64', { mode: 'bigint' }).array().notNull(),
		arrbit: bit('arrbit').array().notNull(),
		arrbool: bool('arrbool').array().notNull(),
		arrboolean: bool('arrboolean').array().notNull(),
		arrchar: char('arrchar').array().notNull(),
		arrdate: date('arrdate', { mode: 'date' }).array().notNull(),
		arrdateStr: date('arrdateStr', { mode: 'string' }).array().notNull(),
		arrdouble: doublePrecision('arrdouble').array().notNull(),
		arrenum: en('arrenum').array().notNull(),
		arrfloat: float('arrfloat').array().notNull(),
		arrinet: inet('arrinet').array().notNull(),
		arrinterval: interval('arrinterval').array().notNull(),
		arrnumeric: numeric('arrnumeric').array().notNull(),
		arrnumericNum: numeric('arrnumericNum', { mode: 'number' }).array().notNull(),
		arrnumericBig: numeric('arrnumericBig', { mode: 'bigint' }).array().notNull(),
		arrreal: real('arrreal').array().notNull(),
		arrsmallint: smallint('arrsmallint').array().notNull(),
		arrstring: string('arrstring').array().notNull(),
		arrtext: text('arrtext').array().notNull(),
		arrtime: time('arrtime').array().notNull(),
		arrtimestamp: timestamp('arrtimestamp', { mode: 'date' }).array().notNull(),
		arrtimestampTz: timestamp('arrtimestampTz', { mode: 'date', withTimezone: true }).array().notNull(),
		arrtimestampStr: timestamp('arrtimestampStr', { mode: 'string' }).array().notNull(),
		arrtimestampTzStr: timestamp('arrtimestampTzStr', { mode: 'string', withTimezone: true }).array().notNull(),
		arruuid: uuid('arruuid').array().notNull(),
		arrvarbit: varbit('arrvarbit').array().notNull(),
		arrvarchar: varchar('arrvarchar').array().notNull(),
	});

export const { en: allTypesEnum, allTypesTable } = makeAllTypes('all_types_cdcs', 'en_cdcs');

export type AllTypesTable = ReturnType<typeof makeAllTypes>['allTypesTable'];

export const allTypesRelations = (r: RelationsBuilder<{ allTypesTable: AllTypesTable }>) => ({
	allTypesTable: {
		self: r.many.allTypesTable({
			from: r.allTypesTable.int4,
			to: r.allTypesTable.int4,
		}),
	},
});

export type AllTypes = {
	int4: number;
	bigint53: number;
	bigint64: bigint;
	bit: string;
	bool: boolean;
	boolean: boolean;
	char: string;
	date: Date;
	dateStr: string;
	double: number;
	enum: 'enVal1' | 'enVal2';
	float: number;
	inet: string;
	interval: string;
	jsonb: unknown;
	numeric: string;
	numericNum: number;
	numericBig: bigint;
	real: number;
	smallint: number;
	string: string;
	text: string;
	time: string;
	timestamp: Date;
	timestampTz: Date;
	timestampStr: string;
	timestampTzStr: string;
	uuid: string;
	varbit: string;
	varchar: string;
	arrint: number[];
	arrbigint53: number[];
	arrbigint64: bigint[];
	arrbit: string[];
	arrbool: boolean[];
	arrboolean: boolean[];
	arrchar: string[];
	arrdate: Date[];
	arrdateStr: string[];
	arrdouble: number[];
	arrenum: ('enVal1' | 'enVal2')[];
	arrfloat: number[];
	arrinet: string[];
	arrinterval: string[];
	arrnumeric: string[];
	arrnumericNum: number[];
	arrnumericBig: bigint[];
	arrreal: number[];
	arrsmallint: number[];
	arrstring: string[];
	arrtext: string[];
	arrtime: string[];
	arrtimestamp: Date[];
	arrtimestampTz: Date[];
	arrtimestampStr: string[];
	arrtimestampTzStr: string[];
	arruuid: string[];
	arrvarbit: string[];
	arrvarchar: string[];
};

export const allTypesData: AllTypes = {
	int4: 1,
	bigint53: 9007199254740991,
	bigint64: 5044565289845416380n,
	bit: '1',
	bool: true,
	boolean: true,
	char: 'c',
	date: new Date('2025-03-12T00:00:00.000Z'),
	dateStr: '2025-03-12',
	double: 15.35325689124218,
	enum: 'enVal1',
	float: 1.12,
	inet: '192.168.0.1/24',
	interval: '-2 mons',
	jsonb: { arr: ['strb', 11], str: 'strvalb' },
	numeric: '475452353476',
	numericNum: 9007199254740991,
	numericBig: 5044565289845416380n,
	real: 1.048596,
	smallint: 15,
	string: 'TEXT STRING',
	text: 'TEXT STRING',
	time: '13:59:28',
	timestamp: new Date('2025-03-12T01:32:41.623Z'),
	timestampTz: new Date('2025-03-12T01:32:41.623Z'),
	timestampStr: '2025-03-12 01:32:41.623',
	timestampTzStr: '2025-03-12 01:32:41.623+00',
	uuid: 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
	varbit: '1',
	varchar: 'C4-',
	arrint: [621, 621],
	arrbigint53: [9007199254740991, 9007199254740991],
	arrbigint64: [5044565289845416380n, 5044565289845416380n],
	arrbit: ['1', '1'],
	arrbool: [true, true],
	arrboolean: [true, false],
	arrchar: ['c', 'c'],
	arrdate: [new Date('2025-03-12T00:00:00.000Z'), new Date('2025-03-12T00:00:00.000Z')],
	arrdateStr: ['2025-03-12', '2025-03-12'],
	arrdouble: [15.35325689124218, 15.35325689124218],
	arrenum: ['enVal1', 'enVal1'],
	arrfloat: [1.12, 1.13],
	arrinet: ['192.168.0.1/24', '192.168.0.1/24'],
	arrinterval: ['-2 mons', '-2 mons'],
	arrnumeric: ['475452353476', '475452353476'],
	arrnumericNum: [9007199254740991, 9007199254740991],
	arrnumericBig: [5044565289845416380n, 5044565289845416380n],
	arrreal: [1.048596, 1.048596],
	arrsmallint: [10, 10],
	arrstring: ['TEXT STRING', 'TEXT STRING1'],
	arrtext: ['TEXT STRING', 'TEXT STRING'],
	arrtime: ['13:59:28', '13:59:28'],
	arrtimestamp: [new Date('2025-03-12T01:32:41.623Z'), new Date('2025-03-12T01:32:41.623Z')],
	arrtimestampTz: [new Date('2025-03-12T01:32:41.623Z'), new Date('2025-03-12T01:32:41.623Z')],
	arrtimestampStr: ['2025-03-12 01:32:41.623', '2025-03-12 01:32:41.623'],
	arrtimestampTzStr: ['2025-03-12 01:32:41.623+00', '2025-03-12 01:32:41.623+00'],
	arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c', 'b77c9eef-8e28-4654-88a1-7221b46d2a1c'],
	arrvarbit: ['1', '1'],
	arrvarchar: ['C4-', 'C4-'],
};

export type RunQuery = (query: any) => Promise<any>;
const awaitQuery: RunQuery = (query) => query;

const defaultAllTypesTable = allTypesTable;

export const allTypesEmptyArraysData: AllTypes = Object.fromEntries(
	Object.entries(allTypesData).map(([key, value]) => [key, key.startsWith('arr') ? [] : value]),
) as AllTypes;

export async function assertAllTypesEmptyArrays(
	db: CockroachDatabase<any, any>,
	allTypesTable: AllTypesTable = defaultAllTypesTable,
	{ rqb = false }: { rqb?: boolean } = {},
) {
	await db.delete(allTypesTable);
	await db.insert(allTypesTable).values(allTypesEmptyArraysData);

	expect(await db.select().from(allTypesTable)).toStrictEqual([allTypesEmptyArraysData]);
	if (rqb) {
		expect(await (<any> db).query.allTypesTable.findFirst({ with: { self: true } })).toStrictEqual({
			...allTypesEmptyArraysData,
			self: [allTypesEmptyArraysData],
		});
	}
}

export async function assertAllTypesUnions(
	db: CockroachDatabase<any, any>,
	allTypesTable: AllTypesTable = defaultAllTypesTable,
	run: RunQuery = awaitQuery,
) {
	// ---- numbers ----
	expect(
		await run(unionAll(
			db.select({
				'int4 ∪ int4': allTypesTable.int4.as('int4 ∪ int4'),
				'int4 ∪ smallint': allTypesTable.int4.as('int4 ∪ smallint'),
				'int4 ∪ bigint53': allTypesTable.int4.as('int4 ∪ bigint53'),
				'smallint ∪ int4': allTypesTable.smallint.as('smallint ∪ int4'),
				'smallint ∪ smallint': allTypesTable.smallint.as('smallint ∪ smallint'),
				'smallint ∪ bigint53': allTypesTable.smallint.as('smallint ∪ bigint53'),
				'bigint53 ∪ int4': allTypesTable.bigint53.as('bigint53 ∪ int4'),
				'bigint53 ∪ smallint': allTypesTable.bigint53.as('bigint53 ∪ smallint'),
				'bigint53 ∪ bigint53': allTypesTable.bigint53.as('bigint53 ∪ bigint53'),
				'double ∪ double': allTypesTable.double.as('double ∪ double'),
				'double ∪ real': allTypesTable.double.as('double ∪ real'),
				'double ∪ float': allTypesTable.double.as('double ∪ float'),
				'real ∪ double': allTypesTable.real.as('real ∪ double'),
				'real ∪ real': allTypesTable.real.as('real ∪ real'),
				'real ∪ float': allTypesTable.real.as('real ∪ float'),
				'float ∪ double': allTypesTable.float.as('float ∪ double'),
				'float ∪ real': allTypesTable.float.as('float ∪ real'),
				'float ∪ float': allTypesTable.float.as('float ∪ float'),
			}).from(allTypesTable),
			db.select({
				'int4 ∪ int4': allTypesTable.int4.as('int4 ∪ int4'),
				'int4 ∪ smallint': allTypesTable.smallint.as('int4 ∪ smallint'),
				'int4 ∪ bigint53': allTypesTable.bigint53.as('int4 ∪ bigint53'),
				'smallint ∪ int4': allTypesTable.int4.as('smallint ∪ int4'),
				'smallint ∪ smallint': allTypesTable.smallint.as('smallint ∪ smallint'),
				'smallint ∪ bigint53': allTypesTable.bigint53.as('smallint ∪ bigint53'),
				'bigint53 ∪ int4': allTypesTable.int4.as('bigint53 ∪ int4'),
				'bigint53 ∪ smallint': allTypesTable.smallint.as('bigint53 ∪ smallint'),
				'bigint53 ∪ bigint53': allTypesTable.bigint53.as('bigint53 ∪ bigint53'),
				'double ∪ double': allTypesTable.double.as('double ∪ double'),
				'double ∪ real': allTypesTable.real.as('double ∪ real'),
				'double ∪ float': allTypesTable.float.as('double ∪ float'),
				'real ∪ double': allTypesTable.double.as('real ∪ double'),
				'real ∪ real': allTypesTable.real.as('real ∪ real'),
				'real ∪ float': allTypesTable.float.as('real ∪ float'),
				'float ∪ double': allTypesTable.double.as('float ∪ double'),
				'float ∪ real': allTypesTable.real.as('float ∪ real'),
				'float ∪ float': allTypesTable.float.as('float ∪ float'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'int4 ∪ int4': 1,
			'int4 ∪ smallint': 1,
			'int4 ∪ bigint53': 1,
			'smallint ∪ int4': 15,
			'smallint ∪ smallint': 15,
			'smallint ∪ bigint53': 15,
			'bigint53 ∪ int4': 9007199254740991,
			'bigint53 ∪ smallint': 9007199254740991,
			'bigint53 ∪ bigint53': 9007199254740991,
			'double ∪ double': 15.35325689124218,
			'double ∪ real': 15.35325689124218,
			'double ∪ float': 15.35325689124218,
			'real ∪ double': 1.048596,
			'real ∪ real': 1.048596,
			'real ∪ float': 1.048596,
			'float ∪ double': 1.12,
			'float ∪ real': 1.12,
			'float ∪ float': 1.12,
		},
		{
			'int4 ∪ int4': 1,
			'int4 ∪ smallint': 15,
			'int4 ∪ bigint53': 9007199254740991,
			'smallint ∪ int4': 1,
			'smallint ∪ smallint': 15,
			'smallint ∪ bigint53': 9007199254740991,
			'bigint53 ∪ int4': 1,
			'bigint53 ∪ smallint': 15,
			'bigint53 ∪ bigint53': 9007199254740991,
			'double ∪ double': 15.35325689124218,
			'double ∪ real': 1.048596,
			'double ∪ float': 1.12,
			'real ∪ double': 15.35325689124218,
			'real ∪ real': 1.048596,
			'real ∪ float': 1.12,
			'float ∪ double': 15.35325689124218,
			'float ∪ real': 1.048596,
			'float ∪ float': 1.12,
		},
	]));

	// ---- bigint ----
	expect(
		await run(unionAll(
			db.select({
				'bigint64 ∪ bigint64': allTypesTable.bigint64.as('bigint64 ∪ bigint64'),
				'bigint64 ∪ numericBig': allTypesTable.bigint64.as('bigint64 ∪ numericBig'),
				'numericBig ∪ bigint64': allTypesTable.numericBig.as('numericBig ∪ bigint64'),
				'numericBig ∪ numericBig': allTypesTable.numericBig.as('numericBig ∪ numericBig'),
			}).from(allTypesTable),
			db.select({
				'bigint64 ∪ bigint64': allTypesTable.bigint64.as('bigint64 ∪ bigint64'),
				'bigint64 ∪ numericBig': allTypesTable.numericBig.as('bigint64 ∪ numericBig'),
				'numericBig ∪ bigint64': allTypesTable.bigint64.as('numericBig ∪ bigint64'),
				'numericBig ∪ numericBig': allTypesTable.numericBig.as('numericBig ∪ numericBig'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'bigint64 ∪ bigint64': 5044565289845416380n,
			'bigint64 ∪ numericBig': 5044565289845416380n,
			'numericBig ∪ bigint64': 5044565289845416380n,
			'numericBig ∪ numericBig': 5044565289845416380n,
		},
		{
			'bigint64 ∪ bigint64': 5044565289845416380n,
			'bigint64 ∪ numericBig': 5044565289845416380n,
			'numericBig ∪ bigint64': 5044565289845416380n,
			'numericBig ∪ numericBig': 5044565289845416380n,
		},
	]));

	// ---- text ----
	expect(
		await run(unionAll(
			db.select({
				'varchar ∪ varchar': allTypesTable.varchar.as('varchar ∪ varchar'),
				'varchar ∪ text': allTypesTable.varchar.as('varchar ∪ text'),
				'varchar ∪ string': allTypesTable.varchar.as('varchar ∪ string'),
				'text ∪ varchar': allTypesTable.text.as('text ∪ varchar'),
				'text ∪ text': allTypesTable.text.as('text ∪ text'),
				'text ∪ string': allTypesTable.text.as('text ∪ string'),
				'string ∪ varchar': allTypesTable.string.as('string ∪ varchar'),
				'string ∪ text': allTypesTable.string.as('string ∪ text'),
				'string ∪ string': allTypesTable.string.as('string ∪ string'),
			}).from(allTypesTable),
			db.select({
				'varchar ∪ varchar': allTypesTable.varchar.as('varchar ∪ varchar'),
				'varchar ∪ text': allTypesTable.text.as('varchar ∪ text'),
				'varchar ∪ string': allTypesTable.string.as('varchar ∪ string'),
				'text ∪ varchar': allTypesTable.varchar.as('text ∪ varchar'),
				'text ∪ text': allTypesTable.text.as('text ∪ text'),
				'text ∪ string': allTypesTable.string.as('text ∪ string'),
				'string ∪ varchar': allTypesTable.varchar.as('string ∪ varchar'),
				'string ∪ text': allTypesTable.text.as('string ∪ text'),
				'string ∪ string': allTypesTable.string.as('string ∪ string'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'varchar ∪ varchar': 'C4-',
			'varchar ∪ text': 'C4-',
			'varchar ∪ string': 'C4-',
			'text ∪ varchar': 'TEXT STRING',
			'text ∪ text': 'TEXT STRING',
			'text ∪ string': 'TEXT STRING',
			'string ∪ varchar': 'TEXT STRING',
			'string ∪ text': 'TEXT STRING',
			'string ∪ string': 'TEXT STRING',
		},
		{
			'varchar ∪ varchar': 'C4-',
			'varchar ∪ text': 'TEXT STRING',
			'varchar ∪ string': 'TEXT STRING',
			'text ∪ varchar': 'C4-',
			'text ∪ text': 'TEXT STRING',
			'text ∪ string': 'TEXT STRING',
			'string ∪ varchar': 'C4-',
			'string ∪ text': 'TEXT STRING',
			'string ∪ string': 'TEXT STRING',
		},
	]));

	// ---- numstr ----
	expect(
		await run(unionAll(
			db.select({
				'numeric ∪ numeric': allTypesTable.numeric.as('numeric ∪ numeric'),
			}).from(allTypesTable),
			db.select({
				'numeric ∪ numeric': allTypesTable.numeric.as('numeric ∪ numeric'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{ 'numeric ∪ numeric': '475452353476' },
		{ 'numeric ∪ numeric': '475452353476' },
	]));

	// ---- numeric crossed with the floats ----
	expect(
		await run(unionAll(
			db.select({
				'numericNum ∪ real': allTypesTable.numericNum.as('numericNum ∪ real'),
				'numericNum ∪ float': allTypesTable.numericNum.as('numericNum ∪ float'),
				'numericNum ∪ double': allTypesTable.numericNum.as('numericNum ∪ double'),
				'numericNum ∪ int4': allTypesTable.numericNum.as('numericNum ∪ int4'),
				'numericNum ∪ bigint53': allTypesTable.numericNum.as('numericNum ∪ bigint53'),
				'real ∪ numericNum': allTypesTable.real.as('real ∪ numericNum'),
				'float ∪ numericNum': allTypesTable.float.as('float ∪ numericNum'),
				'double ∪ numericNum': allTypesTable.double.as('double ∪ numericNum'),
				'int4 ∪ numericNum': allTypesTable.int4.as('int4 ∪ numericNum'),
			}).from(allTypesTable),
			db.select({
				'numericNum ∪ real': allTypesTable.real.as('numericNum ∪ real'),
				'numericNum ∪ float': allTypesTable.float.as('numericNum ∪ float'),
				'numericNum ∪ double': allTypesTable.double.as('numericNum ∪ double'),
				'numericNum ∪ int4': allTypesTable.int4.as('numericNum ∪ int4'),
				'numericNum ∪ bigint53': allTypesTable.bigint53.as('numericNum ∪ bigint53'),
				'real ∪ numericNum': allTypesTable.numericNum.as('real ∪ numericNum'),
				'float ∪ numericNum': allTypesTable.numericNum.as('float ∪ numericNum'),
				'double ∪ numericNum': allTypesTable.numericNum.as('double ∪ numericNum'),
				'int4 ∪ numericNum': allTypesTable.numericNum.as('int4 ∪ numericNum'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'numericNum ∪ real': 9007199254740991,
			'numericNum ∪ float': 9007199254740991,
			'numericNum ∪ double': 9007199254740991,
			'numericNum ∪ int4': 9007199254740991,
			'numericNum ∪ bigint53': 9007199254740991,
			'real ∪ numericNum': 1.048596,
			'float ∪ numericNum': 1.12,
			'double ∪ numericNum': 15.35325689124218,
			'int4 ∪ numericNum': 1,
		},
		{
			'numericNum ∪ real': 1.048596,
			'numericNum ∪ float': 1.12,
			'numericNum ∪ double': 15.35325689124218,
			'numericNum ∪ int4': 1,
			'numericNum ∪ bigint53': 9007199254740991,
			'real ∪ numericNum': 9007199254740991,
			'float ∪ numericNum': 9007199254740991,
			'double ∪ numericNum': 9007199254740991,
			'int4 ∪ numericNum': 9007199254740991,
		},
	]));

	// ---- string-mode temporals ----
	expect(
		await run(unionAll(
			db.select({
				'dateStr ∪ dateStr': allTypesTable.dateStr.as('dateStr ∪ dateStr'),
				'timestampStr ∪ timestampStr': allTypesTable.timestampStr.as('timestampStr ∪ timestampStr'),
				'timestampTzStr ∪ timestampTzStr': allTypesTable.timestampTzStr.as('timestampTzStr ∪ timestampTzStr'),
			}).from(allTypesTable),
			db.select({
				'dateStr ∪ dateStr': allTypesTable.dateStr.as('dateStr ∪ dateStr'),
				'timestampStr ∪ timestampStr': allTypesTable.timestampStr.as('timestampStr ∪ timestampStr'),
				'timestampTzStr ∪ timestampTzStr': allTypesTable.timestampTzStr.as('timestampTzStr ∪ timestampTzStr'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'dateStr ∪ dateStr': '2025-03-12',
			'timestampStr ∪ timestampStr': '2025-03-12 01:32:41.623',
			'timestampTzStr ∪ timestampTzStr': '2025-03-12 01:32:41.623+00',
		},
	]));

	expect(
		await run(unionAll(
			db.select({
				'date ∪ date': allTypesTable.date.as('date ∪ date'),
				'timestamp ∪ timestamp': allTypesTable.timestamp.as('timestamp ∪ timestamp'),
				'timestampTz ∪ timestampTz': allTypesTable.timestampTz.as('timestampTz ∪ timestampTz'),
			}).from(allTypesTable),
			db.select({
				'date ∪ date': allTypesTable.date.as('date ∪ date'),
				'timestamp ∪ timestamp': allTypesTable.timestamp.as('timestamp ∪ timestamp'),
				'timestampTz ∪ timestampTz': allTypesTable.timestampTz.as('timestampTz ∪ timestampTz'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'date ∪ date': new Date('2025-03-12T00:00:00.000Z'),
			'timestamp ∪ timestamp': new Date('2025-03-12T01:32:41.623Z'),
			'timestampTz ∪ timestampTz': new Date('2025-03-12T01:32:41.623Z'),
		},
		{
			'date ∪ date': new Date('2025-03-12T00:00:00.000Z'),
			'timestamp ∪ timestamp': new Date('2025-03-12T01:32:41.623Z'),
			'timestampTz ∪ timestampTz': new Date('2025-03-12T01:32:41.623Z'),
		},
	]));

	// ---- self-only ----
	expect(
		await run(unionAll(
			db.select({
				'bit ∪ bit': allTypesTable.bit.as('bit ∪ bit'),
				'varbit ∪ varbit': allTypesTable.varbit.as('varbit ∪ varbit'),
				'bool ∪ bool': allTypesTable.bool.as('bool ∪ bool'),
				'char ∪ char': allTypesTable.char.as('char ∪ char'),
				'dateStr ∪ dateStr': allTypesTable.dateStr.as('dateStr ∪ dateStr'),
				'enum ∪ enum': allTypesTable.enum.as('enum ∪ enum'),
				'inet ∪ inet': allTypesTable.inet.as('inet ∪ inet'),
				'interval ∪ interval': allTypesTable.interval.as('interval ∪ interval'),
				'jsonb ∪ jsonb': allTypesTable.jsonb.as('jsonb ∪ jsonb'),
				'numericNum ∪ numericNum': allTypesTable.numericNum.as('numericNum ∪ numericNum'),
				'time ∪ time': allTypesTable.time.as('time ∪ time'),
				'timestampStr ∪ timestampStr': allTypesTable.timestampStr.as('timestampStr ∪ timestampStr'),
				'timestampTzStr ∪ timestampTzStr': allTypesTable.timestampTzStr.as('timestampTzStr ∪ timestampTzStr'),
				'uuid ∪ uuid': allTypesTable.uuid.as('uuid ∪ uuid'),
			}).from(allTypesTable),
			db.select({
				'bit ∪ bit': allTypesTable.bit.as('bit ∪ bit'),
				'varbit ∪ varbit': allTypesTable.varbit.as('varbit ∪ varbit'),
				'bool ∪ bool': allTypesTable.bool.as('bool ∪ bool'),
				'char ∪ char': allTypesTable.char.as('char ∪ char'),
				'dateStr ∪ dateStr': allTypesTable.dateStr.as('dateStr ∪ dateStr'),
				'enum ∪ enum': allTypesTable.enum.as('enum ∪ enum'),
				'inet ∪ inet': allTypesTable.inet.as('inet ∪ inet'),
				'interval ∪ interval': allTypesTable.interval.as('interval ∪ interval'),
				'jsonb ∪ jsonb': allTypesTable.jsonb.as('jsonb ∪ jsonb'),
				'numericNum ∪ numericNum': allTypesTable.numericNum.as('numericNum ∪ numericNum'),
				'time ∪ time': allTypesTable.time.as('time ∪ time'),
				'timestampStr ∪ timestampStr': allTypesTable.timestampStr.as('timestampStr ∪ timestampStr'),
				'timestampTzStr ∪ timestampTzStr': allTypesTable.timestampTzStr.as('timestampTzStr ∪ timestampTzStr'),
				'uuid ∪ uuid': allTypesTable.uuid.as('uuid ∪ uuid'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'bit ∪ bit': '1',
			'varbit ∪ varbit': '1',
			'bool ∪ bool': true,
			'char ∪ char': 'c',
			'dateStr ∪ dateStr': '2025-03-12',
			'enum ∪ enum': 'enVal1',
			'inet ∪ inet': '192.168.0.1/24',
			'interval ∪ interval': '-2 mons',
			'jsonb ∪ jsonb': { arr: ['strb', 11], str: 'strvalb' },
			'numericNum ∪ numericNum': 9007199254740991,
			'time ∪ time': '13:59:28',
			'timestampStr ∪ timestampStr': '2025-03-12 01:32:41.623',
			'timestampTzStr ∪ timestampTzStr': '2025-03-12 01:32:41.623+00',
			'uuid ∪ uuid': 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
		},
		{
			'bit ∪ bit': '1',
			'varbit ∪ varbit': '1',
			'bool ∪ bool': true,
			'char ∪ char': 'c',
			'dateStr ∪ dateStr': '2025-03-12',
			'enum ∪ enum': 'enVal1',
			'inet ∪ inet': '192.168.0.1/24',
			'interval ∪ interval': '-2 mons',
			'jsonb ∪ jsonb': { arr: ['strb', 11], str: 'strvalb' },
			'numericNum ∪ numericNum': 9007199254740991,
			'time ∪ time': '13:59:28',
			'timestampStr ∪ timestampStr': '2025-03-12 01:32:41.623',
			'timestampTzStr ∪ timestampTzStr': '2025-03-12 01:32:41.623+00',
			'uuid ∪ uuid': 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
		},
	]));
}

const TABLE = 'all_types_bounds';
export const boundsTable = cockroachTable(TABLE, {
	id: int4('id').primaryKey(),
	bigintBig: bigint('bigint_big', { mode: 'bigint' }),
	bigintNum: bigint('bigint_num', { mode: 'number' }),
	numericBig: numeric('numeric_big', { mode: 'bigint' }),
	numericStr: numeric('numeric_str', { mode: 'string' }),
	numericNum: numeric('numeric_num', { mode: 'number' }),
});

export type BoundsRow = {
	id: number;
	bigintBig: bigint | null;
	bigintNum: number | null;
	numericBig: bigint | null;
	numericStr: string | null;
	numericNum: number | null;
};

export const createBounds = (tableName: string = TABLE) =>
	`create table "${tableName}" (
		"id" int4 primary key,
		"bigint_big" int8,
		"bigint_num" int8,
		"numeric_big" decimal,
		"numeric_str" decimal,
		"numeric_num" decimal
	)`;

export const dropBounds = (tableName: string = TABLE) => `drop table if exists "${tableName}"`;
export const boundsData: BoundsRow[] = [
	{ id: 1, bigintBig: 1n, bigintNum: 1, numericBig: 1n, numericStr: '1', numericNum: 1 },
	{
		id: 2,
		bigintBig: 9007199254740991n,
		bigintNum: 9007199254740991,
		numericBig: 9007199254740991n,
		numericStr: '9007199254740991',
		numericNum: 9007199254740991,
	},
	{
		id: 3,
		bigintBig: 9007199254740993n,
		bigintNum: -9007199254740991,
		numericBig: 9007199254740993n,
		numericStr: '9007199254740993',
		numericNum: -9007199254740991,
	},
	{
		id: 4,
		bigintBig: 5044565289845416380n,
		bigintNum: 0,
		numericBig: 5044565289845416380n,
		numericStr: '5044565289845416380',
		numericNum: 0,
	},
	{
		id: 5,
		bigintBig: -9007199254740993n,
		bigintNum: -1,
		numericBig: -9007199254740993n,
		numericStr: '-9007199254740993',
		numericNum: -1,
	},
	{
		id: 6,
		bigintBig: 9223372036854775807n,
		bigintNum: 123456789,
		numericBig: 170141183460469231731687303715884105727n,
		numericStr: '170141183460469231731687303715884105727',
		numericNum: 123456789,
	},
	{
		id: 7,
		bigintBig: -9223372036854775808n,
		bigintNum: -123456789,
		numericBig: -170141183460469231731687303715884105728n,
		numericStr: '-170141183460469231731687303715884105728',
		numericNum: -123456789,
	},
	{ id: 8, bigintBig: null, bigintNum: null, numericBig: null, numericStr: null, numericNum: null },
];

export async function assertAllTypesBounds(
	db: CockroachDatabase<any, any>,
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

export const temporalBoundsTable = cockroachTable(TEMPORAL_TABLE, {
	id: int4('id').primaryKey(),
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
		// cockroach stores `±infinity` in timestamptz but fails to print it back (22009 "exceeds supported timestamp bounds")
		timestampTzStr: null,
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
		// cockroach prints values from before ~2000 BC with offsets that don't match their time in non-UTC sessions
		timestampTz: null,
		timestampStr: '4714-11-24 00:00:00 BC',
		timestampTzStr: null,
		time: null,
		arrTimestampTz: null,
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
];

/**
 * Fills the temporal bounds table; `timestamp_tz` values then get 567 microseconds added, so they're printed with
 * 6 fractional digits that have to be truncated, not rounded, to milliseconds on decoding
 */
async function fillTemporalBounds(db: CockroachDatabase<any, any>, run: RunQuery) {
	await run(db.insert(temporalBoundsTable).values(temporalBoundsData));
	await run(
		db.execute(
			sql.raw(
				`update "${TEMPORAL_TABLE}" set "timestamp_tz" = "timestamp_tz" + interval '567 microseconds' where "timestamp_tz" is not null`,
			),
		),
	);
}

export async function assertAllTypesTemporalBounds(
	db: CockroachDatabase<any, any>,
	{ run = awaitQuery, rqb = false }: { run?: RunQuery; rqb?: boolean } = {},
) {
	await run(db.execute(sql.raw(dropTemporalBounds())));
	await run(db.execute(sql.raw(createTemporalBounds())));

	try {
		await fillTemporalBounds(db, run);

		const query = db.select().from(temporalBoundsTable).orderBy(temporalBoundsTable.id);
		expectTypeOf<(typeof query)['_']['result']>().toEqualTypeOf<TemporalBoundsRow[]>();

		expect(await run(query)).toStrictEqual(temporalBoundsData);
		if (rqb) {
			expect(
				await run((<any> db).query.temporalBoundsTable.findMany({ orderBy: { id: 'asc' }, with: { self: true } })),
			).toStrictEqual(temporalBoundsData.map((row) => ({ ...row, self: [row] })));
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
	{ timeZone: 'Asia/Tokyo', dateStyle: 'ISO, DMY' },
	{ timeZone: 'America/St_Johns', dateStyle: 'ISO, MDY' },
];

export async function assertAllTypesTemporalBoundsInSessions(
	db: CockroachDatabase<any, any>,
	{ rqb = false, sessions = sessionTimeZones }: { rqb?: boolean; sessions?: TemporalSession[] } = {},
) {
	const table = temporalBoundsTable;
	const columns = { id: true, date: true, timestamp: true, timestampTz: true, arrTimestampTz: true } as const;
	const expected = temporalBoundsData.map(({ id, date, timestamp, timestampTz, arrTimestampTz }) => ({
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
				await fillTemporalBounds(<any> tx, awaitQuery);

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

const nullElementsEnum = cockroachEnum(NULL_ELEMENTS_ENUM, ['enVal1', 'enVal2']);

export const nullElementsTable = cockroachTable(NULL_ELEMENTS_TABLE, {
	id: int4('id').primaryKey(),
	arrint: int4('arrint').array().notNull().$type<number | null>(),
	arrbigint53: bigint('arrbigint53', { mode: 'number' }).array().notNull().$type<number | null>(),
	arrbigint64: bigint('arrbigint64', { mode: 'bigint' }).array().notNull().$type<bigint | null>(),
	arrbit: bit('arrbit').array().notNull().$type<string | null>(),
	arrbool: bool('arrbool').array().notNull().$type<boolean | null>(),
	arrchar: char('arrchar').array().notNull().$type<string | null>(),
	arrdate: date('arrdate', { mode: 'date' }).array().notNull().$type<Date | null>(),
	arrdateStr: date('arrdateStr', { mode: 'string' }).array().notNull().$type<string | null>(),
	arrdouble: doublePrecision('arrdouble').array().notNull().$type<number | null>(),
	arrenum: nullElementsEnum('arrenum').array().notNull().$type<'enVal1' | 'enVal2' | null>(),
	arrfloat: float('arrfloat').array().notNull().$type<number | null>(),
	arrinet: inet('arrinet').array().notNull().$type<string | null>(),
	arrinterval: interval('arrinterval').array().notNull().$type<string | null>(),
	arrnumeric: numeric('arrnumeric').array().notNull().$type<string | null>(),
	arrnumericNum: numeric('arrnumericNum', { mode: 'number' }).array().notNull().$type<number | null>(),
	arrnumericBig: numeric('arrnumericBig', { mode: 'bigint' }).array().notNull().$type<bigint | null>(),
	arrreal: real('arrreal').array().notNull().$type<number | null>(),
	arrsmallint: smallint('arrsmallint').array().notNull().$type<number | null>(),
	arrstring: string('arrstring').array().notNull().$type<string | null>(),
	arrtext: text('arrtext').array().notNull().$type<string | null>(),
	arrtime: time('arrtime').array().notNull().$type<string | null>(),
	arrtimestamp: timestamp('arrtimestamp', { mode: 'date' }).array().notNull().$type<Date | null>(),
	arrtimestampTz: timestamp('arrtimestampTz', { mode: 'date', withTimezone: true }).array().notNull().$type<
		Date | null
	>(),
	arrtimestampStr: timestamp('arrtimestampStr', { mode: 'string' }).array().notNull().$type<string | null>(),
	arrtimestampTzStr: timestamp('arrtimestampTzStr', { mode: 'string', withTimezone: true }).array().notNull().$type<
		string | null
	>(),
	arruuid: uuid('arruuid').array().notNull().$type<string | null>(),
	arrvarbit: varbit('arrvarbit').array().notNull().$type<string | null>(),
	arrvarchar: varchar('arrvarchar').array().notNull().$type<string | null>(),
});

export type NullElementsRow = {
	id: number;
	arrint: (number | null)[];
	arrbigint53: (number | null)[];
	arrbigint64: (bigint | null)[];
	arrbit: (string | null)[];
	arrbool: (boolean | null)[];
	arrchar: (string | null)[];
	arrdate: (Date | null)[];
	arrdateStr: (string | null)[];
	arrdouble: (number | null)[];
	arrenum: ('enVal1' | 'enVal2' | null)[];
	arrfloat: (number | null)[];
	arrinet: (string | null)[];
	arrinterval: (string | null)[];
	arrnumeric: (string | null)[];
	arrnumericNum: (number | null)[];
	arrnumericBig: (bigint | null)[];
	arrreal: (number | null)[];
	arrsmallint: (number | null)[];
	arrstring: (string | null)[];
	arrtext: (string | null)[];
	arrtime: (string | null)[];
	arrtimestamp: (Date | null)[];
	arrtimestampTz: (Date | null)[];
	arrtimestampStr: (string | null)[];
	arrtimestampTzStr: (string | null)[];
	arruuid: (string | null)[];
	arrvarbit: (string | null)[];
	arrvarchar: (string | null)[];
};

export const createNullElements = (tableName: string = NULL_ELEMENTS_TABLE) => [
	`create type "${NULL_ELEMENTS_ENUM}" as enum ('enVal1', 'enVal2')`,
	`create table "${tableName}" (
		"id" int4 primary key,
		"arrint" int4[] not null,
		"arrbigint53" int8[] not null,
		"arrbigint64" int8[] not null,
		"arrbit" bit[] not null,
		"arrbool" bool[] not null,
		"arrchar" char[] not null,
		"arrdate" date[] not null,
		"arrdateStr" date[] not null,
		"arrdouble" float8[] not null,
		"arrenum" "${NULL_ELEMENTS_ENUM}"[] not null,
		"arrfloat" float8[] not null,
		"arrinet" inet[] not null,
		"arrinterval" interval[] not null,
		"arrnumeric" numeric[] not null,
		"arrnumericNum" numeric[] not null,
		"arrnumericBig" numeric[] not null,
		"arrreal" float4[] not null,
		"arrsmallint" int2[] not null,
		"arrstring" string[] not null,
		"arrtext" text[] not null,
		"arrtime" time[] not null,
		"arrtimestamp" timestamp[] not null,
		"arrtimestampTz" timestamptz[] not null,
		"arrtimestampStr" timestamp[] not null,
		"arrtimestampTzStr" timestamptz[] not null,
		"arruuid" uuid[] not null,
		"arrvarbit" varbit[] not null,
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
		arrbigint53: [9007199254740991, null, -42],
		arrbigint64: [5044565289845416380n, null, -9223372036854775808n],
		arrbit: ['1', null, '0'],
		arrbool: [true, null, false],
		arrchar: ['c', null, 'd'],
		arrdate: [new Date('2025-03-12T00:00:00.000Z'), null, new Date('1990-01-01T00:00:00.000Z')],
		arrdateStr: ['2025-03-12', null, '1990-01-01'],
		arrdouble: [15.35325689124218, null, -0.5],
		arrenum: ['enVal1', null, 'enVal2'],
		arrfloat: [1.12, null, 1.13],
		arrinet: ['192.168.0.1/24', null, '10.0.0.1/8'],
		arrinterval: ['-2 mons', null, '1 year 2 mons'],
		arrnumeric: ['475452353476', null, '-0.0001'],
		arrnumericNum: [9007199254740991, null, -1.5],
		arrnumericBig: [5044565289845416380n, null, -170141183460469231731687303715884105728n],
		arrreal: [1.048596, null, -2.5],
		arrsmallint: [10, null, -20],
		arrstring: ['TEXT STRING', null, 'NULL'],
		arrtext: ['TEXT STRING', null, 'NULL'],
		arrtime: ['13:59:28', null, '00:00:00'],
		arrtimestamp: [new Date('2025-03-12T01:32:41.623Z'), null, new Date('1990-01-01T00:00:00.000Z')],
		arrtimestampTz: [new Date('2025-03-12T01:32:41.623Z'), null, new Date('1990-01-01T00:00:00.000Z')],
		arrtimestampStr: ['2025-03-12 01:32:41.623', null, '1990-01-01 00:00:00'],
		arrtimestampTzStr: ['2025-03-12 01:32:41.623+00', null, '1990-01-01 00:00:00+00'],
		arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c', null, '00000000-0000-0000-0000-000000000000'],
		arrvarbit: ['1', null, '0101'],
		arrvarchar: ['C4-', null, 'second'],
	},
	{
		id: 2,
		arrint: [null],
		arrbigint53: [null],
		arrbigint64: [null],
		arrbit: [null],
		arrbool: [null],
		arrchar: [null],
		arrdate: [null],
		arrdateStr: [null],
		arrdouble: [null],
		arrenum: [null],
		arrfloat: [null],
		arrinet: [null],
		arrinterval: [null],
		arrnumeric: [null],
		arrnumericNum: [null],
		arrnumericBig: [null],
		arrreal: [null],
		arrsmallint: [null],
		arrstring: [null],
		arrtext: [null],
		arrtime: [null],
		arrtimestamp: [null],
		arrtimestampTz: [null],
		arrtimestampStr: [null],
		arrtimestampTzStr: [null],
		arruuid: [null],
		arrvarbit: [null],
		arrvarchar: [null],
	},
];

export async function assertAllTypesNullArrayElements(
	db: CockroachDatabase<any, any>,
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
				db.select({ id: nullElementsTable.id }).from(nullElementsTable).where(
					sql`array_position(${nullElementsTable.arrtext}, null) is not null`,
				).orderBy(nullElementsTable.id),
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
	dataType: () => 'string',
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
	dataType: () => 'string',
	toDriver: (value) => value.v,
	fromDriver: (value) => ({ v: value }),
	fromJson: (value) => {
		taggedFromJsonCalls++;
		return { v: value };
	},
});

const CUSTOM_NULL_ELEMENTS_TABLE = 'custom_null_elements';

export const customNullElementsTable = cockroachTable(CUSTOM_NULL_ELEMENTS_TABLE, {
	id: int4('id').primaryKey(),
	tagged: taggedType('tagged').array().notNull().$type<Tagged | null>(),
	counter: counterType('counter').array().notNull().$type<Counter | null>(),
	taggedJson: taggedJsonType('tagged_json').array().notNull().$type<Tagged | null>(),
});

export type CustomNullElementsRow = {
	id: number;
	tagged: (Tagged | null)[];
	counter: (Counter | null)[];
	taggedJson: (Tagged | null)[];
};

export const createCustomNullElements = (tableName: string = CUSTOM_NULL_ELEMENTS_TABLE) =>
	`create table "${tableName}" (
		"id" int4 primary key,
		"tagged" string[] not null,
		"counter" int8[] not null,
		"tagged_json" string[] not null
	)`;

export const dropCustomNullElements = (tableName: string = CUSTOM_NULL_ELEMENTS_TABLE) =>
	`drop table if exists "${tableName}"`;

export const customNullElementsData: CustomNullElementsRow[] = [
	{
		id: 1,
		tagged: [{ v: 'a' }, null, { v: 'NULL' }],
		counter: [{ n: 5044565289845416380n }, null, { n: -1n }],
		taggedJson: [{ v: 'a' }, null, { v: 'b' }],
	},
	{
		id: 2,
		tagged: [null],
		counter: [null],
		taggedJson: [null],
	},
];

export async function assertCustomTypeNullArrayElements(
	db: CockroachDatabase<any, any>,
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
