import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
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
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema, jsonSchema } from '../src';
import { expectSchemaShape } from './utils.ts';

const customInt = customType<{ data: number }>({
	dataType() {
		return 'int';
	},
});

const testTable = mysqlTable('test', {
	bigint: bigint('bigint', { mode: 'bigint' }).notNull(),
	bigintNumber: bigint('bigintNumber', { mode: 'number' }).notNull(),
	binary: binary('binary').notNull(),
	binaryStr: binary('binaryStr').notNull(),
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
	varbinaryStr: varbinary('varbinaryStr', { length: 200 }).notNull(),
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
	binary: Buffer.from('binary'),
	binaryStr: 'binary',
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
	varbinary: Buffer.from('A'.repeat(200)),
	varbinaryStr: 'A'.repeat(200),
	varchar: 'A'.repeat(200),
	varcharEnum: 'a',
	year: 2021,
	autoIncrement: 1,
};

test('insert valid row', () => {
	const schema = createInsertSchema(testTable);

	expect(Value.Check(
		schema,
		testTableRow,
	)).toBeTruthy();
});

test('insert invalid varchar length', () => {
	const schema = createInsertSchema(testTable);

	expect(Value.Check(schema, {
		...testTableRow,
		varchar: 'A'.repeat(201),
	})).toBeFalsy();
});

test('insert smaller char length should work', () => {
	const schema = createInsertSchema(testTable);

	expect(Value.Check(schema, { ...testTableRow, char: 'abc' })).toBeTruthy();
});

test('insert larger char length should fail', () => {
	const schema = createInsertSchema(testTable);

	expect(Value.Check(schema, { ...testTableRow, char: 'abcde' })).toBeFalsy();
});

test('insert schema', (t) => {
	const actual = createInsertSchema(testTable);

	const expected = Type.Object({
		bigint: Type.BigInt(),
		bigintNumber: Type.Number(),
		binary: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		binaryStr: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		boolean: Type.Boolean(),
		char: Type.String({ minLength: 4, maxLength: 4 }),
		charEnum: Type.Union([Type.Literal('a'), Type.Literal('b'), Type.Literal('c')]),
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
		varbinary: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		varbinaryStr: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		varchar: Type.String({ maxLength: 200 }),
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
		binary: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		binaryStr: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
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
		//
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
		varbinaryStr: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		varbinary: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		varchar: Type.String({ maxLength: 200 }),
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
		bigint: (_) => Type.BigInt({ minimum: 0n }),
	});

	const expected = Type.Object({
		bigint: Type.BigInt({ minimum: 0n }),
		bigintNumber: Type.Number(),
		binary: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		binaryStr: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		boolean: Type.Boolean(),
		char: Type.String({ minLength: 5, maxLength: 5 }),
		charEnum: Type.Union([Type.Literal('a'), Type.Literal('b'), Type.Literal('c')]),
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
		varbinary: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		varbinaryStr: Type.Union([Type.String(), Type.Unsafe<Buffer>()]),
		varchar: Type.String({ maxLength: 200 }),
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
