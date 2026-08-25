import type { RelationsBuilder } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { SingleStoreDriverDatabase } from 'drizzle-orm/singlestore';
import type { SingleStoreDatabase } from 'drizzle-orm/singlestore-core';
import {
	bigint,
	binary,
	boolean,
	char,
	date,
	datetime,
	decimal,
	double,
	float,
	int,
	json,
	mediumint,
	real,
	serial,
	singlestoreEnum,
	singlestoreTable,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	unionAll,
	varbinary,
	varchar,
	vector,
	year,
} from 'drizzle-orm/singlestore-core';
import { expect, expectTypeOf } from 'vitest';

export const makeAllTypes = <TTable extends string>(tableName: TTable) =>
	singlestoreTable(tableName, {
		serial: serial('serial').primaryKey(),
		bigint53: bigint('bigint53', { mode: 'number' }),
		bigint64: bigint('bigint64', { mode: 'bigint' }),
		bigintString: bigint('bigintString', { mode: 'string' }),
		binary: binary('binary'),
		boolean: boolean('boolean'),
		char: char('char'),
		date: date('date', { mode: 'date' }),
		dateStr: date('dateStr', { mode: 'string' }),
		datetime: datetime('datetime', { mode: 'date' }),
		datetimeStr: datetime('datetimeStr', { mode: 'string' }),
		decimal: decimal('decimal'),
		decimalNum: decimal('decimalNum', { precision: 30, mode: 'number' }),
		decimalBig: decimal('decimalBig', { precision: 30, mode: 'bigint' }),
		double: double('double'),
		float: float('float'),
		int: int('int'),
		json: json('json'),
		medInt: mediumint('medInt'),
		smallInt: smallint('smallInt'),
		real: real('real'),
		text: text('text'),
		time: time('time'),
		timestamp: timestamp('timestamp', { mode: 'date' }),
		timestampStr: timestamp('timestampStr', { mode: 'string' }),
		tinyInt: tinyint('tinyInt'),
		varbin: varbinary('varbin', { length: 16 }),
		varchar: varchar('varchar', { length: 255 }),
		year: year('year'),
		enum: singlestoreEnum('enum', ['enV1', 'enV2']),
		vectorI8: vector('vectorI8', { dimensions: 5, elementType: 'I8' }),
		vectorI16: vector('vectorI16', { dimensions: 5, elementType: 'I16' }),
		vectorI32: vector('vectorI32', { dimensions: 5, elementType: 'I32' }),
		vectorI64: vector('vectorI64', { dimensions: 5, elementType: 'I64' }),
		vectorF32: vector('vectorF32', { dimensions: 5, elementType: 'F32' }),
		vectorF64: vector('vectorF64', { dimensions: 5, elementType: 'F64' }),
	});

export const allTypesTable = makeAllTypes('all_types_cdcs');

export type AllTypesTable = ReturnType<typeof makeAllTypes>;

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
	bigint53: number | null;
	bigint64: bigint | null;
	bigintString: string | null;
	binary: string | null;
	boolean: boolean | null;
	char: string | null;
	date: Date | null;
	dateStr: string | null;
	datetime: Date | null;
	datetimeStr: string | null;
	decimal: string | null;
	decimalNum: number | null;
	decimalBig: bigint | null;
	double: number | null;
	float: number | null;
	int: number | null;
	json: unknown;
	medInt: number | null;
	smallInt: number | null;
	real: number | null;
	text: string | null;
	time: string | null;
	timestamp: Date | null;
	timestampStr: string | null;
	tinyInt: number | null;
	varbin: string | null;
	varchar: string | null;
	year: number | null;
	enum: 'enV1' | 'enV2' | null;
	vectorI8: number[] | null;
	vectorI16: number[] | null;
	vectorI32: number[] | null;
	vectorI64: bigint[] | null;
	vectorF32: number[] | null;
	vectorF64: number[] | null;
};

export const allTypesData: AllTypes = {
	serial: 1,
	bigint53: 9007199254740991,
	bigint64: 5044565289845416380n,
	bigintString: '5044565289845416380',
	binary: '1',
	boolean: true,
	char: 'c',
	date: new Date('2025-03-12T00:00:00.000Z'),
	dateStr: '2025-03-12',
	datetime: new Date('2025-03-12T01:32:41.000Z'),
	datetimeStr: '2025-03-12 01:32:41',
	decimal: '47521',
	decimalNum: 9007199254740991,
	decimalBig: 5044565289845416380n,
	double: 15.35325689124218,
	float: 1.048596,
	int: 621,
	json: { arr: ['str', 10], str: 'strval' },
	medInt: 560,
	smallInt: 14,
	real: 1.048596,
	text: 'C4-',
	time: '04:13:22',
	timestamp: new Date('2025-03-12T01:32:41.000Z'),
	timestampStr: '2025-03-12 01:32:41',
	tinyInt: 7,
	varbin: '1010110101001101',
	varchar: 'VCHAR',
	year: 2025,
	enum: 'enV1',
	vectorI8: [-2, 8, 127, 85, -128],
	vectorI16: [-2, 8, 127, 85, -128],
	vectorI32: [15342, -27894, 6271, -10385, 31056],
	vectorI64: [
		4829301283746501823n,
		-7203847501293847201n,
		1623847561928374650n,
		-5938475628374651983n,
		803745610293847561n,
	],
	vectorF32: [...new Float32Array([0.735482, -0.291647, 1.183529, -2.406378, 0.014263])],
	vectorF64: [
		0.3918573842719283,
		-1.682530118745203,
		2.014963587205109,
		-0.005832741903218165,
		0.7841029456712038,
	],
};

export type RunQuery = (query: any) => Promise<any>;
const awaitQuery: RunQuery = (query) => query;

const defaultAllTypesTable = allTypesTable;
export async function assertAllTypesUnions(
	db: SingleStoreDatabase<any, any, any>,
	allTypesTable: AllTypesTable = defaultAllTypesTable,
	run: RunQuery = awaitQuery,
) {
	// ---- integers ----
	expect(
		await run(unionAll(
			db.select({
				'tinyInt ∪ smallInt': allTypesTable.tinyInt.as('tinyInt ∪ smallInt'),
				'tinyInt ∪ int': allTypesTable.tinyInt.as('tinyInt ∪ int'),
				'smallInt ∪ medInt': allTypesTable.smallInt.as('smallInt ∪ medInt'),
				'smallInt ∪ bigint53': allTypesTable.smallInt.as('smallInt ∪ bigint53'),
				'medInt ∪ int': allTypesTable.medInt.as('medInt ∪ int'),
				'int ∪ tinyInt': allTypesTable.int.as('int ∪ tinyInt'),
				'int ∪ bigint53': allTypesTable.int.as('int ∪ bigint53'),
				'bigint53 ∪ int': allTypesTable.bigint53.as('bigint53 ∪ int'),
				'bigint53 ∪ bigint53': allTypesTable.bigint53.as('bigint53 ∪ bigint53'),
			}).from(allTypesTable),
			db.select({
				'tinyInt ∪ smallInt': allTypesTable.smallInt.as('tinyInt ∪ smallInt'),
				'tinyInt ∪ int': allTypesTable.int.as('tinyInt ∪ int'),
				'smallInt ∪ medInt': allTypesTable.medInt.as('smallInt ∪ medInt'),
				'smallInt ∪ bigint53': allTypesTable.bigint53.as('smallInt ∪ bigint53'),
				'medInt ∪ int': allTypesTable.int.as('medInt ∪ int'),
				'int ∪ tinyInt': allTypesTable.tinyInt.as('int ∪ tinyInt'),
				'int ∪ bigint53': allTypesTable.bigint53.as('int ∪ bigint53'),
				'bigint53 ∪ int': allTypesTable.int.as('bigint53 ∪ int'),
				'bigint53 ∪ bigint53': allTypesTable.bigint53.as('bigint53 ∪ bigint53'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'tinyInt ∪ smallInt': 7,
			'tinyInt ∪ int': 7,
			'smallInt ∪ medInt': 14,
			'smallInt ∪ bigint53': 14,
			'medInt ∪ int': 560,
			'int ∪ tinyInt': 621,
			'int ∪ bigint53': 621,
			'bigint53 ∪ int': 9007199254740991,
			'bigint53 ∪ bigint53': 9007199254740991,
		},
		{
			'tinyInt ∪ smallInt': 14,
			'tinyInt ∪ int': 621,
			'smallInt ∪ medInt': 560,
			'smallInt ∪ bigint53': 9007199254740991,
			'medInt ∪ int': 621,
			'int ∪ tinyInt': 7,
			'int ∪ bigint53': 9007199254740991,
			'bigint53 ∪ int': 621,
			'bigint53 ∪ bigint53': 9007199254740991,
		},
	]));

	// ---- bigint ----
	expect(
		await run(unionAll(
			db.select({
				'bigint64 ∪ bigint64': allTypesTable.bigint64.as('bigint64 ∪ bigint64'),
			}).from(allTypesTable),
			db.select({
				'bigint64 ∪ bigint64': allTypesTable.bigint64.as('bigint64 ∪ bigint64'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'bigint64 ∪ bigint64': 5044565289845416380n,
		},
	]));

	// ---- floats ----
	expect(
		await run(unionAll(
			db.select({
				'double ∪ double': allTypesTable.double.as('double ∪ double'),
				'double ∪ real': allTypesTable.double.as('double ∪ real'),
				'real ∪ double': allTypesTable.real.as('real ∪ double'),
				'real ∪ real': allTypesTable.real.as('real ∪ real'),
				'float ∪ float': allTypesTable.float.as('float ∪ float'),
				'float ∪ double': allTypesTable.float.as('float ∪ double'),
				'double ∪ float': allTypesTable.double.as('double ∪ float'),
			}).from(allTypesTable),
			db.select({
				'double ∪ double': allTypesTable.double.as('double ∪ double'),
				'double ∪ real': allTypesTable.real.as('double ∪ real'),
				'real ∪ double': allTypesTable.double.as('real ∪ double'),
				'real ∪ real': allTypesTable.real.as('real ∪ real'),
				'float ∪ float': allTypesTable.float.as('float ∪ float'),
				'float ∪ double': allTypesTable.double.as('float ∪ double'),
				'double ∪ float': allTypesTable.float.as('double ∪ float'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'double ∪ double': 15.35325689124218,
			'double ∪ real': 15.35325689124218,
			'real ∪ double': 1.048596,
			'real ∪ real': 1.048596,
			'float ∪ float': 1.048596,
			'float ∪ double': 1.0485960245132446,
			'double ∪ float': 15.35325689124218,
		},
		{
			'double ∪ double': 15.35325689124218,
			'double ∪ real': 1.048596,
			'real ∪ double': 15.35325689124218,
			'real ∪ real': 1.048596,
			'float ∪ float': 1.048596,
			'float ∪ double': 15.35325689124218,
			'double ∪ float': 1.0485960245132446,
		},
	]));

	// ---- numstr ----
	expect(
		await run(unionAll(
			db.select({
				'decimal ∪ decimal': allTypesTable.decimal.as('decimal ∪ decimal'),
				'bigintString ∪ bigintString': allTypesTable.bigintString.as('bigintString ∪ bigintString'),
			}).from(allTypesTable),
			db.select({
				'decimal ∪ decimal': allTypesTable.decimal.as('decimal ∪ decimal'),
				'bigintString ∪ bigintString': allTypesTable.bigintString.as('bigintString ∪ bigintString'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{ 'decimal ∪ decimal': '47521', 'bigintString ∪ bigintString': '5044565289845416380' },
		{ 'decimal ∪ decimal': '47521', 'bigintString ∪ bigintString': '5044565289845416380' },
	]));

	// ---- text ----
	expect(
		await run(unionAll(
			db.select({
				'char ∪ char': allTypesTable.char.as('char ∪ char'),
				'char ∪ varchar': allTypesTable.char.as('char ∪ varchar'),
				'varchar ∪ char': allTypesTable.varchar.as('varchar ∪ char'),
				'varchar ∪ text': allTypesTable.varchar.as('varchar ∪ text'),
				'text ∪ varchar': allTypesTable.text.as('text ∪ varchar'),
				'text ∪ text': allTypesTable.text.as('text ∪ text'),
			}).from(allTypesTable),
			db.select({
				'char ∪ char': allTypesTable.char.as('char ∪ char'),
				'char ∪ varchar': allTypesTable.varchar.as('char ∪ varchar'),
				'varchar ∪ char': allTypesTable.char.as('varchar ∪ char'),
				'varchar ∪ text': allTypesTable.text.as('varchar ∪ text'),
				'text ∪ varchar': allTypesTable.varchar.as('text ∪ varchar'),
				'text ∪ text': allTypesTable.text.as('text ∪ text'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'char ∪ char': 'c',
			'char ∪ varchar': 'c',
			'varchar ∪ char': 'VCHAR',
			'varchar ∪ text': 'VCHAR',
			'text ∪ varchar': 'C4-',
			'text ∪ text': 'C4-',
		},
		{
			'char ∪ char': 'c',
			'char ∪ varchar': 'VCHAR',
			'varchar ∪ char': 'c',
			'varchar ∪ text': 'C4-',
			'text ∪ varchar': 'VCHAR',
			'text ∪ text': 'C4-',
		},
	]));

	// ---- date ----
	expect(
		await run(unionAll(
			db.select({
				'datetime ∪ datetime': allTypesTable.datetime.as('datetime ∪ datetime'),
				'datetime ∪ timestamp': allTypesTable.datetime.as('datetime ∪ timestamp'),
				'timestamp ∪ datetime': allTypesTable.timestamp.as('timestamp ∪ datetime'),
				'timestamp ∪ timestamp': allTypesTable.timestamp.as('timestamp ∪ timestamp'),
				'date ∪ date': allTypesTable.date.as('date ∪ date'),
			}).from(allTypesTable),
			db.select({
				'datetime ∪ datetime': allTypesTable.datetime.as('datetime ∪ datetime'),
				'datetime ∪ timestamp': allTypesTable.timestamp.as('datetime ∪ timestamp'),
				'timestamp ∪ datetime': allTypesTable.datetime.as('timestamp ∪ datetime'),
				'timestamp ∪ timestamp': allTypesTable.timestamp.as('timestamp ∪ timestamp'),
				'date ∪ date': allTypesTable.date.as('date ∪ date'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'datetime ∪ datetime': new Date('2025-03-12T01:32:41.000Z'),
			'datetime ∪ timestamp': new Date('2025-03-12T01:32:41.000Z'),
			'timestamp ∪ datetime': new Date('2025-03-12T01:32:41.000Z'),
			'timestamp ∪ timestamp': new Date('2025-03-12T01:32:41.000Z'),
			'date ∪ date': new Date('2025-03-12T00:00:00.000Z'),
		},
		{
			'datetime ∪ datetime': new Date('2025-03-12T01:32:41.000Z'),
			'datetime ∪ timestamp': new Date('2025-03-12T01:32:41.000Z'),
			'timestamp ∪ datetime': new Date('2025-03-12T01:32:41.000Z'),
			'timestamp ∪ timestamp': new Date('2025-03-12T01:32:41.000Z'),
			'date ∪ date': new Date('2025-03-12T00:00:00.000Z'),
		},
	]));

	// ---- self-only ----
	expect(
		await run(unionAll(
			db.select({
				'boolean ∪ boolean': allTypesTable.boolean.as('boolean ∪ boolean'),
				'dateStr ∪ dateStr': allTypesTable.dateStr.as('dateStr ∪ dateStr'),
				'datetimeStr ∪ datetimeStr': allTypesTable.datetimeStr.as('datetimeStr ∪ datetimeStr'),
				'timestampStr ∪ timestampStr': allTypesTable.timestampStr.as('timestampStr ∪ timestampStr'),
				'time ∪ time': allTypesTable.time.as('time ∪ time'),
				'year ∪ year': allTypesTable.year.as('year ∪ year'),
				'enum ∪ enum': allTypesTable.enum.as('enum ∪ enum'),
				'decimalNum ∪ decimalNum': allTypesTable.decimalNum.as('decimalNum ∪ decimalNum'),
				'decimalBig ∪ decimalBig': allTypesTable.decimalBig.as('decimalBig ∪ decimalBig'),
			}).from(allTypesTable),
			db.select({
				'boolean ∪ boolean': allTypesTable.boolean.as('boolean ∪ boolean'),
				'dateStr ∪ dateStr': allTypesTable.dateStr.as('dateStr ∪ dateStr'),
				'datetimeStr ∪ datetimeStr': allTypesTable.datetimeStr.as('datetimeStr ∪ datetimeStr'),
				'timestampStr ∪ timestampStr': allTypesTable.timestampStr.as('timestampStr ∪ timestampStr'),
				'time ∪ time': allTypesTable.time.as('time ∪ time'),
				'year ∪ year': allTypesTable.year.as('year ∪ year'),
				'enum ∪ enum': allTypesTable.enum.as('enum ∪ enum'),
				'decimalNum ∪ decimalNum': allTypesTable.decimalNum.as('decimalNum ∪ decimalNum'),
				'decimalBig ∪ decimalBig': allTypesTable.decimalBig.as('decimalBig ∪ decimalBig'),
			}).from(allTypesTable),
		)),
	).toEqual(expect.arrayContaining([
		{
			'boolean ∪ boolean': true,
			'dateStr ∪ dateStr': '2025-03-12',
			'datetimeStr ∪ datetimeStr': '2025-03-12 01:32:41',
			'timestampStr ∪ timestampStr': '2025-03-12 01:32:41',
			'time ∪ time': '04:13:22',
			'year ∪ year': 2025,
			'enum ∪ enum': 'enV1',
			'decimalNum ∪ decimalNum': 9007199254740991,
			'decimalBig ∪ decimalBig': 5044565289845416380n,
		},
		{
			'boolean ∪ boolean': true,
			'dateStr ∪ dateStr': '2025-03-12',
			'datetimeStr ∪ datetimeStr': '2025-03-12 01:32:41',
			'timestampStr ∪ timestampStr': '2025-03-12 01:32:41',
			'time ∪ time': '04:13:22',
			'year ∪ year': 2025,
			'enum ∪ enum': 'enV1',
			'decimalNum ∪ decimalNum': 9007199254740991,
			'decimalBig ∪ decimalBig': 5044565289845416380n,
		},
	]));
}

const TABLE = 'all_types_bounds';

export const boundsTable = singlestoreTable(TABLE, {
	id: int('id').primaryKey(),
	bigintBig: bigint('bigint_big', { mode: 'bigint' }),
	bigintStr: bigint('bigint_str', { mode: 'string' }),
	bigintNum: bigint('bigint_num', { mode: 'number' }),
	serialLike: bigint('serial_like', { mode: 'number', unsigned: true }),
	decimalBig: decimal('decimal_big', { precision: 65, scale: 0, mode: 'bigint' }),
	decimalStr: decimal('decimal_str', { precision: 65, scale: 0 }),
	decimalNum: decimal('decimal_num', { precision: 18, scale: 0, mode: 'number' }),
});

export type BoundsRow = {
	id: number;
	bigintBig: bigint | null;
	bigintStr: string | null;
	bigintNum: number | null;
	serialLike: number | null;
	decimalBig: bigint | null;
	decimalStr: string | null;
	decimalNum: number | null;
};

export const createBounds = (tableName: string = TABLE) =>
	`create table \`${tableName}\` (
		\`id\` int primary key,
		\`bigint_big\` bigint,
		\`bigint_str\` bigint,
		\`bigint_num\` bigint,
		\`serial_like\` bigint unsigned,
		\`decimal_big\` decimal(65, 0),
		\`decimal_str\` decimal(65, 0),
		\`decimal_num\` decimal(18, 0)
	)`;

export const dropBounds = (tableName: string = TABLE) => `drop table if exists \`${tableName}\``;

export const boundsData: BoundsRow[] = [
	{
		id: 1,
		bigintBig: 1n,
		bigintStr: '1',
		bigintNum: 1,
		serialLike: 1,
		decimalBig: 1n,
		decimalStr: '1',
		decimalNum: 1,
	},
	{
		id: 2,
		bigintBig: 9007199254740991n,
		bigintStr: '9007199254740991',
		bigintNum: 9007199254740991,
		serialLike: 9007199254740991,
		decimalBig: 9007199254740991n,
		decimalStr: '9007199254740991',
		decimalNum: 9007199254740991,
	},
	{
		id: 3,
		bigintBig: 9007199254740993n,
		bigintStr: '9007199254740993',
		bigintNum: -9007199254740991,
		serialLike: 0,
		decimalBig: 9007199254740993n,
		decimalStr: '9007199254740993',
		decimalNum: -9007199254740991,
	},
	{
		id: 4,
		bigintBig: 5044565289845416380n,
		bigintStr: '5044565289845416380',
		bigintNum: 0,
		serialLike: 123456789,
		decimalBig: 5044565289845416380n,
		decimalStr: '5044565289845416380',
		decimalNum: 0,
	},
	{
		id: 5,
		bigintBig: -9007199254740993n,
		bigintStr: '-9007199254740993',
		bigintNum: -1,
		serialLike: 4503599627370496,
		decimalBig: -9007199254740993n,
		decimalStr: '-9007199254740993',
		decimalNum: -1,
	},
	{
		id: 6,
		bigintBig: 9223372036854775807n,
		bigintStr: '9223372036854775807',
		bigintNum: 123456789,
		serialLike: 2,
		decimalBig: 9999999999999999999999999999999999999999n,
		decimalStr: '9999999999999999999999999999999999999999',
		decimalNum: 123456789,
	},
	{
		id: 7,
		bigintBig: -9223372036854775808n,
		bigintStr: '-9223372036854775808',
		bigintNum: -123456789,
		serialLike: 3,
		decimalBig: -9999999999999999999999999999999999999999n,
		decimalStr: '-9999999999999999999999999999999999999999',
		decimalNum: -123456789,
	},
	{
		id: 8,
		bigintBig: null,
		bigintStr: null,
		bigintNum: null,
		serialLike: null,
		decimalBig: null,
		decimalStr: null,
		decimalNum: null,
	},
];

export async function assertAllTypesBounds(
	db: SingleStoreDriverDatabase<any>,
	run: RunQuery = awaitQuery,
) {
	await run(db.execute(sql.raw(dropBounds())));
	await run(db.execute(sql.raw(createBounds())));

	try {
		await run(db.insert(boundsTable).values(boundsData));

		// pinned on the builder rather than on the awaited value, because `run` erases the type
		const query = db.select().from(boundsTable).orderBy(boundsTable.id);
		expectTypeOf<(typeof query)['_']['result']>().toEqualTypeOf<BoundsRow[]>();

		expect(await run(query)).toStrictEqual(boundsData);
	} finally {
		await run(db.execute(sql.raw(dropBounds())));
	}
}
