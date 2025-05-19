import { sql } from 'drizzle-orm';
import { integer, pgPolicy, pgRole, pgSchema, pgTable } from 'drizzle-orm/pg-core';
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
				on: undefined,
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
				on: undefined,
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
				on: undefined,
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
				on: undefined,
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
			newData: 'test--PERMISSIVE--ALL--current_role--undefined--undefined--undefined',
			oldData: 'test--PERMISSIVE--ALL--public--undefined--undefined--undefined',
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
			newData: 'test--PERMISSIVE--ALL--public--true--undefined--undefined',
			oldData: 'test--PERMISSIVE--ALL--public--undefined--undefined--undefined',
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
			newData: 'test--PERMISSIVE--ALL--public--undefined--true--undefined',
			oldData: 'test--PERMISSIVE--ALL--public--undefined--undefined--undefined',
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
				on: undefined,
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
				on: undefined,
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
				on: undefined,
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
				on: undefined,
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
				on: undefined,
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
				on: undefined,
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
				on: undefined,
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
				on: undefined,
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
		'CREATE TABLE "users2" (\n\t"id" integer PRIMARY KEY NOT NULL\n);\n',
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
			checkConstraints: [],
			compositePkName: '',
			policies: [
				'test--PERMISSIVE--ALL--public--undefined--undefined--undefined',
			],
			schema: '',
			tableName: 'users2',
			isRLSEnabled: false,
			type: 'create_table',
			uniqueConstraints: [],
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: [
					'public',
				],
				on: undefined,
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users2',
			type: 'create_policy',
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
		'DROP TABLE "users2" CASCADE;',
	]);
	expect(statements).toStrictEqual([
		{
			policies: [
				'test--PERMISSIVE--ALL--public--undefined--undefined--undefined',
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
				on: undefined,
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

test('create table with rls enabled', async (t) => {
	const schema1 = {};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY NOT NULL\n);
`,
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
	]);
});

test('enable rls force', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;']);
});

test('disable rls force', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;']);
});

test('drop policy with enabled rls', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { to: ['current_role', role] }),
		})).enableRLS(),
	};

	const role = pgRole('manager').existing();

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
	]);
});

test('add policy with enabled rls', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}).enableRLS(),
	};

	const role = pgRole('manager').existing();

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { to: ['current_role', role] }),
		})).enableRLS(),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_role, "manager";',
	]);
});

test('add policy + link table', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
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
				on: undefined,
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});

test('link table', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
		rls: pgPolicy('test', { as: 'permissive' }),
	};

	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
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
				on: undefined,
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});

test('unlink table', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }),
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
				on: undefined,
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
	]);
});

test('drop policy with link', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
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
				on: undefined,
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
	]);
});

test('add policy in table and with link table', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	}, () => [
		pgPolicy('test1', { to: 'current_user' }),
	]);

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test1" ON "users" AS PERMISSIVE FOR ALL TO current_user;',
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
				name: 'test1',
				to: ['current_user'],
				on: undefined,
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
				using: undefined,
				on: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});

test('link non-schema table', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {};

	const schema2 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE POLICY "test" ON "public"."users" AS PERMISSIVE FOR ALL TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: '"public"."users"',
				to: [
					'public',
				],
				using: undefined,
				withCheck: undefined,
			},
			tableName: '"public"."users"',
			type: 'create_ind_policy',
		},
	]);
});

test('unlink non-schema table', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('test', { as: 'permissive' }),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "public"."users" CASCADE;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: '"public"."users"',
				to: [
					'public',
				],
				using: undefined,
				withCheck: undefined,
			},
			tableName: '"public"."users"',
			type: 'drop_ind_policy',
		},
	]);
});

test('add policy + link non-schema table', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const cities = pgTable('cities', {
		id: integer('id').primaryKey(),
	});

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test2'),
		]),
		rls: pgPolicy('test', { as: 'permissive' }).link(cities),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test2" ON "users" AS PERMISSIVE FOR ALL TO public;',
		'CREATE POLICY "test" ON "public"."cities" AS PERMISSIVE FOR ALL TO public;',
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
				name: 'test2',
				on: undefined,
				to: [
					'public',
				],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: '"public"."cities"',
				to: [
					'public',
				],
				using: undefined,
				withCheck: undefined,
			},
			tableName: '"public"."cities"',
			type: 'create_ind_policy',
		},
	]);
});

test('add policy + link non-schema table from auth schema', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const authSchema = pgSchema('auth');

	const cities = authSchema.table('cities', {
		id: integer('id').primaryKey(),
	});

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test2'),
		]),
		rls: pgPolicy('test', { as: 'permissive' }).link(cities),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test2" ON "users" AS PERMISSIVE FOR ALL TO public;',
		'CREATE POLICY "test" ON "auth"."cities" AS PERMISSIVE FOR ALL TO public;',
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
				name: 'test2',
				on: undefined,
				to: [
					'public',
				],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: '"auth"."cities"',
				to: [
					'public',
				],
				using: undefined,
				withCheck: undefined,
			},
			tableName: '"auth"."cities"',
			type: 'create_ind_policy',
		},
	]);
});

test('rename policy that is linked', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('newName', { as: 'permissive' }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, [
		'"public"."users".test->"public"."users".newName',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "public"."users" RENAME TO "newName";',
	]);
	expect(statements).toStrictEqual([
		{
			newName: 'newName',
			oldName: 'test',
			tableKey: '"public"."users"',
			type: 'rename_ind_policy',
		},
	]);
});

test('alter policy that is linked', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('test', { as: 'permissive', to: 'current_role' }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "public"."users" TO current_role;',
	]);
	expect(statements).toStrictEqual([
		{
			newData: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: '"public"."users"',
				to: [
					'current_role',
				],
				using: undefined,
				withCheck: undefined,
			},
			oldData: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: '"public"."users"',
				to: [
					'public',
				],
				using: undefined,
				withCheck: undefined,
			},
			type: 'alter_ind_policy',
		},
	]);
});

test('alter policy that is linked: withCheck', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive', withCheck: sql`true` }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('test', { as: 'permissive', withCheck: sql`false` }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "public"."users" TO public WITH CHECK (false);',
	]);
	expect(statements).toStrictEqual([
		{
			newData: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: '"public"."users"',
				to: [
					'public',
				],
				using: undefined,
				withCheck: 'false',
			},
			oldData: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: '"public"."users"',
				to: [
					'public',
				],
				using: undefined,
				withCheck: 'true',
			},
			type: 'alter_ind_policy',
		},
	]);
});

test('alter policy that is linked: using', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive', using: sql`true` }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('test', { as: 'permissive', using: sql`false` }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "public"."users" TO public USING (false);',
	]);
	expect(statements).toStrictEqual([
		{
			newData: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: '"public"."users"',
				to: [
					'public',
				],
				using: 'false',
				withCheck: undefined,
			},
			oldData: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: '"public"."users"',
				to: [
					'public',
				],
				using: 'true',
				withCheck: undefined,
			},
			type: 'alter_ind_policy',
		},
	]);
});

test('alter policy that is linked: using', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		rls: pgPolicy('test', { for: 'insert' }).link(users),
	};

	const schema2 = {
		rls: pgPolicy('test', { for: 'delete' }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "public"."users" CASCADE;',
		'CREATE POLICY "test" ON "public"."users" AS PERMISSIVE FOR DELETE TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'INSERT',
				name: 'test',
				on: '"public"."users"',
				to: [
					'public',
				],
				using: undefined,
				withCheck: undefined,
			},
			tableName: '"public"."users"',
			type: 'drop_ind_policy',
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'DELETE',
				name: 'test',
				on: '"public"."users"',
				to: [
					'public',
				],
				using: undefined,
				withCheck: undefined,
			},
			tableName: '"public"."users"',
			type: 'create_ind_policy',
		},
	]);
});

////

test('alter policy in the table', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive' }),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', to: 'current_role' }),
		]),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO current_role;',
	]);
	expect(statements).toStrictEqual([
		{
			newData: 'test--PERMISSIVE--ALL--current_role--undefined--undefined--undefined',
			oldData: 'test--PERMISSIVE--ALL--public--undefined--undefined--undefined',
			schema: '',
			tableName: 'users',
			type: 'alter_policy',
		},
	]);
});

test('alter policy in the table: withCheck', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', withCheck: sql`true` }),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', withCheck: sql`false` }),
		]),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO public WITH CHECK (false);',
	]);
	expect(statements).toStrictEqual([
		{
			newData: 'test--PERMISSIVE--ALL--public--undefined--false--undefined',
			oldData: 'test--PERMISSIVE--ALL--public--undefined--true--undefined',
			schema: '',
			tableName: 'users',
			type: 'alter_policy',
		},
	]);
});

test('alter policy in the table: using', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', using: sql`true` }),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { as: 'permissive', using: sql`false` }),
		]),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO public USING (false);',
	]);
	expect(statements).toStrictEqual([
		{
			newData: 'test--PERMISSIVE--ALL--public--false--undefined--undefined',
			oldData: 'test--PERMISSIVE--ALL--public--true--undefined--undefined',
			schema: '',
			tableName: 'users',
			type: 'alter_policy',
		},
	]);
});

test('alter policy in the table: using', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { for: 'insert' }),
		]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, (t) => [
			pgPolicy('test', { for: 'delete' }),
		]),
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
				for: 'INSERT',
				name: 'test',
				on: undefined,
				to: [
					'public',
				],
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
				on: undefined,
				to: [
					'public',
				],
				using: undefined,
				withCheck: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});
