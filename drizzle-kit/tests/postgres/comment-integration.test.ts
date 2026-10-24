import { comment as pgComment, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
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
		users: pgTable('users', {
			id: serial('id').primaryKey().comment('pk'),
		}, () => [pgComment('users table')]),
	};
	await push({ db, to: schema });
	const { sqlStatements } = await push({ db, to: schema });
	expect(sqlStatements).toStrictEqual([]);
});

test('grammar round-trip with comments', async () => {
	const schema = {
		users: pgTable('users', {
			id: serial('id').primaryKey().comment('pk'),
			name: text('name').notNull().comment('user name'),
		}, () => [pgComment('users table')]),
	};
	const { generateSqlStatements, ddlAfterPull } = await diffIntrospect(db, schema, 'comment-roundtrip');
	expect(generateSqlStatements).toStrictEqual([]);
	expect(ddlAfterPull.tables.one({ schema: 'public', name: 'users' })?.comment).toBe('users table');
	expect(ddlAfterPull.columns.one({ schema: 'public', table: 'users', name: 'id' })?.comment).toBe('pk');
	expect(ddlAfterPull.columns.one({ schema: 'public', table: 'users', name: 'name' })?.comment).toBe('user name');
});

test('push comment modification is idempotent', async () => {
	const s1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey().comment('old comment'),
		}),
	};
	const s2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey().comment('new comment'),
		}),
	};
	await push({ db, to: s1 });
	const { sqlStatements } = await push({ db, to: s2 });
	expect(sqlStatements).toStrictEqual(['COMMENT ON COLUMN "users"."id" IS \'new comment\';']);
	const { sqlStatements: s3 } = await push({ db, to: s2 });
	expect(s3).toStrictEqual([]);
});
