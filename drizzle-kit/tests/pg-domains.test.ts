import { integer, pgDomain, pgSchema, pgTable, serial } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('domains #1', async () => {
	const to = {
		domain: pgDomain('domain', 'text'),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE DOMAIN "public"."domain" AS text;`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'public',
		type: 'create_domain',
		dataType: 'text',
		constraints: [],
	});
});

test('domains #2', async () => {
	const folder = pgSchema('folder');
	const to = {
		domain: folder.domain('domain', 'text'),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE DOMAIN "folder"."domain" AS text;`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'folder',
		type: 'create_domain',
		dataType: 'text',
		constraints: [],
	});
});

test('domains #3', async () => {
	const from = {
		domain: pgDomain('domain', 'text'),
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
		domain: folder.domain('domain', 'text'),
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
		domain: folder1.domain('domain', 'text'),
	};

	const to = {
		folder2,
		domain: folder2.domain('domain', 'text'),
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
		domain: folder1.domain('domain', 'text'),
	};

	const to = {
		folder1,
		folder2,
		domain: folder2.domain('domain', 'text'),
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

test('domains #7 - with constraint', async () => {
	const to = {
		domain: pgDomain('domain', 'text').notNull(),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE DOMAIN "public"."domain" AS text NOT NULL;`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'public',
		type: 'create_domain',
		dataType: 'text',
		constraints: [{ type: 'not_null' }],
	});
});

test('domains #8 - change constraint', async () => {
	const from = {
		domain: pgDomain('domain', 'text').notNull(),
	};
	const to = {
		domain: pgDomain('domain', 'text'),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER DOMAIN "public"."domain" DROP CONSTRAINT "domain_not_null";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'public',
		type: 'alter_domain_drop_constraint',
		constraintType: 'not_null',
	});
});

test('domains #9 - change constraint', async () => {
	const from = {
		domain: pgDomain('domain', 'text'),
	};
	const to = {
		domain: pgDomain('domain', 'text').notNull(),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER DOMAIN "public"."domain" ADD CONSTRAINT "domain_not_null" CHECK (VALUE IS NOT NULL);`,
	);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'public',
		type: 'alter_domain_add_constraint',
		constraintType: 'not_null',
	});
});

test('domains #10 - with check constraint', async () => {
	const to = {
		domain: pgDomain('domain', 'integer').check(sql`VALUE > 0`),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE DOMAIN "public"."domain" AS integer CHECK (VALUE > 0);`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'public',
		type: 'create_domain',
		dataType: 'integer',
		constraints: [{ type: 'check', sql: 'VALUE > 0' }],
	});
});

test('domains #11 - with multiple constraints', async () => {
	const to = {
		domain: pgDomain('domain', 'integer').notNull().check(sql`VALUE > 0`),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE DOMAIN "public"."domain" AS integer NOT NULL CHECK (VALUE > 0);`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'public',
		type: 'create_domain',
		dataType: 'integer',
		constraints: [{ type: 'not_null' }, { type: 'check', sql: 'VALUE > 0' }],
	});
});

test('domains #12 - change multiple constraints', async () => {
	const from = {
		domain: pgDomain('domain', 'integer').notNull(),
	};
	const to = {
		domain: pgDomain('domain', 'integer').notNull().check(sql`VALUE > 0`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER DOMAIN "public"."domain" ADD CONSTRAINT "domain_check" CHECK (VALUE > 0);`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'public',
		type: 'alter_domain_add_constraint',
		constraintType: 'check',
		sql: 'VALUE > 0',
	});
});

test('domains #13 - drop multiple constraints', async () => {
	const from = {
		domain: pgDomain('domain', 'integer').notNull().check(sql`VALUE > 0`),
	};
	const to = {
		domain: pgDomain('domain', 'integer').notNull(),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER DOMAIN "public"."domain" DROP CONSTRAINT "domain_check";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'domain',
		schema: 'public',
		type: 'alter_domain_drop_constraint',
		constraintType: 'check',
	});
});

test('domains #14 - domain is columns data type', async () => {
	const myDomain = pgDomain('my_domain', 'text');

	const from = {
		myDomain,
		table: pgTable('table', {
			id: serial('id').primaryKey(),
		}),
	};

	const to = {
		myDomain,
		table: pgTable('table', {
			id: serial('id').primaryKey(),
			col1: myDomain('col1'),
			col2: integer('col2'),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ADD COLUMN "col1" "my_domain";',
		'ALTER TABLE "table" ADD COLUMN "col2" integer;',
	]);
});

test('domains #15 - rename domain', async () => {
	const from = {
		domain: pgDomain('domain1', 'text'),
	};
	const to = {
		domain: pgDomain('domain2', 'text'),
	};
	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.domain1->public.domain2']);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER DOMAIN "public"."domain1" RENAME TO "domain2";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_domain',
		nameFrom: 'domain1',
		nameTo: 'domain2',
		schema: 'public',
	});
});

test('domains #16 - rename domain and schema', async () => {
	const schema1 = pgSchema('schema1');
	const schema2 = pgSchema('schema2');

	const from = {
		domain: schema1.domain('domain1', 'text'),
	};
	const to = {
		domain: schema2.domain('domain2', 'text'),
	};
	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['schema1.domain1->schema2.domain2']);
	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER DOMAIN "schema1"."domain1" SET SCHEMA "schema2";`);
	expect(sqlStatements[1]).toBe(`ALTER DOMAIN "schema2"."domain1" RENAME TO "domain2";`);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'move_domain',
		name: 'domain1',
		schemaFrom: 'schema1',
		schemaTo: 'schema2',
	});
	expect(statements[1]).toStrictEqual({
		type: 'rename_domain',
		nameFrom: 'domain1',
		nameTo: 'domain2',
		schema: 'schema2',
	});
});
