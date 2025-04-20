import { pgRole } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from '../mocks-postgres';

test('create role', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager'),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager";']);
});

test('create role with properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, inherit: false, createRole: true }),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager" WITH CREATEDB CREATEROLE NOINHERIT;']);
});

test('create role with some properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, inherit: false }),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager" WITH CREATEDB NOINHERIT;']);
});

test('drop role', async (t) => {
	const schema1 = { manager: pgRole('manager') };

	const schema2 = {};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['DROP ROLE "manager";']);
});

test('create and drop role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['DROP ROLE "manager";', 'CREATE ROLE "admin";']);
});

test('rename role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, ['manager->admin']);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" RENAME TO "admin";']);
});

test('alter all role field', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, createRole: true, inherit: false }),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH CREATEDB CREATEROLE NOINHERIT;']);
});

test('alter createdb in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createDb: true }),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH CREATEDB NOCREATEROLE INHERIT;']);
});

test('alter createrole in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createRole: true }),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH NOCREATEDB CREATEROLE INHERIT;']);
});

test('alter inherit in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { inherit: false }),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH NOCREATEDB NOCREATEROLE NOINHERIT;']);
});