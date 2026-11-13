import { comment as mysqlComment, int, mysqlTable, text } from 'drizzle-orm/mysql-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diffIntrospect, prepareTestDatabase, push, TestDatabase } from './mocks';

let _: TestDatabase;
let db: TestDatabase['db'];

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

test('push users with comments is idempotent', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id').autoincrement().primaryKey().comment('pk'),
		}, () => [mysqlComment('users table')]),
	};
	await push({ db, to: schema });
	const { sqlStatements } = await push({ db, to: schema });
	expect(sqlStatements).toStrictEqual([]);
});

test('grammar round-trip with comments', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id').autoincrement().primaryKey().comment('pk'),
			name: text('name').notNull().comment('user name'),
		}, () => [mysqlComment('users table')]),
	};
	const { sqlStatements } = await diffIntrospect(db, schema, 'comment-roundtrip');
	expect(sqlStatements).toStrictEqual([]);
});
