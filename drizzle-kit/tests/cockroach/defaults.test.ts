import { sql } from 'drizzle-orm';
import {
	bigint,
	bit,
	boolean,
	char,
	cockroachEnum,
	date,
	decimal,
	doublePrecision,
	float,
	geometry,
	int4,
	interval,
	jsonb,
	numeric,
	real,
	smallint,
	string,
	text,
	time,
	timestamp,
	uuid,
	varchar,
	vector,
} from 'drizzle-orm/cockroach-core';
import { mkdirSync } from 'fs';
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

test('int4', async () => {
	const res1 = await diffDefault(_, int4().default(10), '10');
	const res2 = await diffDefault(_, int4().default(0), '0');
	const res3 = await diffDefault(_, int4().default(-10), '-10');
	const res4 = await diffDefault(_, int4().default(1e4), '10000');
	const res5 = await diffDefault(_, int4().default(-1e4), '-10000');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('int4 arrays', async () => {
	const res1 = await diffDefault(_, int4().array().default([]), "'{}'::int4[]");
	const res2 = await diffDefault(_, int4().array().default([10]), "'{10}'::int4[]");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
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
	const res1 = await diffDefault(_, smallint().array().default([]), "'{}'::int2[]");
	const res2 = await diffDefault(_, smallint().array().default([32767]), "'{32767}'::int2[]");

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
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
	const res1 = await diffDefault(_, bigint({ mode: 'number' }).array().default([]), "'{}'::int8[]");
	const res2 = await diffDefault(_, bigint({ mode: 'bigint' }).array().default([]), "'{}'::int8[]");

	const res3 = await diffDefault(
		_,
		bigint({ mode: 'number' }).array().default([9007199254740991]),
		"'{9007199254740991}'::int8[]",
	);
	const res4 = await diffDefault(
		_,
		bigint({ mode: 'bigint' }).array().default([9223372036854775807n]),
		"'{9223372036854775807}'::int8[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('numeric', async () => {
	const res1 = await diffDefault(_, numeric().default('10.123'), "'10.123'");

	const res2 = await diffDefault(_, numeric({ mode: 'bigint' }).default(9223372036854775807n), "'9223372036854775807'");
	const res3 = await diffDefault(_, numeric({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res4 = await diffDefault(_, numeric({ mode: 'string' }).default('10.123'), "'10.123'");

	const res5 = await diffDefault(_, numeric({ precision: 6 }).default('10.123'), "'10'");
	const res6 = await diffDefault(_, numeric({ precision: 6, scale: 2 }).default('10.123'), "'10.12'");
	const res7 = await diffDefault(_, numeric({ precision: 6, scale: 3 }).default('10.12'), "'10.120'");

	const res8 = await diffDefault(_, numeric({ mode: 'string', scale: 2 }).default('10.123'), "'10.123'");
	const res9 = await diffDefault(_, numeric({ mode: 'string', precision: 6 }).default('10.123'), "'10'");
	const res10 = await diffDefault(_, numeric({ mode: 'string', precision: 6, scale: 2 }).default('10.123'), "'10.12'");
	const res11 = await diffDefault(_, numeric({ mode: 'string', precision: 6, scale: 3 }).default('10.12'), "'10.120'");

	const res12 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		"'9223372036854775807'",
	);
	const res13 = await diffDefault(_, numeric({ mode: 'number', precision: 6, scale: 2 }).default(10.123), '10.12');
	const res14 = await diffDefault(_, numeric({ mode: 'number', scale: 2 }).default(10.123), '10.123');
	const res15 = await diffDefault(_, numeric({ mode: 'number', precision: 6 }).default(10.123), '10');

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
});

test('numeric arrays', async () => {
	const res1 = await diffDefault(_, numeric({ mode: 'number' }).array().default([]), "'{}'::decimal[]");
	const res2 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);
	const res3 = await diffDefault(_, numeric({ mode: 'bigint' }).array().default([]), "'{}'::decimal[]");
	const res4 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 4 }).array().default([]),
		"'{}'::decimal(4)[]",
	);
	const res5 = await diffDefault(_, numeric({ mode: 'string' }).array().default([]), "'{}'::decimal[]");
	const res6 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);

	const res7 = await diffDefault(
		_,
		numeric({ mode: 'number' }).array().default([10.123, 123.10]),
		"'{10.123,123.1}'::decimal[]",
	);
	const res70 = await diffDefault(
		_,
		numeric({ mode: 'number', scale: 2, precision: 6 }).array().default([10.123, 123.10]),
		"'{10.12,123.10}'::decimal(6,2)[]",
	);

	const res8 = await diffDefault(
		_,
		numeric({ mode: 'number', precision: 6, scale: 2 }).array().default([10.123, 123.10]),
		"'{10.12,123.10}'::decimal(6,2)[]",
	);
	const res9 = await diffDefault(
		_,
		numeric({ mode: 'bigint' }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal[]",
	);
	const res10 = await diffDefault(
		_,
		numeric({ mode: 'bigint', precision: 19 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal(19)[]",
	);
	const res11 = await diffDefault(
		_,
		numeric({ mode: 'string' }).array().default(['10.123', '123.10']),
		"'{10.123,123.10}'::decimal[]",
	);
	const res12 = await diffDefault(
		_,
		numeric({ mode: 'string', precision: 6, scale: 2 }).array().default(['10.123', '123.10']),
		"'{10.12,123.10}'::decimal(6,2)[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res70).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	// it's ok, that's due to '.10' is parsed to '0.1'
	expect.soft(res11.length).toBe(1);
	expect.soft(res12).toStrictEqual([]);
});

test('decimal', async () => {
	const res1 = await diffDefault(_, decimal().default('10.123'), "'10.123'");

	const res2 = await diffDefault(_, decimal({ mode: 'bigint' }).default(9223372036854775807n), "'9223372036854775807'");
	const res3 = await diffDefault(_, decimal({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res4 = await diffDefault(_, decimal({ mode: 'string' }).default('10.123'), "'10.123'");

	const res5 = await diffDefault(_, decimal({ precision: 6 }).default('10.123'), "'10'");
	const res6 = await diffDefault(_, decimal({ precision: 6, scale: 2 }).default('10.123'), "'10.12'");
	const res7 = await diffDefault(_, decimal({ precision: 6, scale: 3 }).default('10.12'), "'10.120'");

	const res8 = await diffDefault(_, decimal({ mode: 'string', scale: 2 }).default('10.123'), "'10.123'");
	const res9 = await diffDefault(_, decimal({ mode: 'string', precision: 6 }).default('10.123'), "'10'");
	const res10 = await diffDefault(_, decimal({ mode: 'string', precision: 6, scale: 2 }).default('10.123'), "'10.12'");
	const res11 = await diffDefault(_, decimal({ mode: 'string', precision: 6, scale: 3 }).default('10.12'), "'10.120'");

	const res12 = await diffDefault(
		_,
		decimal({ mode: 'bigint', precision: 19 }).default(9223372036854775807n),
		"'9223372036854775807'",
	);
	const res13 = await diffDefault(_, decimal({ mode: 'number', precision: 6, scale: 2 }).default(10.123), '10.12');
	const res14 = await diffDefault(_, decimal({ mode: 'number', scale: 2 }).default(10.123), '10.123');
	const res15 = await diffDefault(_, decimal({ mode: 'number', precision: 6 }).default(10.123), '10');

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
});

// when was string array and introspect gives trimmed .10 -> 0.1
test('decimal arrays', async () => {
	const res1 = await diffDefault(_, decimal({ mode: 'number' }).array().default([]), "'{}'::decimal[]");
	const res2 = await diffDefault(
		_,
		decimal({ mode: 'number', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);
	const res3 = await diffDefault(_, decimal({ mode: 'bigint' }).array().default([]), "'{}'::decimal[]");
	const res4 = await diffDefault(
		_,
		decimal({ mode: 'bigint', precision: 4 }).array().default([]),
		"'{}'::decimal(4)[]",
	);
	const res5 = await diffDefault(_, decimal({ mode: 'string' }).array().default([]), "'{}'::decimal[]");
	const res6 = await diffDefault(
		_,
		decimal({ mode: 'string', precision: 4, scale: 2 }).array().default([]),
		"'{}'::decimal(4,2)[]",
	);

	const res7 = await diffDefault(
		_,
		decimal({ mode: 'number' }).array().default([10.123, 123.10]),
		"'{10.123,123.1}'::decimal[]",
	);
	const res70 = await diffDefault(
		_,
		decimal({ mode: 'number', scale: 2, precision: 6 }).array().default([10.123, 123.10]),
		"'{10.12,123.10}'::decimal(6,2)[]",
	);

	const res8 = await diffDefault(
		_,
		decimal({ mode: 'number', precision: 6, scale: 2 }).array().default([10.123, 123.10]),
		"'{10.12,123.10}'::decimal(6,2)[]",
	);
	const res9 = await diffDefault(
		_,
		decimal({ mode: 'bigint' }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal[]",
	);
	const res10 = await diffDefault(
		_,
		decimal({ mode: 'bigint', precision: 19 }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::decimal(19)[]",
	);
	const res11 = await diffDefault(
		_,
		decimal({ mode: 'string' }).array().default(['10.123', '123.10']),
		"'{10.123,123.10}'::decimal[]",
	);
	const res12 = await diffDefault(
		_,
		decimal({ mode: 'string', precision: 6, scale: 2 }).array().default(['10.123', '123.10']),
		"'{10.12,123.10}'::decimal(6,2)[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res70).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	// it's ok, that's due to '.10' is parsed to '0.1'
	expect.soft(res11.length).toBe(1);
	expect.soft(res12).toStrictEqual([]);
});

test('real + real arrays', async () => {
	const res1 = await diffDefault(_, real().default(1000.123), '1000.123');
	const res10 = await diffDefault(_, real().default(1000), '1000');

	const res2 = await diffDefault(_, real().array().default([]), `'{}'::real[]`);
	const res3 = await diffDefault(_, real().array().default([1000.123, 10.2]), `'{1000.123,10.2}'::real[]`);
	const res30 = await diffDefault(_, real().array().default([1000.123, 10]), `'{1000.123,10}'::real[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);
});

test('float + float arrays', async () => {
	const res1 = await diffDefault(_, float().default(10000.123), '10000.123');
	const res10 = await diffDefault(_, float().default(10000), '10000');

	const res2 = await diffDefault(_, float().array().default([]), `'{}'::float[]`);
	const res3 = await diffDefault(
		_,
		float().array().default([10000.123]),
		`'{10000.123}'::float[]`,
	);
	const res30 = await diffDefault(
		_,
		float().array().default([10000, 14]),
		`'{10000,14}'::float[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);
});

test('doublePrecision + doublePrecision arrays', async () => {
	const res1 = await diffDefault(_, doublePrecision().default(10000.123), '10000.123');

	const res2 = await diffDefault(_, doublePrecision().array().default([]), `'{}'::float[]`);
	const res3 = await diffDefault(
		_,
		doublePrecision().array().default([10000.123]),
		`'{10000.123}'::float[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('boolean + boolean arrays', async () => {
	const res1 = await diffDefault(_, boolean().default(true), 'true');
	const res2 = await diffDefault(_, boolean().default(false), 'false');
	const res3 = await diffDefault(_, boolean().default(sql`true`), 'true');

	const res4 = await diffDefault(_, boolean().array().default([]), `'{}'::boolean[]`);
	const res5 = await diffDefault(_, boolean().array().default([true]), `'{true}'::boolean[]`);
	const res6 = await diffDefault(_, boolean().array().default([false]), `'{false}'::boolean[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('char + char arrays', async () => {
	const res1 = await diffDefault(_, char({ length: 256 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, char({ length: 256 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, char({ length: 256 }).default(`text'\\text"`), `'text''\\text"'`);
	const res4 = await diffDefault(_, char({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		char({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''''",\`}{od'`,
	);

	const res6 = await diffDefault(_, char({ length: 256 }).array().default([]), `'{}'::char(256)[]`);
	const res7 = await diffDefault(_, char({ length: 256 }).array().default(['text']), `'{text}'::char(256)[]`);
	const res8 = await diffDefault(
		_,
		char({ length: 256 }).array().default(["text'text"]),
		`'{text''text}'::char(256)[]`,
	);
	const res9 = await diffDefault(
		_,
		char({ length: 256 }).array().default(['text\'\\text"']),
		`'{"text''\\\\text\\""}'::char(256)[]`,
	);
	const res10 = await diffDefault(
		_,
		char({ length: 256, enum: ['one', 'two', 'three'] }).array().default(['one']),
		`'{one}'::char(256)[]`,
	);
	const res11 = await diffDefault(
		_,
		char({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().default(
			[`mo''",\`}{od`],
		),
		`'{"mo''''\\\",\`\}\{od"}'::char(256)[]`,
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

test('varchar + varchar arrays', async () => {
	const res1 = await diffDefault(_, varchar({ length: 256 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, varchar({ length: 256 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, varchar({ length: 256 }).default('text\'\\text"'), "'text''\\text\"'");
	const res4 = await diffDefault(_, varchar({ length: 256, enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''''",\`}{od'`,
	);

	const res6 = await diffDefault(_, varchar({ length: 256 }).array().default([]), `'{}'::varchar(256)[]`);
	const res7 = await diffDefault(_, varchar({ length: 256 }).array().default(['text']), `'{text}'::varchar(256)[]`);
	const res8 = await diffDefault(
		_,
		varchar({ length: 256 }).array().default(["text'text"]),
		`'{text''text}'::varchar(256)[]`,
	);
	const res9 = await diffDefault(
		_,
		varchar({ length: 256 }).array().default(['text\'\\text"']),
		`'{"text''\\\\text\\""}'::varchar(256)[]`,
	);
	const res10 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three'] }).array().default(['one']),
		`'{one}'::varchar(256)[]`,
	);
	const res11 = await diffDefault(
		_,
		varchar({ length: 256, enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array().default(
			[`mo''",\`}{od`],
		),
		`'{"mo''''\\\",\`\}\{od"}'::varchar(256)[]`,
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

test('text + text arrays', async () => {
	const res1 = await diffDefault(_, text().default('text'), `'text'`);
	const res2 = await diffDefault(_, text().default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, text().default('text\'\\text"'), "'text''\\text\"'");
	const res4 = await diffDefault(_, text({ enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''''",\`}{od'`,
	);

	const res6 = await diffDefault(_, text().array().default([]), `'{}'::string[]`);

	const res7 = await diffDefault(_, text().array().default(['text']), `'{text}'::string[]`);
	const res8 = await diffDefault(
		_,
		text().array().default(["text'text"]),
		`'{text''text}'::string[]`,
	);
	const res9 = await diffDefault(
		_,
		text().array().default([`text'\\text"`]),
		`'{"text''\\\\text\\""}'::string[]`,
	);
	const res10 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three'] }).array().default(['one']),
		`'{one}'::string[]`,
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

test('string + string arrays', async () => {
	const res1 = await diffDefault(_, string().default('text'), `'text'`);
	const res2 = await diffDefault(_, string().default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, string().default('text\'\\text"'), "'text''\\text\"'");
	const res4 = await diffDefault(_, string({ enum: ['one', 'two', 'three'] }).default('one'), "'one'");
	const res5 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).default(
			`mo''",\`}{od`,
		),
		`'mo''''",\`}{od'`,
	);

	const res6 = await diffDefault(_, string().array().default([]), `'{}'::string[]`);

	const res7 = await diffDefault(_, string().array().default(['text']), `'{text}'::string[]`);
	const res8 = await diffDefault(
		_,
		text().array().default(["text'text"]),
		`'{text''text}'::string[]`,
	);
	// raw default sql for the line below: '{"text''\\text\\\""}'::string[]
	const res9 = await diffDefault(
		_,
		string().array().default([`text'\\text"`]),
		`'{"text''\\\\text\\""}'::string[]`,
	);
	const res10 = await diffDefault(
		_,
		string({ enum: ['one', 'two', 'three'], length: 10 }).array().default(['one']),
		`'{one}'::string(10)[]`,
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

test('jsonb', async () => {
	const res1 = await diffDefault(_, jsonb().default({}), `'{}'`);
	const res2 = await diffDefault(_, jsonb().default([]), `'[]'`);
	const res3 = await diffDefault(_, jsonb().default([1, 2, 3]), `'[1,2,3]'`);
	const res4 = await diffDefault(_, jsonb().default({ key: 'value' }), `'{"key":"value"}'`);
	// raw default sql for the line below: '{"key":"val''\\ue"}'
	const res5 = await diffDefault(_, jsonb().default({ key: "val'\\ue" }), `'{"key":"val''\\\\ue"}'`);

	const res6 = await diffDefault(_, jsonb().default({ key: `mo''",\`}{od` }), `'{"key":"mo''''\\\",\`}{od"}'`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('timestamp + timestamp arrays', async () => {
	const res1 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res2 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 1, withTimezone: true }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.1+00'`,
	);
	const res3 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115'`,
	);
	const res4 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115+00'`,
	);
	const res40 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).default('2025-05-23 12:53:53.115+00'),
		`'2025-05-23 12:53:53.115+00'`,
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
		`'{}'::timestamp(3) with time zone[]`,
	);
	const res9 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);
	const res10 = await diffDefault(
		_,
		timestamp({ mode: 'date', precision: 2, withTimezone: true }).array().default([
			new Date('2025-05-23T12:53:53.115Z'),
		]),
		`'{"2025-05-23 12:53:53.11+00"}'::timestamp(2) with time zone[]`,
	);

	const res11 = await diffDefault(_, timestamp({ mode: 'string' }).array().default([]), `'{}'::timestamp[]`);
	const res12 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 3, withTimezone: true }).array().default([]),
		`'{}'::timestamp(3) with time zone[]`,
	);
	const res13 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).array().default(['2025-05-23 12:53:53.115']),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);
	const res14 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).array().default(['2025-05-23 12:53:53.115213+03']),
		`'{"2025-05-23 09:53:53.11521+00"}'::timestamp(5) with time zone[]`,
	);
	const res15 = await diffDefault(
		_,
		timestamp({ mode: 'string', precision: 5, withTimezone: true }).array().default(['2025-05-23 12:53:53.1+03']),
		`'{"2025-05-23 09:53:53.1+00"}'::timestamp(5) with time zone[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res40).toStrictEqual([]);
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
});

test('time + time arrays', async () => {
	const res1 = await diffDefault(_, time().default('15:50:33'), `'15:50:33'`);
	const res10 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).default('15:50:33.123'),
		`'15:50:33.123'`,
	);

	const res3 = await diffDefault(_, time().array().default([]), `'{}'::time[]`);
	const res30 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default([]),
		`'{}'::time(3) with time zone[]`,
	);
	const res4 = await diffDefault(_, time().array().default(['15:50:33']), `'{15:50:33}'::time[]`);
	const res40 = await diffDefault(
		_,
		time({ precision: 3, withTimezone: true }).array().default(['15:50:33.123']),
		`'{15:50:33.123}'::time(3) with time zone[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res40).toStrictEqual([]);
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

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res10).toStrictEqual([]);

	expect.soft(res2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);

	expect.soft(res3).toStrictEqual([]);
	expect.soft(res30).toStrictEqual([]);

	expect.soft(res4).toStrictEqual([]);
	expect.soft(res40).toStrictEqual([]);
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
		`'{}'::interval day to second(3)[]`,
	);

	const res3 = await diffDefault(_, interval().array().default(['1 day']), `'{"1 day"}'::interval[]`);
	const res30 = await diffDefault(
		_,
		interval({ fields: 'day to second', precision: 3 }).array().default(['1 day 3 second']),
		`'{"1 day 3 second"}'::interval day to second(3)[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	// it's ok, that's due to '1 day 3 second' vs '1 day 00:00:03'
	expect.soft(res10.length).toBe(1);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res20).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	// it's ok, that's due to '1 day 3 second' vs '1 day 00:00:03'
	expect.soft(res30.length).toBe(1);
});

test('enum + enum arrays', async () => {
	const moodEnum = cockroachEnum('mood_enum', [
		'sad',
		'ok',
		'happy',
		`text'text"`,
		`no,''"\`rm`,
		`mo''",\\\`}{od`,
		`mo''",\\\\\\\`}{od`,
		'mo,\`od',
	]);
	const pre = { moodEnum };

	const res1 = await diffDefault(_, moodEnum().default('ok'), `'ok'::"mood_enum"`, pre);

	const res4 = await diffDefault(_, moodEnum().array().default([]), `'{}'::"mood_enum"[]`, pre);
	const res5 = await diffDefault(_, moodEnum().array().default(['ok']), `'{ok}'::"mood_enum"[]`, pre);

	expect.soft(res1).toStrictEqual([]);

	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('uuid + uuid arrays', async () => {
	const res1 = await diffDefault(
		_,
		uuid().default('550e8400-e29b-41d4-a716-446655440000'),
		`'550e8400-e29b-41d4-a716-446655440000'`,
	);

	const res2 = await diffDefault(
		_,
		uuid().array().default([]),
		`'{}'::uuid[]`,
	);

	const res4 = await diffDefault(
		_,
		uuid().array().default(['550e8400-e29b-41d4-a716-446655440000']),
		`'{550e8400-e29b-41d4-a716-446655440000}'::uuid[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('corner cases', async () => {
	const moodEnum = cockroachEnum('mood_enum', [
		'sad',
		'ok',
		'happy',
		`text'text"`,
		`no,''"\`rm`,
		`mo''",\`}{od`,
		'mo,\`od',
	]);
	const pre = { moodEnum };

	const res6 = await diffDefault(
		_,
		moodEnum().array().default([`text'text"`]),
		`'{"text''text\\\""}'::"mood_enum"[]`,
		pre,
	);
	const res60 = await diffDefault(
		_,
		moodEnum().array().default([`text'text"`, 'ok']),
		`'{"text''text\\\"",ok}'::"mood_enum"[]`,
		pre,
	);

	const res7 = await diffDefault(
		_,
		moodEnum().array().default([`mo''",\`}{od`]),
		`'{"mo''''\\\",\`\}\{od"}'::"mood_enum"[]`,
		pre,
	);

	expect.soft(res6).toStrictEqual([]);
	expect.soft(res60).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);

	const res2 = await diffDefault(_, uuid().defaultRandom(), `gen_random_uuid()`);
	expect.soft(res2).toStrictEqual([]);

	const res3 = await diffDefault(_, uuid().array().default([]), `'{}'::uuid[]`);
	expect.soft(res3).toStrictEqual([]);

	const res_3 = await diffDefault(_, moodEnum().default(`mo''",\`}{od`), `'mo''''",\`}{od'::"mood_enum"`, pre);
	expect.soft(res_3).toStrictEqual([]);

	const res_2 = await diffDefault(_, moodEnum().default(`text'text"`), `'text''text"'::"mood_enum"`, pre);
	expect.soft(res_2).toStrictEqual([]);

	const res__14 = await diffDefault(
		_,
		text({ enum: ['one', 'two', 'three', `no,''"\`rm`, `mo''",\`}{od`, 'mo,\`od'] }).array()
			.default(
				[`mo''",\`}{od`],
			),
		`'{"mo''''\\\",\`\}\{od"}'::string[]`,
	);
	expect.soft(res__14).toStrictEqual([]);
});

test('bit + bit arrays', async () => {
	const res1 = await diffDefault(_, bit({ dimensions: 3 }).default(`101`), `'101'`);
	const res2 = await diffDefault(_, bit({ dimensions: 3 }).default(sql`'101'`), `'101'`);

	const res3 = await diffDefault(_, bit({ dimensions: 3 }).array().default([]), `'{}'::bit(3)[]`);
	const res4 = await diffDefault(_, bit({ dimensions: 3 }).array().default([`101`]), `'{101}'::bit(3)[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('vector + vector arrays', async () => {
	const res1 = await diffDefault(_, vector({ dimensions: 3 }).default([0, -2, 3]), `'[0,-2,3]'`);
	const res2 = await diffDefault(
		_,
		vector({ dimensions: 3 }).default([0, -2.123456789, 3.123456789]),
		`'[0,-2.1234567,3.1234567]'`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
});

// postgis extension
// SRID=4326 -> these coordinates are longitude/latitude values
test.todo('geometry + geometry arrays', async () => {
	const res1 = await diffDefault(
		_,
		geometry({ srid: 100, mode: 'tuple', type: 'point' }).default([30.5234, 50.4501]),
		`'SRID=4326;POINT(30.7233 46.4825)'`,
	);

	const res2 = await diffDefault(
		_,
		geometry({ srid: 4326, mode: 'xy', type: 'point' }).default({ x: 30.5234, y: 50.4501 }),
		`'SRID=4326;POINT(30.7233 46.4825)'`,
	);

	const res3 = await diffDefault(
		_,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).array().default([]),
		`'{}'::geometry(point, 4326)[]`,
	);
	const res4 = await diffDefault(
		_,
		geometry({ srid: 4326, mode: 'tuple', type: 'point' }).array().default([[30.5234, 50.4501]]),
		`'{"SRID=4326;POINT(30.7233 46.4825)"}'::geometry(point, 4326)[]`,
	);

	// const res5 = await diffDefault(
	// 	_,
	// 	geometry({ srid: 4326, mode: 'xy', type: 'point' }).array().default([]),
	// 	`'{}'::geometry(point, 4326)[]`,
	// );
	// const res6 = await diffDefault(
	// 	_,
	// 	geometry({ srid: 4326, mode: 'xy', type: 'point' }).array().default([{ x: 30.5234, y: 50.4501 }]),
	// 	`'{"SRID=4326;POINT(30.7233 46.4825)"}'::geometry(point, 4326)[]`,
	// );

	expect.soft(res1).toStrictEqual([]);
	// expect.soft(res2).toStrictEqual([]);
	// expect.soft(res3).toStrictEqual([]);
	// expect.soft(res4).toStrictEqual([]);
	// expect.soft(res5).toStrictEqual([]);
	// expect.soft(res6).toStrictEqual([]);
});
