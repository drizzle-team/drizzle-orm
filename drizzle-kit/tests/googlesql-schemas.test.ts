import { googlesqlSchema, googlesqlTable } from 'drizzle-orm/googlesql';
import { expect, test } from 'vitest';
import { diffTestSchemasGooglesql } from './schemaDiffer';

// We don't manage databases(schemas) in GoogleSQL with Drizzle Kit
test('add schema #1', async () => {
	const to = {
		devSchema: googlesqlSchema('dev'),
	};

	const { statements } = await diffTestSchemasGooglesql({}, to, []);

	expect(statements.length).toBe(0);
});

test('add schema #2', async () => {
	const from = {
		devSchema: googlesqlSchema('dev'),
	};
	const to = {
		devSchema: googlesqlSchema('dev'),
		devSchema2: googlesqlSchema('dev2'),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(0);
});

test('delete schema #1', async () => {
	const from = {
		devSchema: googlesqlSchema('dev'),
	};

	const { statements } = await diffTestSchemasGooglesql(from, {}, []);

	expect(statements.length).toBe(0);
});

test('delete schema #2', async () => {
	const from = {
		devSchema: googlesqlSchema('dev'),
		devSchema2: googlesqlSchema('dev2'),
	};
	const to = {
		devSchema: googlesqlSchema('dev'),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(0);
});

test('rename schema #1', async () => {
	const from = {
		devSchema: googlesqlSchema('dev'),
	};
	const to = {
		devSchema2: googlesqlSchema('dev2'),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, ['dev->dev2']);

	expect(statements.length).toBe(0);
});

test('rename schema #2', async () => {
	const from = {
		devSchema: googlesqlSchema('dev'),
		devSchema1: googlesqlSchema('dev1'),
	};
	const to = {
		devSchema: googlesqlSchema('dev'),
		devSchema2: googlesqlSchema('dev2'),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('add table to schema #1', async () => {
	const dev = googlesqlSchema('dev');
	const from = {};
	const to = {
		dev,
		users: dev.table('users', {}),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('add table to schema #2', async () => {
	const dev = googlesqlSchema('dev');
	const from = { dev };
	const to = {
		dev,
		users: dev.table('users', {}),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('add table to schema #3', async () => {
	const dev = googlesqlSchema('dev');
	const from = { dev };
	const to = {
		dev,
		usersInDev: dev.table('users', {}),
		users: googlesqlTable('users', {}),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: undefined,
		columns: [],
		internals: {
			tables: {},
			indexes: {},
		},
		compositePkName: '',
		compositePKs: [],
		checkConstraints: [],
	});
});

test('remove table from schema #1', async () => {
	const dev = googlesqlSchema('dev');
	const from = { dev, users: dev.table('users', {}) };
	const to = {
		dev,
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('remove table from schema #2', async () => {
	const dev = googlesqlSchema('dev');
	const from = { dev, users: dev.table('users', {}) };
	const to = {};

	const { statements } = await diffTestSchemasGooglesql(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});
