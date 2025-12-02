import { sql } from 'drizzle-orm';
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
	nchar,
	ntext,
	numeric,
	nvarchar,
	real,
	smallint,
	text,
	time,
	tinyint,
	varbinary,
	varchar,
} from 'drizzle-orm/mssql-core';
import { DB } from 'src/utils';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { diffDefault, prepareTestDatabase, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

test('int', async () => {
	const res1 = await diffDefault(_, int().default(10), '((10))');
	const res2 = await diffDefault(_, int().default(0), '((0))');
	const res3 = await diffDefault(_, int().default(-10), '((-10))');
	const res4 = await diffDefault(_, int().default(1e4), '((10000))');
	const res5 = await diffDefault(_, int().default(-1e4), '((-10000))');

	const res6 = await diffDefault(_, int().default(sql`10`), '(10)');
	const res7 = await diffDefault(_, int().default(sql`((10))`), '((10))');
	const res8 = await diffDefault(_, int().default(sql`'10'`), "('10')");
	const res9 = await diffDefault(_, int().default(sql`('10')`), "('10')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
});

test('smallint', async () => {
	// 2^15 - 1
	const res1 = await diffDefault(_, smallint().default(32767), '((32767))');
	// -2^15
	const res2 = await diffDefault(_, smallint().default(-32768), '((-32768))');

	const res3 = await diffDefault(_, smallint().default(sql`10`), '(10)');
	const res4 = await diffDefault(_, smallint().default(sql`(10)`), '(10)');
	const res5 = await diffDefault(_, smallint().default(sql`'10'`), "('10')");
	const res6 = await diffDefault(_, smallint().default(sql`('10')`), "('10')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('tinyint', async () => {
	const res1 = await diffDefault(_, tinyint().default(123), '((123))');
	const res2 = await diffDefault(_, tinyint().default(0), '((0))');
	const res3 = await diffDefault(_, tinyint().default(1), '((1))');
	const res4 = await diffDefault(_, tinyint().default(sql`10`), '(10)');
	const res5 = await diffDefault(_, tinyint().default(sql`(10)`), '(10)');
	const res6 = await diffDefault(_, tinyint().default(sql`'10'`), "('10')");
	const res7 = await diffDefault(_, tinyint().default(sql`('10')`), "('10')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
});

test('bigint', async () => {
	const res0 = await diffDefault(_, bigint({ mode: 'number' }).default(2147483647), '((2147483647))');
	// 2^53
	const res1 = await diffDefault(_, bigint({ mode: 'number' }).default(9007199254740991), '((9007199254740991))');
	const res2 = await diffDefault(_, bigint({ mode: 'number' }).default(-9007199254740991), '((-9007199254740991))');
	// 2^63 - 1;
	const res3 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).default(9223372036854775807n),
		'((9223372036854775807))',
	);
	// -2^63
	const res4 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).default(-9223372036854775808n),
		'((-9223372036854775808))',
	);

	const res5 = await diffDefault(_, bigint({ mode: 'number' }).default(sql`9007199254740991`), '(9007199254740991)');
	const res6 = await diffDefault(_, bigint({ mode: 'number' }).default(sql`-9007199254740991`), '(-9007199254740991)');

	const res9 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).default(sql`-9223372036854775808`),
		'(-9223372036854775808)',
	);

	expect.soft(res0).toStrictEqual([]);
	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
});

test('numeric', async () => {
	const res1 = await diffDefault(_, numeric().default('10.123'), '((10.123))');

	const res2 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		'((9223372036854775807))',
	);
	const res3 = await diffDefault(_, numeric({ mode: 'number' }).default(9007199254740991), '((9007199254740991))');
	const res4 = await diffDefault(_, numeric({ mode: 'string' }).default('10.123'), '((10.123))');

	const res5 = await diffDefault(_, numeric({ precision: 6 }).default('10.123'), '((10.123))');
	const res6 = await diffDefault(_, numeric({ precision: 6, scale: 2 }).default('10.123'), '((10.123))');
	const res7 = await diffDefault(_, numeric({ precision: 6, scale: 3 }).default('10.12'), '((10.12))');

	const res8 = await diffDefault(_, numeric({ mode: 'string', scale: 2 }).default('10.123'), '((10.123))');
	const res9 = await diffDefault(_, numeric({ mode: 'string', precision: 6 }).default('10.123'), '((10.123))');
	const res10 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 6, scale: 2 }).default('10.123'),
		'((10.123))',
	);
	const res11 = await diffDefault(_, numeric({ mode: 'string', precision: 6, scale: 3 }).default('10.12'), '((10.12))');

	const res12 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		'((9223372036854775807))',
	);
	const res13 = await diffDefault(_, numeric({ mode: 'number', precision: 6, scale: 2 }).default(10.123), '((10.123))');
	const res14 = await diffDefault(_, numeric({ mode: 'number', scale: 2 }).default(10.123), '((10.123))');
	const res15 = await diffDefault(_, numeric({ mode: 'number', precision: 6 }).default(10.123), '((10.123))');

	const res16 = await diffDefault(_, numeric().default(sql`10.123`), '(10.123)');
	const res17 = await diffDefault(_, numeric().default(sql`(10.123)`), '(10.123)');
	const res18 = await diffDefault(_, numeric().default(sql`'10.123'`), "('10.123')");
	const res19 = await diffDefault(_, numeric().default(sql`('10.123')`), "('10.123')");
	const res20 = await diffDefault(_, numeric().default(sql`('9007199254740991')`), "('9007199254740991')");
	const res21 = await diffDefault(_, numeric().default(sql`9007199254740991`), '(9007199254740991)');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res17).toStrictEqual([]);
	expect.soft(res18).toStrictEqual([]);
	expect.soft(res19).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res21).toStrictEqual([]);
});

test('decimal', async () => {
	const res1 = await diffDefault(_, decimal().default('10.123'), '((10.123))');

	const res2 = await diffDefault(
		_,
		decimal({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		'((9223372036854775807))',
	);
	const res3 = await diffDefault(_, decimal({ mode: 'number' }).default(9007199254740991), '((9007199254740991))');
	const res4 = await diffDefault(_, decimal({ mode: 'string' }).default('10.123'), '((10.123))');

	const res5 = await diffDefault(_, decimal({ precision: 6 }).default('10.123'), '((10.123))');
	const res6 = await diffDefault(_, decimal({ precision: 6, scale: 2 }).default('10.123'), '((10.123))');
	const res7 = await diffDefault(_, decimal({ precision: 6, scale: 3 }).default('10.12'), '((10.12))');

	const res8 = await diffDefault(_, decimal({ mode: 'string', scale: 2 }).default('10.123'), '((10.123))');
	const res9 = await diffDefault(_, decimal({ mode: 'string', precision: 6 }).default('10.123'), '((10.123))');
	const res10 = await diffDefault(
		_,
		decimal({ mode: 'string', precision: 6, scale: 2 }).default('10.123'),
		'((10.123))',
	);
	const res11 = await diffDefault(_, decimal({ mode: 'string', precision: 6, scale: 3 }).default('10.12'), '((10.12))');

	const res12 = await diffDefault(
		_,
		decimal({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		'((9223372036854775807))',
	);
	const res13 = await diffDefault(_, decimal({ mode: 'number', precision: 6, scale: 2 }).default(10.123), '((10.123))');
	const res14 = await diffDefault(_, decimal({ mode: 'number', scale: 2 }).default(10.123), '((10.123))');
	const res15 = await diffDefault(_, decimal({ mode: 'number', precision: 6 }).default(10.123), '((10.123))');

	const res16 = await diffDefault(_, decimal().default(sql`10.123`), '(10.123)');
	const res17 = await diffDefault(_, decimal().default(sql`(10.123)`), '(10.123)');
	const res18 = await diffDefault(_, decimal().default(sql`'10.123'`), "('10.123')");
	const res19 = await diffDefault(_, decimal().default(sql`('10.123')`), "('10.123')");
	const res20 = await diffDefault(_, decimal().default(sql`('9007199254740991')`), "('9007199254740991')");
	const res21 = await diffDefault(_, decimal().default(sql`9007199254740991`), '(9007199254740991)');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res17).toStrictEqual([]);
	expect.soft(res18).toStrictEqual([]);
	expect.soft(res19).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res21).toStrictEqual([]);
});

test('real', async () => {
	const res1 = await diffDefault(_, real().default(1000.123), '((1000.123))');
	const res2 = await diffDefault(_, real().default(1000), '((1000))');
	const res3 = await diffDefault(_, real().default(2147483647), '((2147483647))');
	const res4 = await diffDefault(_, real().default(2147483648), '((2147483648))');
	const res5 = await diffDefault(_, real().default(-2147483648), '((-2147483648))');
	const res6 = await diffDefault(_, real().default(-2147483649), '((-2147483649))');
	const res7 = await diffDefault(_, real().default(sql`10`), '(10)');
	const res8 = await diffDefault(_, real().default(sql`(10)`), '(10)');
	const res9 = await diffDefault(_, real().default(sql`'10'`), "('10')");
	const res10 = await diffDefault(_, real().default(sql`('10')`), "('10')");

	const res11 = await diffDefault(_, real().default(sql`'10.123'`), "('10.123')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
});

test('float', async () => {
	const res1 = await diffDefault(_, float().default(10000.123), '((10000.123))');
	const res1_0 = await diffDefault(_, float().default(10000), '((10000))');
	const res1_1 = await diffDefault(_, float().default(2147483647), '((2147483647))');
	const res1_2 = await diffDefault(_, float().default(2147483648), '((2147483648))');
	const res1_3 = await diffDefault(_, float().default(-2147483648), '((-2147483648))');
	const res1_4 = await diffDefault(_, float().default(-2147483649), '((-2147483649))');

	const res2 = await diffDefault(_, float({ precision: 45 }).default(10000.123), '((10000.123))');
	const res2_0 = await diffDefault(_, float({ precision: 45 }).default(10000), '((10000))');
	const res2_1 = await diffDefault(_, float({ precision: 45 }).default(2147483647), '((2147483647))');
	const res2_2 = await diffDefault(_, float({ precision: 45 }).default(2147483648), '((2147483648))');
	const res2_3 = await diffDefault(_, float({ precision: 45 }).default(-2147483648), '((-2147483648))');
	const res2_4 = await diffDefault(_, float({ precision: 45 }).default(-2147483649), '((-2147483649))');

	const res3 = await diffDefault(_, float({ precision: 10 }).default(10000.123), '((10000.123))');
	const res3_0 = await diffDefault(_, float({ precision: 10 }).default(10000), '((10000))');
	const res3_1 = await diffDefault(_, float({ precision: 10 }).default(2147483647), '((2147483647))');
	const res3_2 = await diffDefault(_, float({ precision: 10 }).default(2147483648), '((2147483648))');
	const res3_3 = await diffDefault(_, float({ precision: 10 }).default(-2147483648), '((-2147483648))');
	const res3_4 = await diffDefault(_, float({ precision: 10 }).default(-2147483649), '((-2147483649))');

	const res4 = await diffDefault(_, float({ precision: 10 }).default(sql`(10000.123)`), '(10000.123)');
	const res4_0 = await diffDefault(_, float({ precision: 10 }).default(sql`(2147483648)`), '(2147483648)');
	const res4_1 = await diffDefault(_, float({ precision: 10 }).default(sql`-2147483649`), '(-2147483649)');

	const res5 = await diffDefault(_, float({ precision: 45 }).default(sql`'10000.123'`), "('10000.123')");
	const res5_0 = await diffDefault(_, float({ precision: 45 }).default(sql`(2147483648)`), '(2147483648)');
	const res5_1 = await diffDefault(_, float({ precision: 45 }).default(sql`-2147483649`), '(-2147483649)');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_0).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res1_2).toStrictEqual([]);
	expect.soft(res1_3).toStrictEqual([]);
	expect.soft(res1_4).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res2_0).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res2_2).toStrictEqual([]);
	expect.soft(res2_3).toStrictEqual([]);
	expect.soft(res2_4).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res3_0).toStrictEqual([]);
	expect.soft(res3_1).toStrictEqual([]);
	expect.soft(res3_2).toStrictEqual([]);
	expect.soft(res3_3).toStrictEqual([]);
	expect.soft(res3_4).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res4_0).toStrictEqual([]);
	expect.soft(res4_1).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res5_0).toStrictEqual([]);
	expect.soft(res5_1).toStrictEqual([]);
});

test('bit', async () => {
	const res1 = await diffDefault(_, bit().default(true), '((1))');
	const res2 = await diffDefault(_, bit().default(false), '((0))');
	const res3 = await diffDefault(_, bit().default(sql`1`), '(1)');
	const res4 = await diffDefault(_, bit().default(sql`1.`), '(1.)');
	const res5 = await diffDefault(_, bit().default(sql`'1'`), "('1')");

	const res6 = await diffDefault(_, bit().default(sql`'2'`), "('2')");
	const res7 = await diffDefault(_, bit().default(sql`2`), '(2)');

	const res8 = await diffDefault(_, bit().default(sql`TRY_CAST('true' AS [bit])`), "(TRY_CAST('true' AS [bit]))");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
});

test('char', async () => {
	const res1 = await diffDefault(_, char({ length: 256 }).default('text'), `('text')`);
	const res2 = await diffDefault(_, char({ length: 256 }).default("text'text"), `('text''text')`);
	const res3 = await diffDefault(_, char({ length: 256 }).default('text\'text"'), "('text''text\"')");
	const res4 = await diffDefault(_, char({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "('one')");
	const res5 = await diffDefault(
		_,
		char({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`('mo''''\",\`}{od')`,
	);

	const res6 = await diffDefault(_, char({ length: 10 }).default(sql`'text'`), `('text')`);
	const res7 = await diffDefault(_, char({ length: 10 }).default(sql`('text')`), `('text')`);

	const res8 = await diffDefault(_, char({ length: 10 }).default(''), `('')`);
	const res9 = await diffDefault(_, char({ length: 10 }).default('""'), `('""')`);
	const res10 = await diffDefault(_, char({ length: 10 }).default(sql`''`), `('')`);

	const res11 = await diffDefault(_, char({ length: 10 }).default(sql`'text'+'text'`), `('text'+'text')`);

	const res12 = await diffDefault(_, char({ length: 10 }).default("'"), `('''')`);
	const res13 = await diffDefault(_, char({ length: 10 }).default('"'), `('"')`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
});

test('varchar', async () => {
	const res0 = await diffDefault(_, varchar({ length: 100 }).default('text'), `('text')`);
	const res01 = await diffDefault(_, varchar({ length: 'max' }).default('text'), `('text')`);
	const res1 = await diffDefault(_, varchar({ length: 256 }).default('text'), `('text')`);
	const res2 = await diffDefault(_, varchar({ length: 256 }).default("text'text"), `('text''text')`);
	const res3 = await diffDefault(_, varchar({ length: 256 }).default('text\'text"'), "('text''text\"')");
	const res4 = await diffDefault(_, varchar({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "('one')");
	const res5 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`('mo''''",\`}{od')`,
	);

	const res6 = await diffDefault(_, varchar({ length: 10 }).default(sql`'text'`), `('text')`);
	const res7 = await diffDefault(_, varchar({ length: 10 }).default(sql`('text')`), `('text')`);

	const res8 = await diffDefault(_, varchar({ length: 10 }).default(''), `('')`);
	const res9 = await diffDefault(_, varchar({ length: 10 }).default(sql`''`), `('')`);

	const res10 = await diffDefault(_, varchar({ length: 10 }).default(sql`'text'+'text'`), `('text'+'text')`);

	const res11 = await diffDefault(_, varchar({ length: 10 }).default("'"), `('''')`);
	const res12 = await diffDefault(_, varchar({ length: 10 }).default('"'), `('"')`);

	expect.soft(res0).toStrictEqual([]);
	expect.soft(res01).toStrictEqual([]);
	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
});

test('text', async () => {
	const res1 = await diffDefault(_, text().default('text'), `('text')`);
	const res2 = await diffDefault(_, text().default("text'text"), `('text''text')`);
	const res3 = await diffDefault(_, text().default('text\'text"'), "('text''text\"')");
	const res4 = await diffDefault(_, text({ enum: ['one', 'two', 'three'] }).default('one'), "('one')");
	const res5 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(`mo''",\`}{od`),
		`('mo''''",\`}{od')`,
	);

	const res6 = await diffDefault(_, text().default(sql`'text'`), `('text')`);
	const res7 = await diffDefault(_, text().default(sql`('text')`), `('text')`);

	const res8 = await diffDefault(_, text().default(''), `('')`);
	const res9 = await diffDefault(_, text().default(sql`''`), `('')`);

	const res10 = await diffDefault(_, text().default(sql`'text'+'text'`), `('text'+'text')`);

	const res11 = await diffDefault(_, text().default("'"), `('''')`);
	const res12 = await diffDefault(_, text().default('"'), `('"')`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
});

test('nchar ', async () => {
	const res0 = await diffDefault(_, nchar({ length: 10 }).default('text'), `('text')`);
	const res1 = await diffDefault(_, nchar({ length: 256 }).default('text'), `('text')`);
	const res2 = await diffDefault(_, nchar({ length: 256 }).default("text'text"), `('text''text')`);
	const res3 = await diffDefault(_, nchar({ length: 256 }).default('text\'text"'), "('text''text\"')");
	const res4 = await diffDefault(_, nchar({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "('one')");
	const res5 = await diffDefault(
		_,
		nchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`('mo''''\",\`}{od')`,
	);

	const res6 = await diffDefault(_, nchar({ length: 10 }).default(sql`'text'`), `('text')`);
	const res7 = await diffDefault(_, nchar({ length: 10 }).default(sql`('text')`), `('text')`);

	const res8 = await diffDefault(_, nchar({ length: 10 }).default(''), `('')`);
	const res9 = await diffDefault(_, nchar({ length: 10 }).default(sql`''`), `('')`);

	const res10 = await diffDefault(_, nchar({ length: 10 }).default(sql`'text'+'text'`), `('text'+'text')`);

	const res11 = await diffDefault(_, nchar({ length: 10 }).default("'"), `('''')`);
	const res12 = await diffDefault(_, nchar({ length: 10 }).default('"'), `('"')`);

	expect.soft(res0).toStrictEqual([]);
	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
});

test('nvarchar', async () => {
	const res0 = await diffDefault(_, nvarchar({ length: 10 }).default('text'), `('text')`);
	const res1 = await diffDefault(_, nvarchar({ length: 256 }).default('text'), `('text')`);
	const res2 = await diffDefault(_, nvarchar({ length: 256 }).default("text'text"), `('text''text')`);
	const res3 = await diffDefault(_, nvarchar({ length: 256 }).default('text\'text"'), "('text''text\"')");
	const res4 = await diffDefault(_, nvarchar({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "('one')");
	const res5 = await diffDefault(
		_,
		nvarchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`('mo''''",\`}{od')`,
	);

	const res6 = await diffDefault(_, nvarchar({ length: 10 }).default(sql`'text'`), `('text')`);
	const res7 = await diffDefault(_, nvarchar({ length: 10 }).default(sql`('text')`), `('text')`);

	const res8 = await diffDefault(_, nvarchar({ length: 10 }).default(''), `('')`);
	const res9 = await diffDefault(_, nvarchar({ length: 10 }).default(sql`''`), `('')`);

	const res10 = await diffDefault(_, nvarchar({ length: 10 }).default(sql`'text'+'text'`), `('text'+'text')`);

	const res11 = await diffDefault(
		_,
		nvarchar({ mode: 'json', length: 'max' }).default({ key: 'value' }),
		`('{"key":"value"}')`,
	);
	const res12 = await diffDefault(
		_,
		nvarchar({ mode: 'json', length: 'max' }).default({ key: 9223372036854775807n }),
		`('{"key":9223372036854775807}')`,
	);
	const res13 = await diffDefault(
		_,
		nvarchar({ mode: 'json', length: 'max' }).default(sql`'{"key":9223372036854775807}'`),
		`('{"key":9223372036854775807}')`,
	);
	const res14 = await diffDefault(
		_,
		nvarchar({ mode: 'json', length: 'max' }).default([9223372036854775807n, 9223372036854775806n]),
		`('[9223372036854775807,9223372036854775806]')`,
	);
	const res15 = await diffDefault(
		_,
		nvarchar({ mode: 'json', length: 'max' }).default({ key: 'value\\\'"' }),
		`('{"key":"value\\\\''\\""}')`,
	);

	const res16 = await diffDefault(_, nvarchar({ length: 10 }).default("'"), `('''')`);
	const res17 = await diffDefault(_, nvarchar({ length: 10 }).default('"'), `('"')`);

	expect.soft(res0).toStrictEqual([]);
	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res17).toStrictEqual([]);
});

test('ntext', async () => {
	const res1 = await diffDefault(_, ntext().default('text'), `('text')`);
	const res2 = await diffDefault(_, ntext().default("text'text"), `('text''text')`);
	const res3 = await diffDefault(_, ntext().default('text\'text"'), "('text''text\"')");
	const res4 = await diffDefault(_, ntext({ enum: ['one', 'two', 'three'] }).default('one'), "('one')");
	const res5 = await diffDefault(
		_,
		ntext({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(`mo''",\`}{od`),
		`('mo''''",\`}{od')`,
	);

	const res6 = await diffDefault(_, ntext().default(sql`'text'`), `('text')`);
	const res7 = await diffDefault(_, ntext().default(sql`('text')`), `('text')`);

	const res8 = await diffDefault(_, ntext().default(''), `('')`);
	const res9 = await diffDefault(_, ntext().default(sql`''`), `('')`);

	const res10 = await diffDefault(_, ntext().default(sql`'text'+'text'`), `('text'+'text')`);

	const res11 = await diffDefault(_, ntext().default("'"), `('''')`);
	const res12 = await diffDefault(_, ntext().default('"'), `('"')`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
});

test('datetime', async () => {
	const res1 = await diffDefault(
		_,
		datetime({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.111Z')),
		`('2025-05-23 12:53:53.111')`,
	);
	const res2 = await diffDefault(
		_,
		datetime({ mode: 'string' }).default('2025-05-23T12:53:53.112Z'),
		`('2025-05-23T12:53:53.112Z')`,
	);
	const res3 = await diffDefault(
		_,
		datetime({ mode: 'string' }).default(sql`'2025-05-23T12:53:53.113Z'`),
		`('2025-05-23T12:53:53.113Z')`,
	);

	const res4 = await diffDefault(_, datetime().defaultGetDate(), `(getdate())`);
	const res5 = await diffDefault(_, datetime().default(sql`getdate()`), `(getdate())`);

	const res6 = await diffDefault(
		_,
		datetime({ mode: 'date' }).default(sql`dateadd(day,(7),getdate())`),
		`(dateadd(day,(7),getdate()))`,
	);

	const res7 = await diffDefault(
		_,
		datetime({ mode: 'string' }).default(`2025-05-23`),
		`('2025-05-23')`,
	);
	const res8 = await diffDefault(
		_,
		datetime({ mode: 'string' }).default(`12:53:53.113`),
		`('12:53:53.113')`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
});

test('datetime2', async () => {
	const res1 = await diffDefault(
		_,
		datetime2({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`('2025-05-23 12:53:53.115')`,
	);
	const res10 = await diffDefault(
		_,
		datetime2({ mode: 'date', precision: 4 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`('2025-05-23 12:53:53.115')`,
	);
	const res2 = await diffDefault(
		_,
		datetime2({ mode: 'string' }).default('2025-05-23T12:53:53.115Z'),
		`('2025-05-23T12:53:53.115Z')`,
	);
	const res2_0 = await diffDefault(
		_,
		datetime2({ mode: 'string', precision: 4 }).default('2025-05-23T12:53:53.115Z'),
		`('2025-05-23T12:53:53.115Z')`,
	);
	const res2_1 = await diffDefault(
		_,
		datetime2({ mode: 'string', precision: 4 }).default('2025-05-23 12:53:53.115'),
		`('2025-05-23 12:53:53.115')`,
	);
	const res3 = await diffDefault(
		_,
		datetime2({ mode: 'string', precision: 4 }).default(sql`('2025-05-23T12:53:53.115Z')`),
		`('2025-05-23T12:53:53.115Z')`,
	);
	const res4 = await diffDefault(_, datetime2().defaultGetDate(), `(getdate())`);
	const res40 = await diffDefault(_, datetime2({ precision: 4 }).defaultGetDate(), `(getdate())`);
	const res5 = await diffDefault(_, datetime2().default(sql`getdate()`), `(getdate())`);
	const res50 = await diffDefault(_, datetime2({ precision: 4 }).default(sql`getdate()`), `(getdate())`);

	const res6 = await diffDefault(
		_,
		datetime2({ mode: 'date' }).default(sql`dateadd(day,(7),getdate())`),
		`(dateadd(day,(7),getdate()))`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);

	expect.soft(res10).toStrictEqual([]);
	expect.soft(res2_0).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res40).toStrictEqual([]);
	expect.soft(res50).toStrictEqual([]);
});

test('datetimeoffset', async () => {
	const res1 = await diffDefault(
		_,
		datetimeoffset({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`('2025-05-23T12:53:53.115Z')`,
	);
	const res2 = await diffDefault(
		_,
		datetimeoffset({ mode: 'date', precision: 3 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`('2025-05-23T12:53:53.115Z')`,
	);
	const res3 = await diffDefault(
		_,
		datetimeoffset({ mode: 'string' }).default('2025-05-23T12:53:53.115+03:00'),
		`('2025-05-23T12:53:53.115+03:00')`,
	);
	const res4 = await diffDefault(
		_,
		datetimeoffset({ mode: 'string', precision: 3 }).default('2025-05-23 12:53:53.115'),
		`('2025-05-23 12:53:53.115')`,
	);
	const res5 = await diffDefault(_, datetimeoffset().defaultGetDate(), `(getdate())`);

	const res30 = await diffDefault(
		_,
		datetimeoffset({ mode: 'string' }).default(sql`'2025-05-23T12:53:53.115+03:00'`),
		`('2025-05-23T12:53:53.115+03:00')`,
	);
	const res40 = await diffDefault(
		_,
		datetimeoffset({ mode: 'string', precision: 3 }).default(sql`('2025-05-23 12:53:53.115')`),
		`('2025-05-23 12:53:53.115')`,
	);

	const res6 = await diffDefault(
		_,
		datetimeoffset({ mode: 'date' }).default(sql`dateadd(day,(7),getdate())`),
		`(dateadd(day,(7),getdate()))`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res40).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('time', async () => {
	const res1 = await diffDefault(_, time().default(new Date('2025-05-23T12:53:53.115Z')), `('12:53:53.115')`);
	const res10 = await diffDefault(
		_,
		time({ mode: 'string', precision: 2 }).default('15:50:33.12342'),
		`('15:50:33.12342')`,
	);
	const res2 = await diffDefault(
		_,
		time({ mode: 'string', precision: 2 }).default('2025-05-23T12:53:53.115Z'),
		`('2025-05-23T12:53:53.115Z')`,
	);

	const res3 = await diffDefault(
		_,
		time({ mode: 'string', precision: 2 }).default(sql`('15:50:33.12342')`),
		`('15:50:33.12342')`,
	);
	const res4 = await diffDefault(
		_,
		time({ mode: 'string', precision: 2 }).default(sql`('2025-05-23T12:53:53.115Z')`),
		`('2025-05-23T12:53:53.115Z')`,
	);

	const res5 = await diffDefault(
		_,
		time({ mode: 'date' }).default(sql`dateadd(day,(7),getdate())`),
		`(dateadd(day,(7),getdate()))`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('date', async () => {
	const res1 = await diffDefault(_, date({ mode: 'string' }).default('2025-05-23'), `('2025-05-23')`);
	const res10 = await diffDefault(
		_,
		date({ mode: 'string' }).default('2025-05-23T12:53:53.115Z'),
		`('2025-05-23T12:53:53.115Z')`,
	);
	const res2 = await diffDefault(_, date({ mode: 'date' }).default(new Date('2025-05-23')), `('2025-05-23')`);
	const res3 = await diffDefault(_, date({ mode: 'string' }).defaultGetDate(), `(getdate())`);
	const res30 = await diffDefault(_, date({ mode: 'date' }).defaultGetDate(), `(getdate())`);

	const res4 = await diffDefault(_, date({ mode: 'date' }).default(sql`getdate()`), `(getdate())`);
	const res6 = await diffDefault(_, date({ mode: 'string' }).default(sql`'2025-05-23'`), `('2025-05-23')`);
	const res7 = await diffDefault(_, date({ mode: 'date' }).default(sql`'2025-05-23'`), `('2025-05-23')`);

	const res8 = await diffDefault(
		_,
		date({ mode: 'date' }).default(sql`dateadd(day,(7),getdate())`),
		`(dateadd(day,(7),getdate()))`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
});

function toBinary(str: string) {
	return '(' + '0x' + Buffer.from(str, 'utf8').toString('hex').toUpperCase() + ')';
}
test('binary + varbinary', async () => {
	const res1 = await diffDefault(
		_,
		binary({ length: 100 }).default(Buffer.from('hello world')),
		toBinary('hello world'),
	);
	const res1_1 = await diffDefault(
		_,
		varbinary({ length: 100 }).default(Buffer.from('hello world')),
		toBinary('hello world'),
	);
	const res1_2 = await diffDefault(
		_,
		binary({ length: 100 }).default(sql`hashbytes('SHA1','password')`),
		"(hashbytes('SHA1','password'))",
	);
	const res1_3 = await diffDefault(_, binary({ length: 100 }).default(sql`0xFF`), '(0xFF)');
	const res1_4 = await diffDefault(
		_,
		varbinary({ length: 100 }).default(sql`hashbytes('SHA1','password')`),
		"(hashbytes('SHA1','password'))",
	);
	const res1_5 = await diffDefault(_, varbinary({ length: 100 }).default(sql`0xFF`), '(0xFF)');

	const res2 = await diffDefault(
		_,
		binary({ length: 100 }).default(Buffer.from('hello world')),
		toBinary('hello world'),
	);
	const res2_1 = await diffDefault(
		_,
		varbinary({ length: 'max' }).default(Buffer.from('hello world')),
		toBinary('hello world'),
	);
	const res2_2 = await diffDefault(
		_,
		varbinary({ length: 100 }).default(Buffer.from('hello world')),
		toBinary('hello world'),
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res1_2).toStrictEqual([]);
	expect.soft(res1_3).toStrictEqual([]);
	expect.soft(res1_4).toStrictEqual([]);
	expect.soft(res1_5).toStrictEqual([]);

	expect.soft(res2).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res2_2).toStrictEqual([]);
});

// Probably most of the tests should be handled in `push.test.ts`
// User-friendly warning should be shown if there are changes in default expressions
// This just needs to be handled right for typescript (values must be in sql``, not .default())
test.skip('corner cases', async () => {
	const res1 = await diffDefault(_, char().default(sql`('text' + 'text')`), `('text' + 'text')`);
	const res2 = await diffDefault(_, char().default(sql`(CONVERT([char](2),N'A+'))`), `(CONVERT([char](2),N'A+'))`);
	const res3 = await diffDefault(
		_,
		char().default(sql`IIF(DAY(GETDATE()) % 2 = 0, 'Y', 'N')`),
		`(IIF(DAY(GETDATE()) % 2 = 0, 'Y', 'N'))`,
	);
	const res4 = await diffDefault(
		_,
		char().default(sql`CASE
	    WHEN DATEPART(HOUR, GETDATE()) < 12 THEN 'M'
	    ELSE 'A'
	END`),
		`(CASE
	    WHEN DATEPART(HOUR, GETDATE()) < 12 THEN 'M'
	    ELSE 'A'
	END)`,
	);

	const res5 = await diffDefault(_, int().default(sql`10 + 10`), '10 + 10');
	const res6 = await diffDefault(_, int().default(sql`(10) + 10`), '(10) + 10');
	const res7 = await diffDefault(_, int().default(sql`((10) + 10)`), '((10) + 10)');
	const res8 = await diffDefault(
		_,
		int().default(sql`(10) + (10 + 15) + 9007199254740992`),
		'(10) + (10 + 15) + 9007199254740992',
	);
	const res9 = await diffDefault(
		_,
		int().default(sql`(10) + (10 + 15) / 9007199254740992 - '11'`),
		"(10) + (10 + 15) / 9007199254740992 - '11'",
	);

	const res10 = await diffDefault(
		_,
		bigint({ mode: 'number' }).default(sql`'9007199254740991.'`),
		"('9007199254740991.')",
	);
	const res11 = await diffDefault(_, bigint({ mode: 'number' }).default(sql`9007199254740991.`), '(9007199254740991.)');

	const res12 = await diffDefault(_, numeric({ mode: 'number', precision: 6 }).default(10), '10.');
	const res13 = await diffDefault(_, numeric({ mode: 'number' }).default(sql`'6.73' + '4.2'`), "'6.73' + '4.2'");
	const res14 = await diffDefault(_, numeric({ mode: 'number' }).default(sql`(6.73 + 4.)`), '6.73 + 4.');
	const res15 = await diffDefault(_, numeric({ mode: 'number' }).default(sql`'6.73' + '4.2'`), "'6.73' + '4.2'");

	const res16 = await diffDefault(_, real().default(sql`('10.')`), "('10.')");
	const res17 = await diffDefault(_, real().default(sql`(10.)`), '(10.)');
	const res18 = await diffDefault(_, real().default(sql`10.`), '(10.)');
	const res19 = await diffDefault(_, real().default(sql`10.123`), '(10.123)');

	const res20 = await diffDefault(_, float().default(sql`10000.`), '(10000.)');
	const res21 = await diffDefault(_, float().default(sql`'10000.'`), "('10000.')");
	const res22 = await diffDefault(_, float({ precision: 45 }).default(sql`10000.`), '(10000.)');
	const res23 = await diffDefault(_, float({ precision: 10 }).default(sql`(10000.)`), '(10000.)');

	const res24 = await diffDefault(_, bit().default(sql`TRY_CAST('true' AS [bit])`), "(TRY_CAST('true' AS [bit]))");
	const res25 = await diffDefault(
		_,
		bit().default(sql`CASE WHEN 1 + 1 - 1 + 1= 2 THEN 1 ELSE 0 END`),
		'CASE WHEN 1 + 1 - 1 + 1= 2 THEN 1 ELSE 0 END',
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
	expect.soft(res16).toStrictEqual([]);
	expect.soft(res17).toStrictEqual([]);
	expect.soft(res18).toStrictEqual([]);
	expect.soft(res19).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res21).toStrictEqual([]);
	expect.soft(res22).toStrictEqual([]);
	expect.soft(res23).toStrictEqual([]);
	expect.soft(res24).toStrictEqual([]);
	expect.soft(res25).toStrictEqual([]);
});
