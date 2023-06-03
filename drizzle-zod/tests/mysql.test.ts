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
import { z } from 'zod';
import { createInsertSchema, createSelectSchema, jsonSchema } from '~/index';
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
	mediumtextEnum: mediumtext('mediumtextEnum', { enum: ['a', 'b', 'c'] }).notNull(),
	longtext: longtext('longtext').notNull(),
	longtextEnum: longtext('longtextEnum', { enum: ['a', 'b', 'c'] }).notNull(),
	time: time('time').notNull(),
	timestamp: timestamp('timestamp').notNull(),
	timestampString: timestamp('timestampString', { mode: 'string' }).notNull(),
	tinyint: tinyint('tinyint').notNull(),
	varbinary: varbinary('varbinary', { length: 200 }).notNull(),
	varchar: varchar('varchar', { length: 200 }).notNull(),
	varcharEnum: varchar('varcharEnum', { length: 1, enum: ['a', 'b', 'c'] }).notNull(),
	year: year('year').notNull(),
	autoIncrement: int('autoIncrement').notNull().autoincrement(),
});

const testTableRow = {
	bigint: BigInt(1),
	bigintNumber: 1,
	binary: 'binary',
	boolean: true,
	char: 'char',
	charEnum: 'a',
	customInt: { data: 1 },
	date: new Date(),
	dateString: new Date().toISOString(),
	datetime: new Date(),
	datetimeString: new Date().toISOString(),
	decimal: '1.1',
	double: 1.1,
	enum: 'a',
	float: 1.1,
	int: 1,
	json: { data: 1 },
	mediumint: 1,
	real: 1.1,
	serial: 1,
	smallint: 1,
	text: 'text',
	textEnum: 'a',
	tinytext: 'tinytext',
	tinytextEnum: 'a',
	mediumtext: 'mediumtext',
	mediumtextEnum: 'a',
	longtext: 'longtext',
	longtextEnum: 'a',
	time: '00:00:00',
	timestamp: new Date(),
	timestampString: new Date().toISOString(),
	tinyint: 1,
	varbinary: 'A'.repeat(200),
	varchar: 'A'.repeat(200),
	varcharEnum: 'a',
	year: 2021,
	autoIncrement: 1,
};

test('insert valid row', (t) => {
	const schema = createInsertSchema(testTable);

	t.is(schema.safeParse(testTableRow).success, true);
});

test('insert invalid varchar length', (t) => {
	const schema = createInsertSchema(testTable);

	t.is(schema.safeParse({ ...testTableRow, varchar: 'A'.repeat(201) }).success, false);
});

test('insert invalid char length', (t) => {
	const schema = createInsertSchema(testTable);

	t.is(schema.safeParse({ ...testTableRow, char: 'abc' }).success, false);
});

test('insert schema', (t) => {
	const actual = createInsertSchema(testTable);

	const expected = z.object({
		bigint: z.bigint(),
		bigintNumber: z.number(),
		binary: z.string(),
		boolean: z.boolean(),
		char: z.string().length(4),
		charEnum: z.enum(['a', 'b', 'c']),
		customInt: z.any(),
		date: z.date(),
		dateString: z.string(),
		datetime: z.date(),
		datetimeString: z.string(),
		decimal: z.string(),
		double: z.number(),
		enum: z.enum(['a', 'b', 'c']),
		float: z.number(),
		int: z.number(),
		json: jsonSchema,
		mediumint: z.number(),
		real: z.number(),
		serial: z.number().optional(),
		smallint: z.number(),
		text: z.string(),
		textEnum: z.enum(['a', 'b', 'c']),
		tinytext: z.string(),
		tinytextEnum: z.enum(['a', 'b', 'c']),
		mediumtext: z.string(),
		mediumtextEnum: z.enum(['a', 'b', 'c']),
		longtext: z.string(),
		longtextEnum: z.enum(['a', 'b', 'c']),
		time: z.string(),
		timestamp: z.date(),
		timestampString: z.string(),
		tinyint: z.number(),
		varbinary: z.string().max(200),
		varchar: z.string().max(200),
		varcharEnum: z.enum(['a', 'b', 'c']),
		year: z.number(),
		autoIncrement: z.number().optional(),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('select schema', (t) => {
	const actual = createSelectSchema(testTable);

	const expected = z.object({
		bigint: z.bigint(),
		bigintNumber: z.number(),
		binary: z.string(),
		boolean: z.boolean(),
		char: z.string().length(4),
		charEnum: z.enum(['a', 'b', 'c']),
		customInt: z.any(),
		date: z.date(),
		dateString: z.string(),
		datetime: z.date(),
		datetimeString: z.string(),
		decimal: z.string(),
		double: z.number(),
		enum: z.enum(['a', 'b', 'c']),
		float: z.number(),
		int: z.number(),
		json: jsonSchema,
		mediumint: z.number(),
		real: z.number(),
		serial: z.number(),
		smallint: z.number(),
		text: z.string(),
		textEnum: z.enum(['a', 'b', 'c']),
		tinytext: z.string(),
		tinytextEnum: z.enum(['a', 'b', 'c']),
		mediumtext: z.string(),
		mediumtextEnum: z.enum(['a', 'b', 'c']),
		longtext: z.string(),
		longtextEnum: z.enum(['a', 'b', 'c']),
		time: z.string(),
		timestamp: z.date(),
		timestampString: z.string(),
		tinyint: z.number(),
		varbinary: z.string().max(200),
		varchar: z.string().max(200),
		varcharEnum: z.enum(['a', 'b', 'c']),
		year: z.number(),
		autoIncrement: z.number(),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('select schema w/ refine', (t) => {
	const actual = createSelectSchema(testTable, {
		bigint: (schema) => schema.bigint.positive(),
	});

	const expected = z.object({
		bigint: z.bigint().positive(),
		bigintNumber: z.number(),
		binary: z.string(),
		boolean: z.boolean(),
		char: z.string().length(5),
		charEnum: z.enum(['a', 'b', 'c']),
		customInt: z.any(),
		date: z.date(),
		dateString: z.string(),
		datetime: z.date(),
		datetimeString: z.string(),
		decimal: z.string(),
		double: z.number(),
		enum: z.enum(['a', 'b', 'c']),
		float: z.number(),
		int: z.number(),
		json: jsonSchema,
		mediumint: z.number(),
		real: z.number(),
		serial: z.number(),
		smallint: z.number(),
		text: z.string(),
		textEnum: z.enum(['a', 'b', 'c']),
		tinytext: z.string(),
		tinytextEnum: z.enum(['a', 'b', 'c']),
		mediumtext: z.string(),
		mediumtextEnum: z.enum(['a', 'b', 'c']),
		longtext: z.string(),
		longtextEnum: z.enum(['a', 'b', 'c']),
		time: z.string(),
		timestamp: z.date(),
		timestampString: z.string(),
		tinyint: z.number(),
		varbinary: z.string().max(200),
		varchar: z.string().max(200),
		varcharEnum: z.enum(['a', 'b', 'c']),
		year: z.number(),
		autoIncrement: z.number(),
	});

	expectSchemaShape(t, expected).from(actual);
});
