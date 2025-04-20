import { integer, pgEnum, pgSchema, pgTable, serial } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './mocks-postgres';

test('enums #1', async () => {
	const to = {
		enum: pgEnum('enum', ['value']),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE TYPE "enum" AS ENUM('value');`);
});

test('enums #2', async () => {
	const folder = pgSchema('folder');
	const to = {
		enum: folder.enum('enum', ['value']),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE TYPE "folder"."enum" AS ENUM('value');`);
});

test('enums #3', async () => {
	const from = {
		enum: pgEnum('enum', ['value']),
	};

	const { sqlStatements } = await diffTestSchemas(from, {}, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP TYPE "enum";`);
});

test('enums #4', async () => {
	const folder = pgSchema('folder');

	const from = {
		enum: folder.enum('enum', ['value']),
	};

	const { sqlStatements } = await diffTestSchemas(from, {}, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP TYPE "folder"."enum";`);
});

test('enums #5', async () => {
	const folder1 = pgSchema('folder1');
	const folder2 = pgSchema('folder2');

	const from = {
		folder1,
		enum: folder1.enum('enum', ['value']),
	};

	const to = {
		folder2,
		enum: folder2.enum('enum', ['value']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, ['folder1->folder2']);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER SCHEMA "folder1" RENAME TO "folder2";\n`);
});

test('enums #6', async () => {
	const folder1 = pgSchema('folder1');
	const folder2 = pgSchema('folder2');

	const from = {
		folder1,
		folder2,
		enum: folder1.enum('enum', ['value']),
	};

	const to = {
		folder1,
		folder2,
		enum: folder2.enum('enum', ['value']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.enum->folder2.enum',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "folder1"."enum" SET SCHEMA "folder2";`);
});

test('enums #7', async () => {
	const from = {
		enum: pgEnum('enum', ['value1']),
	};

	const to = {
		enum: pgEnum('enum', ['value1', 'value2']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "enum" ADD VALUE 'value2';`);
});

test('enums #8', async () => {
	const from = {
		enum: pgEnum('enum', ['value1']),
	};

	const to = {
		enum: pgEnum('enum', ['value1', 'value2', 'value3']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "enum" ADD VALUE 'value2';`);
	expect(sqlStatements[1]).toBe(`ALTER TYPE "enum" ADD VALUE 'value3';`);
});

test('enums #9', async () => {
	const from = {
		enum: pgEnum('enum', ['value1', 'value3']),
	};

	const to = {
		enum: pgEnum('enum', ['value1', 'value2', 'value3']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "enum" ADD VALUE 'value2' BEFORE 'value3';`);
});

test('enums #10', async () => {
	const schema = pgSchema('folder');
	const from = {
		enum: schema.enum('enum', ['value1']),
	};

	const to = {
		enum: schema.enum('enum', ['value1', 'value2']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "folder"."enum" ADD VALUE 'value2';`);
});

test('enums #11', async () => {
	const schema1 = pgSchema('folder1');
	const from = {
		enum: schema1.enum('enum', ['value1']),
	};

	const to = {
		enum: pgEnum('enum', ['value1']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.enum->public.enum',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "folder1"."enum" SET SCHEMA "public";`);
});

test('enums #12', async () => {
	const schema1 = pgSchema('folder1');
	const from = {
		enum: pgEnum('enum', ['value1']),
	};

	const to = {
		enum: schema1.enum('enum', ['value1']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.enum->folder1.enum',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "enum" SET SCHEMA "folder1";`);
});

test('enums #13', async () => {
	const from = {
		enum: pgEnum('enum1', ['value1']),
	};

	const to = {
		enum: pgEnum('enum2', ['value1']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.enum1->public.enum2',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "enum1" RENAME TO "enum2";`);
});

test('enums #14', async () => {
	const folder1 = pgSchema('folder1');
	const folder2 = pgSchema('folder2');
	const from = {
		enum: folder1.enum('enum1', ['value1']),
	};

	const to = {
		enum: folder2.enum('enum2', ['value1']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.enum1->folder2.enum2',
	]);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "folder1"."enum1" SET SCHEMA "folder2";`);
	expect(sqlStatements[1]).toBe(`ALTER TYPE "folder2"."enum1" RENAME TO "enum2";`);
});

test('enums #15', async () => {
	const folder1 = pgSchema('folder1');
	const folder2 = pgSchema('folder2');
	const from = {
		enum: folder1.enum('enum1', ['value1', 'value4']),
	};

	const to = {
		enum: folder2.enum('enum2', ['value1', 'value2', 'value3', 'value4']),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.enum1->folder2.enum2',
	]);

	expect(sqlStatements).toStrictEqual([
		`ALTER TYPE "folder1"."enum1" SET SCHEMA "folder2";`,
		`ALTER TYPE "folder2"."enum1" RENAME TO "enum2";`,
		`ALTER TYPE "folder2"."enum2" ADD VALUE 'value2' BEFORE 'value4';`,
		`ALTER TYPE "folder2"."enum2" ADD VALUE 'value3' BEFORE 'value4';`,
	]);
});

test('enums #16', async () => {
	const enum1 = pgEnum('enum1', ['value1']);
	const enum2 = pgEnum('enum2', ['value1']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column'),
		}),
	};

	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column'),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.enum1->public.enum2',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "enum1" RENAME TO "enum2";`);
});

test('enums #17', async () => {
	const schema = pgSchema('schema');
	const enum1 = pgEnum('enum1', ['value1']);
	const enum2 = schema.enum('enum1', ['value1']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column'),
		}),
	};

	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column'),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.enum1->schema.enum1',
	]);

	expect(sqlStatements).toStrictEqual([
		`ALTER TYPE "enum1" SET SCHEMA "schema";`,
	]);
});

test('enums #18', async () => {
	const schema1 = pgSchema('schema1');
	const schema2 = pgSchema('schema2');

	const enum1 = schema1.enum('enum1', ['value1']);
	const enum2 = schema2.enum('enum2', ['value1']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column'),
		}),
	};

	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column'),
		}),
	};

	// change name and schema of the enum, no table changes
	const { sqlStatements } = await diffTestSchemas(from, to, [
		'schema1.enum1->schema2.enum2',
	]);

	expect(sqlStatements).toStrictEqual([
		`ALTER TYPE "schema1"."enum1" SET SCHEMA "schema2";`,
		`ALTER TYPE "schema2"."enum1" RENAME TO "enum2";`,
	]);
});

test('enums #19', async () => {
	const myEnum = pgEnum('my_enum', ["escape's quotes"]);

	const from = {};

	const to = { myEnum };

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toStrictEqual(
		"CREATE TYPE \"my_enum\" AS ENUM('escape''s quotes');",
	);
});

test('enums #20', async () => {
	const myEnum = pgEnum('my_enum', ['one', 'two', 'three']);

	const from = {
		myEnum,
		table: pgTable('table', {
			id: serial('id').primaryKey(),
		}),
	};

	const to = {
		myEnum,
		table: pgTable('table', {
			id: serial('id').primaryKey(),
			col1: myEnum('col1'),
			col2: integer('col2'),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ADD COLUMN "col1" "my_enum";',
		'ALTER TABLE "table" ADD COLUMN "col2" integer;',
	]);
});

test('enums #21', async () => {
	const myEnum = pgEnum('my_enum', ['one', 'two', 'three']);

	const from = {
		myEnum,
		table: pgTable('table', {
			id: serial('id').primaryKey(),
		}),
	};

	const to = {
		myEnum,
		table: pgTable('table', {
			id: serial('id').primaryKey(),
			col1: myEnum('col1').array(),
			col2: integer('col2').array(),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ADD COLUMN "col1" "my_enum"[];',
		'ALTER TABLE "table" ADD COLUMN "col2" integer[];',
	]);
});

test('enums #22', async () => {
	const schema = pgSchema('schema');
	const en = schema.enum('e', ['a', 'b']);

	const from = {
		schema,
		en,
	};

	const to = {
		schema,
		en,
		table: pgTable('table', {
			en: en(),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual(['CREATE TABLE IF NOT EXISTS "table" (\n\t"en" "schema"."e"\n);\n']);
});

test('enums #23', async () => {
	const schema = pgSchema('schema');
	const en = schema.enum('e', ['a', 'b']);

	const from = {
		schema,
		en,
	};

	const to = {
		schema,
		en,
		table: pgTable('table', {
			en1: en().array(),
			en2: en().array().array(),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual(['CREATE TABLE IF NOT EXISTS "table" (\n\t"en1" "schema"."e"[],\n\t"en2" "schema"."e"[][]\n);\n']);
});

test('drop enum value', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
	};

	const enum2 = pgEnum('enum', ['value1', 'value3']);
	const to = {
		enum2,
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`DROP TYPE "enum";`);
	expect(sqlStatements[1]).toBe(`CREATE TYPE "enum" AS ENUM('value1', 'value3');`);
});

test('drop enum value. enum is columns data type', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const schema = pgSchema('new_schema');

	const from = {
		schema,
		enum1,
		table: pgTable('table', {
			column: enum1('column'),
		}),
		table2: schema.table('table', {
			column: enum1('column'),
		}),
	};

	const enum2 = pgEnum('enum', ['value1', 'value3']);
	const to = {
		schema,
		enum2,
		table: pgTable('table', {
			column: enum1('column'),
		}),
		table2: schema.table('table', {
			column: enum1('column'),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3');`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";`,
	]);
});

test('shuffle enum values', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const schema = pgSchema('new_schema');

	const from = {
		schema,
		enum1,
		table: pgTable('table', {
			column: enum1('column'),
		}),
		table2: schema.table('table', {
			column: enum1('column'),
		}),
	};

	const enum2 = pgEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		schema,
		enum2,
		table: pgTable('table', {
			column: enum1('column'),
		}),
		table2: schema.table('table', {
			column: enum1('column'),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";`,
	]);
});
