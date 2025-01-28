import { integer, pgDomain, pgEnum, pgSchema, pgTable, serial } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('domains #1', async () => {
	const to = {
		domain: pgDomain('domain', 'string'),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE DOMAIN "public"."domain" AS text;`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'public',
		type: 'create_domain',
		baseType: 'text',
	});
});

test('domains #2', async () => {
	const folder = pgSchema('folder');
	const to = {
		domain: folder.domain('domain', 'string'),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE DOMAIN "folder"."domain" AS text;`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'folder',
		type: 'create_domain',
		baseType: 'text',
	});
});

test('domains #3', async () => {
	const from = {
		domain: pgDomain('domain', 'string'),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, {}, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP DOMAIN "public"."domain";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_domain',
		name: 'domain',
		schema: 'public',
	});
});

test('domains #4', async () => {
	const folder = pgSchema('folder');

	const from = {
		domain: folder.domain('domain', 'string'),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, {}, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP DOMAIN "folder"."domain";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_domain',
		name: 'domain',
		schema: 'folder',
	});
});

test('domains #5', async () => {
	const folder1 = pgSchema('folder1');
	const folder2 = pgSchema('folder2');

	const from = {
		folder1,
		domain: folder1.domain('domain', 'string'),
	};

	const to = {
		folder2,
		domain: folder2.domain('domain', 'string'),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['folder1->folder2']);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER SCHEMA "folder1" RENAME TO "folder2";\n`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_schema',
		from: 'folder1',
		to: 'folder2',
	});
});

test('domains #6', async () => {
	const folder1 = pgSchema('folder1');
	const folder2 = pgSchema('folder2');

	const from = {
		folder1,
		folder2,
		domain: folder1.domain('domain', 'string'),
	};

	const to = {
		folder1,
		folder2,
		domain: folder2.domain('domain', 'string'),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.domain->folder2.domain',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER DOMAIN "folder1"."domain" SET SCHEMA "folder2";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'move_domain',
		name: 'domain',
		schemaFrom: 'folder1',
		schemaTo: 'folder2',
	});
});

test('domains #7', async () => {
	const from = {
		domain: pgDomain('domain', 'string'),
	};

	const to = {
		domain: pgDomain('domain', 'string'),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "public"."table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`DROP DOMAIN "public"."domain";`);
	expect(sqlStatements[2]).toBe(`CREATE DOMAIN "public"."domain" AS varchar;`);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithDomain: [],
		name: 'domain',
		schema: 'public',
		type: 'alter_type_domain',
		baseType: 'varchar',
	});
});

test('domains #8', async () => {
	const domain = pgDomain('domain', 'string'); // 'text' is a valid ColumnDataType
	const from = {
		domain,
	};

	const to = {
		domain,
		table: pgTable('table', {
			column: domain('column').notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ADD COLUMN "column" "domain";`);

	expect(statements.length).toBe(0);
});

test('domains #9', async () => {
	const domain1 = pgDomain('domain1', 'string');
	const domain2 = pgDomain('domain2', 'string');

	const from = {
		domain1,
		table: pgTable('table', {
			column: domain1('column'),
		}),
	};

	const to = {
		domain2,
		table: pgTable('table', {
			column: domain2('column'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.domain1->public.domain2',
	]);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER DOMAIN "public"."domain1" RENAME TO "domain2";`);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_type_domain',
		nameFrom: 'domain1',
		nameTo: 'domain2',
		schema: 'public',
		columnsWithDomain: [
			{
				column: 'column',
				schema: 'public',
				table: 'table',
			},
		],
	});
});

test('domains #10', async () => {
	const schema = pgSchema('schema');
	const domain1 = pgDomain('domain1', 'string');
	const domain2 = schema.domain('domain1', 'string');

	const from = {
		domain1,
		table: pgTable('table', {
			column: domain1('column'),
		}),
	};

	const to = {
		domain2,
		table: pgTable('table', {
			column: domain2('column'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.domain1->schema.domain1',
	]);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER DOMAIN "public"."domain1" SET SCHEMA "schema";`);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'move_domain',
		name: 'domain1',
		schemaFrom: 'public',
		schemaTo: 'schema',
		columnsWithDomain: [
			{
				column: 'column',
				schema: 'public',
				table: 'table',
			},
		],
	});
});

test('domains #11', async () => {
	const schema1 = pgSchema('schema1');
	const schema2 = pgSchema('schema2');

	const domain1 = schema1.domain('domain1', 'string');
	const domain2 = schema2.domain('domain2', 'string');

	const from = {
		domain1,
		table: pgTable('table', {
			column: domain1('column'),
		}),
	};

	const to = {
		domain2,
		table: pgTable('table', {
			column: domain2('column'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'schema1.domain1->schema2.domain2',
	]);

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER DOMAIN "schema1"."domain1" SET SCHEMA "schema2";`);
	expect(sqlStatements[2]).toBe(`ALTER DOMAIN "schema2"."domain1" RENAME TO "domain2";`);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'move_domain',
		name: 'domain1',
		schemaFrom: 'schema1',
		schemaTo: 'schema2',
		columnsWithDomain: [
			{
				column: 'column',
				schema: 'public',
				table: 'table',
			},
		],
	});
	expect(statements[1]).toStrictEqual({
		type: 'rename_type_domain',
		nameFrom: 'domain1',
		nameTo: 'domain2',
		schema: 'schema2',
		columnsWithDomain: [
			{
				column: 'column',
				schema: 'public',
				table: 'table',
			},
		],
	});
});
