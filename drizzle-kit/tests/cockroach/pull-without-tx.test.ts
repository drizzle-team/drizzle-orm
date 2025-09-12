import { sql } from 'drizzle-orm';
import { cockroachPolicy, cockroachRole, cockroachTable, int4 } from 'drizzle-orm/cockroach-core';
import fs from 'fs';
import { DB } from 'src/utils';
import { diffIntrospect, prepareTestDatabase, TestDatabase } from 'tests/cockroach/mocks';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

// @vitest-environment-options {"max-concurrency":1}

if (!fs.existsSync('tests/cockroach/tmp')) {
	fs.mkdirSync(`tests/cockroach/tmp`, { recursive: true });
}

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	// TODO can be improved
	// these tests are failing when using "tx" in prepareTestDatabase
	_ = await prepareTestDatabase(false);
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('basic policy', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test')]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with "as"', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-as',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with CURRENT_USER role', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { to: 'current_user' })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-with-current-user-role',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with all fields except "using" and "with"', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive', for: 'all', to: ['root'] })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-all-fields',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with "using" and "with"', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { using: sql`true`, withCheck: sql`true` })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-using-withcheck',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { using: sql`true`, withCheck: sql`true` }), cockroachPolicy('newRls')]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'multiple-policies',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies with roles', async () => {
	await db.query(`CREATE ROLE new_manager;`);

	const schema = {
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
			},
			() => [
				cockroachPolicy('test', { using: sql`true`, withCheck: sql`true` }),
				cockroachPolicy('newRls', { to: ['root', 'new_manager'] }),
			],
		),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'multiple-policies-with-roles',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies with roles from schema', async () => {
	const usersRole = cockroachRole('user_role', { createRole: true });

	const schema = {
		usersRole,
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
			},
			() => [
				cockroachPolicy('test', { using: sql`true`, withCheck: sql`true` }),
				cockroachPolicy('newRls', { to: ['root', usersRole] }),
			],
		),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'multiple-policies-with-roles-from-schema',
		['public'],
		{ roles: { include: ['user_role'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
