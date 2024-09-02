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
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			schema: '',
			tableName: 'users',
			type: 'enable_rls',
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
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
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
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
		'CREATE POLICY "newRls" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'newRls',
				to: ['public'],
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
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'oldRls',
				to: ['public'],
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
			rls: pgPolicy('test', { as: 'permissive', to: 'current_role' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO current_role;',
	]);
	expect(statements).toStrictEqual([
		{
			newData: 'test--PERMISSIVE--ALL--current_role--undefined--undefined',
			oldData: 'test--PERMISSIVE--ALL--public--undefined--undefined',
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
		'ALTER POLICY "test" ON "users" TO public USING (true);',
	]);
	expect(statements).toStrictEqual([
		{
			newData: 'test--PERMISSIVE--ALL--public--true--undefined',
			oldData: 'test--PERMISSIVE--ALL--public--undefined--undefined',
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
		'ALTER POLICY "test" ON "users" TO public WITH CHECK (true);',
	]);
	expect(statements).toStrictEqual([
		{
			newData: 'test--PERMISSIVE--ALL--public--undefined--true',
			oldData: 'test--PERMISSIVE--ALL--public--undefined--undefined',
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
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'RESTRICTIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
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
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'DELETE',
				name: 'test',
				to: ['public'],
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
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR INSERT TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'RESTRICTIVE',
				for: 'INSERT',
				name: 'test',
				to: ['public'],
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
			rls: pgPolicy('test', { as: 'restrictive', to: 'current_role', withCheck: sql`true` }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO current_role WITH CHECK (true);',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'SELECT',
				name: 'test',
				to: ['public'],
				using: 'true',
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'RESTRICTIVE',
				for: 'ALL',
				name: 'test',
				to: ['current_role'],
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
		'CREATE POLICY "test" ON "users2" AS PERMISSIVE FOR ALL TO public;',
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
				'test--PERMISSIVE--ALL--public--undefined--undefined',
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
				'test--PERMISSIVE--ALL--public--undefined--undefined',
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
			rls: pgPolicy('test', { to: ['current_role', role] }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_role, "manager";',
	]);
	expect(statements).toStrictEqual([
		{
			schema: '',
			tableName: 'users',
			type: 'enable_rls',
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: ['current_role', 'manager'],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});
