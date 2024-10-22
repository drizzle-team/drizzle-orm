import { pgSchema } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('add schema #1', async () => {
	const to = {
		devSchema: pgSchema('dev'),
	};

	const { statements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_schema',
		name: 'dev',
	});
});

test('add schema #2', async () => {
	const from = {
		devSchema: pgSchema('dev'),
	};
	const to = {
		devSchema: pgSchema('dev'),
		devSchema2: pgSchema('dev2'),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_schema',
		name: 'dev2',
	});
});

test('delete schema #1', async () => {
	const from = {
		devSchema: pgSchema('dev'),
	};

	const { statements } = await diffTestSchemas(from, {}, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_schema',
		name: 'dev',
	});
});

test('delete schema #2', async () => {
	const from = {
		devSchema: pgSchema('dev'),
		devSchema2: pgSchema('dev2'),
	};
	const to = {
		devSchema: pgSchema('dev'),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_schema',
		name: 'dev2',
	});
});

test('rename schema #1', async () => {
	const from = {
		devSchema: pgSchema('dev'),
	};
	const to = {
		devSchema2: pgSchema('dev2'),
	};

	const { statements } = await diffTestSchemas(from, to, ['dev->dev2']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_schema',
		from: 'dev',
		to: 'dev2',
	});
});

test('rename schema #2', async () => {
	const from = {
		devSchema: pgSchema('dev'),
		devSchema1: pgSchema('dev1'),
	};
	const to = {
		devSchema: pgSchema('dev'),
		devSchema2: pgSchema('dev2'),
	};

	const { statements } = await diffTestSchemas(from, to, ['dev1->dev2']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_schema',
		from: 'dev1',
		to: 'dev2',
	});
});
