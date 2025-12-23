import { sql } from 'drizzle-orm';
import {
	bigint,
	binary,
	blob,
	boolean,
	char,
	date,
	datetime,
	decimal,
	double,
	float,
	int,
	json,
	longblob,
	longtext,
	mediumblob,
	mediumint,
	mediumtext,
	mysqlEnum,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyblob,
	tinyint,
	tinytext,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
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

beforeEach(async () => {
	await _.clear();
});

test('tinyint', async () => {
	const res1 = await diffDefault(_, tinyint().default(-128), '-128');
	const res2 = await diffDefault(_, tinyint().default(0), '0');
	const res3 = await diffDefault(_, tinyint().default(127), '127');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('smallint', async () => {
	const res1 = await diffDefault(_, smallint().default(-32768), '-32768');
	const res2 = await diffDefault(_, smallint().default(0), '0');
	const res3 = await diffDefault(_, smallint().default(32767), '32767');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('mediumint', async () => {
	const res1 = await diffDefault(_, mediumint().default(-8388608), '-8388608');
	const res2 = await diffDefault(_, mediumint().default(0), '0');
	const res3 = await diffDefault(_, mediumint().default(8388607), '8388607');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('int', async () => {
	const res1 = await diffDefault(_, int().default(-2147483648), '-2147483648');
	const res2 = await diffDefault(_, int().default(0), '0');
	const res3 = await diffDefault(_, int().default(2147483647), '2147483647');
	const res4 = await diffDefault(_, int().default(1e4), '10000');
	const res5 = await diffDefault(_, int().default(-1e4), '-10000');

	// expressions
	const res6 = await diffDefault(_, int().default(sql`(1 + 1)`), '(1 + 1)');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('bigint', async () => {
	const res1 = await diffDefault(_, bigint({ mode: 'number' }).default(9007199254740991), '9007199254740991'); // 2^53
	const res2 = await diffDefault(_, bigint({ mode: 'number' }).default(-9007199254740991), '-9007199254740991');
	const res3 = await diffDefault(_, bigint({ mode: 'bigint' }).default(9223372036854775807n), '9223372036854775807'); // 2^63 - 1
	const res4 = await diffDefault(_, bigint({ mode: 'bigint' }).default(-9223372036854775808n), '-9223372036854775808'); // -2^63
	const res5 = await diffDefault(
		_,
		bigint({ mode: 'number', unsigned: true }).default(9007199254740991),
		'9007199254740991',
	);
	const res6 = await diffDefault(
		_,
		bigint({ mode: 'bigint', unsigned: true }).default(18446744073709551615n),
		'18446744073709551615', // 2^64 max in Mysql
	);

	// expressions
	const res7 = await diffDefault(_, bigint({ mode: 'number' }).default(sql`(1 + 1)`), '(1 + 1)');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
});

test('decimal', async () => {
	const res1 = await diffDefault(_, decimal().default('10.123'), '(10.123)');

	const res2 = await diffDefault(_, decimal({ precision: 6 }).default('10.123'), '(10.123)');
	const res3 = await diffDefault(_, decimal({ precision: 6, scale: 2 }).default('10.123'), '(10.123)');

	// string
	const res4 = await diffDefault(_, decimal({ mode: 'string' }).default('10.123'), '(10.123)');

	const res5 = await diffDefault(_, decimal({ mode: 'string', scale: 2 }).default('10.123'), '(10.123)');
	const res6 = await diffDefault(_, decimal({ mode: 'string', precision: 6 }).default('10.123'), '(10.123)');
	const res7 = await diffDefault(
		_,
		decimal({ mode: 'string', precision: 6, scale: 2 }).default('10.123'),
		'(10.123)',
	);

	// number
	// const res8 = await diffDefault(_, decimal({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res9 = await diffDefault(
		_,
		decimal({ mode: 'number', precision: 16 }).default(9007199254740991),
		'(9007199254740991)',
	);

	const res10 = await diffDefault(_, decimal({ mode: 'number', precision: 6, scale: 2 }).default(10.123), '(10.123)');
	const res11 = await diffDefault(_, decimal({ mode: 'number', scale: 2 }).default(10.123), '(10.123)');
	const res12 = await diffDefault(_, decimal({ mode: 'number', precision: 6 }).default(10.123), '(10.123)');

	// TODO revise: maybe bigint mode should set the precision to a value appropriate for bigint, since the default precision (10) is insufficient.
	// the line below will fail
	const res13 = await diffDefault(
		_,
		decimal({ mode: 'bigint' }).default(9223372036854775807n),
		'(9223372036854775807)',
	);
	const res14 = await diffDefault(
		_,
		decimal({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		'(9223372036854775807)',
	);

	// expressions
	const res15 = await diffDefault(_, decimal().default(sql`(1.10 + 1.20)`), '(1.10 + 1.20)');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	// expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res11).toStrictEqual([]);
	expect.soft(res12).toStrictEqual([]);
	expect.soft(res13).toStrictEqual([]);
	expect.soft(res14).toStrictEqual([]);
	expect.soft(res15).toStrictEqual([]);
});

test('real', async () => {
	const res1 = await diffDefault(_, real().default(10.123), '10.123');
	// TODO: revise: It seems that the real type can’t be configured using only one property—precision or scale; both must be specified.
	// The commented line below will fail
	// const res2 = await diffDefault(_, real({ precision: 6 }).default(10.123), '10.123');
	const res3 = await diffDefault(_, real({ precision: 6, scale: 3 }).default(10.123), '10.123');
	const res4 = await diffDefault(_, real({ precision: 6, scale: 2 }).default(10.123), '10.123', null, {
		ignoreSubsequent: true,
	});

	// expressions
	const res5 = await diffDefault(_, decimal().default(sql`(1.10 + 1.20)`), '(1.10 + 1.20)');

	expect.soft(res1).toStrictEqual([]);
	// expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([
		'Unexpected subsequent init:\n'
		+ 'ALTER TABLE `table` MODIFY COLUMN `column` real(6,2) DEFAULT 10.123;', // expected due to scale 2
	]);
	expect.soft(res5).toStrictEqual([]);
});

test('double', async () => {
	const res1 = await diffDefault(_, double().default(10.123), '10.123');
	// TODO: revise: It seems that the double type can’t be configured using only one property precision or scale; both must be specified.
	// The commented line below will fail
	// const res2 = await diffDefault(_, double({ precision: 6 }).default(10.123), '10.123');
	const res3 = await diffDefault(_, double({ precision: 6, scale: 2 }).default(10.123), '10.123', null, {
		ignoreSubsequent: true,
	});
	const res4 = await diffDefault(_, double({ unsigned: true }).default(10.123), '10.123');
	const res5 = await diffDefault(
		_,
		double({ unsigned: true, precision: 6, scale: 2 }).default(10.123),
		'10.123',
		null,
		{ ignoreSubsequent: true },
	);

	// expressions
	const res6 = await diffDefault(_, decimal({ precision: 6, scale: 2 }).default(sql`(1.10 + 1.20)`), '(1.10 + 1.20)');

	expect.soft(res1).toStrictEqual([]);
	// expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([
		'Unexpected subsequent init:\n'
		+ 'ALTER TABLE `table` MODIFY COLUMN `column` double(6,2) DEFAULT 10.123;',
	]);
	expect.soft(res4).toStrictEqual([]);

	//
	expect.soft(res5).toStrictEqual([
		'Unexpected subsequent init:\n'
		+ 'ALTER TABLE `table` MODIFY COLUMN `column` double(6,2) unsigned DEFAULT 10.123;',
	]);
	expect.soft(res6).toStrictEqual([]);
});

test('float', async () => {
	const res1 = await diffDefault(_, float().default(10.123), '10.123');

	const res2 = await diffDefault(_, float({ precision: 6 }).default(10.123), '10.123');
	const res3 = await diffDefault(_, float({ precision: 6, scale: 3 }).default(10.123), '10.123');

	const res4 = await diffDefault(_, float({ unsigned: true }).default(10.123), '10.123');
	const res5 = await diffDefault(_, float({ unsigned: true, precision: 6, scale: 3 }).default(10.123), '10.123');
	const res6 = await diffDefault(_, float({ unsigned: true, precision: 6, scale: 2 }).default(10.123), '10.123', null, {
		ignoreSubsequent: true,
	});

	// expressions
	const res7 = await diffDefault(_, decimal({ precision: 6, scale: 2 }).default(sql`(1.10 + 1.20)`), '(1.10 + 1.20)');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([
		'Unexpected subsequent init:\n'
		+ 'ALTER TABLE `table` MODIFY COLUMN `column` float(6,2) unsigned DEFAULT 10.123;',
	]);
	expect.soft(res7).toStrictEqual([]);
});

test('boolean', async () => {
	// sql`null` equals no default value, while we handle it properly
	// it breaks on expected sql statements since they always expect DEFAULT
	const res1 = await diffDefault(_, boolean().default(sql`null`), 'null', null, { ignoreSubsequent: true });
	const res2 = await diffDefault(_, boolean().default(true), 'true');
	const res3 = await diffDefault(_, boolean().default(false), 'false');
	const res4 = await diffDefault(_, boolean().default(sql`true`), '(true)');

	// null vs { value: "null", type: "unknown" }
	expect.soft(res1.length).greaterThan(0);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('char', async () => {
	const res1 = await diffDefault(_, char({ length: 10 }).default('10'), `'10'`);
	const res2 = await diffDefault(_, char({ length: 10 }).default("'"), `''''`);
	const res3 = await diffDefault(_, char({ length: 10 }).default('"'), `'"'`);
	const res4 = await diffDefault(_, char({ length: 10 }).default('text\'text"'), "'text''text\"'");

	const res5 = await diffDefault(_, char({ length: 100 }).default(sql`('hello' + ' world')`), "('hello' + ' world')");
	const res6 = await diffDefault(_, char({ length: 100 }).default(sql`'hey'`), "('hey')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('varchar', async () => {
	const res1 = await diffDefault(_, varchar({ length: 10 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, varchar({ length: 10 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, varchar({ length: 10 }).default('text\'text"'), "'text''text\"'");

	// expressions
	const res4 = await diffDefault(
		_,
		varchar({ length: 100 }).default(sql`('hello' + ' world')`),
		"('hello' + ' world')",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('tinytext', async () => {
	const res1 = await diffDefault(_, tinytext().default('text'), `('text')`);
	const res2 = await diffDefault(_, tinytext().default("'"), `('''')`);
	const res3 = await diffDefault(_, tinytext().default('"'), `('"')`);
	const res4 = await diffDefault(_, tinytext().default("text'text"), `('text''text')`);
	const res5 = await diffDefault(_, tinytext().default('text\'text"'), `('text''text"')`);

	// expressions
	const res6 = await diffDefault(_, tinytext().default(sql`('hello' + ' world')`), "('hello' + ' world')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('mediumtext', async () => {
	const res1 = await diffDefault(_, mediumtext().default('text'), `('text')`);
	const res2 = await diffDefault(_, mediumtext().default("text'text"), `('text''text')`);
	const res3 = await diffDefault(_, mediumtext().default('text\'text"'), `('text''text"')`);

	// expressions
	const res4 = await diffDefault(_, mediumtext().default(sql`('hello' + ' world')`), "('hello' + ' world')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('text', async () => {
	const res1 = await diffDefault(_, text().default('text'), `('text')`);
	const res2 = await diffDefault(_, text().default("text'text"), `('text''text')`);
	const res3 = await diffDefault(_, text().default('text\'text"'), `('text''text"')`);

	// expressions
	const res4 = await diffDefault(_, text().default(sql`('hello' + ' world')`), "('hello' + ' world')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('longtext', async () => {
	const res1 = await diffDefault(_, longtext().default('text'), `('text')`);
	const res2 = await diffDefault(_, longtext().default("text'text"), `('text''text')`);
	const res3 = await diffDefault(_, longtext().default('text\'text"'), `('text''text"')`);

	// expressions
	const res4 = await diffDefault(_, longtext().default(sql`('hello' + ' world')`), "('hello' + ' world')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('tinyblob', async () => {
	const res1 = await diffDefault(_, tinyblob({ mode: 'string' }).default('text'), `('text')`);
	const res1_1 = await diffDefault(
		_,
		tinyblob().default(Buffer.from('text')),
		`(0x${Buffer.from('text').toString('hex')})`,
	);
	const res2 = await diffDefault(_, tinyblob({ mode: 'string' }).default("text'text"), `('text''text')`);
	const res2_1 = await diffDefault(
		_,
		tinyblob().default(Buffer.from("text't")),
		`(0x${Buffer.from("text't").toString('hex')})`,
	);
	const res3 = await diffDefault(_, tinyblob({ mode: 'string' }).default('text\'text"'), `('text''text"')`);
	const res3_1 = await diffDefault(
		_,
		tinyblob().default(Buffer.from('text\'t"')),
		`(0x${Buffer.from('text\'t"').toString('hex')})`,
	);

	// expressions
	const res4 = await diffDefault(_, tinyblob().default(sql`('hello' + ' world')`), "('hello' + ' world')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res3_1).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('mediumblob', async () => {
	const res1 = await diffDefault(_, mediumblob({ mode: 'string' }).default('text'), `('text')`);
	const res1_1 = await diffDefault(
		_,
		mediumblob().default(Buffer.from('text')),
		`(0x${Buffer.from('text').toString('hex')})`,
	);
	const res2 = await diffDefault(_, mediumblob({ mode: 'string' }).default("text'text"), `('text''text')`);
	const res2_1 = await diffDefault(
		_,
		mediumblob().default(Buffer.from("text'text")),
		`(0x${Buffer.from("text'text").toString('hex')})`,
	);
	const res3 = await diffDefault(_, mediumblob({ mode: 'string' }).default('text\'text"'), `('text''text"')`);
	const res3_1 = await diffDefault(
		_,
		mediumblob().default(Buffer.from('text\'text"')),
		`(0x${Buffer.from('text\'text"').toString('hex')})`,
	);

	// expressions
	const res4 = await diffDefault(_, mediumblob().default(sql`('hello' + ' world')`), "('hello' + ' world')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res3_1).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('blob', async () => {
	const res1 = await diffDefault(_, blob({ mode: 'string' }).default('text'), `('text')`);
	const res1_1 = await diffDefault(
		_,
		blob().default(Buffer.from('text')),
		`(0x${Buffer.from('text').toString('hex')})`,
	);
	const res2 = await diffDefault(_, blob({ mode: 'string' }).default("text'text"), `('text''text')`);
	const res2_1 = await diffDefault(
		_,
		blob().default(Buffer.from("text'text")),
		`(0x${Buffer.from("text'text").toString('hex')})`,
	);
	const res3 = await diffDefault(_, blob({ mode: 'string' }).default('text\'text"'), `('text''text"')`);
	const res3_1 = await diffDefault(
		_,
		blob().default(Buffer.from('text\'text"')),
		`(0x${Buffer.from('text\'text"').toString('hex')})`,
	);

	// expressions
	const res4 = await diffDefault(_, blob().default(sql`('hello' + ' world')`), "('hello' + ' world')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res3_1).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('longblob', async () => {
	const res1 = await diffDefault(_, longblob({ mode: 'string' }).default('text'), `('text')`);
	const res1_1 = await diffDefault(
		_,
		longblob().default(Buffer.from('text')),
		`(0x${Buffer.from('text').toString('hex')})`,
	);
	const res2 = await diffDefault(_, longblob({ mode: 'string' }).default("text'text"), `('text''text')`);
	const res2_1 = await diffDefault(
		_,
		longblob().default(Buffer.from("text'text")),
		`(0x${Buffer.from("text'text").toString('hex')})`,
	);
	const res3 = await diffDefault(_, longblob({ mode: 'string' }).default('text\'text"'), `('text''text"')`);
	const res3_1 = await diffDefault(
		_,
		longblob().default(Buffer.from('text\'text"')),
		`(0x${Buffer.from('text\'text"').toString('hex')})`,
	);

	// expressions
	const res4 = await diffDefault(_, longblob().default(sql`('hello' + ' world')`), "('hello' + ' world')");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res1_1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res2_1).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res3_1).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('enum', async () => {
	const res1 = await diffDefault(
		_,
		mysqlEnum(['sad', 'ok', 'happy']).default('ok'),
		`'ok'`,
		null,
		{
			type: `enum('sad','ok','happy')`,
		},
	);
	const res2 = await diffDefault(_, mysqlEnum(["'"]).default("'"), `''''`, null, { type: `enum('''')` });
	const res3 = await diffDefault(_, mysqlEnum(['"']).default('"'), `'"'`, null, { type: `enum('"')` });

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('binary', async () => {
	const res1 = await diffDefault(_, binary().default('binary'), `('binary')`);
	const res2 = await diffDefault(_, binary({ length: 10 }).default('binary'), `('binary')`);
	const res3 = await diffDefault(_, binary().default(sql`(lower('HELLO'))`), `(lower('HELLO'))`);
	const res4 = await diffDefault(_, binary().default(sql`lower('HELLO')`), `(lower('HELLO'))`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('varbinary', async () => {
	const res1 = await diffDefault(_, varbinary({ length: 10 }).default('binary'), `(0x62696e617279)`);
	const res2 = await diffDefault(_, varbinary({ length: 16 }).default(sql`(lower('HELLO'))`), `(lower('HELLO'))`);
	const res3 = await diffDefault(_, varbinary({ length: 16 }).default(sql`lower('HELLO')`), `(lower('HELLO'))`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('json', async () => {
	const res1 = await diffDefault(_, json().default({}), `('{}')`);
	const res2 = await diffDefault(_, json().default([]), `('[]')`);
	const res3 = await diffDefault(_, json().default([1, 2, 3]), `('[1,2,3]')`);
	const res4 = await diffDefault(_, json().default({ key: 'value' }), `('{"key":"value"}')`);
	const res5 = await diffDefault(_, json().default({ key: "val'ue" }), `('{"key":"val''ue"}')`);
	const res7 = await diffDefault(_, json().default({ key1: { key2: 'value' } }), `('{"key1":{"key2":"value"}}')`);

	const res8 = await diffDefault(_, json().default({ key: 9223372036854775807n }), `('{"key":9223372036854775807}')`);
	const res9 = await diffDefault(
		_,
		json().default(sql`'{"key":9223372036854775807}'`),
		`('{"key":9223372036854775807}')`,
	);
	const res10 = await diffDefault(
		_,
		json().default([9223372036854775807n, 9223372036854775806n]),
		`('[9223372036854775807,9223372036854775806]')`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2136
test('timestamp', async () => {
	const res1 = await diffDefault(_, timestamp({ mode: 'date' }).defaultNow(), `(now())`);
	const res2 = await diffDefault(_, timestamp({ mode: 'string' }).defaultNow(), `(now())`);
	const res3 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
		null,
		{ ignoreSubsequent: true },
	);
	const res4 = await diffDefault(
		_,
		timestamp({ mode: 'date', fsp: 3 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);

	const res5 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115'`,
		null,
		{ ignoreSubsequent: true },
	);
	const res6 = await diffDefault(
		_,
		timestamp({ mode: 'string', fsp: 3 }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115'`,
	);
	const res7 = await diffDefault(
		_,
		timestamp({ mode: 'string', fsp: 6 }).default('2025-05-23 12:53:53.123456'),
		`'2025-05-23 12:53:53.123456'`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([
		// without fsp timestamp column returns no .115
		'Unexpected subsequent init:\n'
		+ "ALTER TABLE `table` MODIFY COLUMN `column` timestamp DEFAULT '2025-05-23 12:53:53.115';",
	]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([
		// without fsp timestamp column returns no .115
		'Unexpected subsequent init:\n'
		+ "ALTER TABLE `table` MODIFY COLUMN `column` timestamp DEFAULT '2025-05-23 12:53:53.115';",
	]);

	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
});

test('datetime', async () => {
	const res1 = await diffDefault(
		_,
		datetime({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
		null,
		{ ignoreSubsequent: true },
	);
	const res2 = await diffDefault(
		_,
		datetime({ mode: 'date', fsp: 3 }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);

	const res3 = await diffDefault(
		_,
		datetime({ mode: 'string' }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115'`,
		null,
		{ ignoreSubsequent: true },
	);
	const res4 = await diffDefault(
		_,
		datetime({ mode: 'string', fsp: 3 }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115'`,
	);
	const res5 = await diffDefault(
		_,
		datetime({ mode: 'string', fsp: 6 }).default('2025-05-23 12:53:53.123456'),
		`'2025-05-23 12:53:53.123456'`,
	);

	// database datetime without precision does not return .115 fraction
	expect.soft(res1).toStrictEqual([
		'Unexpected subsequent init:\n'
		+ "ALTER TABLE `table` MODIFY COLUMN `column` datetime DEFAULT '2025-05-23 12:53:53.115';",
	]);
	expect.soft(res2).toStrictEqual([]);

	// database datetime without precision does not return .115 fraction
	expect.soft(res3).toStrictEqual([
		'Unexpected subsequent init:\n'
		+ "ALTER TABLE `table` MODIFY COLUMN `column` datetime DEFAULT '2025-05-23 12:53:53.115';",
	]);

	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('time', async () => {
	const res1 = await diffDefault(_, time().default('15:50:33'), `'15:50:33'`);
	const res2 = await diffDefault(
		_,
		time({ fsp: 3 }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);

	const res3 = await diffDefault(
		_,
		time({ fsp: 6 }).default('15:50:33.123456'),
		`'15:50:33.123456'`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('date', async () => {
	const res1 = await diffDefault(_, date({ mode: 'string' }).default('2025-05-23'), `'2025-05-23'`);
	const res2 = await diffDefault(_, date({ mode: 'date' }).default(new Date('2025-05-23')), `'2025-05-23'`);
	const res3 = await diffDefault(
		_,
		date({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23'`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('year', async () => {
	const res1 = await diffDefault(_, year().default(2025), `2025`);
	const res2 = await diffDefault(_, year().default(sql`2025`), `(2025)`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
});

test.skip('corner cases', async () => {
	await diffDefault(_, json().default({ key: 'mo",\\`}{od' }), `('{"key":"mo\\\\",\\\\\\\\\`}{od"}'))`);
	await diffDefault(
		_,
		mysqlEnum(['sad', 'ok', 'happy', 'mo",\\`}{od']).default('mo",\\`}{od'),
		`'mo",\\\\\`}{od'`,
		null,
		{ type: `enum('sad','ok','happy','mo",\\\\\`}{od')` },
	);

	await diffDefault(_, longtext().default('mo",\\`}{od'), `('mo",\\\`}{od')`);

	await diffDefault(
		_,
		longtext({ enum: ['one', 'two', 'three', 'mo",\\`}{od'] }).default('mo",\\`}{od'),
		`('mo",\\\`}{od')`,
	);

	await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', 'mo",\\`}{od'] }).default('mo",\\`}{od'),
		`('mo",\\\`}{od')`,
	);
	await diffDefault(_, text().default('mo",\\`}{od'), `('mo",\\\`}{od')`);

	await diffDefault(
		_,
		mediumtext({ enum: ['one', 'two', 'three', 'mo",\\`}{od'] }).default('mo",\\`}{od'),
		`('mo",\\\`}{od')`,
	);
	await diffDefault(_, mediumtext().default('mo",\\`}{od'), `('mo",\\\`}{od')`);

	await diffDefault(
		_,
		tinytext({ enum: ['one', 'two', 'three', 'mo",\\`}{od'] }).default('mo",\\`}{od'),
		`('mo",\\\`}{od')`,
	);
	await diffDefault(_, tinytext().default('mo",\\`}{od'), `('mo",\\\`}{od')`);

	await diffDefault(
		_,
		varchar({ length: 15, enum: ['one', 'two', 'three', 'mo",\\`}{od'] }).default('mo",\\`}{od'),
		`('mo",\\\`}{od')`,
	);
	await diffDefault(_, varchar({ length: 15 }).default('mo",\\`}{od'), `('mo",\\\`}{od')`);

	await diffDefault(
		_,
		char({ length: 15, enum: ['one', 'two', 'three', 'mo",\\`}{od'] }).default('mo",\\`}{od'),
		`('mo",\\\`}{od')`,
	);
	await diffDefault(_, char({ length: 15 }).default('mo",\\`}{od'), `('mo",\\\`}{od')`);

	// raw sql for the line below: create table `table` (`column` json default ('{"key1":{"key2":"mo\\\",\\\\`}{od"}}'));
	await diffDefault(
		_,
		json().default({ key1: { key2: 'mo",\\`}{od' } }),
		`('{"key1":{"key2":"mo\\\\",\\\\\\\\\`}{od"}}')`,
	);
});
