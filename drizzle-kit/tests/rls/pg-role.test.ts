import { pgRole } from 'drizzle-orm/pg-core';
import { diffTestSchemas } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';

test('create role', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager'),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager";']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'create_role',
			values: {
				createDb: false,
				createRole: false,
				inherit: true,
			},
		},
	]);
});

test('create role with properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, inherit: false, createRole: true }),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager" WITH CREATEDB CREATEROLE NOINHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'create_role',
			values: {
				createDb: true,
				createRole: true,
				inherit: false,
			},
		},
	]);
});

test('create role with some properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, inherit: false }),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager" WITH CREATEDB NOINHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'create_role',
			values: {
				createDb: true,
				createRole: false,
				inherit: false,
			},
		},
	]);
});

test('drop role', async (t) => {
	const schema1 = { manager: pgRole('manager') };

	const schema2 = {};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['DROP ROLE "manager";']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'drop_role',
		},
	]);
});

test('create and drop role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['DROP ROLE "manager";', 'CREATE ROLE "admin";']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'drop_role',
		},
		{
			name: 'admin',
			type: 'create_role',
			values: {
				createDb: false,
				createRole: false,
				inherit: true,
			},
		},
	]);
});

test('rename role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, ['manager->admin']);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" RENAME TO "admin";']);
	expect(statements).toStrictEqual([
		{ nameFrom: 'manager', nameTo: 'admin', type: 'rename_role' },
	]);
});

test('alter all role field', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, createRole: true, inherit: false }),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH CREATEDB CREATEROLE NOINHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'alter_role',
			values: {
				createDb: true,
				createRole: true,
				inherit: false,
			},
		},
	]);
});

test('alter createdb in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createDb: true }),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH CREATEDB NOCREATEROLE INHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'alter_role',
			values: {
				createDb: true,
				createRole: false,
				inherit: true,
			},
		},
	]);
});

test('alter createrole in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createRole: true }),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH NOCREATEDB CREATEROLE INHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'alter_role',
			values: {
				createDb: false,
				createRole: true,
				inherit: true,
			},
		},
	]);
});

test('alter inherit in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { inherit: false }),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH NOCREATEDB NOCREATEROLE NOINHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'alter_role',
			values: {
				createDb: false,
				createRole: false,
				inherit: false,
			},
		},
	]);
});
