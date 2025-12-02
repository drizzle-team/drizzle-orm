import { int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { Decimal, parseEnum } from 'src/dialects/mysql/grammar';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diffIntrospect, prepareTestDatabase, TestDatabase } from './mocks';

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

if (!fs.existsSync('tests/mysql/tmp')) {
	fs.mkdirSync('tests/mysql/tmp', { recursive: true });
}

test('enum', () => {
	expect(parseEnum("enum('one','two','three')")).toStrictEqual(['one', 'two', 'three']);
});

test('numeric|decimal', () => {
	expect.soft(Decimal.is('decimal')).true;
	expect.soft(Decimal.is('numeric')).true;
	expect.soft(Decimal.is('decimal(7)')).true;
	expect.soft(Decimal.is('numeric(7)')).true;
	expect.soft(Decimal.is('decimal (7)')).true;
	expect.soft(Decimal.is('numeric (7)')).true;
	expect.soft(Decimal.is('decimal(7, 4)')).true;
	expect.soft(Decimal.is('decimal(7, 0)')).true;
	expect.soft(Decimal.is('decimal(7, 0) ZEROFILL')).true;
	expect.soft(Decimal.is('decimal(7, 0) unsigned')).true;
	expect.soft(Decimal.is('DECIMAL(7, 0) UNSIGNED')).true;
	expect.soft(Decimal.is('DECIMAL(7, 0) UNSIGNED ZEROFILL')).true;
});

test('column name + options', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			sortKey: varchar('sortKey__!@#', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'default-value-varchar');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
