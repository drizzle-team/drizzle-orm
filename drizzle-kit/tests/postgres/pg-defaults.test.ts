import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	char,
	cidr,
	date,
	doublePrecision,
	integer,
	interval,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	pgEnum,
	point,
	real,
	smallint,
	text,
	time,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
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

// TODO revise: remove the call to _.clear(), since diffDefault already clears it at the start.
// beforeEach(async () => {
// 	await _.clear();
// });

test('integer', async () => {
	const res1 = await diffDefault(_, integer().default(10), '10');
	const res2 = await diffDefault(_, integer().default(0), '0');
	const res3 = await diffDefault(_, integer().default(-10), '-10');
	const res4 = await diffDefault(_, integer().default(1e4), '10000');
	const res5 = await diffDefault(_, integer().default(-1e4), '-10000');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('integer arrays', async () => {
	const res1 = await diffDefault(_, integer().array().default([]), "'{}'::integer[]");
	const res2 = await diffDefault(_, integer().array().default([10]), "'{10}'::integer[]");
	const res3 = await diffDefault(_, integer().array().array().default([]), "'{}'::integer[]");
	const res4 = await diffDefault(_, integer().array().array().default([[]]), "'{}'::integer[]");
	const res5 = await diffDefault(_, integer().array().array().default([[1, 2]]), "'{{1,2}}'::integer[]");
	const res6 = await diffDefault(_, integer().array().array().default([[1, 2], [1, 2]]), "'{{1,2},{1,2}}'::integer[]");
	const res7 = await diffDefault(
		_,
		integer().array().array().array().default([[[1, 2]], [[1, 2]]]),
		"'{{{1,2}},{{1,2}}}'::integer[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
});

test('smallint', async () => {
	// 2^15 - 1
	const res1 = await diffDefault(_, smallint().default(32767), '32767');
	// -2^15
	const res2 = await diffDefault(_, smallint().default(-32768), '-32768');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
});

test('smallint arrays', async () => {
	const res1 = await diffDefault(_, smallint().array().default([]), "'{}'::smallint[]");
	const res2 = await diffDefault(_, smallint().array().default([32767]), "'{32767}'::smallint[]");
	const res3 = await diffDefault(_, smallint().array().array().default([]), "'{}'::smallint[]");
	const res4 = await diffDefault(_, smallint().array().array().default([[]]), "'{}'::smallint[]");
	const res5 = await diffDefault(_, smallint().array().array().default([[1, 2]]), "'{{1,2}}'::smallint[]");
	const res6 = await diffDefault(
		_,
		smallint().array().array().default([[1, 2], [1, 2]]),
		"'{{1,2},{1,2}}'::smallint[]",
	);
	const res7 = await diffDefault(
		_,
		smallint().array().array().array().default([[[1, 2]], [[1, 2]]]),
		"'{{{1,2}},{{1,2}}}'::smallint[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
});

test('bigint', async () => {
	// 2^53
	const res1 = await diffDefault(_, bigint({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res2 = await diffDefault(_, bigint({ mode: 'number' }).default(-9007199254740991), '-9007199254740991');
	// 2^63 - 1
	const res3 = await diffDefault(_, bigint({ mode: 'bigint' }).default(9223372036854775807n), "'9223372036854775807'");
	// -2^63
	const res4 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).default(-9223372036854775808n),
		"'-9223372036854775808'",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('bigint arrays', async () => {
	const res1 = await diffDefault(_, bigint({ mode: 'number' }).array().default([]), "'{}'::bigint[]");
	const res2 = await diffDefault(_, bigint({ mode: 'bigint' }).array().default([]), "'{}'::bigint[]");

	const res3 = await diffDefault(
		_,
		bigint({ mode: 'number' }).array().default([9007199254740991]),
		"'{9007199254740991}'::bigint[]",
	);
	const res4 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).array().default([9223372036854775807n]),
		"'{9223372036854775807}'::bigint[]",
	);

	const res5 = await diffDefault(_, bigint({ mode: 'number' }).array().array().default([]), "'{}'::bigint[]");
	const res6 = await diffDefault(_, bigint({ mode: 'bigint' }).array().array().default([]), "'{}'::bigint[]");

	const res7 = await diffDefault(_, bigint({ mode: 'number' }).array().array().default([[]]), "'{}'::bigint[]");
	const res8 = await diffDefault(_, bigint({ mode: 'bigint' }).array().array().default([[]]), "'{}'::bigint[]");

	const res9 = await diffDefault(
		_,
		bigint({ mode: 'number' }).array().array().default([[1, 2], [1, 2]]),
		"'{{1,2},{1,2}}'::bigint[]",
	);
	const res10 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).array().array().default([[1n, 2n], [1n, 2n]]),
		"'{{1,2},{1,2}}'::bigint[]",
	);

	const res11 = await diffDefault(
		_,
		bigint({ mode: 'number' }).array().array().array().default([[[1, 2]], [[1, 2]]]),
		"'{{{1,2}},{{1,2}}}'::bigint[]",
	);
	const res12 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).array().array().array().default([[[1n, 2n]], [[1n, 2n]]]),
		"'{{{1,2}},{{1,2}}}'::bigint[]",
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
});

test('numeric', async () => {
	const res1 = await diffDefault(_, numeric().default('10.123'), "'10.123'");

	const res4 = await diffDefault(_, numeric({ mode: 'string' }).default('10.123'), "'10.123'");
	const res2 = await diffDefault(_, numeric({ mode: 'bigint' }).default(9223372036854775807n), "'9223372036854775807'");
	const res3 = await diffDefault(_, numeric({ mode: 'number' }).default(9007199254740991), '9007199254740991');

	const res5 = await diffDefault(_, numeric({ precision: 6 }).default('10.123'), "'10.123'");
	const res6 = await diffDefault(_, numeric({ precision: 6, scale: 2 }).default('10.123'), "'10.123'");

	const res7 = await diffDefault(_, numeric({ mode: 'string', scale: 2 }).default('10.123'), "'10.123'");
	const res8 = await diffDefault(_, numeric({ mode: 'string', precision: 6 }).default('10.123'), "'10.123'");
	const res9 = await diffDefault(_, numeric({ mode: 'string', precision: 6, scale: 2 }).default('10.123'), "'10.123'");

	const res10 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		"'9223372036854775807'",
	);
	const res11 = await diffDefault(_, numeric({ mode: 'number', precision: 6, scale: 2 }).default(10.123), '10.123');
	const res12 = await diffDefault(_, numeric({ mode: 'number', scale: 2 }).default(10.123), '10.123');
	const res13 = await diffDefault(_, numeric({ mode: 'number', precision: 6 }).default(10.123), '10.123');

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

test('numeric arrays', async () => {
	const res1 = await diffDefault(_, numeric({ mode: 'number' }).array().default([]), "'{}'::numeric[]");
	const res2 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 4, scale: 2 }).array().default([]),
		"'{}'::numeric[]",
	);
	const res3 = await diffDefault(_, numeric({ mode: 'bigint' }).array().default([]), "'{}'::numeric[]");
	const res4 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 4 }).array().default([]),
		"'{}'::numeric[]",
	);
	const res5 = await diffDefault(_, numeric({ mode: 'string' }).array().default([]), "'{}'::numeric[]");
	const res6 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 4, scale: 2 }).array().default([]),
		"'{}'::numeric[]",
	);

	const res7 = await diffDefault(
		_,
		numeric({ mode: 'number' }).array().default([10.123, 123.10]),
		"'{10.123,123.1}'::numeric[]", // .1 due to number->string conversion
	);

	const res8 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 6, scale: 2 }).array().default([10.123, 123.10]),
		"'{10.123,123.1}'::numeric[]", // .1 due to number->string conversion
	);
	const res9 = await diffDefault(
		_,
		numeric({ mode: 'bigint' }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::numeric[]",
	);
	const res10 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::numeric[]",
	);
	const res11 = await diffDefault(
		_,
		numeric({ mode: 'string' }).array().default(['10.123', '123.10']),
		"'{10.123,123.10}'::numeric[]",
	);
	const res12 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 6, scale: 2 }).array().default(['10.123', '123.10']),
		"'{10.123,123.10}'::numeric[]",
	);

	const res13 = await diffDefault(_, numeric({ mode: 'string' }).array().array().default([]), "'{}'::numeric[]");
	const res14 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 4, scale: 2 }).array().array().default([]),
		"'{}'::numeric[]",
	);
	const res15 = await diffDefault(_, numeric({ mode: 'number' }).array().array().default([]), "'{}'::numeric[]");
	const res16 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 4, scale: 2 }).array().array().default([]),
		"'{}'::numeric[]",
	);
	const res17 = await diffDefault(_, numeric({ mode: 'bigint' }).array().array().default([]), "'{}'::numeric[]");
	const res18 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 4 }).array().array().default([]),
		"'{}'::numeric[]",
	);
	const res19 = await diffDefault(
		_,
		numeric({ mode: 'string' }).array().array().default([['10.123', '123.10'], ['10.123', '123.10']]),
		"'{{10.123,123.10},{10.123,123.10}}'::numeric[]",
	);
	const res20 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 6, scale: 2 }).array().array().default([['10.123', '123.10'], [
			'10.123',
			'123.10',
		]]),
		"'{{10.123,123.10},{10.123,123.10}}'::numeric[]",
	);
	const res21 = await diffDefault(
		_,
		numeric({ mode: 'number' }).array().array().default([[10.123, 123.10], [10.123, 123.10]]),
		"'{{10.123,123.10},{10.123,123.10}}'::numeric[]",
	);
	const res22 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 6, scale: 2 }).array().array().default([[10.123, 123.10], [
			10.123,
			123.10,
		]]),
		"'{{10.123,123.10},{10.123,123.10}}'::numeric[]",
	);
	const res23 = await diffDefault(
		_,
		numeric({ mode: 'bigint' }).array().array().default([[9223372036854775807n, 9223372036854775806n], [
			9223372036854775807n,
			9223372036854775806n,
		]]),
		"'{{9223372036854775807,9223372036854775806},{9223372036854775807,9223372036854775806}}'::numeric[]",
	);
	const res24 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).array().array().default([[9223372036854775807n, 9223372036854775806n], [
			9223372036854775807n,
			9223372036854775806n,
		]]),
		"'{{9223372036854775807,9223372036854775806},{9223372036854775807,9223372036854775806}}'::numeric[]",
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
});

test('real + real arrays', async () => {
	const res1 = await diffDefault(_, real().default(1000.123), '1000.123');

	const res2 = await diffDefault(_, real().array().default([]), `'{}'::real[]`);
	const res3 = await diffDefault(_, real().array().default([1000.123, 10.2]), `'{1000.123,10.2}'::real[]`);

	const res4 = await diffDefault(_, real().array().array().default([]), `'{}'::real[]`);
	const res5 = await diffDefault(
		_,
		real().array().array().default([[1000.123, 10.2], [1000.123, 10.2]]),
		`'{{1000.123,10.2},{1000.123,10.2}}'::real[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('doublePrecision + doublePrecision arrays', async () => {
	const res1 = await diffDefault(_, doublePrecision().default(10000.123), '10000.123');

	const res2 = await diffDefault(_, doublePrecision().array().default([]), `'{}'::double precision[]`);
	const res3 = await diffDefault(
		_,
		doublePrecision().array().default([10000.123]),
		`'{10000.123}'::double precision[]`,
	);

	const res4 = await diffDefault(_, doublePrecision().array().array().default([]), `'{}'::double precision[]`);
	const res5 = await diffDefault(
		_,
		doublePrecision().array().array().default([[10000.123, 10.1], [10000.123, 10.1]]),
		`'{{10000.123,10.1},{10000.123,10.1}}'::double precision[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('boolean + boolean arrays', async () => {
	const res1 = await diffDefault(_, boolean().default(true), 'true');
	const res2 = await diffDefault(_, boolean().default(false), 'false');
	const res3 = await diffDefault(_, boolean().default(sql`true`), 'true');

	const res4 = await diffDefault(_, boolean().array().default([]), `'{}'::boolean[]`);
	const res5 = await diffDefault(_, boolean().array().default([true]), `'{t}'::boolean[]`);

	const res6 = await diffDefault(_, boolean().array().array().default([]), `'{}'::boolean[]`);
	const res7 = await diffDefault(_, boolean().array().array().default([[true], [false]]), `'{{t},{f}}'::boolean[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
});

test('char + char arrays', async () => {
	const res1 = await diffDefault(_, char({ length: 256 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, char({ length: 256 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, char({ length: 256 }).default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, char({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		char({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''",\`}{od'`,
	);

	const res6 = await diffDefault(_, char({ length: 256 }).array().default([]), `'{}'::char(256)[]`);
	const res7 = await diffDefault(_, char({ length: 256 }).array().default(['text']), `'{"text"}'::char(256)[]`);
	const res8 = await diffDefault(
		_,
		char({ length: 256 }).array().default(["text'text"]),
		`'{"text''text"}'::char(256)[]`,
	);
	const res9 = await diffDefault(
		_,
		char({ length: 256 }).array().default(['text\'text"']),
		`'{"text''text\""}':char(256)[]`,
	);
	const res10 = await diffDefault(
		_,
		char({ length: 256, enum: ['one', 'two', 'three'] }).array().default(['one']),
		`'{"one"}::char(256)[]'`,
	);
	const res11 = await diffDefault(
		_,
		char({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().default(
			[`mo''",\`}{od`],
		),
		`'{"mo''\",\`\}\{od"}'::char(256)[]`,
	);

	const res12 = await diffDefault(_, char({ length: 256 }).array().array().default([]), `'{}'::char(256)[]`);
	const res13 = await diffDefault(
		_,
		char({ length: 256 }).array().array().default([['text'], ['text']]),
		`'{{"text"},{"text"}}'::char(256)[]`,
	);
	const res14 = await diffDefault(
		_,
		char({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().array()
			.default(
				[[`mo''",\`}{od`], [`mo''",\`}{od`]],
			),
		`'{{"mo''\",\`\}\{od"},{"mo''\",\`\}\{od"}}'::char(256)[]`,
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
});

test('varchar + varchar arrays', async () => {
	const res1 = await diffDefault(_, varchar({ length: 256 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, varchar({ length: 256 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, varchar({ length: 256 }).default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, varchar({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''",\`}{od'`,
	);

	const res6 = await diffDefault(_, varchar({ length: 256 }).array().default([]), `'{}'::varchar(256)[]`);
	const res7 = await diffDefault(_, varchar({ length: 256 }).array().default(['text']), `'{"text"}'::varchar(256)[]`);
	const res8 = await diffDefault(
		_,
		varchar({ length: 256 }).array().default(["text'text"]),
		`'{"text''text"}'::varchar(256)[]`,
	);
	const res9 = await diffDefault(
		_,
		varchar({ length: 256 }).array().default(['text\'text"']),
		`'{"text''text\""}':varchar(256)[]`,
	);
	const res10 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three'] }).array().default(['one']),
		`'{"one"}::varchar(256)[]'`,
	);
	const res11 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().default(
			[`mo''",\`}{od`],
		),
		`'{"mo''\",\`\}\{od"}'::varchar(256)[]`,
	);

	const res12 = await diffDefault(_, varchar({ length: 256 }).array().array().default([]), `'{}'::varchar(256)[]`);
	const res13 = await diffDefault(
		_,
		varchar({ length: 256 }).array().array().default([['text'], ['text']]),
		`'{{"text"},{"text"}}'::varchar(256)[]`,
	);
	const res14 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().array()
			.default(
				[[`mo''",\`}{od`], [`mo''",\`}{od`]],
			),
		`'{{"mo''\",\`\}\{od"},{"mo''\",\`\}\{od"}}'::varchar(256)[]`,
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
});

test('text + text arrays', async () => {
	const res1 = await diffDefault(_, text().default('text'), `'text'`);
	const res2 = await diffDefault(_, text().default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, text().default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, text({ enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''",\`}{od'`,
	);

	const res6 = await diffDefault(_, text().array().default([]), `'{}'::text[]`);
	const res7 = await diffDefault(_, text().array().default(['text']), `'{"text"}'::text[]`);
	const res8 = await diffDefault(
		_,
		text().array().default(["text'text"]),
		`'{"text''text"}'::text[]`,
	);
	const res9 = await diffDefault(
		_,
		text().array().default(['text\'text"']),
		`'{"text''text\""}':text[]`,
	);
	const res10 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three'] }).array().default(['one']),
		`'{"one"}::text[]'`,
	);
	const res11 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().default(
			[`mo''",\`}{od`],
		),
		`'{"mo''\",\`\}\{od"}'::text[]`,
	);

	const res12 = await diffDefault(_, text().array().array().default([]), `'{}'::text[]`);
	const res13 = await diffDefault(
		_,
		text().array().array().default([['text'], ['text']]),
		`'{{"text"},{"text"}}'::text[]`,
	);
	const res14 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().array()
			.default(
				[[`mo''",\`}{od`], [`mo''",\`}{od`]],
			),
		`'{{"mo''\",\`\}\{od"},{"mo''\\",\`\\}\\{od"}}'::text[]`,
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
});

test('json + json arrays', async () => {
	const res1 = await diffDefault(_, json().default({}), `'{}'`);
	const res2 = await diffDefault(_, json().default([]), `'[]'`);
	const res3 = await diffDefault(_, json().default([1, 2, 3]), `'[1,2,3]'`);
	const res4 = await diffDefault(_, json().default({ key: 'value' }), `'{"key":"value"}'`);
	const res5 = await diffDefault(_, json().default({ key: "val'ue" }), `'{"key":"val''ue"}'`);
	const res6 = await diffDefault(_, json().default({ key: `mo''",\`}{od` }), `'{"key":"mo''''\\\",\`}{od"}'`);

	const res7 = await diffDefault(_, json().array().default([]), `'{}'::json[]`);
	const res8 = await diffDefault(
		_,
		json().array().default([{ key: 'value' }]),
		`'{\"{\\\"key\\\":\\\"value\\\"}\"}'::json[]`,
	);
	const res9 = await diffDefault(
		_,
		json().array().default([{ key: "val'ue" }]),
		`'{"{\\"key\\":\\"val''ue\\"}"}'::json[]`,
	);
	const res10 = await diffDefault(
		_,
		json().array().default([{ key: `mo''",\`}{od` }]),
		`'{"{\\"key\\":\\"mo''\\\\\\",\`}{od\\"}"}'::json[]`,
	);

	const res11 = await diffDefault(_, json().array().array().default([]), `'{}'::json[]`);
	const res12 = await diffDefault(
		_,
		json().array().array().default([[{ key: 'value' }]]),
		`'{{\"{\\\"key\\\":\\\"value\\\"}\"}}'::json[]`,
	);
	const res13 = await diffDefault(
		_,
		json().array().array().default([[{ key: "val'ue" }]]),
		`'{{"{\\"key\\":\\"val''ue\\"}"}}'::json[]`,
	);
	const res14 = await diffDefault(
		_,
		json().array().array().default([[{ key: `mo''",\`}{od` }]]),
		`'{{"{\\"key\\":\\"mo''\\\\\\",\`}{od\\"}"}}'::json[]`,
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
});

test('jsonb + jsonb arrays', async () => {
	const res1 = await diffDefault(_, jsonb().default({}), `'{}'`);
	const res2 = await diffDefault(_, jsonb().default([]), `'[]'`);
	const res3 = await diffDefault(_, jsonb().default([1, 2, 3]), `'[1,2,3]'`);
	const res4 = await diffDefault(_, jsonb().default({ key: 'value' }), `'{"key":"value"}'`);
	const res5 = await diffDefault(_, jsonb().default({ key: "val'ue" }), `'{"key":"val''ue"}'`);

	const res6 = await diffDefault(_, json().default({ key: `mo''",\`}{od` }), `'{"key":"mo''''\\\",\`}{od"}'`);

	const res7 = await diffDefault(_, json().array().default([]), `'{}'::json[]`);
	const res8 = await diffDefault(
		_,
		json().array().default([{ key: 'value' }]),
		`'{\"{\\\"key\\\":\\\"value\\\"}\"}'::json[]`,
	);
	const res9 = await diffDefault(
		_,
		json().array().default([{ key: "val'ue" }]),
		`'{"{\\"key\\":\\"val''ue\\"}"}'::json[]`,
	);
	const res10 = await diffDefault(
		_,
		json().array().default([{ key: `mo''",\`}{od` }]),
		`'{"{\\"key\\":\\"mo''\\\\\\",\`}{od\\"}"}'::json[]`,
	);

	const res11 = await diffDefault(_, json().array().array().default([]), `'{}'::json[]`);
	const res12 = await diffDefault(
		_,
		json().array().array().default([[{ key: 'value' }]]),
		`'{{\"{\\\"key\\\":\\\"value\\\"}\"}}'::json[]`,
	);
	const res13 = await diffDefault(
		_,
		json().array().array().default([[{ key: "val'ue" }]]),
		`'{{"{\\"key\\":\\"val''ue\\"}"}}'::json[]`,
	);
	const res14 = await diffDefault(
		_,
		json().array().array().default([[{ key: `mo''",\`}{od` }]]),
		`'{{"{\\"key\\":\\"mo''\\\\\\",\`}{od\\"}"}}'::json[]`,
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
});

test('timestamp + timestamp arrays', async () => {
	const res1 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res2 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res3 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115'`,
	);
	const res4 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115'`,
	);
	const res5 = await diffDefault(_, timestamp().defaultNow(), `now()`);
	const res6 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).defaultNow(),
		`now()`,
	);

	const res7 = await diffDefault(_, timestamp({ mode: 'date' }).array().default([]), `'{}'::timestamp[]`);
	const res8 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).array().default([]),
		`'{}'::timestamp[]`,
	);
	const res9 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);
	const res10 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).array().default([
			new Date('2025-05-23T12:53:53.115Z'),
		]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);

	const res11 = await diffDefault(_, timestamp({ mode: 'string' }).array().default([]), `'{}'::timestamp[]`);
	const res12 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().default([]),
		`'{}'::timestamp[]`,
	);
	const res13 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).array().default(['2025-05-23 12:53:53.115']),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);
	const res14 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().default(['2025-05-23 12:53:53.115']),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);

	const res15 = await diffDefault(_, timestamp({ mode: 'date' }).array().array().default([]), `'{}'::timestamp[]`);
	const res16 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).array().array().default([]),
		`'{}'::timestamp[]`,
	);
	const res17 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).array().array().default([[new Date('2025-05-23T12:53:53.115Z')]]),
		`'{{"2025-05-23 12:53:53.115"}}'::timestamp[]`,
	);
	const res18 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 3, withTimezone: true }).array().array().default([[
			new Date('2025-05-23T12:53:53.115Z'),
		]]),
		`'{{"2025-05-23 12:53:53.115"}}'::timestamp[]`,
	);

	const res19 = await diffDefault(_, timestamp({ mode: 'string' }).array().array().default([]), `'{}'::timestamp[]`);
	const res20 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().array().default([]),
		`'{}'::timestamp[]`,
	);
	const res21 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).array().array().default([['2025-05-23 12:53:53.115']]),
		`'{{"2025-05-23 12:53:53.115"}}'::timestamp[]`,
	);
	const res22 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().array().default([[
			'2025-05-23 12:53:53.115',
		]]),
		`'{{"2025-05-23 12:53:53.115"}}'::timestamp[]`,
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
});

test('time + time arrays', async () => {
	const res1 = await diffDefault(_, time().default('15:50:33'), `'15:50:33'`);
	const res10 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);
	const res2 = await diffDefault(_, time().defaultNow(), `now()`);
	const res20 = await diffDefault(_, time({ precision: 3, withTimezone: true }).defaultNow(), `now()`);

	const res3 = await diffDefault(_, time().array().default([]), `'{}'::time[]`);
	const res30 = await diffDefault(_, time({ precision: 3, withTimezone: true }).array().default([]), `'{}'::time[]`);
	const res4 = await diffDefault(_, time().array().default(['15:50:33']), `'{15:50:33}'::time[]`);
	const res40 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time[]`,
	);

	const res5 = await diffDefault(_, time().array().array().default([]), `'{}'::time[]`);
	const res50 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().array().default([]),
		`'{}'::time[]`,
	);
	const res6 = await diffDefault(_, time().array().array().default([['15:50:33']]), `'{{15:50:33}}'::time[]`);
	const res60 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().array().default([['15:50:33.123']]),
		`'{{15:50:33.123}}'::time[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res40).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res50).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res60).toStrictEqual([]);
});

test('date + date arrays', async () => {
	const res1 = await diffDefault(_, date({ mode: 'string' }).default('2025-05-23'), `'2025-05-23'`);
	const res10 = await diffDefault(_, date({ mode: 'date' }).default(new Date('2025-05-23')), `'2025-05-23'`);
	const res2 = await diffDefault(_, date({ mode: 'string' }).defaultNow(), `now()`);
	const res20 = await diffDefault(_, date({ mode: 'date' }).defaultNow(), `now()`);

	const res3 = await diffDefault(_, date({ mode: 'string' }).array().default([]), `'{}'::date[]`);
	const res30 = await diffDefault(_, date({ mode: 'date' }).array().default([]), `'{}'::date[]`);
	const res4 = await diffDefault(_, date({ mode: 'string' }).array().default(['2025-05-23']), `'{2025-05-23}'::date[]`);
	const res40 = await diffDefault(
		_,
		date({ mode: 'date' }).array().default([new Date('2025-05-23')]),
		`'{2025-05-23}'::date[]`,
	);

	const res5 = await diffDefault(_, date({ mode: 'string' }).array().array().default([]), `'{}'::date[]`);
	const res50 = await diffDefault(_, date({ mode: 'date' }).array().array().default([]), `'{}'::date[]`);
	const res6 = await diffDefault(
		_,
		date({ mode: 'string' }).array().array().default([['2025-05-23']]),
		`'{{2025-05-23}}'::date[]`,
	);
	const res60 = await diffDefault(
		_,
		date({ mode: 'date' }).array().array().default([[new Date('2025-05-23')]]),
		`'{{2025-05-23}}'::date[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);

	expect.soft(res2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);

	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);

	expect.soft(res4).toStrictEqual([]);
	expect.soft(res40).toStrictEqual([]);

	expect.soft(res5).toStrictEqual([]);
	expect.soft(res50).toStrictEqual([]);

	expect.soft(res6).toStrictEqual([]);
	expect.soft(res60).toStrictEqual([]);
});

test('interval + interval arrays', async () => {
	const res1 = await diffDefault(_, interval().default('1 day'), `'1 day'`);
	const res10 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).default('1 day 3 second'),
		`'1 day 3 second'`,
	);

	const res2 = await diffDefault(_, interval().array().default([]), `'{}'::interval[]`);
	const res20 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).array().default([]),
		`'{}'::interval[]`,
	);

	const res3 = await diffDefault(_, interval().array().default(['1 day']), `'{"1 day"}'::interval[]`);
	const res30 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).array().default(['1 day 3 second']),
		`'{"1 day 3 second"}'::interval[]`,
	);

	const res4 = await diffDefault(_, interval().array().array().default([]), `'{}'::interval[]`);
	const res40 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).array().array().default([]),
		`'{}'::interval[]`,
	);

	const res5 = await diffDefault(_, interval().array().array().default([['1 day']]), `'{{"1 day"}}'::interval[]`);
	const res50 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).array().array().default([['1 day 3 second']]),
		`'{{"1 day 3 second"}}'::interval[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res40).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res50).toStrictEqual([]);
});

test('point + point arrays', async () => {
	const res1 = await diffDefault(_, point({ mode: 'xy' }).default({ x: 1, y: 2 }), `'(1,2)'`);
	const res2 = await diffDefault(_, point({ mode: 'tuple' }).default([1, 2]), `'(1,2)'`);

	const res3 = await diffDefault(_, point({ mode: 'tuple' }).array().default([]), `'{}'::point[]`);
	const res4 = await diffDefault(_, point({ mode: 'tuple' }).array().default([[1, 2]]), `'{"(1,2)"}'::point[]`);

	const res5 = await diffDefault(_, point({ mode: 'xy' }).array().default([]), `'{}'::point[]`);
	const res6 = await diffDefault(_, point({ mode: 'xy' }).array().default([{ x: 1, y: 2 }]), `'{"(1,2)"}'::point[]`);

	const res7 = await diffDefault(_, point({ mode: 'tuple' }).array().array().default([]), `'{}'::point[]`);
	const res8 = await diffDefault(
		_,
		point({ mode: 'tuple' }).array().array().default([[[1, 2]]]),
		`'{{"(1,2)"}}'::point[]`,
	);

	const res9 = await diffDefault(_, point({ mode: 'xy' }).array().array().default([]), `'{}'::point[]`);
	const res10 = await diffDefault(
		_,
		point({ mode: 'xy' }).array().array().default([[{ x: 1, y: 2 }]]),
		`'{{"(1,2)"}}'::point[]`,
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
});

test('line + line arrays', async () => {
	const res1 = await diffDefault(_, line({ mode: 'abc' }).default({ a: 1, b: 2, c: 3 }), `'{1,2,3}'`);
	const res2 = await diffDefault(_, line({ mode: 'tuple' }).default([1, 2, 3]), `'{1,2,3}'`);

	const res3 = await diffDefault(_, line({ mode: 'tuple' }).array().default([]), `'{}'::line[]`);
	const res4 = await diffDefault(_, line({ mode: 'tuple' }).array().default([[1, 2, 3]]), `'{"{1,2,3}"}'::line[]`);

	const res5 = await diffDefault(_, line({ mode: 'abc' }).array().default([]), `'{}'::line[]`);
	const res6 = await diffDefault(
		_,
		line({ mode: 'abc' }).array().default([{ a: 1, b: 2, c: 3 }]),
		`'{"{1,2,3}"}'::line[]`,
	);

	const res7 = await diffDefault(_, line({ mode: 'tuple' }).array().array().default([]), `'{}'::line[]`);
	const res8 = await diffDefault(
		_,
		line({ mode: 'tuple' }).array().array().default([[[1, 2, 3]]]),
		`'{{"{1,2,3}"}}'::line[]`,
	);

	const res9 = await diffDefault(_, line({ mode: 'abc' }).array().array().default([]), `'{}'::line[]`);
	const res10 = await diffDefault(
		_,
		line({ mode: 'abc' }).array().array().default([[{ a: 1, b: 2, c: 3 }]]),
		`'{{"{1,2,3}"}}'::line[]`,
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
});

test('enum + enum arrays', async () => {
	const moodEnum = pgEnum('mood_enum', ['sad', 'ok', 'happy', `text'text"`, `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od']);
	const pre = { moodEnum };

	const res1 = await diffDefault(_, moodEnum().default('ok'), `'ok'::"mood_enum"`, pre);
	const res2 = await diffDefault(_, moodEnum().default(`text'text"`), `"'text''text"'"::"mood_enum"`, pre);
	const res3 = await diffDefault(_, moodEnum().default(`mo''",\`}{od`), `'mo''",\`}{od'::"mood_enum"`, pre);

	const res4 = await diffDefault(_, moodEnum().array().default([]), `'{}'::"mood_enum"[]`, pre);
	const res5 = await diffDefault(_, moodEnum().array().default(['ok']), `'{ok}'::"mood_enum"[]`, pre);
	const res6 = await diffDefault(
		_,
		moodEnum().array().default([`text'text"`]),
		`'{"text''text\""}':"mood_enum"[]`,
		pre,
	);
	const res7 = await diffDefault(
		_,
		moodEnum().array().default([`mo''",\`}{od`]),
		`'{"mo''\",\`\}\{od"}'::"mood_enum"[]`,
		pre,
	);

	const res8 = await diffDefault(_, moodEnum().array().array().default([]), `'{}'::"mood_enum"[]`, pre);
	const res9 = await diffDefault(_, moodEnum().array().array().default([['ok']]), `'{{ok}}'::"mood_enum"[]`, pre);
	const res10 = await diffDefault(
		_,
		moodEnum().array().array().default([[`text'text"`]]),
		`'{{"text''text\""}}':"mood_enum"[]`,
		pre,
	);
	const res11 = await diffDefault(
		_,
		moodEnum().array().array().default([[`mo''",\`}{od`]]),
		`'{{"mo''",\`}{od"}}'::"mood_enum"[]`,
		pre,
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
});

test('uuid + uuid arrays', async () => {
	const res1 = await diffDefault(
		_,
		uuid().default('550e8400-e29b-41d4-a716-446655440000'),
		`'550e8400-e29b-41d4-a716-446655440000'`,
	);
	const res2 = await diffDefault(_, uuid().defaultRandom(), `gen_random_uuid()`);

	const res3 = await diffDefault(_, uuid().array().default([]), `'{}'::uuid[]`);
	const res4 = await diffDefault(
		_,
		uuid().array().default(['550e8400-e29b-41d4-a716-446655440000']),
		`'{550e8400-e29b-41d4-a716-446655440000}'::uuid[]`,
	);

	const res5 = await diffDefault(_, uuid().array().array().default([]), `'{}'::uuid[]`);
	const res6 = await diffDefault(
		_,
		uuid().array().array().default([['550e8400-e29b-41d4-a716-446655440000']]),
		`'{{550e8400-e29b-41d4-a716-446655440000}}'::uuid[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('cidr + cidr arrays', async () => {
	const res1 = await diffDefault(_, cidr().default('10.1.2.3/32'), `'10.1.2.3/32'`);

	const res2 = await diffDefault(_, cidr().array().default([]), `'{}'::cidr[]`);
	const res3 = await diffDefault(_, cidr().array().default(['10.1.2.3/32']), `'{10.1.2.3/32}'::cidr[]`);

	const res4 = await diffDefault(_, cidr().array().array().default([]), `'{}'::cidr[]`);
	const res5 = await diffDefault(
		_,
		cidr().array().array().default([['10.1.2.3/32'], ['10.1.2.3/32']]),
		`'{{10.1.2.3/32},{10.1.2.3/32}}'::cidr[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('macaddr + macaddr arrays', async () => {
	const res1 = await diffDefault(_, macaddr().default('08:00:2b:01:02:03'), `'08:00:2b:01:02:03'`);

	const res2 = await diffDefault(_, macaddr().array().default([]), `'{}'::macaddr[]`);
	const res3 = await diffDefault(
		_,
		macaddr().array().default(['08:00:2b:01:02:03']),
		`'{08:00:2b:01:02:03}'::macaddr[]`,
	);

	const res4 = await diffDefault(_, macaddr().array().array().default([]), `'{}'::macaddr[]`);
	const res5 = await diffDefault(
		_,
		macaddr().array().array().default([['08:00:2b:01:02:03'], ['08:00:2b:01:02:03']]),
		`'{{08:00:2b:01:02:03},{08:00:2b:01:02:03}}'::macaddr[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('macaddr8 + macaddr8 arrays', async () => {
	const res1 = await diffDefault(_, macaddr8().default('08:00:2b:01:02:03:04:05'), `'08:00:2b:01:02:03:04:05'`);

	const res2 = await diffDefault(_, macaddr8().array().default([]), `'{}'::macaddr8[]`);
	const res3 = await diffDefault(
		_,
		macaddr8().array().default(['08:00:2b:01:02:03:04:05']),
		`'{08:00:2b:01:02:03:04:05}'::macaddr8[]`,
	);

	const res4 = await diffDefault(_, macaddr8().array().array().default([]), `'{}'::macaddr8[]`);
	const res5 = await diffDefault(
		_,
		macaddr8().array().array().default([['08:00:2b:01:02:03:04:05'], ['08:00:2b:01:02:03:04:05']]),
		`'{{08:00:2b:01:02:03:04:05},{08:00:2b:01:02:03:04:05}}'::macaddr8[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});
