import { int, mysqlSchema, mysqlTable } from 'drizzle-orm/mysql-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

// We don't manage databases(schemas) in MySQL with Drizzle Kit
test('add schema #1', async () => {
	const to = {
		devSchema: mysqlSchema('dev'),
	};

	const { statements } = await diff({}, to, []);

	expect(statements.length).toBe(0);
});

test('add schema #2', async () => {
	const from = {
		devSchema: mysqlSchema('dev'),
	};
	const to = {
		devSchema: mysqlSchema('dev'),
		devSchema2: mysqlSchema('dev2'),
	};

	const { statements } = await diff(from, to, []);

	expect(statements.length).toBe(0);
});

test('delete schema #1', async () => {
	const from = {
		devSchema: mysqlSchema('dev'),
	};

	const { statements } = await diff(from, {}, []);

	expect(statements.length).toBe(0);
});

test('delete schema #2', async () => {
	const from = {
		devSchema: mysqlSchema('dev'),
		devSchema2: mysqlSchema('dev2'),
	};
	const to = {
		devSchema: mysqlSchema('dev'),
	};

	const { statements } = await diff(from, to, []);

	expect(statements.length).toBe(0);
});

test('rename schema #1', async () => {
	const from = {
		devSchema: mysqlSchema('dev'),
	};
	const to = {
		devSchema2: mysqlSchema('dev2'),
	};

	const { statements } = await diff(from, to, ['dev->dev2']);

	expect(statements.length).toBe(0);
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

	const { statements } = await diff(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('add table to schema #1', async () => {
	const dev = mysqlSchema('dev');
	const from = {};
	const to = {
		dev,
		users: dev.table('users', {}),
	};

	const { statements } = await diff(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('add table to schema #2', async () => {
	const dev = mysqlSchema('dev');
	const from = { dev };
	const to = {
		dev,
		users: dev.table('users', {}),
	};

	const { statements } = await diff(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('add table to schema #3', async () => {
	const dev = mysqlSchema('dev');
	const from = { dev };
	const to = {
		dev,
		usersInDev: dev.table('users', {}),
		users: mysqlTable('users', { id: int() }),
	};

	const { sqlStatements } = await diff(from, to, ['dev1->dev2']);

	expect(sqlStatements).toStrictEqual(['CREATE TABLE `users` (\n\t`id` int\n);\n']);
});

test('remove table from schema #1', async () => {
	const dev = mysqlSchema('dev');
	const from = { dev, users: dev.table('users', {}) };
	const to = {
		dev,
	};

	const { statements } = await diff(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('remove table from schema #2', async () => {
	const dev = mysqlSchema('dev');
	const from = { dev, users: dev.table('users', {}) };
	const to = {};

	const { statements } = await diff(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});
