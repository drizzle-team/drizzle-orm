// src/db/schema.ts
import { sql } from 'orm044';
import {
	bigint,
	bigserial,
	bit,
	boolean,
	char,
	cidr,
	customType,
	date,
	decimal,
	doublePrecision,
	foreignKey,
	geometry,
	halfvec,
	index,
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
	pgMaterializedView,
	pgSchema,
	pgSequence,
	pgTable,
	pgView,
	point,
	primaryKey,
	real,
	serial,
	smallint,
	smallserial,
	sparsevec,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
	vector,
} from 'orm044/pg-core';

export const citext = customType<{ data: string }>({
	dataType() {
		return 'citext';
	},
});

export const customSchema = pgSchema('schemass');
export const transactionStatusEnum = customSchema.enum('TransactionStatusEnum', ['PENDING', 'FAILED', 'SUCCESS']);
export const enumname = pgEnum('enumname', ['three', 'two', 'one']);
export const test = pgEnum('test', ['ds']);
export const testHello = pgEnum('test_hello', ['ds']);

export const invoiceSeqCustom = customSchema.sequence('invoice_seq', {
	increment: 1,
	startWith: 1000,
	minValue: 1000,
	cache: 1,
	cycle: false,
});
export const invoiceSeq = pgSequence('invoice_seq', {
	increment: 1,
	startWith: 1000,
	minValue: 1000,
	cache: 1,
	cycle: false,
});

export const schemaTest = pgTable('schema_test', {
	columnAll: uuid('column_all').defaultRandom(),
	column: transactionStatusEnum('column').notNull(),
});

export const allSmallIntsCustom = customSchema.table(
	'schema_test2_custom',
	{
		column: smallint('column').notNull().array().generatedAlwaysAs([1]),
		column1: smallint('column1').default(1),
		column2: smallint('column2').notNull().array().array(),
		column3: smallint('column3').notNull().array().array(),
		column4: smallint('column4').notNull().array().default([1]),
	},
	(
		t,
	) => [
		uniqueIndex().on(t.column1),
		uniqueIndex().on(t.column2),
		uniqueIndex('testdfds').on(t.column3),
		uniqueIndex('testdfds1').on(t.column4),
	],
);

export const allEnumsCustom = customSchema.table(
	'all_enums_custom',
	{
		columnAll: enumname('column_all').default('three').notNull(),
		column: enumname('columns').array().generatedAlwaysAs(['three']),
	},
	(t: any) => [index('ds').on(t.column)],
);

export const allTimestampsCustom = customSchema.table('all_timestamps_custom', {
	columnDateNow: timestamp('column_date_now', {
		precision: 1,
		withTimezone: true,
		mode: 'string',
	}).defaultNow(),
	columnAll: timestamp('column_all', { mode: 'string' }).default('2023-03-01 12:47:29.792'),
	column: timestamp('column', { mode: 'string' }).default(sql`'2023-02-28 16:18:31.18'`),
	column2: timestamp('column2', { mode: 'string', precision: 3 }).default(sql`'2023-02-28 16:18:31.18'`),
});

export const allUuidsCustom = customSchema.table('all_uuids_custom', {
	columnAll: uuid('column_all').defaultRandom().notNull(),
	column: uuid('column'),
});

export const allDatesCustom = customSchema.table('all_dates_custom', {
	column_date_now: date('column_date_now').defaultNow(),
	column_all: date('column_all', { mode: 'date' }).default(new Date()).notNull(),
	column: date('column'),
});

export const allRealsCustom = customSchema.table('all_reals_custom', {
	columnAll: real('column_all').default(32).notNull(),
	column: real('column'),
	columnPrimary: real('column_primary').primaryKey().notNull(),
});

export const allBigintsCustom = pgTable('all_bigints_custom', {
	columnAll: bigint('column_all', { mode: 'number' }).default(124).notNull(),
	column: bigint('column', { mode: 'number' }),
});

export const allBigserialsCustom = customSchema.table('all_bigserials_custom', {
	columnAll: bigserial('column_all', { mode: 'bigint' }).notNull(),
	column: bigserial('column', { mode: 'bigint' }).notNull(),
});

export const allIntervalsCustom = customSchema.table('all_intervals_custom', {
	columnAllConstrains: interval('column_all_constrains', {
		fields: 'month',
	})
		.default('1 mon')
		.notNull(),
	columnMinToSec: interval('column_min_to_sec', {
		fields: 'minute to second',
	}),
	columnWithoutFields: interval('column_without_fields').default('00:00:01').notNull(),
	column: interval('column'),
	column5: interval('column5', {
		fields: 'minute to second',
		precision: 3,
	}),
	column6: interval('column6'),
});

export const allSerialsCustom = customSchema.table('all_serials_custom', {
	columnAll: serial('column_all').notNull(),
	column: serial('column').notNull(),
});

export const allSmallserialsCustom = pgTable('all_smallserials_custom', {
	columnAll: smallserial('column_all').notNull(),
	column: smallserial('column').notNull(),
});

export const allTextsCustom = customSchema.table(
	'all_texts_custom',
	{
		columnAll: text('column_all').default('text').notNull(),
		column: text('columns').primaryKey(),
	},
	(t: any) => [index('test').on(t.column)],
);

export const allBoolsCustom = customSchema.table('all_bools_custom', {
	columnAll: boolean('column_all').default(true).notNull(),
	column: boolean('column'),
});

export const allVarcharsCustom = customSchema.table('all_varchars_custom', {
	columnAll: varchar('column_all').default('text').notNull(),
	column: varchar('column', { length: 200 }),
});

export const allTimesCustom = customSchema.table('all_times_custom', {
	columnDateNow: time('column_date_now').defaultNow(),
	columnAll: time('column_all').default('22:12:12').notNull(),
	column: time('column'),
});

export const allCharsCustom = customSchema.table('all_chars_custom', {
	columnAll: char('column_all', { length: 1 }).default('text').notNull(),
	column: char('column', { length: 1 }),
});

export const allDoublePrecisionCustom = customSchema.table('all_double_precision_custom', {
	columnAll: doublePrecision('column_all').default(33.2).notNull(),
	column: doublePrecision('column'),
});

export const allJsonbCustom = customSchema.table('all_jsonb_custom', {
	columnDefaultObject: jsonb('column_default_object').default({ hello: 'world world' }).notNull(),
	columnDefaultArray: jsonb('column_default_array').default({
		hello: { 'world world': ['foo', 'bar'] },
	}),
	column: jsonb('column'),
});

export const allJsonCustom = customSchema.table('all_json_custom', {
	columnDefaultObject: json('column_default_object').default({ hello: 'world world' }).notNull(),
	columnDefaultArray: json('column_default_array').default({
		hello: { 'world world': ['foo', 'bar'] },
		foo: 'bar',
		fe: 23,
	}),
	column: json('column'),
});

export const allIntegersCustom = customSchema.table('all_integers_custom', {
	columnAll: integer('column_all').primaryKey(),
	column: integer('column'),
	columnPrimary: integer('column_primary'),
});

export const allNumericsCustom = customSchema.table('all_numerics_custom', {
	columnAll: numeric('column_all', { precision: 1, scale: 1 }).default('32').notNull(),
	column: numeric('column'),
	columnPrimary: numeric('column_primary').primaryKey().notNull(),
});

export const allCidrCustom = customSchema.table('all_cidr_custom', {
	columnAll: cidr('column_all').notNull().array().generatedAlwaysAs(['0.0.0.0/0']),
	column: cidr('column').default('0.0.0.0/0'),
	columnPrimary: cidr('column_primary').primaryKey().notNull(),
});

export const allCustomCustom = customSchema.table('all_custom_custom', {
	columnAll: citext('column_all').notNull().array().generatedAlwaysAs(['0.0.0.0/0']),
	column: citext('column').default('test{}\'://`"'),
	columnPrimary: citext('column_primary').primaryKey().notNull(),
});

export const allInetCustom = customSchema.table('all_inet_custom', {
	columnAll: inet('column_all').notNull().array().generatedAlwaysAs(['127.0.0.1']),
	column: inet('column').default('127.0.0.1'),
	columnPrimary: inet('column_primary').primaryKey().notNull(),
});

export const allLineCustom = customSchema.table('all_line_custom', {
	columnAll: line('column_all').notNull().array().generatedAlwaysAs([[1, 1, 1]]),
	column: line('column').default([1, 1, 1]),
	columnPrimary: line('column_primary').primaryKey().notNull(),
});

export const allMacaddrCustom = customSchema.table('all_macaddr_custom', {
	columnAll: macaddr('column_all').notNull().array().generatedAlwaysAs(['08:00:2b:01:02:03']),
	column: macaddr('column').default('08:00:2b:01:02:03'),
	columnPrimary: macaddr('column_primary').primaryKey().notNull(),
});

export const allMacaddr8Custom = customSchema.table('all_macaddr8_custom', {
	columnAll: macaddr('column_all').notNull().array().generatedAlwaysAs(['08:00:2b:01:02:03:04:05']),
	column: macaddr('column').default('08:00:2b:01:02:03:04:05'),
	columnPrimary: macaddr('column_primary').primaryKey().notNull(),
});

export const allPointCustom = customSchema.table('all_point_custom', {
	columnAll: point('column_all', { mode: 'xy' }).notNull().array().generatedAlwaysAs([{ x: 1, y: 2 }]),
	columnAll1: point('column_all1', { mode: 'tuple' }).notNull().array().generatedAlwaysAs([[1, 2]]),
	column: point('column', { mode: 'xy' }).default({ x: 1, y: 2 }),
	column1: point('column1', { mode: 'tuple' }).default([1, 2]),
	columnPrimary: point('column_primary').primaryKey().notNull(),
});

export const allDecimalsCustom = customSchema.table('all_decimals_custom', {
	columnAll: decimal('column_all', { precision: 1, scale: 1 }).default('32').notNull(),
	column: decimal('column'),
	columnPrimary: decimal('column_primary').primaryKey().notNull(),
});

export const allGeometryCustom = pgTable('all_geometry_custom', {
	columnAll: geometry('column_all', { mode: 'xy', srid: 4326, type: 'point' }).default({ x: 30.5234, y: 50.4501 })
		.notNull(),
	columnAll1: geometry('column_all1', { mode: 'xy', type: 'point' }).default({ x: 30.5234, y: 50.4501 }).notNull(),
	columnAll2: geometry('column_all2', { mode: 'tuple', srid: 4326, type: 'point' }).default([30.5234, 50.4501])
		.notNull(),
	columnAll3: geometry('column_all3', { mode: 'tuple', type: 'point' }).default([30.5234, 50.4501]).notNull(),
	column: geometry('column').array(),
	columnPrimary: geometry('column_primary').primaryKey().notNull(),
});

export const allBitCustom = pgTable('all_bit_custom', {
	columnAll: bit('column_all', { dimensions: 1 }).default('1').notNull(),
	columnAll1: bit('column_all1', { dimensions: 2 }).default('11').notNull(),
	column: bit('column', { dimensions: 3 }).array(),
	columnPrimary: bit('column_primary', { dimensions: 5 }).primaryKey().notNull(),
});

export const allHalfvecCustom = pgTable('all_halfvec_custom', {
	columnAll: halfvec('column_all', { dimensions: 1 }).default([0, -2, 3]).notNull(),
	columnAll1: halfvec('column_all1', { dimensions: 2 }).default([0, -2, 3]).notNull(),
	column: halfvec('column', { dimensions: 3 }).array(),
	columnPrimary: halfvec('column_primary', { dimensions: 5 }).primaryKey().notNull(),
});

export const allVecCustom = pgTable('all_vec_custom', {
	columnAll: vector('column_all', { dimensions: 1 }).default([0, -2, 3]).notNull(),
	columnAll1: vector('column_all1', { dimensions: 2 }).default([0, -2, 3]).notNull(),
	columnAll2: vector('column_all2', { dimensions: 2 }).array().default([[0, -2, 3]]).notNull(),
	columnPrimary: vector('column_primary', { dimensions: 5 }).primaryKey().notNull(),
});

export const allSparcevecCustom = pgTable('all_sparcevec_custom', {
	columnAll: sparsevec('column_all', { dimensions: 1 }).default('{1:-1,3:2,5:3}/5').notNull(),
	columnAll1: sparsevec('column_all1', { dimensions: 2 }).default('{1:-1,3:2,5:3}/5').notNull(),
	columnAll3: sparsevec('column_all3', { dimensions: 2 }).array().default(['{1:-1,3:2,5:3}/5']).notNull(),
	columnPrimary: sparsevec('column_primary', { dimensions: 5 }).primaryKey().notNull(),
});

export const allSmallInts = pgTable(
	'schema_test2',
	{
		columnAll: smallint('column_all').default(124).notNull(),
		column: smallint('columns').array(),
		column1: smallint('column1').array().array(),
		column2: smallint('column2').array().array(),
		column3: smallint('column3').array(),
		column4: smallint('column4').array().notNull(),
	},
	(t: any) => [uniqueIndex('testdfds').on(t.column)],
);

export const allEnums = pgTable(
	'all_enums',
	{
		columnAll: enumname('column_all').default('three').notNull(),
		column: enumname('columns'),
		column3: enumname('column3').array().notNull(),
	},
	(t: any) => [index('ds').on(t.column)],
);

export const allTimestamps = pgTable('all_timestamps', {
	columnDateNow: timestamp('column_date_now', {
		precision: 1,
		withTimezone: true,
		mode: 'string',
	}).defaultNow(),
	columnAll: timestamp('column_all', { mode: 'string' }).default('2023-03-01 12:47:29.792'),
	column: timestamp('column', { mode: 'string' }).default(sql`'2023-02-28 16:18:31.18'`),
	column2: timestamp('column2', { mode: 'string', precision: 3 }).default(sql`'2023-02-28 16:18:31.18'`),
	column3: timestamp('column3').array().notNull(),
});

export const allUuids = pgTable('all_uuids', {
	columnAll: uuid('column_all').defaultRandom().notNull(),
	column: uuid('column'),
	column3: uuid('column3').array().notNull(),
});

export const allDates = pgTable('all_dates', {
	column_date_now: date('column_date_now').defaultNow(),
	column_all: date('column_all', { mode: 'date' }).default(new Date()).notNull(),
	column: date('column'),
	column3: date('column3').array().notNull(),
});

export const allReals = pgTable('all_reals', {
	columnAll: real('column_all').default(32).notNull(),
	column: real('column'),
	columnPrimary: real('column_primary').primaryKey().notNull(),
	column3: real('column3').array().notNull(),
});

export const allBigints = pgTable('all_bigints', {
	columnAll: bigint('column_all', { mode: 'number' }).default(124).notNull(),
	column: bigint('column', { mode: 'number' }),
	column3: bigint('column3', { mode: 'number' }).array().notNull(),
});

export const allBigserials = pgTable('all_bigserials', {
	columnAll: bigserial('column_all', { mode: 'bigint' }).notNull(),
	column: bigserial('column', { mode: 'bigint' }).notNull(),
	column3: bigserial('column3', { mode: 'number' }).array().notNull(),
});

export const allIntervals = pgTable('all_intervals', {
	columnAllConstrains: interval('column_all_constrains', {
		fields: 'month',
	})
		.default('1 mon')
		.notNull(),
	columnMinToSec: interval('column_min_to_sec', {
		fields: 'minute to second',
	}),
	columnWithoutFields: interval('column_without_fields').default('00:00:01').notNull(),
	column: interval('column'),
	column5: interval('column5', {
		fields: 'minute to second',
		precision: 3,
	}),
	column6: interval('column6'),
	column3: interval('column3').array().notNull(),
});

export const allSerials = pgTable('all_serials', {
	columnAll: serial('column_all').notNull(),
	column: serial('column').notNull(),
	column3: serial('column3').array().notNull(),
});

export const allSmallserials = pgTable('all_smallserials', {
	columnAll: smallserial('column_all').notNull(),
	column: smallserial('column').notNull(),
	column3: smallserial('column3').array().notNull(),
});

export const allTexts = pgTable(
	'all_texts',
	{
		columnAll: text('column_all').default('text').notNull(),
		column: text('columns').primaryKey(),
		column3: text('column3').array().notNull(),
	},
	(t: any) => [index('test').on(t.column)],
);

export const allBools = pgTable('all_bools', {
	columnAll: boolean('column_all').default(true).notNull(),
	column: boolean('column'),
	column3: boolean('column3').array().notNull(),
});

export const allVarchars = pgTable('all_varchars', {
	columnAll: varchar('column_all').default('text').notNull(),
	column: varchar('column', { length: 200 }),
	column3: varchar('column3').array().notNull(),
});

export const allTimes = pgTable('all_times', {
	columnDateNow: time('column_date_now').defaultNow(),
	columnAll: time('column_all').default('22:12:12').notNull(),
	column: time('column'),
	column3: time('column3').array().notNull(),
});

export const allChars = pgTable('all_chars', {
	columnAll: char('column_all', { length: 1 }).default('text').notNull(),
	column: char('column', { length: 1 }),
	column3: char('column3').array().notNull(),
});

export const allDoublePrecision = pgTable('all_double_precision', {
	columnAll: doublePrecision('column_all').default(33.2).notNull(),
	column: doublePrecision('column'),
	column3: doublePrecision('column3').array().notNull(),
});

export const allJsonb = pgTable('all_jsonb', {
	columnDefaultObject: jsonb('column_default_object').default({ hello: 'world world' }).notNull(),
	columnDefaultArray: jsonb('column_default_array').default({
		hello: { 'world world': ['foo', 'bar'] },
	}),
	column: jsonb('column'),
	column3: jsonb('column3').array().notNull(),
});

export const allJson = pgTable('all_json', {
	columnDefaultObject: json('column_default_object').default({ hello: 'world world' }).notNull(),
	columnDefaultArray: json('column_default_array').default({
		hello: { 'world world': ['foo', 'bar'] },
		foo: 'bar',
		fe: 23,
	}),
	column: json('column'),
	column3: json('column3').array().notNull(),
});

export const allIntegers = pgTable('all_integers', {
	columnAll: integer('column_all').primaryKey(),
	column: integer('column').default(1),
	columnPrimary: integer('column_primary'),
	column3: integer('column3').array().notNull(),
});

export const allNumerics = pgTable('all_numerics', {
	columnAll: numeric('column_all', { precision: 1, scale: 1 }).default('32').notNull(),
	column: numeric('column'),
	columnPrimary: numeric('column_primary').primaryKey().notNull(),
	column3: numeric('column3').array().notNull(),
});

export const allCidr = pgTable('all_cidr', {
	columnAll: cidr('column_all').notNull().array().generatedAlwaysAs(['0.0.0.0/0']),
	column: cidr('column').default('0.0.0.0/0'),
	columnPrimary: cidr('column_primary').primaryKey().notNull(),
	column3: cidr('column3').array().notNull(),
});

export const allCustom = pgTable('all_custom', {
	columnAll: citext('column_all').notNull().array().generatedAlwaysAs(['0.0.0.0/0']),
	column: citext('column').default('test{}\'://`"'),
	columnPrimary: citext('column_primary').primaryKey().notNull(),
	column3: citext('column3').array().notNull(),
});

export const allInet = pgTable('all_inet', {
	columnAll: inet('column_all').notNull().array().generatedAlwaysAs(['127.0.0.1']),
	column: inet('column').default('127.0.0.1'),
	columnPrimary: inet('column_primary').primaryKey().notNull(),
	column3: inet('column3').array().notNull(),
});

export const allLine = pgTable('all_line', {
	columnAll: line('column_all').notNull().array().generatedAlwaysAs([[1, 1, 1]]),
	column: line('column').default([1, 1, 1]),
	columnPrimary: line('column_primary').primaryKey().notNull(),
	column3: line('column3').array().notNull(),
});

export const allMacaddr = pgTable('all_macaddr', {
	columnAll: macaddr('column_all').notNull().array().generatedAlwaysAs(['08:00:2b:01:02:03']),
	column: macaddr('column').default('08:00:2b:01:02:03'),
	columnPrimary: macaddr('column_primary').primaryKey().notNull(),
	column3: macaddr('column3').notNull().array(),
});

export const allMacaddr8 = pgTable('all_macaddr8', {
	columnAll: macaddr8('column_all').notNull().array().generatedAlwaysAs(['08:00:2b:01:02:03:04:05']),
	column: macaddr8('column').default('08:00:2b:01:02:03:04:05'),
	columnPrimary: macaddr8('column_primary').primaryKey().notNull(),
	column3: macaddr8('column3').notNull().array(),
});

export const allPoint = pgTable('all_point', {
	columnAll: point('column_all', { mode: 'xy' }).notNull().array().generatedAlwaysAs([{ x: 1, y: 2 }]),
	columnAll1: point('column_all1', { mode: 'tuple' }).notNull().array().generatedAlwaysAs([[1, 2]]),
	column: point('column', { mode: 'xy' }).default({ x: 1, y: 2 }),
	column1: point('column1', { mode: 'tuple' }).default([1, 2]),
	columnPrimary: point('column_primary').primaryKey().notNull(),
	column3: point('column3').notNull().array(),
});

export const allDecimals = pgTable('all_decimals', {
	columnAll: decimal('column_all', { precision: 1, scale: 1 }).default('32').notNull(),
	column: decimal('column').array(),
	columnPrimary: decimal('column_primary').primaryKey().notNull(),
});

export const allGeometry = pgTable('all_geometry', {
	columnAll: geometry('column_all', { mode: 'xy', srid: 4326, type: 'point' }).default({ x: 30.5234, y: 50.4501 })
		.notNull(),
	columnAll1: geometry('column_all1', { mode: 'xy', type: 'point' }).default({ x: 30.5234, y: 50.4501 }).notNull(),
	columnAll2: geometry('column_all2', { mode: 'tuple', srid: 4326, type: 'point' }).default([30.5234, 50.4501])
		.notNull(),
	columnAll3: geometry('column_all3', { mode: 'tuple', type: 'point' }).default([30.5234, 50.4501]).notNull(),
	column: geometry('column').array(),
	columnPrimary: geometry('column_primary').primaryKey().notNull(),
});

export const allBit = pgTable('all_bit', {
	columnAll: bit('column_all', { dimensions: 1 }).default('1').notNull(),
	columnAll1: bit('column_all1', { dimensions: 2 }).default('11').notNull(),
	column: bit('column', { dimensions: 3 }).array(),
	columnPrimary: bit('column_primary', { dimensions: 5 }).primaryKey().notNull(),
});

export const allHalfvec = pgTable('all_halfvec', {
	columnAll: halfvec('column_all', { dimensions: 1 }).default([0, -2, 3]).notNull(),
	columnAll1: halfvec('column_all1', { dimensions: 2 }).default([0, -2, 3]).notNull(),
	column: halfvec('column', { dimensions: 3 }).array(),
	columnPrimary: halfvec('column_primary', { dimensions: 5 }).primaryKey().notNull(),
});

export const allVec = pgTable('all_vec', {
	columnAll: vector('column_all', { dimensions: 1 }).default([0, -2, 3]).notNull(),
	columnAll1: vector('column_all1', { dimensions: 2 }).default([0, -2, 3]).notNull(),
	columnAll2: vector('column_all2', { dimensions: 2 }).array().default([[0, -2, 3]]).notNull(),
	columnPrimary: vector('column_primary', { dimensions: 5 }).primaryKey().notNull(),
});

export const allSparcevec = pgTable('all_sparcevec', {
	columnAll: sparsevec('column_all', { dimensions: 1 }).default('{1:-1,3:2,5:3}/5').notNull(),
	columnAll1: sparsevec('column_all1', { dimensions: 2 }).default('{1:-1,3:2,5:3}/5').notNull(),
	columnAll3: sparsevec('column_all3', { dimensions: 2 }).array().default(['{1:-1,3:2,5:3}/5']).notNull(),
	columnPrimary: sparsevec('column_primary', { dimensions: 5 }).primaryKey().notNull(),
});
