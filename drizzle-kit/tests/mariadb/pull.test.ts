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
