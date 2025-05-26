import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	char,
	date,
	decimal,
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

beforeEach(async () => {
	await _.clear();
});

const moodEnum = pgEnum('mood_enum', ['sad', 'ok', 'happy']);
const cases = [
	[real().default(1000.123), '1000.123', 'number'],
	[real().array(1).default([1000.123]), '{1000.123}', 'array', `'{1000.123}'::real[]`],
	[doublePrecision().default(10000.123), '10000.123', 'number'],
	[doublePrecision().array(1).default([10000.123]), '{10000.123}', 'array', `'{10000.123}'::double precision[]`],

	[boolean(), null, null, ''],
	[boolean().default(true), 'true', 'boolean'],
	[boolean().default(false), 'false', 'boolean'],
	[boolean().default(sql`true`), 'true', 'unknown'],
	[boolean().array(1).default([true]), '{true}', 'array', `'{true}'::boolean[]`],

	[char({ length: 256 }).default('text'), 'text', 'string', `'text'`],
	[char({ length: 256 }).array(1).default(['text']), '{"text"}', 'array', `'{"text"}'::char(256)[]`],

	[varchar({ length: 10 }).default('text'), 'text', 'string', `'text'`],
	[varchar({ length: 10 }).default("text'text"), "text'text", 'string', `'text''text'`],
	[varchar({ length: 10 }).default('text\'text"'), 'text\'text"', 'string', "'text''text\"'"],
	[varchar({ length: 10, enum: ['one', 'two', 'three'] }).default('one'), 'one', 'string', "'one'"],
	[varchar({ length: 10 }).array(1).default(['text']), '{"text"}', 'array', `'{"text"}'::varchar(10)[]`],

	[text().default('text'), 'text', 'string', `'text'`],
	[text().default("text'text"), "text'text", 'string', `'text''text'`],
	[text().default('text\'text"'), 'text\'text"', 'string', `'text''text"'`],
	[text({ enum: ['one', 'two', 'three'] }).default('one'), 'one', 'string', `'one'`],
	[text().array(1).default(['text']), '{"text"}', 'array', `'{"text"}'::text[]`],

	[json().default({}), '{}', 'json', `'{}'`],
	[json().default([]), '[]', 'json', `'[]'`],
	[json().default([1, 2, 3]), '[1,2,3]', 'json', `'[1,2,3]'`],
	[json().default({ key: 'value' }), '{"key":"value"}', 'json', `'{"key":"value"}'`],
	[json().default({ key: "val'ue" }), '{"key":"val\'ue"}', 'json', `'{"key":"val''ue"}'`],
	[json().array(1).default([{}]), '{"{}"}', 'array', `'{"{}"}'::json[]`],

	[jsonb().default({}), '{}', 'jsonb', `'{}'`],
	[jsonb().default([]), '[]', 'jsonb', `'[]'`],
	[jsonb().default([1, 2, 3]), '[1,2,3]', 'jsonb', `'[1,2,3]'`],
	[jsonb().default({ key: 'value' }), '{"key":"value"}', 'jsonb', `'{"key":"value"}'`],
	[jsonb().default({ key: "val'ue" }), '{"key":"val\'ue"}', 'jsonb', `'{"key":"val''ue"}'`],
	[jsonb().array(1).default([{}]), '{"{}"}', 'array', `'{"{}"}'::jsonb[]`],

	[
		timestamp().default(new Date('2025-05-23T12:53:53.115Z')),
		'2025-05-23 12:53:53.115',
		'string',
		`'2025-05-23 12:53:53.115'`,
	],
	[
		timestamp({ mode: 'string' }).default('2025-05-23 12:53:53.115'),
		'2025-05-23 12:53:53.115',
		'string',
		`'2025-05-23 12:53:53.115'`,
	],
	[timestamp().defaultNow(), 'now()', 'unknown', 'now()'],
	[
		timestamp().array(1).default([new Date('2025-05-23T12:53:53.115Z')]),
		'{"2025-05-23T12:53:53.115Z"}',
		'array',
		`'{"2025-05-23T12:53:53.115Z"}'::timestamp[]`,
	],

	[time().default('15:50:33'), '15:50:33', 'string', `'15:50:33'`],
	[time().defaultNow(), 'now()', 'unknown', `now()`],
	[time().array(1).default(['15:50:33']), '{"15:50:33"}', 'array', `'{"15:50:33"}'::time[]`],

	[date().default('2025-05-23'), '2025-05-23', 'string', `'2025-05-23'`],
	[date().defaultNow(), 'now()', 'unknown', 'now()'],
	[
		date().array(1).default(['2025-05-23']),
		'{"2025-05-23"}',
		'array',
		`'{"2025-05-23"}'::date[]`,
	],

	[interval('interval').default('1 day'), '1 day', 'string', `'1 day'`],
	[interval('interval').array(1).default(['1 day']), '{"1 day"}', 'array', `'{"1 day"}'::interval[]`],

	[point('point', { mode: 'xy' }).default({ x: 1, y: 2 }), '(1,2)', 'string', `'(1,2)'`],
	[point({ mode: 'tuple' }).default([1, 2]), '(1,2)', 'string', `'(1,2)'`],
	[point().array(1).default([[1, 2]]), '{{1,2}}', 'array', `'{{1,2}}'::point[]`],

	[line({ mode: 'abc' }).default({ a: 1, b: 2, c: 3 }), "'{1,2,3}'", 'unknown', `'{1,2,3}'`],
	[line({ mode: 'tuple' }).default([1, 2, 3]), "'{1,2,3}'", 'unknown', `'{1,2,3}'`],
	[
		line({ mode: 'abc' }).array().default([{ a: 1, b: 2, c: 3 }]),
		'{"{1,2,3}"}',
		'array',
		`'{"{1,2,3}"}'::line[]`,
	],
	[line({ mode: 'tuple' }).array(1).default([[1, 2, 3]]), '{"{1,2,3}"}', 'array', `'{"{1,2,3}"}'::line[]`],

	[moodEnum().default('ok'), 'ok', 'string', `'ok'`],
	[moodEnum().array(1).default(['ok']), '{"ok"}', 'array', `'{"ok"}'::mood_enum[]`],

	[
		uuid().default('550e8400-e29b-41d4-a716-446655440000'),
		'550e8400-e29b-41d4-a716-446655440000',
		'string',
		`'550e8400-e29b-41d4-a716-446655440000'`,
	],
	[uuid().defaultRandom(), 'gen_random_uuid()', 'unknown', `gen_random_uuid()`],
	[
		uuid().array(1).default(['550e8400-e29b-41d4-a716-446655440000']),
		'{"550e8400-e29b-41d4-a716-446655440000"}',
		'array',
		`'{"550e8400-e29b-41d4-a716-446655440000"}'::uuid[]`,
	],

	// smallint
	[smallint().array(1).default([10]), '{10}', 'array', `'{10}'::smallint[]`],

	// bigint
	// 2^63
	[
		bigint({ mode: 'bigint' }).array(1).default([BigInt('9223372036854775807')]),
		'{9223372036854775807}',
		'array',
		`'{9223372036854775807}'::bigint[]`,
	],
	// 2^53
	[
		bigint({ mode: 'number' }).array(1).default([9007199254740992]),
		'{9007199254740992}',
		'array',
		`'{9007199254740992}'::bigint[]`,
	],
] as const;

test('integer', async () => {
	const res1 = await diffDefault(_, integer(), 10, '10');
	const res2 = await diffDefault(_, integer(), 0, '0');
	const res3 = await diffDefault(_, integer(), -10, '-10');
	const res4 = await diffDefault(_, integer(), 1e4, '10000');
	const res5 = await diffDefault(_, integer(), -1e4, '-10000');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('integer arrays', async () => {
	const res1 = await diffDefault(_, integer().array(), [], "'{}'::integer[]");
	const res2 = await diffDefault(_, integer().array(), [10], "'{10}'::integer[]");
	const res3 = await diffDefault(_, integer().array().array(), [], "'{}'::integer[]");
	const res4 = await diffDefault(_, integer().array().array(), [[]], "'{}'::integer[]");
	const res5 = await diffDefault(_, integer().array().array(), [[1, 2]], "'{{1,2}}'::integer[]");
	const res6 = await diffDefault(_, integer().array().array(), [[1, 2], [1, 2]], "'{{1,2},{1,2}}'::integer[]");
	const res7 = await diffDefault(
		_,
		integer().array().array().array(),
		[[[1, 2]], [[1, 2]]],
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

test('small big', async () => {
	const res1 = await diffDefault(_, smallint(), 10, '10');
	const res2 = await diffDefault(_, bigint({ mode: 'bigint' }), 9223372036854775807n, "'9223372036854775807'");
	const res3 = await diffDefault(_, bigint({ mode: 'number' }), 9007199254740991, '9007199254740991');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('small big arrays', async () => {
	// TODO
});

test('numeric', async () => {
	const res1 = await diffDefault(_, numeric(), '10.123', "'10.123'");
	const res2 = await diffDefault(_, numeric({ mode: 'bigint' }), 9223372036854775807n, "'9223372036854775807'");
	const res3 = await diffDefault(_, numeric({ mode: 'number' }), 9007199254740991, '9007199254740991');

	const res4 = await diffDefault(_, numeric().array(), ['10.123', '123.10'], "'{10.123,123.10}'::numeric[]");
	const res5 = await diffDefault(
		_,
		numeric({ mode: 'number' }).array(),
		[10.123, 123.10],
		"'{10.123,123.1}'::numeric[]", // .1 due to number->string conversion
	);
	const res6 = await diffDefault(
		_,
		numeric({ mode: 'bigint' }).array(),
		[9223372036854775807n, 9223372036854775806n],
		"'{9223372036854775807,9223372036854775806}'::numeric[]",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
});
