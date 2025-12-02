import { mssqlSchema } from 'drizzle-orm/mssql-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
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

test('add schema #1', async () => {
	const to = {
		devSchema: mssqlSchema('dev'),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = ['CREATE SCHEMA [dev];\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add schema #2', async () => {
	const from = {
		devSchema: mssqlSchema('dev'),
	};
	const to = {
		devSchema: mssqlSchema('dev'),
		devSchema2: mssqlSchema('dev2'),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = ['CREATE SCHEMA [dev2];\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('delete schema #1', async () => {
	const from = {
		devSchema: mssqlSchema('dev'),
	};

	const { sqlStatements: st } = await diff(from, {}, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: {} });

	const st0 = ['DROP SCHEMA [dev];\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('delete schema #2', async () => {
	const from = {
		devSchema: mssqlSchema('dev'),
		devSchema2: mssqlSchema('dev2'),
	};
	const to = {
		devSchema: mssqlSchema('dev'),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = ['DROP SCHEMA [dev2];\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(pst);
});

// TODO add log to console that it is not possible?
test('rename schema #1', async () => {
	const from = {
		devSchema: mssqlSchema('dev'),
	};

	const to = {
		devSchema2: mssqlSchema('dev2'),
	};

	const { sqlStatements: st } = await diff(from, to, ['dev->dev2']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dev->dev2'], ignoreSubsequent: true });

	const st0 = [`/**
 * ⚠️ Renaming schemas is not supported in SQL Server (MSSQL),
 * and therefore is not supported in Drizzle ORM at this time
 * 
 * SQL Server does not provide a built-in command to rename a schema directly.
 * Workarounds involve creating a new schema and migrating objects manually
 */`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, ['dev1->dev2']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dev1->dev2'], ignoreSubsequent: true });

	const st0 = [`/**
 * ⚠️ Renaming schemas is not supported in SQL Server (MSSQL),
 * and therefore is not supported in Drizzle ORM at this time
 * 
 * SQL Server does not provide a built-in command to rename a schema directly.
 * Workarounds involve creating a new schema and migrating objects manually
 */`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
