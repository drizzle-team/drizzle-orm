import { sql } from 'drizzle-orm';
import {
	binary,
	boolean,
	char,
	int,
	json,
	MySqlColumnBuilder,
	mysqlTable,
	text,
	timestamp,
	varchar,
} from 'drizzle-orm/mysql-core';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import { ddlDiffDry } from 'src/dialects/mysql/diff';
import { defaultFromColumn } from 'src/dialects/mysql/drizzle';
import { defaultToSQL } from 'src/dialects/mysql/grammar';
import { fromDatabase } from 'src/dialects/mysql/introspect';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { drizzleToDDL, prepareTestDatabase, TestDatabase } from './mocks';

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

const cases = [
	[int().default(10), '10', 'number'],
	[int().default(0), '0', 'number'],
	[int().default(-10), '-10', 'number'],
	[int().default(1e4), '10000', 'number'],
	[int().default(-1e4), '-10000', 'number'],

	// bools
	[boolean(), null, null, ''],
	[boolean().default(true), 'true', 'boolean'],
	[boolean().default(false), 'false', 'boolean'],
	[boolean().default(sql`true`), 'true', 'unknown'],

	// varchar
	[varchar({ length: 10 }).default('text'), 'text', 'string', `'text'`],
	[varchar({ length: 10 }).default("text'text"), "text'text", 'string', `'text''text'`],
	[varchar({ length: 10 }).default('text\'text"'), 'text\'text"', 'string', "'text''text\"'"],
	[varchar({ length: 10, enum: ['one', 'two', 'three'] }).default('one'), 'one', 'string', "'one'"],

	//
	[text().default('text'), 'text', 'text', `('text')`],
	[text().default("text'text"), "text'text", 'text', `('text''text')`],
	[text().default('text\'text"'), 'text\'text"', 'text', `('text''text"')`],
	[text({ enum: ['one', 'two', 'three'] }).default('one'), 'one', 'text', `('one')`],

	//
	[binary().default('binary'), 'binary', 'text', `('binary')`],
	[binary({ length: 10 }).default('binary'), 'binary', 'text', `('binary')`],
	[binary().default(sql`(lower('HELLO'))`), `(lower('HELLO'))`, 'unknown'],

	//
	[json().default({}), '{}', 'json', `('{}')`],
	[json().default([]), '[]', 'json', `('[]')`],
	[json().default([1, 2, 3]), '[1,2,3]', 'json', `('[1,2,3]')`],
	[json().default({ key: 'value' }), '{"key":"value"}', 'json', `('{"key":"value"}')`],
	[json().default({ key: "val'ue" }), '{"key":"val\'ue"}', 'json', `('{"key":"val''ue"}')`],

	[char({ length: 10 }).default('10'), '10', 'string', "'10'"],
	[timestamp().defaultNow(), '(now())', 'unknown', '(now())'],
] as const;

// TODO implement

const diffDefault = async <T extends MySqlColumnBuilder>(
	kit: TestDatabase,
	builder: T,
	expectedDefault: string,
): Promise<string[]> => [];

// TODO add tests for more types

test('int', async () => {
	// [int().default(10), '10', 'number'],
	// [int().default(0), '0', 'number'],
	// [int().default(-10), '-10', 'number'],
	// [int().default(1e4), '10000', 'number'],
	// [int().default(-1e4), '-10000', 'number'],

	const res1 = await diffDefault(_, int().default(10), '10');
	const res2 = await diffDefault(_, int().default(0), '0');
	const res3 = await diffDefault(_, int().default(-10), '-10');
	const res4 = await diffDefault(_, int().default(1e4), '10000');
	const res5 = await diffDefault(_, int().default(-1e4), '-10000');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('boolean', async () => {
	// // bools
	// [boolean(), null, null, ''],
	// [boolean().default(true), 'true', 'boolean'],
	// [boolean().default(false), 'false', 'boolean'],
	// [boolean().default(sql`true`), 'true', 'unknown'],

	const res1 = await diffDefault(_, boolean().default(true), 'true');
	const res2 = await diffDefault(_, boolean().default(false), 'false');
	const res3 = await diffDefault(_, boolean().default(sql`true`), 'true');

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('char', async () => {
	// char
	// [char({ length: 10 }).default('10'), '10', 'string', "'10'"],

	const res1 = await diffDefault(_, char({ length: 10 }).default('10'), `'10'`);
	const res2 = await diffDefault(_, char({ length: 10 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, char({ length: 10 }).default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, char({ length: 10, enum: ['one', 'two', 'three'] }).default('one'), `'one'`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('varchar', async () => {
	// varchar
	// [varchar({ length: 10 }).default('text'), 'text', 'string', `'text'`],
	// [varchar({ length: 10 }).default("text'text"), "text'text", 'string', `'text''text'`],
	// [varchar({ length: 10 }).default('text\'text"'), 'text\'text"', 'string', "'text''text\"'"],
	// [varchar({ length: 10, enum: ['one', 'two', 'three'] }).default('one'), 'one', 'string', "'one'"],

	const res1 = await diffDefault(_, varchar({ length: 10 }).default('text'), `'text'`);
	const res2 = await diffDefault(_, varchar({ length: 10 }).default("text'text"), `'text''text'`);
	const res3 = await diffDefault(_, varchar({ length: 10 }).default('text\'text"'), "'text''text\"'");
	const res4 = await diffDefault(_, varchar({ length: 10, enum: ['one', 'two', 'three'] }).default('one'), `'one'`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('text', async () => {
	// text
	// [text().default('text'), 'text', 'text', `('text')`],
	// [text().default("text'text"), "text'text", 'text', `('text''text')`],
	// [text().default('text\'text"'), 'text\'text"', 'text', `('text''text"')`],
	// [text({ enum: ['one', 'two', 'three'] }).default('one'), 'one', 'text', `('one')`],

	const res1 = await diffDefault(_, text().default('text'), `('text')`);
	const res2 = await diffDefault(_, text().default("text'text"), `('text''text')`);
	const res3 = await diffDefault(_, text().default('text\'text"'), `('text''text"')`);
	const res4 = await diffDefault(_, text({ enum: ['one', 'two', 'three'] }).default('one'), `('one')`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
});

test('binary', async () => {
	// 	// binary
	// [binary().default('binary'), 'binary', 'text', `('binary')`],
	// [binary({ length: 10 }).default('binary'), 'binary', 'text', `('binary')`],
	// [binary().default(sql`(lower('HELLO'))`), `(lower('HELLO'))`, 'unknown'],

	const res1 = await diffDefault(_, binary().default('binary'), `('binary')`);
	const res2 = await diffDefault(_, binary({ length: 10 }).default('binary'), `('binary')`);
	const res3 = await diffDefault(_, binary().default(sql`(lower('HELLO'))`), `(lower('HELLO'))`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
});

test('json', async () => {
	// json
	// [json().default({}), '{}', 'json', `('{}')`],
	// [json().default([]), '[]', 'json', `('[]')`],
	// [json().default([1, 2, 3]), '[1,2,3]', 'json', `('[1,2,3]')`],
	// [json().default({ key: 'value' }), '{"key":"value"}', 'json', `('{"key":"value"}')`],
	// [json().default({ key: "val'ue" }), '{"key":"val\'ue"}', 'json', `('{"key":"val''ue"}')`],

	const res1 = await diffDefault(_, json().default({}), `('{}')`);
	const res2 = await diffDefault(_, json().default([]), `('[]')`);
	const res3 = await diffDefault(_, json().default([1, 2, 3]), `('[1,2,3]')`);
	const res4 = await diffDefault(_, json().default({ key: 'value' }), `('{"key":"value"}')`);
	const res5 = await diffDefault(_, json().default({ key: "val'ue" }), `('{"key":"val''ue"}')`);

	expect.soft(res1).toStrictEqual([]);
	expect.soft(res2).toStrictEqual([]);
	expect.soft(res3).toStrictEqual([]);
	expect.soft(res4).toStrictEqual([]);
	expect.soft(res5).toStrictEqual([]);
});

test('timestamp', async () => {
	// timestamp
	// [timestamp().defaultNow(), '(now())', 'unknown', '(now())'],

	const res1 = await diffDefault(_, timestamp().defaultNow(), `(now())`);

	expect.soft(res1).toStrictEqual([]);
});

const { c1, c2, c3 } = cases.reduce((acc, it) => {
	const l1 = (it[1] as string)?.length || 0;
	const l2 = (it[2] as string)?.length || 0;
	const l3 = (it[3] as string)?.length || 0;
	acc.c1 = l1 > acc.c1 ? l1 : acc.c1;
	acc.c2 = l2 > acc.c2 ? l2 : acc.c2;
	acc.c3 = l3 > acc.c3 ? l3 : acc.c3;
	return acc;
}, { c1: 0, c2: 0, c3: 0 });

for (const it of cases) {
	const [column, value, type] = it;
	const sql = it[3] || value;

	const paddedType = (type || '').padStart(c2, ' ');
	const paddedValue = (value || '').padStart(c1, ' ');
	const paddedSql = (sql || '').padEnd(c3, ' ');

	test(`default | ${paddedType} | ${paddedValue} | ${paddedSql}`, async () => {
		const t = mysqlTable('table', { column });
		const res = defaultFromColumn(t.column);

		expect.soft(res).toStrictEqual(value === null ? null : { value, type });
		expect.soft(defaultToSQL(res)).toStrictEqual(sql);

		const { ddl } = drizzleToDDL({ t });
		const { sqlStatements: init } = await ddlDiffDry(createDDL(), ddl);

		for (const statement of init) {
			await db.query(statement);
		}

		const { ddl: ddl2 } = interimToDDL(await fromDatabase(db, 'drizzle'));
		const { sqlStatements } = await ddlDiffDry(ddl2, ddl);

		expect.soft(sqlStatements).toStrictEqual([]);
	});
}
