import { int, mysqlSchema, mysqlTable } from 'drizzle-orm/mysql-core';
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

// We don't manage databases(schemas) in MySQL with Drizzle Kit
test('add schema #1', async () => {
	const to = {
		devSchema: mysqlSchema('dev'),
	};

	const { statements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add schema #2', async () => {
	const from = {
		devSchema: mysqlSchema('dev'),
	};
	const to = {
		devSchema: mysqlSchema('dev'),
		devSchema2: mysqlSchema('dev2'),
	};

	const { statements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('delete schema #1', async () => {
	const from = {
		devSchema: mysqlSchema('dev'),
	};

	const { statements: st } = await diff(from, {}, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: {} });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('delete schema #2', async () => {
	const from = {
		devSchema: mysqlSchema('dev'),
		devSchema2: mysqlSchema('dev2'),
	};
	const to = {
		devSchema: mysqlSchema('dev'),
	};

	const { statements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: {} });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename schema #1', async () => {
	const from = {
		devSchema: mysqlSchema('dev'),
	};
	const to = {
		devSchema2: mysqlSchema('dev2'),
	};

	const renames = ['dev->dev2'];
	const { statements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename schema #2', async () => {
	const from = {
		devSchema: mysqlSchema('dev'),
		devSchema1: mysqlSchema('dev1'),
	};
	const to = {
		devSchema: mysqlSchema('dev'),
		devSchema2: mysqlSchema('dev2'),
	};

	const renames = ['dev->dev2'];
	const { statements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table to schema #1', async () => {
	const dev = mysqlSchema('dev');
	const from = {};
	const to = {
		dev,
		users: dev.table('users', {}),
	};

	const renames = ['dev->dev2'];
	const { statements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table to schema #2', async () => {
	const dev = mysqlSchema('dev');
	const from = { dev };
	const to = {
		dev,
		users: dev.table('users', {}),
	};

	const renames = ['dev->dev2'];
	const { statements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table to schema #3', async () => {
	const dev = mysqlSchema('dev');
	const from = { dev };
	const to = {
		dev,
		usersInDev: dev.table('users', {}),
		users: mysqlTable('users', { id: int() }),
	};

	const renames = ['dev->dev2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['CREATE TABLE `users` (\n\t`id` int\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('remove table from schema #1', async () => {
	const dev = mysqlSchema('dev');
	const from = { dev, users: dev.table('users', {}) };
	const to = {
		dev,
	};

	const renames = ['dev->dev2'];
	const { statements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('remove table from schema #2', async () => {
	const dev = mysqlSchema('dev');
	const from = { dev, users: dev.table('users', {}) };
	const to = {};

	const renames = ['dev->dev2'];
	const { statements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
