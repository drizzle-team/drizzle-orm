import { singlestoreSchema, singlestoreTable } from 'drizzle-orm/singlestore-core';
import { expect, test } from 'vitest';
import { diffTestSchemasSingleStore } from './schemaDiffer';

// We don't manage databases(schemas) in MySQL with Drizzle Kit
test('add schema #1', async () => {
	const to = {
		devSchema: singlestoreSchema('dev'),
	};

	const { statements } = await diffTestSchemasSingleStore({}, to, []);

	expect(statements.length).toBe(0);
});

test('add schema #2', async () => {
	const from = {
		devSchema: singlestoreSchema('dev'),
	};
	const to = {
		devSchema: singlestoreSchema('dev'),
		devSchema2: singlestoreSchema('dev2'),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, []);

	expect(statements.length).toBe(0);
});

test('delete schema #1', async () => {
	const from = {
		devSchema: singlestoreSchema('dev'),
	};

	const { statements } = await diffTestSchemasSingleStore(from, {}, []);

	expect(statements.length).toBe(0);
});

test('delete schema #2', async () => {
	const from = {
		devSchema: singlestoreSchema('dev'),
		devSchema2: singlestoreSchema('dev2'),
	};
	const to = {
		devSchema: singlestoreSchema('dev'),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, []);

	expect(statements.length).toBe(0);
});

test('rename schema #1', async () => {
	const from = {
		devSchema: singlestoreSchema('dev'),
	};
	const to = {
		devSchema2: singlestoreSchema('dev2'),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, ['dev->dev2']);

	expect(statements.length).toBe(0);
});

test('rename schema #2', async () => {
	const from = {
		devSchema: singlestoreSchema('dev'),
		devSchema1: singlestoreSchema('dev1'),
	};
	const to = {
		devSchema: singlestoreSchema('dev'),
		devSchema2: singlestoreSchema('dev2'),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('add table to schema #1', async () => {
	const dev = singlestoreSchema('dev');
	const from = {};
	const to = {
		dev,
		users: dev.table('users', {}),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('add table to schema #2', async () => {
	const dev = singlestoreSchema('dev');
	const from = { dev };
	const to = {
		dev,
		users: dev.table('users', {}),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('add table to schema #3', async () => {
	const dev = singlestoreSchema('dev');
	const from = { dev };
	const to = {
		dev,
		usersInDev: dev.table('users', {}),
		users: singlestoreTable('users', {}),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: undefined,
		columns: [],
		uniqueConstraints: [],
		internals: {
			tables: {},
			indexes: {},
		},
		compositePkName: '',
		compositePKs: [],
	});
});

test('remove table from schema #1', async () => {
	const dev = singlestoreSchema('dev');
	const from = { dev, users: dev.table('users', {}) };
	const to = {
		dev,
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});

test('remove table from schema #2', async () => {
	const dev = singlestoreSchema('dev');
	const from = { dev, users: dev.table('users', {}) };
	const to = {};

	const { statements } = await diffTestSchemasSingleStore(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(0);
});
