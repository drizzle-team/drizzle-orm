import { sql } from 'drizzle-orm';
import {
	foreignKey,
	index,
	int,
	mssqlSchema,
	mssqlTable,
	mssqlTableCreator,
	primaryKey,
	text,
	unique,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/mssql-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

fs.mkdirSync('./tests/mssql/migrations', { recursive: true });

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];
let client: TestDatabase['client'];

beforeAll(async () => {
	_ = await prepareTestDatabase(false);
	db = _.db;
	client = _.client;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('push after migrate with custom migrations table #1', async () => {
	const migrationsConfig = {
		schema: undefined,
		table: undefined,
	};

	const { migrate } = await import('drizzle-orm/node-mssql/migrator');
	const { drizzle } = await import('drizzle-orm/node-mssql');

	await migrate(drizzle({ client }), {
		migrationsSchema: migrationsConfig.schema,
		migrationsTable: migrationsConfig.table,
		migrationsFolder: './tests/mssql/migrations',
	});

	const to = {
		table: mssqlTable('table1', { col1: int() }),
	};

	const { sqlStatements: st2 } = await diff({}, to, []);
	const { sqlStatements: pst2 } = await push({ db, to, migrationsConfig });
	const expectedSt2 = [
		'CREATE TABLE [table1] (\n\t[col1] int\n);\n',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('push after migrate with custom migrations table #2', async () => {
	const migrationsConfig = {
		schema: undefined,
		table: 'migrations',
	};

	const { migrate } = await import('drizzle-orm/node-mssql/migrator');
	const { drizzle } = await import('drizzle-orm/node-mssql');
	await migrate(drizzle({ client }), {
		migrationsSchema: migrationsConfig.schema,
		migrationsTable: migrationsConfig.table,
		migrationsFolder: './tests/mssql/migrations',
	});

	const to = {
		table: mssqlTable('table1', { col1: int() }),
	};

	const { sqlStatements: st2 } = await diff({}, to, []);
	const { sqlStatements: pst2 } = await push({ db, to, migrationsConfig });
	const expectedSt2 = [
		'CREATE TABLE [table1] (\n\t[col1] int\n);\n',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('push after migrate with custom migrations table #3', async () => {
	const migrationsConfig = {
		schema: 'migrations_schema',
		table: undefined,
	};

	const { migrate } = await import('drizzle-orm/node-mssql/migrator');
	const { drizzle } = await import('drizzle-orm/node-mssql');
	await migrate(drizzle({ client }), {
		migrationsSchema: migrationsConfig.schema,
		migrationsTable: migrationsConfig.table,
		migrationsFolder: './tests/mssql/migrations',
	});

	const to = {
		table: mssqlTable('table1', { col1: int() }),
	};
	// TODO: test is not valid, because `push` doesn't know about migrationsTable
	const { sqlStatements: st2 } = await diff({}, to, []);
	const { sqlStatements: pst2 } = await push({ db, to, migrationsConfig });
	const expectedSt2 = [
		'CREATE TABLE [table1] (\n\t[col1] int\n);\n',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('push after migrate with custom migrations table #4', async () => {
	const migrationsConfig = {
		schema: 'migrations_schema',
		table: 'migrations',
	};

	const { migrate } = await import('drizzle-orm/node-mssql/migrator');
	const { drizzle } = await import('drizzle-orm/node-mssql');
	await migrate(drizzle({ client }), {
		migrationsSchema: migrationsConfig.schema,
		migrationsTable: migrationsConfig.table,
		migrationsFolder: './tests/mssql/migrations',
	});
	const to = {
		table: mssqlTable('table1', { col1: int() }),
	};

	const { sqlStatements: st2 } = await diff({}, to, []);
	const { sqlStatements: pst2 } = await push({ db, to, migrationsConfig });
	const expectedSt2 = [
		'CREATE TABLE [table1] (\n\t[col1] int\n);\n',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
