import { pgSchema } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './mocks';

test('add schema #1', async () => {
	const to = {
		devSchema: pgSchema('dev'),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements).toStrictEqual(['CREATE SCHEMA "dev";\n']);
});

test('add schema #2', async () => {
	const from = {
		devSchema: pgSchema('dev'),
	};
	const to = {
		devSchema: pgSchema('dev'),
		devSchema2: pgSchema('dev2'),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual(['CREATE SCHEMA "dev2";\n']);
});

test('delete schema #1', async () => {
	const from = {
		devSchema: pgSchema('dev'),
	};

	const { sqlStatements } = await diffTestSchemas(from, {}, []);

	expect(sqlStatements).toStrictEqual(['DROP SCHEMA "dev";\n']);
});

test('delete schema #2', async () => {
	const from = {
		devSchema: pgSchema('dev'),
		devSchema2: pgSchema('dev2'),
	};
	const to = {
		devSchema: pgSchema('dev'),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual(['DROP SCHEMA "dev2";\n']);
});

test('rename schema #1', async () => {
	const from = {
		devSchema: pgSchema('dev'),
	};

	const to = {
		devSchema2: pgSchema('dev2'),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, ['dev->dev2']);

	expect(sqlStatements).toStrictEqual(['ALTER SCHEMA "dev" RENAME TO "dev2";\n']);
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

	const { sqlStatements } = await diffTestSchemas(from, to, ['dev1->dev2']);

	expect(sqlStatements).toStrictEqual(['ALTER SCHEMA "dev1" RENAME TO "dev2";\n']);
});
