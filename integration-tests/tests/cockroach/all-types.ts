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
	run: RunQuery = awaitQuery,
) {
	await run(db.execute(sql.raw(dropBounds())));
	await run(db.execute(sql.raw(createBounds())));

	try {
		await run(db.insert(boundsTable).values(boundsData));

		const query = db.select().from(boundsTable).orderBy(boundsTable.id);
		expectTypeOf<(typeof query)['_']['result']>().toEqualTypeOf<BoundsRow[]>();

		expect(await run(query)).toStrictEqual(boundsData);
	} finally {
		await run(db.execute(sql.raw(dropBounds())));
	}
}
