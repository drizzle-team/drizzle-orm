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
import { createInsertSchema, createSelectSchema, jsonSchema } from '~/index';
import { expectSchemaShape } from './utils';
import { Value } from '@sinclair/typebox/value';
import { Type } from '@sinclair/typebox';

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

	t.is(
	// @ts-ignore
		Value.Check(
			schema,
			testTableRow
		) ,
		true
	);
});

test('insert invalid varchar length', (t) => {
	const schema = createInsertSchema(testTable);

	t.is(
		Value.Check(schema, {
			...testTableRow,
			varchar: 'A'.repeat(201),
		}) /* schema.safeParse({ ...testTableRow, varchar: 'A'.repeat(201) }).success */,
		false
	);
});

test('insert smaller char length should work', (t) => {
	const schema = createInsertSchema(testTable);

	t.is(Value.Check(schema, { ...testTableRow, char: 'abc' }), true);
});

test('insert larger char length should fail', (t) => {
	const schema = createInsertSchema(testTable);

	t.is(Value.Check(schema, { ...testTableRow, char: 'abcde' }), false);
});

test('insert schema', (t) => {
	const actual = createInsertSchema(testTable);

	// @ts-ignore
	const expected = Type.Object({
		bigint: Type.BigInt(),
		bigintNumber: Type.Number(),
		binary: Type.String(),
		boolean: Type.Boolean(),
		char: Type.String({ minLength: 4, maxLength: 4 }),
		charEnum: Type.Union(([Type.Literal('a'), Type.Literal('b'), Type.Literal('c')])),
		customInt: Type.Any(),
		date: Type.Date(),
		dateString: Type.String(),
		datetime: Type.Date(),
		datetimeString: Type.String(),
		decimal: Type.String(),
		double: Type.Number(),
		enum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		float: Type.Number(),
		int: Type.Number(),
		json: jsonSchema,
		mediumint: Type.Number(),
		real: Type.Number(),
		serial: Type.Optional(Type.Number()),
		smallint: Type.Number(),
		text: Type.String(),
		textEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		tinytext: Type.String(),
		tinytextEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		mediumtext: Type.String(),
		mediumtextEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		longtext: Type.String(),
		longtextEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		time: Type.String(),
		timestamp: Type.Date(),
		timestampString: Type.String(),
		tinyint: Type.Number(),
		varbinary: Type.String({maxLength: 200}),
		varchar: Type.String({maxLength: 200}),
		varcharEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		year: Type.Number(),
		autoIncrement: Type.Optional(Type.Number()),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('select schema', (t) => {
	const actual = createSelectSchema(testTable);

	const expected = Type.Object({
		bigint: Type.BigInt(),
		bigintNumber: Type.Number(),
		binary: Type.String(),
		boolean: Type.Boolean(),
		char: Type.String({ minLength: 4, maxLength: 4 }),
		charEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		customInt: Type.Any(),
		date: Type.Date(),
		dateString: Type.String(),
		datetime: Type.Date(),
		datetimeString: Type.String(),
		decimal: Type.String(),
		double: Type.Number(),
		enum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		float: Type.Number(),
		int: Type.Number(),
		// @ts-ignore
		json: jsonSchema,
		mediumint: Type.Number(),
		real: Type.Number(),
		serial: Type.Number(),
		smallint: Type.Number(),
		text: Type.String(),
		textEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		tinytext: Type.String(),
		tinytextEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		mediumtext: Type.String(),
		mediumtextEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		longtext: Type.String(),
		longtextEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		time: Type.String(),
		timestamp: Type.Date(),
		timestampString: Type.String(),
		tinyint: Type.Number(),
		varbinary: Type.String({maxLength: 200}),
		varchar: Type.String({maxLength: 200}),
		varcharEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		year: Type.Number(),
		autoIncrement: Type.Number(),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('select schema w/ refine', (t) => {
	const actual = createSelectSchema(testTable, {
		bigint: (schema) => Type.BigInt({minimum: 0n}),
	});

	const expected = Type.Object({
		bigint: Type.BigInt({minimum: 0n}),
		bigintNumber: Type.Number(),
		binary: Type.String(),
		boolean: Type.Boolean(),
		char: Type.String({ minLength: 5, maxLength: 5 }),
		charEnum: Type.Union(([Type.Literal('a'), Type.Literal('b'), Type.Literal('c')])),
		customInt: Type.Any(),
		date: Type.Date(),
		dateString: Type.String(),
		datetime: Type.Date(),
		datetimeString: Type.String(),
		decimal: Type.String(),
		double: Type.Number(),
		enum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		float: Type.Number(),
		int: Type.Number(),
		json: jsonSchema,
		mediumint: Type.Number(),
		real: Type.Number(),
		serial: Type.Number(),
		smallint: Type.Number(),
		text: Type.String(),
		textEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		tinytext: Type.String(),
		tinytextEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		mediumtext: Type.String(),
		mediumtextEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		longtext: Type.String(),
		longtextEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		time: Type.String(),
		timestamp: Type.Date(),
		timestampString: Type.String(),
		tinyint: Type.Number(),
		varbinary: Type.String({maxLength: 200}),
		varchar: Type.String({maxLength: 200}),
		varcharEnum: Type.Union([
			Type.Literal('a'),
			Type.Literal('b'),
			Type.Literal('c'),
		]),
		year: Type.Number(),
		autoIncrement: Type.Number(),
	});

	expectSchemaShape(t, expected).from(actual);
});
