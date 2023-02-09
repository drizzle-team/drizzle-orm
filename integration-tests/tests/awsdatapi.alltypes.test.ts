import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { fromIni } from '@aws-sdk/credential-providers';
import anyTest, { TestFn } from 'ava';
import * as dotenv from 'dotenv';
import { DefaultLogger, sql } from 'drizzle-orm';
import { AwsDataApiPgDatabase, drizzle } from 'drizzle-orm/aws-data-api/pg';
import {
	bigint,
	bigserial,
	boolean,
	date,
	decimal,
	doublePrecision,
	InferModel,
	integer,
	json,
	jsonb,
	numeric,
	pgTable,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	varchar,
} from 'drizzle-orm/pg-core';
dotenv.config();

export const allColumns = pgTable('all_columns', {
	sm: smallint('smallint'),
	smdef: smallint('smallint_def').default(10),
	int: integer('integer'),
	intdef: integer('integer_def').default(10),
	numeric: numeric('numeric'),
	numeric2: numeric('numeric2', { precision: 5 }),
	numeric3: numeric('numeric3', { scale: 2 }),
	numeric4: numeric('numeric4', { precision: 5, scale: 2 }),
	numericdef: numeric('numeridef').default('100'),
	bigint: bigint('bigint', { mode: 'number' }),
	bigintdef: bigint('bigintdef', { mode: 'number' }).default(100),
	bool: boolean('boolean'),
	booldef: boolean('boolean_def').default(true),
	text: text('text'),
	textdef: text('textdef').default('text'),
	varchar: varchar('varchar'),
	varchardef: varchar('varchardef').default('text'),
	serial: serial('serial'),
	bigserial: bigserial('bigserial', { mode: 'number' }),
	decimal: decimal('decimal', { precision: 100, scale: 2 }),
	decimaldef: decimal('decimaldef', { precision: 100, scale: 2 }).default('100.0'),
	doublePrecision: doublePrecision('doublePrecision'),
	doublePrecisiondef: doublePrecision('doublePrecisiondef').default(100.0),
	real: real('real'),
	realdef: real('realdef').default(100.0),
	json: json<{ attr: string }>('json'),
	jsondef: json<{ attr: string }>('jsondef').default({ attr: 'value' }),
	jsonb: jsonb<{ attr: string }>('jsonb'),
	jsonbdef: jsonb<{ attr: string }>('jsonbdef').default({ attr: 'value' }),
	time: time('time'),
	time2: time('time2', { precision: 6, withTimezone: true }),
	timedefnow: time('timedefnow').defaultNow(),
	timestamp: timestamp('timestamp'),
	timestamp2: timestamp('timestamp2', { precision: 6, withTimezone: true }),
	timestamp3: timestamp('timestamp3', { withTimezone: true }),
	timestamp4: timestamp('timestamp4', { precision: 4 }),
	timestampdef: timestamp('timestampdef').defaultNow(),
	date: date('date', { mode: 'date' }),
	datedef: date('datedef').defaultNow(),
});

interface Context {
	db: AwsDataApiPgDatabase;
	row: InferModel<typeof allColumns, 'select'>;
}

const test = anyTest as TestFn<Context>;

test.before(async (t) => {
	const ctx = t.context;
	const database = process.env['AWS_DATA_API_DB']!;
	const secretArn = process.env['AWS_DATA_API_SECRET_ARN']!;
	const resourceArn = process.env['AWS_DATA_API_RESOURCE_ARN']!;

	const rdsClient = new RDSDataClient({
		credentials: fromIni({ profile: process.env['AWS_TEST_PROFILE'] }),
		region: 'us-east-1',
	});

	ctx.db = drizzle(rdsClient, {
		database,
		secretArn,
		resourceArn,
		// logger: new DefaultLogger(),
	});

	await ctx.db.execute(sql`CREATE TABLE IF NOT EXISTS "all_columns" (
		"smallint" smallint,
		"smallint_def" smallint DEFAULT 10,
		"integer" integer,
		"integer_def" integer DEFAULT 10,
		"numeric" numeric,
		"numeric2" numeric(5),
		"numeric3" numeric,
		"numeric4" numeric(5, 2),
		"numeridef" numeric DEFAULT '100',
		"bigint" bigint,
		"bigintdef" bigint DEFAULT 100,
		"boolean" boolean,
		"boolean_def" boolean DEFAULT true,
		"text" text,
		"textdef" text DEFAULT 'text',
		"varchar" varchar,
		"varchardef" varchar DEFAULT 'text',
		"serial" serial,
		"bigserial" bigserial,
		"decimal" numeric(100, 2),
		"decimaldef" numeric(100, 2) DEFAULT '100.0',
		"doublePrecision" double precision,
		"doublePrecisiondef" double precision DEFAULT 100,
		"real" real,
		"realdef" real DEFAULT 100,
		"json" json,
		"jsondef" json DEFAULT '{"attr":"value"}'::json,
		"jsonb" jsonb,
		"jsonbdef" jsonb DEFAULT '{"attr":"value"}'::jsonb,
		"time" time,
		"time2" time,
		"timedefnow" time DEFAULT now(),
		"timestamp" timestamp,
		"timestamp2" timestamp (6) with time zone,
		"timestamp3" timestamp with time zone,
		"timestamp4" timestamp (4),
		"timestampdef" timestamp DEFAULT now(),
		"date" date,
		"datedef" date DEFAULT now()
	)`);

	const now = new Date();

	await ctx.db.insert(allColumns).values({
		sm: 12,
		int: 22,
		numeric: '1.1',
		numeric2: '123.45',
		numeric3: '123.45',
		numeric4: '123.45',
		bigint: 1578,
		bool: true,
		text: 'inserted_text',
		varchar: 'inserted_varchar',
		serial: 44,
		bigserial: 63473487,
		decimal: '100.1',
		doublePrecision: 7384.34,
		real: 73849.11,
		json: { attr: 'hellohello' },
		jsonb: { attr: 'hellohello' },
		time: '11:12:00',
		time2: '11:12:00',
		timestamp: now,
		timestamp2: now,
		timestamp3: now,
		timestamp4: now,
		date: now,
		// interval: '10 days'
	});

	const resultRows = await ctx.db.select().from(allColumns);
	t.is(resultRows.length, 1);

	const row = resultRows[0]!;
	ctx.row = row;
});

test.serial('[small] serial type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.sm === 'number');
	t.is(row.sm, 12);
});

test.serial('[small serial] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.sm === 'number');
	t.is(row.smdef, 10);
});

test.serial('[int] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.int === 'number');
	t.is(row.int, 22);
});

test.serial('[int] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.intdef === 'number');
	t.is(row.intdef, 10);
});

test.serial('[numeric] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.int === 'number');
	t.is(row.int, 22);
});

test.serial('[numeric(precision)] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.int === 'number');
	t.is(row.int, 22);
});

test.serial('[numeric(scale)] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.int === 'number');
	t.is(row.int, 22);
});

test.serial('[numeric(precision, scale)] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.int === 'number');
	t.is(row.int, 22);
});

test.serial('[numeric] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.int === 'number');
	t.is(row.int, 22);
});

test.serial('[bigint] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.bigint === 'number');
	t.is(row.bigint, 1578);
});

test.serial('[bigint] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.bigintdef === 'number');
	t.is(row.bigintdef, 100);
});

test.serial('[boolean] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.bool === 'boolean');
	t.is(row.bool, true);
});

test.serial('[boolean] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.booldef === 'boolean');
	t.is(row.booldef, true);
});

test.serial('[text] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.text === 'string');
	t.is(row.text, 'inserted_text');
});

test.serial('[text] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.textdef === 'string');
	t.is(row.textdef, 'text');
});

test.serial('[varchar] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.varchar === 'string');
	t.is(row.varchar, 'inserted_varchar');
});

test.serial('[varchar] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.varchardef === 'string');
	t.is(row.varchardef, 'text');
});

test.serial('[serial] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.serial === 'number');
	t.is(row.serial, 44);
});

test.serial('[bigserial] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.bigserial === 'number');
	t.is(row.bigserial, 63473487);
});

test.serial('[decimal] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.decimal === 'string');
	t.is(row.decimal, '100.10');
});

test.serial('[decimal] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.decimaldef === 'string');
	t.is(row.decimaldef, '100.00');
});

test.serial('[double precision] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.doublePrecision === 'number');
	t.is(row.doublePrecision, 7384.34);
});

test.serial('[double precision] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.doublePrecisiondef === 'number');
	t.is(row.doublePrecisiondef, 100.0);
});

test.serial('[real] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.real === 'number');
	t.is(row.real, 73849.11);
});

test.serial('[real] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.realdef === 'number');
	t.is(row.realdef, 100.0);
});

test.serial('[json] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.json?.attr === 'string');
	t.deepEqual(row.json, { attr: 'hellohello' });
});

test.serial('[json] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.jsondef?.attr === 'string');
	t.deepEqual(row.jsondef, { attr: 'value' });
});

test.serial('[jsonb] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.jsonb?.attr === 'string');
	t.deepEqual(row.jsonb, { attr: 'hellohello' });
});

test.serial('[jsonb] type with default', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.jsonbdef?.attr === 'string');
	t.deepEqual(row.jsonbdef, { attr: 'value' });
});

test.serial('[time] type', async (t) => {
	const { row } = t.context;

	t.assert(typeof row.time === 'string');
	t.assert(typeof row.time2 === 'string');
	t.assert(typeof row.timedefnow === 'string');
});

test.serial('[timestamp] type with default', async (t) => {
	const { row } = t.context;

	t.assert(row.timestamp instanceof Date);
	t.assert(row.timestamp2 instanceof Date);
	t.assert(row.timestamp3 instanceof Date);
	t.assert(row.timestamp4 instanceof Date);
	t.assert(row.timestampdef instanceof Date);
});

test.serial('[date] type with default', async (t) => {
	const { row } = t.context;

	t.assert(row.date instanceof Date);
	t.assert(typeof row.datedef === 'string');
});

test.after.always(async (t) => {
	const ctx = t.context;

	await ctx.db.execute(sql`drop table "all_columns"`);
});
