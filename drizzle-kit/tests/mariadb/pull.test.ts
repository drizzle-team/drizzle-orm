import 'dotenv/config';
import { int, mysqlTable, serial, varchar } from 'drizzle-orm/mysql-core';
import * as fs from 'fs';
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

if (!fs.existsSync('tests/mariadb/tmp')) {
	fs.mkdirSync('tests/mariadb/tmp', { recursive: true });
}

test('introspect primary keys', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 255 }),
			age: int('age'),
		}),
	};

	const { ddlAfterPull } = await diffIntrospect(db, schema, 'primary-keys');

	expect(ddlAfterPull.pks.list()).toStrictEqual([{
		entityType: 'pks',
		table: 'users',
		name: 'PRIMARY',
		columns: ['id'],
	}]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/6491
// Unlike MySQL, MariaDB returns the text of an expression in information_schema without extra escapes
test('introspect generated column and default expression with a string literal', async () => {
	await db.query(
		"create table `users` (`name` varchar(100), `label` varchar(120) generated always as (concat(`name`, 'x', 'a\\\\b')) stored, `b` text default (concat('a\\\\b', 'c')));",
	);

	const { sqlStatements, ddlAfterPull } = await diffIntrospect(db, {}, 'generated-and-default-with-string-literal');

	expect(sqlStatements).toStrictEqual([]);
	expect(ddlAfterPull.columns.one({ table: 'users', name: 'label' })?.generated?.as).toBe(
		"concat(`name`,'x','a\\\\b')",
	);
	expect(ddlAfterPull.columns.one({ table: 'users', name: 'b' })?.default).toBe("concat('a\\\\b','c')");
});
