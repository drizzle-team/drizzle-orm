import { blob, integer, numeric, real, text } from 'drizzle-orm/sqlite-core';
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

test('integer', async () => {
	const res1 = await diffDefault(_, integer({ mode: 'number' }).default(10), '10');
	const res2 = await diffDefault(_, integer({ mode: 'number' }).default(0), '0');
	const res3 = await diffDefault(_, integer({ mode: 'number' }).default(-10), '-10');
	const res4 = await diffDefault(_, integer({ mode: 'number' }).default(1e4), '10000');
	const res5 = await diffDefault(_, integer({ mode: 'number' }).default(-1e4), '-10000');

	const res6 = await diffDefault(_, integer({ mode: 'boolean' }).default(true), '1');
	const res7 = await diffDefault(_, integer({ mode: 'boolean' }).default(false), '0');

	const date = new Date('2025-05-23T12:53:53.115Z');
	const res8 = await diffDefault(_, integer({ mode: 'timestamp' }).default(date), `1748004833`);
	const res9 = await diffDefault(_, integer({ mode: 'timestamp_ms' }).default(date), `${date.getTime()}`);

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

test('text', async () => {
	const res1 = await diffDefault(_, text().default('text'), `('text')`);
	const res2 = await diffDefault(_, text().default("text'text"), `('text''text')`);
	// raw default sql for the line below: ('text''\text"')
	const res3 = await diffDefault(_, text().default('text\'\\text"'), `('text''\\text"')`);
	const res4 = await diffDefault(_, text({ enum: ['one', 'two', 'three'] }).default('one'), `('one')`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('real', async () => {
	const res1 = await diffDefault(_, real().default(1000.123), '1000.123');

	expect.soft(res1).toStrictEqual([]);
});

test.only('numeric', async () => {
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
	const res1 = await diffDefault(_, blob({ mode: 'buffer' }).default(Buffer.from('text')), `'text'`);
	const res2 = await diffDefault(_, blob({ mode: 'buffer' }).default(Buffer.from("text'text")), `'text''text'`);
	// raw default sql for the line below: ('text''\text"')
	const res3 = await diffDefault(_, blob({ mode: 'buffer' }).default(Buffer.from('text\'\\text"')), `'text''\\text"'`);

	const res4 = await diffDefault(_, blob({ mode: 'bigint' }).default(9223372036854775807n), "'9223372036854775807'");

	const res5 = await diffDefault(_, blob({ mode: 'json' }).default(9223372036854775807n), "'9223372036854775807'");
	const res6 = await diffDefault(_, blob({ mode: 'json' }).default({}), `'{}'`);
	const res7 = await diffDefault(_, blob({ mode: 'json' }).default([]), `'[]'`);
	const res8 = await diffDefault(_, blob({ mode: 'json' }).default([1, 2, 3]), `'[1,2,3]'`);
	const res9 = await diffDefault(_, blob({ mode: 'json' }).default({ key: 'value' }), `'{"key":"value"}'`);
	// raw default sql for the line below: '{"key":"val'\ue"}'
	const res10 = await diffDefault(_, blob({ mode: 'json' }).default({ key: "val'\\ue" }), `'{"key":"val''\\ue"}'`);

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
