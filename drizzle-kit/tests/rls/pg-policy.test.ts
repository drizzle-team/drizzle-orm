import { sql } from 'drizzle-orm';
import { integer, pgPolicy, pgRole, pgTable } from 'drizzle-orm/pg-core';
import { diffTestSchemas } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';

test('add policy + enable rls', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO PUBLIC;',
	]);
	expect(statements).toStrictEqual([
		{
			schema: '',
			tableName: 'users',
			type: 'enable_rls',
		},
		{
			data: {
				as: 'permissive',
				for: 'all',
				name: 'test',
				to: ['PUBLIC'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});

test('drop policy + disable rls', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
		'DROP POLICY "test" ON "users" CASCADE;',
	]);
	expect(statements).toStrictEqual([
		{
			schema: '',
			tableName: 'users',
			type: 'disable_rls',
		},
		{
			data: {
				as: 'permissive',
				for: 'all',
				name: 'test',
				to: ['PUBLIC'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
	]);
});

test('add policy without enable rls', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
			newrls: pgPolicy('newRls'),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE POLICY "newRls" ON "users" AS PERMISSIVE FOR ALL TO PUBLIC;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'permissive',
				for: 'all',
				name: 'newRls',
				to: ['PUBLIC'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});

test('drop policy without disable rls', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
			oldRls: pgPolicy('oldRls'),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "oldRls" ON "users" CASCADE;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'permissive',
				for: 'all',
				name: 'oldRls',
				to: ['PUBLIC'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
	]);
});

test('alter policy without recreation: changing roles', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', to: 'CURRENT_ROLE' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO CURRENT_ROLE;',
	]);
	expect(statements).toStrictEqual([
		{
			newData: 'test--permissive--all--CURRENT_ROLE--undefined--undefined',
			oldData: 'test--permissive--all--PUBLIC--undefined--undefined',
			schema: '',
			tableName: 'users',
			type: 'alter_policy',
		},
	]);
});

test('alter policy without recreation: changing using', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', using: sql`true` }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO PUBLIC USING (true);',
	]);
	expect(statements).toStrictEqual([
		{
			newData: 'test--permissive--all--PUBLIC--true--undefined',
			oldData: 'test--permissive--all--PUBLIC--undefined--undefined',
			schema: '',
			tableName: 'users',
			type: 'alter_policy',
		},
	]);
});

test('alter policy without recreation: changing with check', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', withCheck: sql`true` }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO PUBLIC WITH CHECK (true);',
	]);
	expect(statements).toStrictEqual([
		{
			newData: 'test--permissive--all--PUBLIC--undefined--true',
			oldData: 'test--permissive--all--PUBLIC--undefined--undefined',
			schema: '',
			tableName: 'users',
			type: 'alter_policy',
		},
	]);
});

///

test('alter policy with recreation: changing as', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'restrictive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO PUBLIC;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'permissive',
				for: 'all',
				name: 'test',
				to: ['PUBLIC'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'restrictive',
				for: 'all',
				name: 'test',
				to: ['PUBLIC'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});

test('alter policy with recreation: changing for', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', for: 'delete' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO PUBLIC;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'permissive',
				for: 'all',
				name: 'test',
				to: ['PUBLIC'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'permissive',
				for: 'delete',
				name: 'test',
				to: ['PUBLIC'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});

test('alter policy with recreation: changing both "as" and "for"', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'restrictive', for: 'insert' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR INSERT TO PUBLIC;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'permissive',
				for: 'all',
				name: 'test',
				to: ['PUBLIC'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'restrictive',
				for: 'insert',
				name: 'test',
				to: ['PUBLIC'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});

test('alter policy with recreation: changing all fields', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', for: 'select', using: sql`true` }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'restrictive', to: 'CURRENT_ROLE', withCheck: sql`true` }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO CURRENT_ROLE WITH CHECK (true);',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'permissive',
				for: 'select',
				name: 'test',
				to: ['PUBLIC'],
				using: 'true',
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'restrictive',
				for: 'all',
				name: 'test',
				to: ['CURRENT_ROLE'],
				using: undefined,
				withCheck: 'true',
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});

test('rename policy', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('newName', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, [
		'public.users.test->public.users.newName',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" RENAME TO "newName";',
	]);
	expect(statements).toStrictEqual([
		{
			newName: 'newName',
			oldName: 'test',
			schema: '',
			tableName: 'users',
			type: 'rename_policy',
		},
	]);
});

test('rename policy in renamed table', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('newName', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, [
		'public.users->public.users2',
		'public.users2.test->public.users2.newName',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER POLICY "test" ON "users2" RENAME TO "newName";',
	]);
	expect(statements).toStrictEqual([
		{
			fromSchema: '',
			tableNameFrom: 'users',
			tableNameTo: 'users2',
			toSchema: '',
			type: 'rename_table',
		},
		{
			newName: 'newName',
			oldName: 'test',
			schema: '',
			tableName: 'users2',
			type: 'rename_policy',
		},
	]);
});

test('create table with a policy', async (t) => {
	const schema1 = {};

	const schema2 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "users2" (\n\t"id" integer PRIMARY KEY NOT NULL\n);\n',
		'ALTER TABLE "users2" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users2" AS PERMISSIVE FOR ALL TO PUBLIC;',
	]);
	expect(statements).toStrictEqual([
		{
			columns: [
				{
					name: 'id',
					notNull: true,
					primaryKey: true,
					type: 'integer',
				},
			],
			compositePKs: [],
			compositePkName: '',
			policies: [
				'test--permissive--all--PUBLIC--undefined--undefined',
			],
			schema: '',
			tableName: 'users2',
			type: 'create_table',
			uniqueConstraints: [],
		},
	]);
});

test('drop table with a policy', async (t) => {
	const schema1 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users2" CASCADE;',
		'DROP TABLE "users2";',
	]);
	expect(statements).toStrictEqual([
		{
			policies: [
				'test--permissive--all--PUBLIC--undefined--undefined',
			],
			schema: '',
			tableName: 'users2',
			type: 'drop_table',
		},
	]);
});

test('add policy with multiple "to" roles', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const role = pgRole('manager').existing();

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { to: ['CURRENT_ROLE', role] }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO CURRENT_ROLE, manager;',
	]);
	expect(statements).toStrictEqual([
		{
			schema: '',
			tableName: 'users',
			type: 'enable_rls',
		},
		{
			data: {
				as: 'permissive',
				for: 'all',
				name: 'test',
				to: ['CURRENT_ROLE', 'manager'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});
