import { sql } from 'drizzle-orm';
import { cockroachPolicy, cockroachRole, cockroachTable, int4 } from 'drizzle-orm/cockroach-core';
import { diffIntrospect, test } from 'tests/cockroach/mocks';
import { expect } from 'vitest';

test('basic policy', async ({ db }) => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test')]),
	};

	const { pushStatements: statements, pushSqlStatements: sqlStatements, generateStatements, generateSqlStatements } =
		await diffIntrospect(
			db,
			schema,
			'basic-policy',
		);

	expect(statements.length).toBe(0);
	expect(generateStatements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(generateSqlStatements.length).toBe(0);
});

test('basic policy with "as"', async ({ db }) => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const { pushStatements: statements, pushSqlStatements: sqlStatements, generateStatements, generateSqlStatements } =
		await diffIntrospect(
			db,
			schema,
			'basic-policy-as',
		);

	expect(statements.length).toBe(0);
	expect(generateStatements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(generateSqlStatements.length).toBe(0);
});

test('basic policy with CURRENT_USER role', async ({ db }) => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { to: 'current_user' })]),
	};

	const { pushStatements: statements, pushSqlStatements: sqlStatements, generateStatements, generateSqlStatements } =
		await diffIntrospect(
			db,
			schema,
			'basic-policy-with-current-user-role',
		);

	expect(statements.length).toBe(0);
	expect(generateStatements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(generateSqlStatements.length).toBe(0);
});

test('basic policy with all fields except "using" and "with"', async ({ db }) => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive', for: 'all', to: ['root'] })]),
	};

	const { pushStatements: statements, pushSqlStatements: sqlStatements, generateStatements, generateSqlStatements } =
		await diffIntrospect(
			db,
			schema,
			'basic-policy-all-fields',
		);

	expect(statements.length).toBe(0);
	expect(generateStatements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(generateSqlStatements.length).toBe(0);
});

test('basic policy with "using" and "with"', async ({ db }) => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { using: sql`true`, withCheck: sql`true` })]),
	};

	const { pushStatements: statements, pushSqlStatements: sqlStatements, generateStatements, generateSqlStatements } =
		await diffIntrospect(
			db,
			schema,
			'basic-policy-using-withcheck',
		);

	expect(statements.length).toBe(0);
	expect(generateStatements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(generateSqlStatements.length).toBe(0);
});

test('multiple policies', async ({ db }) => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { using: sql`true`, withCheck: sql`true` }), cockroachPolicy('newRls')]),
	};

	const { pushStatements: statements, pushSqlStatements: sqlStatements, generateStatements, generateSqlStatements } =
		await diffIntrospect(
			db,
			schema,
			'multiple-policies',
		);

	expect(statements.length).toBe(0);
	expect(generateStatements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(generateSqlStatements.length).toBe(0);
});

test('multiple policies with roles', async ({ db }) => {
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

	const { pushStatements: statements, pushSqlStatements: sqlStatements, generateStatements, generateSqlStatements } =
		await diffIntrospect(
			db,
			schema,
			'multiple-policies-with-roles',
		);

	expect(statements.length).toBe(0);
	expect(generateStatements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(generateSqlStatements.length).toBe(0);
});

test('multiple policies with roles from schema', async ({ db }) => {
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

	const { pushStatements: statements, pushSqlStatements: sqlStatements, generateStatements, generateSqlStatements } =
		await diffIntrospect(
			db,
			schema,
			'multiple-policies-with-roles-from-schema',
			['public'],
			{ roles: { include: ['user_role'] } },
		);

	expect(statements.length).toBe(0);
	expect(generateStatements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(generateSqlStatements.length).toBe(0);
});
