import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	char,
	date,
	doublePrecision,
	integer,
	interval,
	json,
	jsonb,
	line,
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

const moodEnum = pgEnum('mood_enum', ['sad', 'ok', 'happy']);

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
	const res2 = await diffDefault(_, numeric({ mode: 'bigint' }).default(9223372036854775807n), "'9223372036854775807'");
	const res3 = await diffDefault(_, numeric({ mode: 'number' }).default(9007199254740991), '9007199254740991');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('numeric arrays', async () => {
	const res1 = await diffDefault(_, numeric().array().default([]), "'{}'::numeric[]");
	const res2 = await diffDefault(_, numeric().array().default(['10.123', '123.10']), "'{10.123,123.10}'::numeric[]");
	const res3 = await diffDefault(
		_,
		numeric({ mode: 'number' }).array().default([10.123, 123.10]),
		"'{10.123,123.1}'::numeric[]", // .1 due to number->string conversion
	);
	const res4 = await diffDefault(
		_,
		numeric({ mode: 'bigint' }).array().default([9223372036854775807n, 9223372036854775806n]),
		"'{9223372036854775807,9223372036854775806}'::numeric[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('real + real arrays', async () => {
	const res1 = await diffDefault(_, real().default(1000.123), '1000.123');
	const res2 = await diffDefault(_, real().array().default([1000.123]), `'{1000.123}'::real[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
});

test('doublePrecision + doublePrecision arrays', async () => {
	const res1 = await diffDefault(_, doublePrecision().default(10000.123), '10000.123');
	const res2 = await diffDefault(_, doublePrecision().array().default([]), `'{}'::double precision[]`);
	const res3 = await diffDefault(
		_,
		doublePrecision().array().default([10000.123]),
		`'{10000.123}'::double precision[]`,
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

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('char + char arrays', async () => {
	const res1 = await diffDefault(_, char({ length: 256 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, char({ length: 256 }).array().default([]), `'{}'::char(256)[]`);
	const res3 = await diffDefault(_, char({ length: 256 }).array().default(['text']), `'{"text"}'::char(256)[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('varchar + varchar arrays', async () => {
	const res1 = await diffDefault(_, varchar({ length: 10 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, varchar({ length: 10 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, varchar({ length: 10 }).default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, varchar({ length: 10, enum: ['one', 'two', 'three'] }).default('one'), "'one'");

	const res5 = await diffDefault(_, varchar({ length: 10 }).array().default([]), `'{}'::varchar(10)[]`);
	const res6 = await diffDefault(_, varchar({ length: 10 }).array(1).default(['text']), `'{"text"}'::varchar(10)[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('text + text arrays', async () => {
	const res1 = await diffDefault(_, text().default('text'), `'text'`);
	const res2 = await diffDefault(_, text().default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, text().default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, text({ enum: ['one', 'two', 'three'] }).default('one'), "'one'");

	const res5 = await diffDefault(_, text().array().default([]), `'{}'::text[]`);
	const res6 = await diffDefault(_, text().array(1).default(['text']), `'{"text"}'::text[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('json + json arrays', async () => {
	const res1 = await diffDefault(_, json().default({}), `'{}'`);
	const res2 = await diffDefault(_, json().default([]), `'[]'`);
	const res3 = await diffDefault(_, json().default([1, 2, 3]), `'[1,2,3]'`);
	const res4 = await diffDefault(_, json().default({ key: 'value' }), `'{"key":"value"}'`);
	const res5 = await diffDefault(_, json().default({ key: "val'ue" }), `'{"key":"val''ue"}'`);

	const res6 = await diffDefault(_, json().array().default([]), `'{}'::json[]`);
	const res7 = await diffDefault(
		_,
		json().array().default([{ key: 'value' }]),
		`'{\"{\\\"key\\\":\\\"value\\\"}\"}'::json[]`,
	);
	const res8 = await diffDefault(
		_,
		json().array().default([{ key: "val'ue" }]),
		`'{\"{\\\"key\\\":\\\"val''ue\\\"}\"}'::json[]`,
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

test('jsonb + jsonb arrays', async () => {
	const res1 = await diffDefault(_, jsonb().default({}), `'{}'`);
	const res2 = await diffDefault(_, jsonb().default([]), `'[]'`);
	const res3 = await diffDefault(_, jsonb().default([1, 2, 3]), `'[1,2,3]'`);
	const res4 = await diffDefault(_, jsonb().default({ key: 'value' }), `'{"key":"value"}'`);
	const res5 = await diffDefault(_, jsonb().default({ key: "val'ue" }), `'{"key":"val''ue"}'`);

	const res6 = await diffDefault(_, jsonb().array().default([]), `'{}'::jsonb[]`);
	const res7 = await diffDefault(
		_,
		jsonb().array().default([{ key: 'value' }]),
		`'{\"{\\\"key\\\":\\\"value\\\"}\"}'::jsonb[]`,
	);
	const res8 = await diffDefault(
		_,
		jsonb().array().default([{ key: "val'ue" }]),
		`'{\"{\\\"key\\\":\\\"val''ue\\\"}\"}'::jsonb[]`,
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

test('timestamp + timestamp arrays', async () => {
	const res1 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).default(new Date('2025-05-23T12:53:53.115Z')),
		`'2025-05-23 12:53:53.115'`,
	);
	const res2 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).default('2025-05-23 12:53:53.115'),
		`'2025-05-23 12:53:53.115'`,
	);
	const res3 = await diffDefault(_, timestamp().defaultNow(), `now()`);

	const res4 = await diffDefault(_, timestamp({ mode: 'date' }).array().default([]), `'{}'::timestamp[]`);
	const res5 = await diffDefault(
		_,
		timestamp({ mode: 'date' }).array().default([new Date('2025-05-23T12:53:53.115Z')]),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);

	const res6 = await diffDefault(_, timestamp({ mode: 'string' }).array().default([]), `'{}'::timestamp[]`);
	const res7 = await diffDefault(
		_,
		timestamp({ mode: 'string' }).array().default(['2025-05-23 12:53:53.115']),
		`'{"2025-05-23 12:53:53.115"}'::timestamp[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
});

test('time + time arrays', async () => {
	const res1 = await diffDefault(_, time().default('15:50:33'), `'15:50:33'`);
	const res2 = await diffDefault(_, time().defaultNow(), `now()`);
	const res3 = await diffDefault(_, time().array().default([]), `'{}'::time[]`);
	const res4 = await diffDefault(_, time().array().default(['15:50:33']), `'{"15:50:33"}'::time[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('date + date arrays', async () => {
	const res1 = await diffDefault(_, date().default('2025-05-23'), `'2025-05-23'`);
	const res2 = await diffDefault(_, date().defaultNow(), `now()`);
	const res3 = await diffDefault(_, date().array().default([]), `'{}'::date[]`);
	const res4 = await diffDefault(_, date().array().default(['2025-05-23']), `'{"2025-05-23"}'::date[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('interval + interval arrays', async () => {
	const res1 = await diffDefault(_, interval().default('1 day'), `'1 day'`);
	const res2 = await diffDefault(_, interval().array().default([]), `'{}'::interval[]`);
	const res3 = await diffDefault(_, interval().array().default(['1 day']), `'{"1 day"}'::interval[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('point + point arrays', async () => {
	const res1 = await diffDefault(_, point({ mode: 'xy' }).default({ x: 1, y: 2 }), `'(1,2)'`);
	const res2 = await diffDefault(_, point({ mode: 'tuple' }).default([1, 2]), `'(1,2)'`);

	const res3 = await diffDefault(_, point({ mode: 'tuple' }).array().default([]), `'{}'::point[]`);
	const res4 = await diffDefault(_, point({ mode: 'tuple' }).array().default([[1, 2]]), `'{{"(1,2)"}}'::point[]`);

	const res5 = await diffDefault(_, point({ mode: 'xy' }).array().default([]), `'{}'::point[]`);
	const res6 = await diffDefault(_, point({ mode: 'xy' }).array().default([{ x: 1, y: 2 }]), `'{{"(1,2)"}}'::point[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
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

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});

test('enum + enum arrays', async () => {
	// TODO revise: provide a way to pass `moodEnum` into the `diffDefault` function.
	const res1 = await diffDefault(_, moodEnum().default('ok'), `'ok'`);
	const res2 = await diffDefault(_, moodEnum().array().default([]), `'{}'::mood_enum[]`);
	const res3 = await diffDefault(_, moodEnum().array().default(['ok']), `'{"ok"}'::mood_enum[]`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
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
		`'{"550e8400-e29b-41d4-a716-446655440000"}'::uuid[]`,
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});
