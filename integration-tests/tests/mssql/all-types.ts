import type { RelationsBuilder } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { MsSqlDatabase } from 'drizzle-orm/mssql-core';
import {
	bigint,
	binary,
	bit,
	char,
	date,
	datetime,
	datetime2,
	datetimeoffset,
	decimal,
	float,
	int,
	mssqlTable,
	numeric,
	real,
	smallint,
	text,
	time,
	tinyint,
	unionAll,
	varbinary,
	varchar,
} from 'drizzle-orm/mssql-core';
import { expect, expectTypeOf } from 'vitest';

export const makeAllTypes = <TTable extends string>(tableName: TTable) =>
	mssqlTable(tableName, {
		tinyintCol: tinyint('tinyint_col').notNull(),
		smallintCol: smallint('smallint_col').notNull(),
		intCol: int('int_col').notNull(),
		bigintCol: bigint('bigint_col', { mode: 'bigint' }).notNull(),
		bigintNumber: bigint('bigint_number', { mode: 'number' }).notNull(),
		bigintString: bigint('bigint_string', { mode: 'string' }).notNull(),
		decimalCol: decimal('decimal_col', { precision: 38, scale: 9 }).notNull(),
		decimalNumber: decimal('decimal_number', { precision: 18, scale: 2, mode: 'number' }).notNull(),
		numericCol: numeric('numeric_col', { precision: 38, scale: 9 }).notNull(),
		floatCol: float('float_col').notNull(),
		realCol: real('real_col').notNull(),
		bitCol: bit('bit_col').notNull(),
		charCol: char('char_col', { length: 5 }).notNull(),
		varcharCol: varchar('varchar_col', { length: 50 }).notNull(),
		textCol: text('text_col').notNull(),
		binaryCol: binary('binary_col', { length: 5 }).notNull(),
		varbinaryCol: varbinary('varbinary_col', { length: 50 }).notNull(),
		dateCol: date('date_col', { mode: 'date' }).notNull(),
		dateString: date('date_string', { mode: 'string' }).notNull(),
		datetimeCol: datetime('datetime_col', { mode: 'date' }).notNull(),
		datetime2Col: datetime2('datetime2_col', { mode: 'date', precision: 3 }).notNull(),
		datetime2String: datetime2('datetime2_string', { mode: 'string', precision: 3 }).notNull(),
		datetimeoffsetCol: datetimeoffset('datetimeoffset_col', { mode: 'date', precision: 3 }).notNull(),
		timeString: time('time_string', { mode: 'string' }).notNull(),
	});

export const allTypesTable = makeAllTypes('all_types_codecs');

export type AllTypesTable = ReturnType<typeof makeAllTypes>;

export const allTypesRelations = (r: RelationsBuilder<{ allTypesTable: AllTypesTable }>) => ({
	allTypesTable: {
		self: r.many.allTypesTable({
			from: r.allTypesTable.intCol,
			to: r.allTypesTable.intCol,
		}),
	},
});

export type AllTypes = {
	tinyintCol: number;
	smallintCol: number;
	intCol: number;
	bigintCol: bigint;
	bigintNumber: number;
	bigintString: string;
	decimalCol: string;
	decimalNumber: number;
	numericCol: string;
	floatCol: number;
	realCol: number;
	bitCol: boolean;
	charCol: string;
	varcharCol: string;
	textCol: string;
	binaryCol: Buffer;
	varbinaryCol: Buffer;
	dateCol: Date;
	dateString: string;
	datetimeCol: Date;
	datetime2Col: Date;
	datetime2String: string;
	datetimeoffsetCol: Date;
	timeString: string;
};

export const allTypesData: AllTypes = {
	tinyintCol: 200,
	smallintCol: 30000,
	intCol: 2000000000,
	bigintCol: 5044565289845416380n,
	bigintNumber: 9007199254740991,
	bigintString: '5044565289845416380',
	decimalCol: '123456789.987654321',
	decimalNumber: 1234.56,
	numericCol: '987654321.123456789',
	floatCol: 15.35325689124218,
	realCol: 1.5,
	bitCol: true,
	charCol: 'abc  ',
	varcharCol: 'C4-',
	textCol: 'TEXT STRING',
	binaryCol: Buffer.from('BYTES'),
	varbinaryCol: Buffer.from('BYTES'),
	dateCol: new Date('2025-03-12T00:00:00Z'),
	dateString: '2025-03-12',
	datetimeCol: new Date('2025-03-12T01:32:41.000Z'),
	datetime2Col: new Date('2025-03-12T01:32:41.623Z'),
	datetime2String: '2025-03-12T01:32:41.623Z',
	datetimeoffsetCol: new Date('2025-03-12T01:32:41.623Z'),
	timeString: '13:59:28.000',
};

export const createAllTypes = (tableName: string) => `
	create table [${tableName}] (
		[tinyint_col] tinyint not null, [smallint_col] smallint not null, [int_col] int not null,
		[bigint_col] bigint not null, [bigint_number] bigint not null, [bigint_string] bigint not null,
		[decimal_col] decimal(38,9) not null, [decimal_number] decimal(18,2) not null,
		[numeric_col] numeric(38,9) not null,
		[float_col] float not null, [real_col] real not null, [bit_col] bit not null,
		[char_col] char(5) not null, [varchar_col] varchar(50) not null, [text_col] text not null,
		[binary_col] binary(5) not null, [varbinary_col] varbinary(50) not null,
		[date_col] date not null, [date_string] date not null, [datetime_col] datetime not null,
		[datetime2_col] datetime2(3) not null, [datetime2_string] datetime2(3) not null,
		[datetimeoffset_col] datetimeoffset(3) not null, [time_string] time not null
	)
`;

export type RunQuery = (query: any) => Promise<any>;
const awaitQuery: RunQuery = (query) => query;

const defaultAllTypesTable = allTypesTable;
export async function assertAllTypesUnions(
	db: MsSqlDatabase<any, any, any>,
	allTypesTable: AllTypesTable = defaultAllTypesTable,
	run: RunQuery = awaitQuery,
) {
	// ---- integers ----
	expect(
		await run(unionAll(
			db.select({
				'tinyintCol ∪ smallintCol': allTypesTable.tinyintCol.as('tinyintCol ∪ smallintCol'),
				'tinyintCol ∪ intCol': allTypesTable.tinyintCol.as('tinyintCol ∪ intCol'),
				'tinyintCol ∪ bigintNumber': allTypesTable.tinyintCol.as('tinyintCol ∪ bigintNumber'),
				'smallintCol ∪ intCol': allTypesTable.smallintCol.as('smallintCol ∪ intCol'),
				'smallintCol ∪ bigintNumber': allTypesTable.smallintCol.as('smallintCol ∪ bigintNumber'),
				'intCol ∪ tinyintCol': allTypesTable.intCol.as('intCol ∪ tinyintCol'),
				'intCol ∪ bigintNumber': allTypesTable.intCol.as('intCol ∪ bigintNumber'),
				'bigintNumber ∪ tinyintCol': allTypesTable.bigintNumber.as('bigintNumber ∪ tinyintCol'),
				'bigintNumber ∪ intCol': allTypesTable.bigintNumber.as('bigintNumber ∪ intCol'),
			}).from(allTypesTable),
			db.select({
				'tinyintCol ∪ smallintCol': allTypesTable.smallintCol.as('tinyintCol ∪ smallintCol'),
				'tinyintCol ∪ intCol': allTypesTable.intCol.as('tinyintCol ∪ intCol'),
				'tinyintCol ∪ bigintNumber': allTypesTable.bigintNumber.as('tinyintCol ∪ bigintNumber'),
				'smallintCol ∪ intCol': allTypesTable.intCol.as('smallintCol ∪ intCol'),
				'smallintCol ∪ bigintNumber': allTypesTable.bigintNumber.as('smallintCol ∪ bigintNumber'),
				'intCol ∪ tinyintCol': allTypesTable.tinyintCol.as('intCol ∪ tinyintCol'),
				'intCol ∪ bigintNumber': allTypesTable.bigintNumber.as('intCol ∪ bigintNumber'),
				'bigintNumber ∪ tinyintCol': allTypesTable.tinyintCol.as('bigintNumber ∪ tinyintCol'),
				'bigintNumber ∪ intCol': allTypesTable.intCol.as('bigintNumber ∪ intCol'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'tinyintCol ∪ smallintCol': 200,
			'tinyintCol ∪ intCol': 200,
			'tinyintCol ∪ bigintNumber': 200,
			'smallintCol ∪ intCol': 30000,
			'smallintCol ∪ bigintNumber': 30000,
			'intCol ∪ tinyintCol': 2000000000,
			'intCol ∪ bigintNumber': 2000000000,
			'bigintNumber ∪ tinyintCol': 9007199254740991,
			'bigintNumber ∪ intCol': 9007199254740991,
		},
		{
			'tinyintCol ∪ smallintCol': 30000,
			'tinyintCol ∪ intCol': 2000000000,
			'tinyintCol ∪ bigintNumber': 9007199254740991,
			'smallintCol ∪ intCol': 2000000000,
			'smallintCol ∪ bigintNumber': 9007199254740991,
			'intCol ∪ tinyintCol': 200,
			'intCol ∪ bigintNumber': 9007199254740991,
			'bigintNumber ∪ tinyintCol': 200,
			'bigintNumber ∪ intCol': 2000000000,
		},
	]));

	// ---- floats ----
	expect(
		await run(unionAll(
			db.select({
				'floatCol ∪ floatCol': allTypesTable.floatCol.as('floatCol ∪ floatCol'),
				'floatCol ∪ realCol': allTypesTable.floatCol.as('floatCol ∪ realCol'),
				'realCol ∪ realCol': allTypesTable.realCol.as('realCol ∪ realCol'),
			}).from(allTypesTable),
			db.select({
				'floatCol ∪ floatCol': allTypesTable.floatCol.as('floatCol ∪ floatCol'),
				'floatCol ∪ realCol': allTypesTable.realCol.as('floatCol ∪ realCol'),
				'realCol ∪ realCol': allTypesTable.realCol.as('realCol ∪ realCol'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'floatCol ∪ floatCol': 15.35325689124218,
			'floatCol ∪ realCol': 15.35325689124218,
			'realCol ∪ realCol': 1.5,
		},
		{
			'floatCol ∪ floatCol': 15.35325689124218,
			'floatCol ∪ realCol': 1.5,
			'realCol ∪ realCol': 1.5,
		},
	]));

	// ---- bignumbers ----
	expect(
		await run(unionAll(
			db.select({
				'bigintString ∪ bigintString': allTypesTable.bigintString.as('bigintString ∪ bigintString'),
				'bigintCol ∪ bigintCol': allTypesTable.bigintCol.as('bigintCol ∪ bigintCol'),
				'decimalCol ∪ decimalCol': allTypesTable.decimalCol.as('decimalCol ∪ decimalCol'),
				'decimalCol ∪ numericCol': allTypesTable.decimalCol.as('decimalCol ∪ numericCol'),
				'numericCol ∪ decimalCol': allTypesTable.numericCol.as('numericCol ∪ decimalCol'),
				'decimalNumber ∪ decimalNumber': allTypesTable.decimalNumber.as('decimalNumber ∪ decimalNumber'),
				'decimalNumber ∪ intCol': allTypesTable.decimalNumber.as('decimalNumber ∪ intCol'),
			}).from(allTypesTable),
			db.select({
				'bigintString ∪ bigintString': allTypesTable.bigintString.as('bigintString ∪ bigintString'),
				'bigintCol ∪ bigintCol': allTypesTable.bigintCol.as('bigintCol ∪ bigintCol'),
				'decimalCol ∪ decimalCol': allTypesTable.decimalCol.as('decimalCol ∪ decimalCol'),
				'decimalCol ∪ numericCol': allTypesTable.numericCol.as('decimalCol ∪ numericCol'),
				'numericCol ∪ decimalCol': allTypesTable.decimalCol.as('numericCol ∪ decimalCol'),
				'decimalNumber ∪ decimalNumber': allTypesTable.decimalNumber.as('decimalNumber ∪ decimalNumber'),
				'decimalNumber ∪ intCol': allTypesTable.intCol.as('decimalNumber ∪ intCol'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'bigintString ∪ bigintString': '5044565289845416380',
			'bigintCol ∪ bigintCol': 5044565289845416380n,
			'decimalCol ∪ decimalCol': '123456789.987654321',
			'decimalCol ∪ numericCol': '123456789.987654321',
			'numericCol ∪ decimalCol': '987654321.123456789',
			'decimalNumber ∪ decimalNumber': 1234.56,
			'decimalNumber ∪ intCol': 1234.56,
		},
		{
			'bigintString ∪ bigintString': '5044565289845416380',
			'bigintCol ∪ bigintCol': 5044565289845416380n,
			'decimalCol ∪ decimalCol': '123456789.987654321',
			'decimalCol ∪ numericCol': '987654321.123456789',
			'numericCol ∪ decimalCol': '123456789.987654321',
			'decimalNumber ∪ decimalNumber': 1234.56,
			'decimalNumber ∪ intCol': 2000000000,
		},
	]));

	// ---- text ----
	expect(
		await run(unionAll(
			db.select({
				'charCol ∪ charCol': allTypesTable.charCol.as('charCol ∪ charCol'),
				'charCol ∪ varcharCol': allTypesTable.charCol.as('charCol ∪ varcharCol'),
				'varcharCol ∪ charCol': allTypesTable.varcharCol.as('varcharCol ∪ charCol'),
				'varcharCol ∪ textCol': allTypesTable.varcharCol.as('varcharCol ∪ textCol'),
				'textCol ∪ varcharCol': allTypesTable.textCol.as('textCol ∪ varcharCol'),
				'textCol ∪ textCol': allTypesTable.textCol.as('textCol ∪ textCol'),
			}).from(allTypesTable),
			db.select({
				'charCol ∪ charCol': allTypesTable.charCol.as('charCol ∪ charCol'),
				'charCol ∪ varcharCol': allTypesTable.varcharCol.as('charCol ∪ varcharCol'),
				'varcharCol ∪ charCol': allTypesTable.charCol.as('varcharCol ∪ charCol'),
				'varcharCol ∪ textCol': allTypesTable.textCol.as('varcharCol ∪ textCol'),
				'textCol ∪ varcharCol': allTypesTable.varcharCol.as('textCol ∪ varcharCol'),
				'textCol ∪ textCol': allTypesTable.textCol.as('textCol ∪ textCol'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'charCol ∪ charCol': 'abc  ',
			'charCol ∪ varcharCol': 'abc  ',
			'varcharCol ∪ charCol': 'C4-',
			'varcharCol ∪ textCol': 'C4-',
			'textCol ∪ varcharCol': 'TEXT STRING',
			'textCol ∪ textCol': 'TEXT STRING',
		},
		{
			'charCol ∪ charCol': 'abc  ',
			'charCol ∪ varcharCol': 'C4-',
			'varcharCol ∪ charCol': 'abc  ',
			'varcharCol ∪ textCol': 'TEXT STRING',
			'textCol ∪ varcharCol': 'C4-',
			'textCol ∪ textCol': 'TEXT STRING',
		},
	]));

	// ---- date ----
	expect(
		await run(unionAll(
			db.select({
				'datetimeCol ∪ datetimeCol': allTypesTable.datetimeCol.as('datetimeCol ∪ datetimeCol'),
				'datetimeCol ∪ datetime2Col': allTypesTable.datetimeCol.as('datetimeCol ∪ datetime2Col'),
				'datetime2Col ∪ datetimeCol': allTypesTable.datetime2Col.as('datetime2Col ∪ datetimeCol'),
				'datetime2Col ∪ datetime2Col': allTypesTable.datetime2Col.as('datetime2Col ∪ datetime2Col'),
				'dateCol ∪ dateCol': allTypesTable.dateCol.as('dateCol ∪ dateCol'),
			}).from(allTypesTable),
			db.select({
				'datetimeCol ∪ datetimeCol': allTypesTable.datetimeCol.as('datetimeCol ∪ datetimeCol'),
				'datetimeCol ∪ datetime2Col': allTypesTable.datetime2Col.as('datetimeCol ∪ datetime2Col'),
				'datetime2Col ∪ datetimeCol': allTypesTable.datetimeCol.as('datetime2Col ∪ datetimeCol'),
				'datetime2Col ∪ datetime2Col': allTypesTable.datetime2Col.as('datetime2Col ∪ datetime2Col'),
				'dateCol ∪ dateCol': allTypesTable.dateCol.as('dateCol ∪ dateCol'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'datetimeCol ∪ datetimeCol': new Date('2025-03-12T01:32:41.000Z'),
			'datetimeCol ∪ datetime2Col': new Date('2025-03-12T01:32:41.000Z'),
			'datetime2Col ∪ datetimeCol': new Date('2025-03-12T01:32:41.623Z'),
			'datetime2Col ∪ datetime2Col': new Date('2025-03-12T01:32:41.623Z'),
			'dateCol ∪ dateCol': new Date('2025-03-12T00:00:00.000Z'),
		},
		{
			'datetimeCol ∪ datetimeCol': new Date('2025-03-12T01:32:41.000Z'),
			'datetimeCol ∪ datetime2Col': new Date('2025-03-12T01:32:41.623Z'),
			'datetime2Col ∪ datetimeCol': new Date('2025-03-12T01:32:41.000Z'),
			'datetime2Col ∪ datetime2Col': new Date('2025-03-12T01:32:41.623Z'),
			'dateCol ∪ dateCol': new Date('2025-03-12T00:00:00.000Z'),
		},
	]));

	// ---- self-only ----
	expect(
		await run(unionAll(
			db.select({
				'bitCol ∪ bitCol': allTypesTable.bitCol.as('bitCol ∪ bitCol'),
				'binaryCol ∪ binaryCol': allTypesTable.binaryCol.as('binaryCol ∪ binaryCol'),
				'varbinaryCol ∪ varbinaryCol': allTypesTable.varbinaryCol.as('varbinaryCol ∪ varbinaryCol'),
				'dateString ∪ dateString': allTypesTable.dateString.as('dateString ∪ dateString'),
				'datetime2String ∪ datetime2String': allTypesTable.datetime2String.as('datetime2String ∪ datetime2String'),
				'datetimeoffsetCol ∪ datetimeoffsetCol': allTypesTable.datetimeoffsetCol.as(
					'datetimeoffsetCol ∪ datetimeoffsetCol',
				),
				'timeString ∪ timeString': allTypesTable.timeString.as('timeString ∪ timeString'),
			}).from(allTypesTable),
			db.select({
				'bitCol ∪ bitCol': allTypesTable.bitCol.as('bitCol ∪ bitCol'),
				'binaryCol ∪ binaryCol': allTypesTable.binaryCol.as('binaryCol ∪ binaryCol'),
				'varbinaryCol ∪ varbinaryCol': allTypesTable.varbinaryCol.as('varbinaryCol ∪ varbinaryCol'),
				'dateString ∪ dateString': allTypesTable.dateString.as('dateString ∪ dateString'),
				'datetime2String ∪ datetime2String': allTypesTable.datetime2String.as('datetime2String ∪ datetime2String'),
				'datetimeoffsetCol ∪ datetimeoffsetCol': allTypesTable.datetimeoffsetCol.as(
					'datetimeoffsetCol ∪ datetimeoffsetCol',
				),
				'timeString ∪ timeString': allTypesTable.timeString.as('timeString ∪ timeString'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'bitCol ∪ bitCol': true,
			'binaryCol ∪ binaryCol': Buffer.from('BYTES'),
			'varbinaryCol ∪ varbinaryCol': Buffer.from('BYTES'),
			'dateString ∪ dateString': '2025-03-12',
			'datetime2String ∪ datetime2String': '2025-03-12T01:32:41.623Z',
			'datetimeoffsetCol ∪ datetimeoffsetCol': new Date('2025-03-12T01:32:41.623Z'),
			'timeString ∪ timeString': '13:59:28.000',
		},
		{
			'bitCol ∪ bitCol': true,
			'binaryCol ∪ binaryCol': Buffer.from('BYTES'),
			'varbinaryCol ∪ varbinaryCol': Buffer.from('BYTES'),
			'dateString ∪ dateString': '2025-03-12',
			'datetime2String ∪ datetime2String': '2025-03-12T01:32:41.623Z',
			'datetimeoffsetCol ∪ datetimeoffsetCol': new Date('2025-03-12T01:32:41.623Z'),
			'timeString ∪ timeString': '13:59:28.000',
		},
	]));
}

const TABLE = 'all_types_bounds';
export const boundsTable = mssqlTable(TABLE, {
	id: int('id').primaryKey(),
	bigintBig: bigint('bigint_big', { mode: 'bigint' }),
	bigintStr: bigint('bigint_str', { mode: 'string' }),
	bigintNum: bigint('bigint_num', { mode: 'number' }),
	decimalBig: decimal('decimal_big', { precision: 38, scale: 0, mode: 'bigint' }),
	decimalStr: decimal('decimal_str', { precision: 38, scale: 0 }),
	decimalNum: decimal('decimal_num', { precision: 18, scale: 0, mode: 'number' }),
	numericBig: numeric('numeric_big', { precision: 38, scale: 0, mode: 'bigint' }),
	numericStr: numeric('numeric_str', { precision: 38, scale: 0 }),
});

export type BoundsRow = {
	id: number;
	bigintBig: bigint | null;
	bigintStr: string | null;
	bigintNum: number | null;
	decimalBig: bigint | null;
	decimalStr: string | null;
	decimalNum: number | null;
	numericBig: bigint | null;
	numericStr: string | null;
};

export const createBounds = (tableName: string = TABLE) =>
	`create table [${tableName}] (
		[id] int primary key,
		[bigint_big] bigint,
		[bigint_str] bigint,
		[bigint_num] bigint,
		[decimal_big] decimal(38, 0),
		[decimal_str] decimal(38, 0),
		[decimal_num] decimal(18, 0),
		[numeric_big] numeric(38, 0),
		[numeric_str] numeric(38, 0)
	)`;

export const dropBounds = (tableName: string = TABLE) => `drop table if exists [${tableName}]`;
export const boundsData: BoundsRow[] = [
	{
		id: 1,
		bigintBig: 1n,
		bigintStr: '1',
		bigintNum: 1,
		decimalBig: 1n,
		decimalStr: '1',
		decimalNum: 1,
		numericBig: 1n,
		numericStr: '1',
	},
	{
		id: 2,
		bigintBig: 9007199254740991n,
		bigintStr: '9007199254740991',
		bigintNum: 9007199254740991,
		decimalBig: 9007199254740991n,
		decimalStr: '9007199254740991',
		decimalNum: 9007199254740991,
		numericBig: 9007199254740991n,
		numericStr: '9007199254740991',
	},
	{
		id: 3,
		bigintBig: 9007199254740993n,
		bigintStr: '9007199254740993',
		bigintNum: -9007199254740991,
		decimalBig: 9007199254740993n,
		decimalStr: '9007199254740993',
		decimalNum: -9007199254740991,
		numericBig: 9007199254740993n,
		numericStr: '9007199254740993',
	},
	{
		id: 4,
		bigintBig: 5044565289845416380n,
		bigintStr: '5044565289845416380',
		bigintNum: 0,
		decimalBig: 5044565289845416380n,
		decimalStr: '5044565289845416380',
		decimalNum: 0,
		numericBig: 5044565289845416380n,
		numericStr: '5044565289845416380',
	},
	{
		id: 5,
		bigintBig: -9007199254740993n,
		bigintStr: '-9007199254740993',
		bigintNum: -1,
		decimalBig: -9007199254740993n,
		decimalStr: '-9007199254740993',
		decimalNum: -1,
		numericBig: -9007199254740993n,
		numericStr: '-9007199254740993',
	},
	{
		id: 6,
		bigintBig: 9223372036854775807n,
		bigintStr: '9223372036854775807',
		bigintNum: 123456789,
		decimalBig: 99999999999999999999999999999999999999n,
		decimalStr: '99999999999999999999999999999999999999',
		decimalNum: 123456789,
		numericBig: 99999999999999999999999999999999999999n,
		numericStr: '99999999999999999999999999999999999999',
	},
	{
		id: 7,
		bigintBig: -9223372036854775808n,
		bigintStr: '-9223372036854775808',
		bigintNum: -123456789,
		decimalBig: -99999999999999999999999999999999999999n,
		decimalStr: '-99999999999999999999999999999999999999',
		decimalNum: -123456789,
		numericBig: -99999999999999999999999999999999999999n,
		numericStr: '-99999999999999999999999999999999999999',
	},
	{
		id: 8,
		bigintBig: null,
		bigintStr: null,
		bigintNum: null,
		decimalBig: null,
		decimalStr: null,
		decimalNum: null,
		numericBig: null,
		numericStr: null,
	},
];

export async function assertAllTypesBounds(
	db: MsSqlDatabase<any, any, any>,
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

export const temporalBoundsTable = mssqlTable(TEMPORAL_TABLE, {
	id: int('id').primaryKey(),
	date: date('date', { mode: 'date' }),
	dateStr: date('date_str', { mode: 'string' }),
	datetime: datetime('datetime', { mode: 'date' }),
	datetime2: datetime2('datetime2', { mode: 'date', precision: 3 }),
	datetime2Str: datetime2('datetime2_str', { mode: 'string', precision: 3 }),
	datetimeoffset: datetimeoffset('datetimeoffset', { mode: 'date', precision: 3 }),
	timeStr: time('time_str', { mode: 'string', precision: 3 }),
});

export type TemporalBoundsRow = {
	id: number;
	date: Date | null;
	dateStr: string | null;
	datetime: Date | null;
	datetime2: Date | null;
	datetime2Str: string | null;
	datetimeoffset: Date | null;
	timeStr: string | null;
};

export const createTemporalBounds = (tableName: string = TEMPORAL_TABLE) =>
	`create table [${tableName}] (
		[id] int primary key,
		[date] date,
		[date_str] date,
		[datetime] datetime,
		[datetime2] datetime2(3),
		[datetime2_str] datetime2(3),
		[datetimeoffset] datetimeoffset(3),
		[time_str] time(3)
	)`;

export const dropTemporalBounds = (tableName: string = TEMPORAL_TABLE) => `drop table if exists [${tableName}]`;

/*
	`date`, `datetime2` and `datetimeoffset` - years 1 - 9999
	`datetime` - 1753-01-01 - 9999-12-31 23:59:59.997, rounds milliseconds to .000 / .003 / .007
*/
export const temporalBoundsData: TemporalBoundsRow[] = [
	{
		id: 1,
		date: new Date('1970-01-01T00:00:00.000Z'),
		dateStr: '1970-01-01',
		datetime: new Date('1970-01-01T00:00:00.000Z'),
		datetime2: new Date('1970-01-01T00:00:00.000Z'),
		datetime2Str: '1970-01-01T00:00:00.000Z',
		datetimeoffset: new Date('1970-01-01T00:00:00.000Z'),
		timeStr: '00:00:00.000',
	},
	{
		id: 2,
		date: new Date('1969-12-31T00:00:00.000Z'),
		dateStr: '1969-12-31',
		datetime: new Date('1969-12-31T23:59:59.997Z'),
		datetime2: new Date('1969-12-31T23:59:59.999Z'),
		datetime2Str: '1969-12-31T23:59:59.999Z',
		datetimeoffset: new Date('1969-12-31T23:59:59.999Z'),
		timeStr: '23:59:59.999',
	},
	{
		id: 3,
		date: new Date('2024-02-29T00:00:00.000Z'),
		dateStr: '2024-02-29',
		datetime: new Date('2024-02-29T12:34:56.783Z'),
		datetime2: new Date('2024-02-29T12:34:56.789Z'),
		datetime2Str: '2024-02-29T12:34:56.789Z',
		datetimeoffset: new Date('2024-02-29T12:34:56.789Z'),
		timeStr: '12:34:56.789',
	},
	{
		id: 4,
		date: new Date('0001-01-01T00:00:00.000Z'),
		dateStr: '0001-01-01',
		datetime: new Date('1753-01-01T00:00:00.000Z'),
		datetime2: new Date('0001-01-01T00:00:00.000Z'),
		datetime2Str: '0001-01-01T00:00:00.000Z',
		datetimeoffset: new Date('0001-01-01T00:00:00.000Z'),
		timeStr: null,
	},
	{
		id: 5,
		date: new Date('0099-12-31T00:00:00.000Z'),
		dateStr: '0099-12-31',
		datetime: null,
		datetime2: new Date('0099-12-31T23:59:59.999Z'),
		datetime2Str: '0099-12-31T23:59:59.999Z',
		datetimeoffset: new Date('0099-12-31T23:59:59.999Z'),
		timeStr: null,
	},
	{
		id: 6,
		date: new Date('9999-12-31T00:00:00.000Z'),
		dateStr: '9999-12-31',
		datetime: new Date('9999-12-31T23:59:59.997Z'),
		datetime2: new Date('9999-12-31T23:59:59.999Z'),
		datetime2Str: '9999-12-31T23:59:59.999Z',
		datetimeoffset: new Date('9999-12-31T23:59:59.999Z'),
		timeStr: null,
	},
	{
		id: 7,
		date: null,
		dateStr: null,
		datetime: null,
		datetime2: null,
		datetime2Str: null,
		datetimeoffset: null,
		timeStr: null,
	},
];

export async function assertAllTypesTemporalBounds(
	db: MsSqlDatabase<any, any, any>,
	{ run = awaitQuery, rqb = false }: { run?: RunQuery; rqb?: boolean } = {},
) {
	await run(db.execute(sql.raw(dropTemporalBounds())));
	await run(db.execute(sql.raw(createTemporalBounds())));

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
		await run(db.execute(sql.raw(dropTemporalBounds())));
	}
}

/** https://github.com/drizzle-team/drizzle-orm/issues/6496 */
export const sessionDateFormats = [
	'set dateformat dmy',
	'set dateformat ydm',
	'set language british',
	'set language german',
];

export async function assertAllTypesTemporalBoundsInSessionDateFormats(
	db: MsSqlDatabase<any, any, any>,
	{ rqb = false }: { rqb?: boolean } = {},
) {
	await db.execute(sql.raw(dropTemporalBounds()));
	await db.execute(sql.raw(createTemporalBounds()));

	try {
		for (const setting of sessionDateFormats) {
			await db.transaction(async (tx) => {
				await tx.execute(sql.raw(setting));
				try {
					await tx.delete(temporalBoundsTable);
					await tx.insert(temporalBoundsTable).values(temporalBoundsData);

					expect(await tx.select().from(temporalBoundsTable).orderBy(temporalBoundsTable.id), setting)
						.toStrictEqual(temporalBoundsData);
					if (rqb) {
						expect(
							await (<any> tx).query.temporalBoundsTable.findMany({ orderBy: { id: 'asc' }, with: { self: true } }),
							setting,
						).toStrictEqual(temporalBoundsData.map((row) => ({ ...row, self: [row] })));
					}
				} finally {
					await tx.execute(sql.raw('set language us_english'));
				}
			});
		}
	} finally {
		await db.execute(sql.raw(dropTemporalBounds()));
	}
}

export const boundsSchema = { boundsTable, temporalBoundsTable };

export const boundsRelations = (r: RelationsBuilder<typeof boundsSchema>) => ({
	boundsTable: {
		self: r.many.boundsTable({ from: r.boundsTable.id, to: r.boundsTable.id }),
	},
	temporalBoundsTable: {
		self: r.many.temporalBoundsTable({ from: r.temporalBoundsTable.id, to: r.temporalBoundsTable.id }),
	},
});
