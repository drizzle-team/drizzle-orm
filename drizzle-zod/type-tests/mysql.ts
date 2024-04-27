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
import type { output } from 'zod';
import { createInsertSchema, createSelectSchema } from '../src';
import { type Equal, Expect } from './utils';

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
	// JSON's are ommitted from these tests - their schema type is impossible to compare using current type comparison utils
	// json: json('json').notNull(),
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

const insertSchema = createInsertSchema(testTable);
const selectSchema = createSelectSchema(testTable);

type InsertType = output<typeof insertSchema>;
type SelectType = output<typeof selectSchema>;

Expect<
	Equal<InsertType, {
		bigint: bigint;
		boolean: boolean;
		dateString: string;
		date: Date;
		bigintNumber: number;
		binary: string;
		char: string;
		charEnum: 'a' | 'b' | 'c';
		int: number;
		datetime: Date;
		datetimeString: string;
		decimal: string;
		double: number;
		enum: 'a' | 'b' | 'c';
		float: number;
		mediumint: number;
		real: number;
		smallint: number;
		text: string;
		tinytext: string;
		mediumtext: string;
		longtext: string;
		textEnum: 'a' | 'b' | 'c';
		tinytextEnum: 'a' | 'b' | 'c';
		mediumtextEnum: 'a' | 'b' | 'c';
		longtextEnum: 'a' | 'b' | 'c';
		time: string;
		timestamp: Date;
		timestampString: string;
		tinyint: number;
		varbinary: string;
		varchar: string;
		varcharEnum: 'a' | 'b' | 'c';
		year: number;
		customInt?: any;
		serial?: number;
		autoIncrement?: number;
	}>
>;

Expect<
	Equal<SelectType, {
		bigint: bigint;
		boolean: boolean;
		varcharEnum: 'a' | 'b' | 'c';
		year: number;
		date: Date;
		bigintNumber: number;
		binary: string;
		char: string;
		charEnum: 'a' | 'b' | 'c';
		int: number;
		dateString: string;
		datetime: Date;
		datetimeString: string;
		decimal: string;
		double: number;
		enum: 'a' | 'b' | 'c';
		float: number;
		mediumint: number;
		real: number;
		serial: number;
		smallint: number;
		text: string;
		tinytext: string;
		mediumtext: string;
		longtext: string;
		textEnum: 'a' | 'b' | 'c';
		tinytextEnum: 'a' | 'b' | 'c';
		mediumtextEnum: 'a' | 'b' | 'c';
		longtextEnum: 'a' | 'b' | 'c';
		time: string;
		timestamp: Date;
		timestampString: string;
		tinyint: number;
		varbinary: string;
		varchar: string;
		autoIncrement: number;
		customInt?: any;
	}>
>;
