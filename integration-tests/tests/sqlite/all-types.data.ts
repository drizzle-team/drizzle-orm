import type { RelationsBuilder } from 'drizzle-orm';
import { entityKind } from 'drizzle-orm';
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core';
import { blob, integer, numeric, real, sqliteTable, text, unionAll } from 'drizzle-orm/sqlite-core';

export const makeAllTypes = <TTable extends string>(tableName: TTable) =>
	sqliteTable(tableName, {
		id: integer('id').primaryKey(),
		int: integer('int', {
			mode: 'number',
		}),
		bool: integer('bool', {
			mode: 'boolean',
		}),
		time: integer('time', {
			mode: 'timestamp',
		}),
		timeMs: integer('timeMs', {
			mode: 'timestamp_ms',
		}),
		bigint: blob('bigint', {
			mode: 'bigint',
		}),
		buffer: blob('buffer', {
			mode: 'buffer',
		}),
		json: blob('json', {
			mode: 'json',
		}),
		numeric: numeric('numeric'),
		numericNum: numeric('numericNum', {
			mode: 'number',
		}),
		numericBig: numeric('numericBig', {
			mode: 'bigint',
		}),
		real: real('real'),
		text: text('text', {
			mode: 'text',
		}),
		jsonText: text('jsonText', {
			mode: 'json',
		}),
	});

export const allTypesTable = makeAllTypes('all_types_cdcs');

export type AllTypesTable = ReturnType<typeof makeAllTypes>;

export const allTypesRelations = (r: RelationsBuilder<{ allTypesTable: AllTypesTable }>) => ({
	allTypesTable: {
		self: r.many.allTypesTable({
			from: r.allTypesTable.id,
			to: r.allTypesTable.id,
		}),
	},
});

export const createAllTypes = (tableName: string) =>
	`create table \`${tableName}\` (
		\`id\` integer primary key,
		\`int\` integer,
		\`bool\` integer,
		\`time\` integer,
		\`timeMs\` integer,
		\`bigint\` blob,
		\`buffer\` blob,
		\`json\` blob,
		\`numeric\` numeric,
		\`numericNum\` numeric,
		\`numericBig\` numeric,
		\`real\` real,
		\`text\` text,
		\`jsonText\` text
	)`;

export const dropAllTypes = (tableName: string) => `drop table if exists \`${tableName}\``;

export type AllTypes = {
	id: number;
	int: number | null;
	bool: boolean | null;
	time: Date | null;
	timeMs: Date | null;
	bigint: bigint | null;
	buffer: Buffer | null;
	json: unknown;
	numeric: string | null;
	numericNum: number | null;
	numericBig: bigint | null;
	real: number | null;
	text: string | null;
	jsonText: unknown;
};

const bufferBytes = [
	0x44,
	0x65,
	0x73,
	0x70,
	0x61,
	0x69,
	0x72,
	0x20,
	0x6f,
	0x20,
	0x64,
	0x65,
	0x73,
	0x70,
	0x61,
	0x69,
	0x72,
	0x2e,
	0x2e,
	0x2e,
];

const buffer = (typeof Buffer === 'undefined' ? new Uint8Array(bufferBytes) : Buffer.from(bufferBytes)) as Buffer;

export const allTypesInput: AllTypes = {
	id: 1,
	int: 1,
	bool: true,
	time: new Date(1741743161623),
	timeMs: new Date(1741743161623),
	bigint: 5044565289845416380n,
	buffer,
	json: { str: 'strval', arr: ['str', 10] },
	numeric: '475452353476',
	numericNum: 9007199254740991,
	numericBig: 5044565289845416380n,
	real: 1.048596,
	text: 'TEXT STRING',
	jsonText: { str: 'strvalb', arr: ['strb', 11] },
};

export const allTypesData: AllTypes = {
	...allTypesInput,
	time: new Date('2025-03-12T01:32:41.000Z'),
	timeMs: new Date('2025-03-12T01:32:41.623Z'),
};

export type RunQuery = (query: any) => Promise<any>;

const defaultAllTypesTable = allTypesTable;
export const allTypesUnionCases = (
	db: SQLiteAsyncDatabase<any, any, any>,
	allTypesTable: AllTypesTable = defaultAllTypesTable,
): { query: any; expected: Record<string, unknown>[] }[] => {
	const realsLoseLastBit = (db as any)?.constructor?.[entityKind] === 'SQLiteCloudDatabase';
	const numericNumThroughReal = realsLoseLastBit ? 9007199254740990 : 9007199254740991;

	return [
		// ---- numbers ----
		{
			query: unionAll(
				db.select({
					'int ∪ int': allTypesTable.int.as('int ∪ int'),
					'int ∪ real': allTypesTable.int.as('int ∪ real'),
					'int ∪ numericNum': allTypesTable.int.as('int ∪ numericNum'),
					'real ∪ int': allTypesTable.real.as('real ∪ int'),
					'real ∪ real': allTypesTable.real.as('real ∪ real'),
					'real ∪ numericNum': allTypesTable.real.as('real ∪ numericNum'),
					'numericNum ∪ int': allTypesTable.numericNum.as('numericNum ∪ int'),
					'numericNum ∪ real': allTypesTable.numericNum.as('numericNum ∪ real'),
					'numericNum ∪ numericNum': allTypesTable.numericNum.as('numericNum ∪ numericNum'),
				}).from(allTypesTable),
				db.select({
					'int ∪ int': allTypesTable.int.as('int ∪ int'),
					'int ∪ real': allTypesTable.real.as('int ∪ real'),
					'int ∪ numericNum': allTypesTable.numericNum.as('int ∪ numericNum'),
					'real ∪ int': allTypesTable.int.as('real ∪ int'),
					'real ∪ real': allTypesTable.real.as('real ∪ real'),
					'real ∪ numericNum': allTypesTable.numericNum.as('real ∪ numericNum'),
					'numericNum ∪ int': allTypesTable.int.as('numericNum ∪ int'),
					'numericNum ∪ real': allTypesTable.real.as('numericNum ∪ real'),
					'numericNum ∪ numericNum': allTypesTable.numericNum.as('numericNum ∪ numericNum'),
				}).from(allTypesTable),
			),
			expected: [
				{
					'int ∪ int': 1,
					'int ∪ real': 1,
					'int ∪ numericNum': 1,
					'real ∪ int': 1.048596,
					'real ∪ real': 1.048596,
					'real ∪ numericNum': 1.048596,
					'numericNum ∪ int': 9007199254740991,
					'numericNum ∪ real': 9007199254740991,
					'numericNum ∪ numericNum': 9007199254740991,
				},
				{
					'int ∪ int': 1,
					'int ∪ real': 1.048596,
					'int ∪ numericNum': 9007199254740991,
					'real ∪ int': 1,
					'real ∪ real': 1.048596,
					'real ∪ numericNum': numericNumThroughReal,
					'numericNum ∪ int': 1,
					'numericNum ∪ real': 1.048596,
					'numericNum ∪ numericNum': 9007199254740991,
				},
			],
		},
		// ---- bigints ----
		{
			query: unionAll(
				db.select({
					'bigint ∪ bigint': allTypesTable.bigint.as('bigint ∪ bigint'),
					'bigint ∪ numericBig': allTypesTable.bigint.as('bigint ∪ numericBig'),
					'numericBig ∪ bigint': allTypesTable.numericBig.as('numericBig ∪ bigint'),
					'numericBig ∪ numericBig': allTypesTable.numericBig.as('numericBig ∪ numericBig'),
				}).from(allTypesTable),
				db.select({
					'bigint ∪ bigint': allTypesTable.bigint.as('bigint ∪ bigint'),
					'bigint ∪ numericBig': allTypesTable.numericBig.as('bigint ∪ numericBig'),
					'numericBig ∪ bigint': allTypesTable.bigint.as('numericBig ∪ bigint'),
					'numericBig ∪ numericBig': allTypesTable.numericBig.as('numericBig ∪ numericBig'),
				}).from(allTypesTable),
			),
			expected: [
				{
					'bigint ∪ bigint': 5044565289845416380n,
					'bigint ∪ numericBig': 5044565289845416380n,
					'numericBig ∪ bigint': 5044565289845416380n,
					'numericBig ∪ numericBig': 5044565289845416380n,
				},
				{
					'bigint ∪ bigint': 5044565289845416380n,
					'bigint ∪ numericBig': 5044565289845416380n,
					'numericBig ∪ bigint': 5044565289845416380n,
					'numericBig ∪ numericBig': 5044565289845416380n,
				},
			],
		},
		// ---- text ----
		{
			query: unionAll(
				db.select({
					'text ∪ text': allTypesTable.text.as('text ∪ text'),
					'text ∪ numeric': allTypesTable.text.as('text ∪ numeric'),
					'numeric ∪ text': allTypesTable.numeric.as('numeric ∪ text'),
					'numeric ∪ numeric': allTypesTable.numeric.as('numeric ∪ numeric'),
				}).from(allTypesTable),
				db.select({
					'text ∪ text': allTypesTable.text.as('text ∪ text'),
					'text ∪ numeric': allTypesTable.numeric.as('text ∪ numeric'),
					'numeric ∪ text': allTypesTable.text.as('numeric ∪ text'),
					'numeric ∪ numeric': allTypesTable.numeric.as('numeric ∪ numeric'),
				}).from(allTypesTable),
			),
			expected: [
				{
					'text ∪ text': 'TEXT STRING',
					'text ∪ numeric': 'TEXT STRING',
					'numeric ∪ text': '475452353476',
					'numeric ∪ numeric': '475452353476',
				},
				{
					'text ∪ text': 'TEXT STRING',
					'text ∪ numeric': '475452353476',
					'numeric ∪ text': 'TEXT STRING',
					'numeric ∪ numeric': '475452353476',
				},
			],
		},
		// ---- json ----
		{
			query: unionAll(
				db.select({
					'jsonText ∪ jsonText': allTypesTable.jsonText.as('jsonText ∪ jsonText'),
					'jsonText ∪ json': allTypesTable.jsonText.as('jsonText ∪ json'),
					'json ∪ jsonText': allTypesTable.json.as('json ∪ jsonText'),
					'json ∪ json': allTypesTable.json.as('json ∪ json'),
				}).from(allTypesTable),
				db.select({
					'jsonText ∪ jsonText': allTypesTable.jsonText.as('jsonText ∪ jsonText'),
					'jsonText ∪ json': allTypesTable.json.as('jsonText ∪ json'),
					'json ∪ jsonText': allTypesTable.jsonText.as('json ∪ jsonText'),
					'json ∪ json': allTypesTable.json.as('json ∪ json'),
				}).from(allTypesTable),
			),
			expected: [
				{
					'jsonText ∪ jsonText': { str: 'strvalb', arr: ['strb', 11] },
					'jsonText ∪ json': { str: 'strvalb', arr: ['strb', 11] },
					'json ∪ jsonText': { str: 'strval', arr: ['str', 10] },
					'json ∪ json': { str: 'strval', arr: ['str', 10] },
				},
				{
					'jsonText ∪ jsonText': { str: 'strvalb', arr: ['strb', 11] },
					'jsonText ∪ json': { str: 'strval', arr: ['str', 10] },
					'json ∪ jsonText': { str: 'strvalb', arr: ['strb', 11] },
					'json ∪ json': { str: 'strval', arr: ['str', 10] },
				},
			],
		},
		{
			query: unionAll(
				db.select({
					'bool ∪ bool': allTypesTable.bool.as('bool ∪ bool'),
					'time ∪ time': allTypesTable.time.as('time ∪ time'),
					'time ∪ timeMs': allTypesTable.time.as('time ∪ timeMs'),
					'timeMs ∪ time': allTypesTable.timeMs.as('timeMs ∪ time'),
					'timeMs ∪ timeMs': allTypesTable.timeMs.as('timeMs ∪ timeMs'),
					'buffer ∪ buffer': allTypesTable.buffer.as('buffer ∪ buffer'),
				}).from(allTypesTable),
				db.select({
					'bool ∪ bool': allTypesTable.bool.as('bool ∪ bool'),
					'time ∪ time': allTypesTable.time.as('time ∪ time'),
					'time ∪ timeMs': allTypesTable.timeMs.as('time ∪ timeMs'),
					'timeMs ∪ time': allTypesTable.time.as('timeMs ∪ time'),
					'timeMs ∪ timeMs': allTypesTable.timeMs.as('timeMs ∪ timeMs'),
					'buffer ∪ buffer': allTypesTable.buffer.as('buffer ∪ buffer'),
				}).from(allTypesTable),
			),
			expected: [
				{
					'bool ∪ bool': true,
					'time ∪ time': new Date('2025-03-12T01:32:41.000Z'),
					'time ∪ timeMs': new Date('2025-03-12T01:32:41.000Z'),
					'timeMs ∪ time': new Date('2025-03-12T01:32:41.623Z'),
					'timeMs ∪ timeMs': new Date('2025-03-12T01:32:41.623Z'),
					'buffer ∪ buffer': buffer,
				},
				{
					'bool ∪ bool': true,
					'time ∪ time': new Date('2025-03-12T01:32:41.000Z'),
					'time ∪ timeMs': new Date(1741743161623 * 1000),
					'timeMs ∪ time': new Date(1741743161),
					'timeMs ∪ timeMs': new Date('2025-03-12T01:32:41.623Z'),
					'buffer ∪ buffer': buffer,
				},
			],
		},
	];
};

const TABLE = 'all_types_bounds';

export const boundsTable = sqliteTable(TABLE, {
	id: integer('id').primaryKey(),
	blobBig: blob('blob_big', { mode: 'bigint' }),
	numericBig: numeric('numeric_big', { mode: 'bigint' }),
	numericStr: numeric('numeric_str'),
	numericNum: numeric('numeric_num', { mode: 'number' }),
	int: integer('int'),
});

export type BoundsRow = {
	id: number;
	blobBig: bigint | null;
	numericBig: bigint | null;
	numericStr: string | null;
	numericNum: number | null;
	int: number | null;
};

export const createBounds = (tableName: string = TABLE) =>
	`create table \`${tableName}\` (
		\`id\` integer primary key,
		\`blob_big\` blob,
		\`numeric_big\` numeric,
		\`numeric_str\` numeric,
		\`numeric_num\` numeric,
		\`int\` integer
	)`;

export const dropBounds = (tableName: string = TABLE) => `drop table if exists \`${tableName}\``;

export const boundsData: BoundsRow[] = [
	{
		id: 1,
		blobBig: 1n,
		numericBig: 1n,
		numericStr: '1',
		numericNum: 1,
		int: 1,
	},
	{
		id: 2,
		blobBig: 9007199254740991n,
		numericBig: 9007199254740991n,
		numericStr: '9007199254740991',
		numericNum: 9007199254740991,
		int: 9007199254740991,
	},
	{
		id: 3,
		blobBig: 9007199254740993n,
		numericBig: 9007199254740993n,
		numericStr: '9007199254740993',
		numericNum: -9007199254740991,
		int: -9007199254740991,
	},
	{
		id: 4,
		blobBig: 5044565289845416380n,
		numericBig: 5044565289845416380n,
		numericStr: '5044565289845416380',
		numericNum: 0,
		int: 0,
	},
	{
		id: 5,
		blobBig: -9007199254740993n,
		numericBig: -9007199254740993n,
		numericStr: '-9007199254740993',
		numericNum: -1,
		int: -1,
	},
	{
		id: 6,
		blobBig: 170141183460469231731687303715884105727n,
		numericBig: 9223372036854775807n,
		numericStr: '9223372036854775807',
		numericNum: 123456789,
		int: 123456789,
	},
	{
		id: 7,
		blobBig: -170141183460469231731687303715884105728n,
		// int64 min, not -9223372036854775808: turso reads that one as a real, sqlite as an integer
		numericBig: -9223372036854775807n,
		numericStr: '-9223372036854775807',
		numericNum: -123456789,
		int: -123456789,
	},
	{
		id: 8,
		blobBig: null,
		numericBig: null,
		numericStr: null,
		numericNum: null,
		int: null,
	},
];
