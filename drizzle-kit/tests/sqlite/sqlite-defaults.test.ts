import { sql } from 'drizzle-orm';
import { blob, int, integer, numeric, real, text } from 'drizzle-orm/sqlite-core';
import { DB } from 'src/utils';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { diffDefault, prepareTestDatabase, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	_ = prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

// https://github.com/drizzle-team/drizzle-orm/issues/2085
// https://github.com/drizzle-team/drizzle-orm/issues/1406
// https://github.com/drizzle-team/drizzle-orm/issues/4217
test('integer', async () => {
	const res1 = await diffDefault(_, integer({ mode: 'number' }).default(10), '10');
	const res2 = await diffDefault(_, integer({ mode: 'number' }).default(0), '0');
	const res3 = await diffDefault(_, integer({ mode: 'number' }).default(-10), '-10');
	const res4 = await diffDefault(_, integer({ mode: 'number' }).default(1e4), '10000');
	const res5 = await diffDefault(_, integer({ mode: 'number' }).default(-1e4), '-10000');

	const res6 = await diffDefault(_, integer({ mode: 'boolean' }).default(true), 'true');
	const res7 = await diffDefault(_, integer({ mode: 'boolean' }).default(false), 'false');
	const res71 = await diffDefault(_, int({ mode: 'boolean' }).default(false), 'false');

	const date = new Date('2025-05-23T12:53:53.115Z');
	const res8 = await diffDefault(_, integer({ mode: 'timestamp' }).default(date), `1748004833`);
	const res9 = await diffDefault(_, integer({ mode: 'timestamp_ms' }).default(date), `${date.getTime()}`);
	// this test will fail in ci/cd due to different timezones
	// const res10 = await diffDefault(_, integer({ mode: 'timestamp_ms' }).default(new Date(2000, 1, 1)), `949356000000`);

	// const res11 = await diffDefault(
	// 	_,
	// 	integer({ mode: 'timestamp_ms' }).defaultNow(),
	// 	`(cast((julianday('now') - 2440587.5)*86400000 as integer))`,
	// );

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
	expect.soft(res6).toStrictEqual([]);
	expect.soft(res7).toStrictEqual([]);
	expect.soft(res71).toStrictEqual([]);
	expect.soft(res8).toStrictEqual([]);
	expect.soft(res9).toStrictEqual([]);
	// expect.soft(res10).toStrictEqual([]);
});

test('text', async () => {
	const res1 = await diffDefault(_, text().default('text'), `'text'`);
	const res2 = await diffDefault(_, text().default("text'text"), `'text''text'`);
	// raw default sql for the line below: ('text''\text"')
	const res3 = await diffDefault(_, text().default('text\'\\text"'), `'text''\\\\text"'`);
	const res4 = await diffDefault(_, text({ enum: ['one', 'two', 'three'] }).default('one'), `'one'`);
	const res5 = await diffDefault(_, text().default(sql`CURRENT_TIME`), 'CURRENT_TIME');
	const res6 = await diffDefault(_, text().default(sql`CURRENT_DATE`), 'CURRENT_DATE');
	const res7 = await diffDefault(_, text().default(sql`CURRENT_TIMESTAMP`), 'CURRENT_TIMESTAMP');
	const res8 = await diffDefault(_, text({ mode: 'json' }).default({ key: 'value' }), `'{"key":"value"}'`);
	const res9 = await diffDefault(
		_,
		text({ mode: 'json' }).default({ key: 9223372036854775807n }),
		`'{"key":9223372036854775807}'`,
	);
	const res10 = await diffDefault(
		_,
		text({ mode: 'json' }).default(sql`'{"key":9223372036854775807}'`),
		`'{"key":9223372036854775807}'`,
	);
	const res11 = await diffDefault(
		_,
		text({ mode: 'json' }).default([9223372036854775807n, 9223372036854775806n]),
		`'[9223372036854775807,9223372036854775806]'`,
	);
	const res12 = await diffDefault(
		_,
		text({ mode: 'json' }).default({ key: 'value\\\'"' }),
		`'{"key":"value\\\\''\\""}'`,
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

test('real', async () => {
	const res1 = await diffDefault(_, real().default(1000.123), '1000.123');
	expect.soft(res1).toStrictEqual([]);
});

test('numeric', async () => {
	const res1 = await diffDefault(_, numeric().default('10.123'), "'10.123'");
	const res2 = await diffDefault(_, numeric({ mode: 'bigint' }).default(9223372036854775807n), "'9223372036854775807'");
	const res3 = await diffDefault(_, numeric({ mode: 'number' }).default(9007199254740991), '9007199254740991');
	const res4 = await diffDefault(
		_,
		numeric({ mode: 'string' }).default('9223372036854775807'),
		"'9223372036854775807'",
	);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('blob', async () => {
	const res1 = await diffDefault(_, blob({ mode: 'buffer' }).default(Buffer.from('text')), `X'74657874'`);
	const res2 = await diffDefault(
		_,
		blob({ mode: 'buffer' }).default(Buffer.from("text'text")),
		`X'746578742774657874'`,
	);
	// raw default sql for the line below: ('text''\text"')
	const res3 = await diffDefault(
		_,
		blob({ mode: 'buffer' }).default(Buffer.from('text\'\\text"')),
		`X'74657874275C7465787422'`,
	);

	const res4 = await diffDefault(_, blob({ mode: 'bigint' }).default(9223372036854775807n), "'9223372036854775807'");

	const res5 = await diffDefault(_, blob({ mode: 'json' }).default(9223372036854775807n), "'9223372036854775807'");
	const res6 = await diffDefault(_, blob({ mode: 'json' }).default({}), `'{}'`);
	const res7 = await diffDefault(_, blob({ mode: 'json' }).default([]), `'[]'`);
	const res8 = await diffDefault(_, blob({ mode: 'json' }).default([1, 2, 3]), `'[1,2,3]'`);
	const res9 = await diffDefault(_, blob({ mode: 'json' }).default({ key: 'value' }), `'{"key":"value"}'`);
	// raw default sql for the line below: '{"key":"val'\ue"}'
	const res10 = await diffDefault(_, blob({ mode: 'json' }).default({ key: "val'\\ue" }), `'{"key":"val''\\\\ue"}'`);

	const res11 = await diffDefault(
		_,
		blob({ mode: 'json' }).default({ key: 9223372036854775807n }),
		`'{"key":9223372036854775807}'`,
	);
	const res12 = await diffDefault(
		_,
		blob({ mode: 'json' }).default(sql`'{"key":9223372036854775807}'`),
		`'{"key":9223372036854775807}'`,
	);
	const res13 = await diffDefault(
		_,
		blob({ mode: 'json' }).default([9223372036854775807n, 9223372036854775806n]),
		`'[9223372036854775807,9223372036854775806]'`,
	);
	const res14 = await diffDefault(
		_,
		blob({ mode: 'json' }).default({ key: 'value\\\'"' }),
		`'{"key":"value\\\\''\\""}'`,
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
