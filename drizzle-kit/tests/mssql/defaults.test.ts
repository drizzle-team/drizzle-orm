import { sql } from 'drizzle-orm';
import { binary, bit, char, int, mssqlTable, nchar, nText, nvarchar, text, varchar } from 'drizzle-orm/mssql-core';
import { createDDL, interimToDDL } from 'src/dialects/mssql/ddl';
import { ddlDiffDry } from 'src/dialects/mssql/diff';
import { defaultFromColumn } from 'src/dialects/mssql/drizzle';
import { defaultToSQL } from 'src/dialects/mssql/grammar';
import { fromDatabase } from 'src/dialects/mssql/introspect';
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
	[bit(), null, null, ''],
	[bit().default(true), 'true', 'boolean', '1'],
	[bit().default(false), 'false', 'boolean', '0'],
	[bit().default(sql`1`), '1', 'unknown', '1'],

	// varchar
	[varchar({ length: 10 }).default('text'), 'text', 'string', `'text'`],
	[varchar({ length: 10 }).default("text'text"), "text'text", 'string', `'text''text'`],
	[varchar({ length: 10 }).default('text\'text"'), 'text\'text"', 'string', "'text''text\"'"],
	[varchar({ length: 10, enum: ['one', 'two', 'three'] }).default('one'), 'one', 'string', "'one'"],

	// nvarchar
	[nvarchar({ length: 10 }).default('text'), 'text', 'string', `'text'`],
	[nvarchar({ length: 10 }).default("text'text"), "text'text", 'string', `'text''text'`],
	[nvarchar({ length: 10 }).default('text\'text"'), 'text\'text"', 'string', "'text''text\"'"],
	[nvarchar({ length: 10, enum: ['one', 'two', 'three'] }).default('one'), 'one', 'string', "'one'"],

	// text
	[text().default('text'), 'text', 'string', `'text'`],
	[text().default("text'text"), "text'text", 'string', `'text''text'`],
	[text().default('text\'text"'), 'text\'text"', 'string', `'text''text"'`],
	[text({ enum: ['one', 'two', 'three'] }).default('one'), 'one', 'string', `'one'`],

	// ntext
	[nText().default('text'), 'text', 'string', `'text'`],
	[nText().default("text'text"), "text'text", 'string', `'text''text'`],
	[nText().default('text\'text"'), 'text\'text"', 'string', `'text''text"'`],
	[nText({ enum: ['one', 'two', 'three'] }).default('one'), 'one', 'string', `'one'`],

	// TODO add more

	[char({ length: 10 }).default('10'), '10', 'string', "'10'"],
	[nchar({ length: 10 }).default('10'), '10', 'string', "'10'"],
	// [timestamp().defaultNow(), '(now())', 'unknown', '(now())'],
] as const;

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
	const sql = it[3] ?? value;

	const paddedType = (type || '').padStart(c2, ' ');
	const paddedValue = (value || '').padStart(c1, ' ');
	const paddedSql = (sql || '').padEnd(c3, ' ');

	test(`default | ${paddedType} | ${paddedValue} | ${paddedSql}`, async () => {
		const t = mssqlTable('table', { column });
		const res = defaultFromColumn(t.column);

		expect.soft(res).toStrictEqual(value === null ? null : { value, type });
		expect.soft(defaultToSQL(res)).toStrictEqual(sql);

		const { ddl } = drizzleToDDL({ t });
		const { sqlStatements: init } = await ddlDiffDry(createDDL(), ddl, 'default');

		for (const statement of init) {
			await db.query(statement);
		}

		const fromDb = await fromDatabase(db, undefined, (it: string) => it === 'dbo');
		const { ddl: ddl2 } = interimToDDL(fromDb);
		const { sqlStatements } = await ddlDiffDry(ddl2, ddl, 'default');

		expect.soft(sqlStatements).toStrictEqual([]);
	});
}
