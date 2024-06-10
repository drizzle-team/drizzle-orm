import test from 'ava';
import {
	bigint,
	binary,
	boolean,
	char,
	customType,
	date,
	datetime,
	decimal,
	double,
	float,
	int,
	json,
	longtext,
	mediumint,
	mediumtext,
	mysqlEnum,
	mysqlTable,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	tinytext,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import * as v from 'valibot';
import { createInsertSchema, createSelectSchema, jsonSchema } from '../src';
import { expectSchemaShape } from './utils';

const customInt = customType<{ data: number }>({
	dataType() {
		return 'int';
	},
});

const testTable = mysqlTable('test', {
	bigint: bigint('bigint', { mode: 'bigint' }).notNull(),
	bigintNumber: bigint('bigintNumber', { mode: 'number' }).notNull(),
	binary: binary('binary').notNull(),
	boolean: boolean('boolean').notNull(),
	char: char('char', { length: 4 }).notNull(),
	charEnum: char('char', { enum: ['a', 'b', 'c'] }).notNull(),
	customInt: customInt('customInt').notNull(),
	date: date('date').notNull(),
	dateString: date('dateString', { mode: 'string' }).notNull(),
	datetime: datetime('datetime').notNull(),
	datetimeString: datetime('datetimeString', { mode: 'string' }).notNull(),
	decimal: decimal('decimal').notNull(),
	double: double('double').notNull(),
	enum: mysqlEnum('enum', ['a', 'b', 'c']).notNull(),
	float: float('float').notNull(),
	int: int('int').notNull(),
	json: json('json').notNull(),
	mediumint: mediumint('mediumint').notNull(),
	real: real('real').notNull(),
	serial: serial('serial').notNull(),
	smallint: smallint('smallint').notNull(),
	text: text('text').notNull(),
	textEnum: text('textEnum', { enum: ['a', 'b', 'c'] }).notNull(),
	tinytext: tinytext('tinytext').notNull(),
	tinytextEnum: tinytext('tinytextEnum', { enum: ['a', 'b', 'c'] }).notNull(),
	mediumtext: mediumtext('mediumtext').notNull(),
	mediumtextEnum: mediumtext('mediumtextEnum', {
		enum: ['a', 'b', 'c'],
	}).notNull(),
	longtext: longtext('longtext').notNull(),
	longtextEnum: longtext('longtextEnum', { enum: ['a', 'b', 'c'] }).notNull(),
	time: time('time').notNull(),
	timestamp: timestamp('timestamp').notNull(),
	timestampString: timestamp('timestampString', { mode: 'string' }).notNull(),
	tinyint: tinyint('tinyint').notNull(),
	varbinary: varbinary('varbinary', { length: 200 }).notNull(),
	varchar: varchar('varchar', { length: 200 }).notNull(),
	varcharEnum: varchar('varcharEnum', {
		length: 1,
		enum: ['a', 'b', 'c'],
	}).notNull(),
	year: year('year').notNull(),
	autoIncrement: int('autoIncrement').notNull().autoincrement(),
});

const testTableRow = {
	bigint: BigInt(1),
	bigintNumber: 1,
	binary: 'binary',
	boolean: true,
	char: 'char',
	charEnum: 'a' as const,
	customInt: { data: 1 },
	date: new Date(),
	dateString: new Date().toISOString(),
	datetime: new Date(),
	datetimeString: new Date().toISOString(),
	decimal: '1.1',
	double: 1.1,
	enum: 'a' as const,
	float: 1.1,
	int: 1,
	json: { data: 1 },
	mediumint: 1,
	real: 1.1,
	serial: 1,
	smallint: 1,
	text: 'text',
	textEnum: 'a' as const,
	tinytext: 'tinytext',
	tinytextEnum: 'a' as const,
	mediumtext: 'mediumtext',
	mediumtextEnum: 'a' as const,
	longtext: 'longtext',
	longtextEnum: 'a' as const,
	time: '00:00:00',
	timestamp: new Date(),
	timestampString: new Date().toISOString(),
	tinyint: 1,
	varbinary: 'A'.repeat(200),
	varchar: 'A'.repeat(200),
	varcharEnum: 'a' as const,
	year: 2021,
	autoIncrement: 1,
};

test('insert valid row', (t) => {
	const schema = createInsertSchema(testTable);

	t.deepEqual(v.parse(schema, testTableRow), testTableRow);
});

test('insert invalid varchar length', (t) => {
	const schema = createInsertSchema(testTable);
	t.throws(
		() =>
			v.parse(schema, {
				...testTableRow,
				varchar: 'A'.repeat(201),
			}),
		undefined, /* schema.safeParse({ ...testTableRow, varchar: 'A'.repeat(201) }).success */
	);
});

test('insert smaller char length should work', (t) => {
	const schema = createInsertSchema(testTable);

	const input = { ...testTableRow, char: 'abc' };

	t.deepEqual(v.parse(schema, input), input);
});

test('insert larger char length should fail', (t) => {
	const schema = createInsertSchema(testTable);

	t.throws(
		() => v.parse(schema, { ...testTableRow, char: 'abcde' }),
		undefined,
	);
});

test('insert schema', (t) => {
	const actual = createInsertSchema(testTable);

	const expected = v.object({
		bigint: v.bigint(),
		bigintNumber: v.number(),
		binary: v.string(),
		boolean: v.boolean(),
		char: v.pipe(v.string(), v.maxLength(4)),
		charEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		customInt: v.any(),
		date: v.date(),
		dateString: v.string(),
		datetime: v.date(),
		datetimeString: v.string(),
		decimal: v.string(),
		double: v.number(),
		enum: v.picklist([
			'a',
			'b',
			'c',
		]),
		float: v.number(),
		int: v.number(),
		json: jsonSchema,
		mediumint: v.number(),
		real: v.number(),
		serial: v.optional(v.number()),
		smallint: v.number(),
		text: v.string(),
		textEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		tinytext: v.string(),
		tinytextEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		mediumtext: v.string(),
		mediumtextEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		longtext: v.string(),
		longtextEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		time: v.string(),
		timestamp: v.date(),
		timestampString: v.string(),
		tinyint: v.number(),
		varbinary: v.pipe(v.string(), v.maxLength(200)),
		varchar: v.pipe(v.string(), v.maxLength(200)),
		varcharEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		year: v.number(),
		autoIncrement: v.optional(v.number()),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('select schema', (t) => {
	const actual = createSelectSchema(testTable);

	const expected = v.object({
		bigint: v.bigint(),
		bigintNumber: v.number(),
		binary: v.string(),
		boolean: v.boolean(),
		char: v.pipe(v.string(), v.maxLength(4)),
		charEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		customInt: v.any(),
		date: v.date(),
		dateString: v.string(),
		datetime: v.date(),
		datetimeString: v.string(),
		decimal: v.string(),
		double: v.number(),
		enum: v.picklist([
			'a',
			'b',
			'c',
		]),
		float: v.number(),
		int: v.number(),
		//
		json: jsonSchema,
		mediumint: v.number(),
		real: v.number(),
		serial: v.number(),
		smallint: v.number(),
		text: v.string(),
		textEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		tinytext: v.string(),
		tinytextEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		mediumtext: v.string(),
		mediumtextEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		longtext: v.string(),
		longtextEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		time: v.string(),
		timestamp: v.date(),
		timestampString: v.string(),
		tinyint: v.number(),
		varbinary: v.pipe(v.string(), v.maxLength(200)),
		varchar: v.pipe(v.string(), v.maxLength(200)),
		varcharEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		year: v.number(),
		autoIncrement: v.number(),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('select schema w/ refine', (t) => {
	const actual = createSelectSchema(testTable, {
		bigint: (_) => v.pipe(v.bigint(), v.minValue(0n)),
	});

	const expected = v.object({
		bigint: v.pipe(v.bigint(), v.minValue(0n)),
		bigintNumber: v.number(),
		binary: v.string(),
		boolean: v.boolean(),
		char: v.pipe(v.string(), v.maxLength(5)),
		charEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		customInt: v.any(),
		date: v.date(),
		dateString: v.string(),
		datetime: v.date(),
		datetimeString: v.string(),
		decimal: v.string(),
		double: v.number(),
		enum: v.picklist([
			'a',
			'b',
			'c',
		]),
		float: v.number(),
		int: v.number(),
		json: jsonSchema,
		mediumint: v.number(),
		real: v.number(),
		serial: v.number(),
		smallint: v.number(),
		text: v.string(),
		textEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		tinytext: v.string(),
		tinytextEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		mediumtext: v.string(),
		mediumtextEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		longtext: v.string(),
		longtextEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		time: v.string(),
		timestamp: v.date(),
		timestampString: v.string(),
		tinyint: v.number(),
		varbinary: v.pipe(v.string(), v.maxLength(200)),
		varchar: v.pipe(v.string(), v.maxLength(200)),
		varcharEnum: v.picklist([
			'a',
			'b',
			'c',
		]),
		year: v.number(),
		autoIncrement: v.number(),
	});

	expectSchemaShape(t, expected).from(actual);
});
