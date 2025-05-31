import { mssqlSchema } from 'drizzle-orm/mssql-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('add schema #1', async () => {
	const to = {
		devSchema: mssqlSchema('dev'),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements).toStrictEqual(['CREATE SCHEMA [dev];\n']);
});

test('add schema #2', async () => {
	const from = {
		devSchema: mssqlSchema('dev'),
	};
	const to = {
		devSchema: mssqlSchema('dev'),
		devSchema2: mssqlSchema('dev2'),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual(['CREATE SCHEMA [dev2];\n']);
});

test('delete schema #1', async () => {
	const from = {
		devSchema: mssqlSchema('dev'),
	};

	const { sqlStatements } = await diff(from, {}, []);

	expect(sqlStatements).toStrictEqual(['DROP SCHEMA [dev];\n']);
});

test('delete schema #2', async () => {
	const from = {
		devSchema: mssqlSchema('dev'),
		devSchema2: mssqlSchema('dev2'),
	};
	const to = {
		devSchema: mssqlSchema('dev'),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual(['DROP SCHEMA [dev2];\n']);
});

test('rename schema #1', async () => {
	const from = {
		devSchema: mssqlSchema('dev'),
	};

	const to = {
		devSchema2: mssqlSchema('dev2'),
	};

	const { sqlStatements } = await diff(from, to, ['dev->dev2']);

	expect(sqlStatements).toStrictEqual([`/**
 * ⚠️ Renaming schemas is not supported in SQL Server (MSSQL),
 * and therefore is not supported in Drizzle ORM at this time
 * 
 * SQL Server does not provide a built-in command to rename a schema directly.
 * Workarounds involve creating a new schema and migrating objects manually
 */`]);
});

test('rename schema #2', async () => {
	const from = {
		devSchema: mssqlSchema('dev'),
		devSchema1: mssqlSchema('dev1'),
	};
	const to = {
		devSchema: mssqlSchema('dev'),
		devSchema2: mssqlSchema('dev2'),
	};

	const { sqlStatements } = await diff(from, to, ['dev1->dev2']);

	expect(sqlStatements).toStrictEqual([`/**
 * ⚠️ Renaming schemas is not supported in SQL Server (MSSQL),
 * and therefore is not supported in Drizzle ORM at this time
 * 
 * SQL Server does not provide a built-in command to rename a schema directly.
 * Workarounds involve creating a new schema and migrating objects manually
 */`]);
});
