import { integer, pgEnum, pgSchema, pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('enums #1', async () => {
	const to = {
		enum: pgEnum('enum', ['value']),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value');`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'enum',
		schema: 'public',
		type: 'create_type_enum',
		values: ['value'],
	});
});

test('enums #2', async () => {
	const folder = pgSchema('folder');
	const to = {
		enum: folder.enum('enum', ['value']),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE TYPE "folder"."enum" AS ENUM('value');`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'enum',
		schema: 'folder',
		type: 'create_type_enum',
		values: ['value'],
	});
});

test('enums #3', async () => {
	const from = {
		enum: pgEnum('enum', ['value']),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, {}, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP TYPE "public"."enum";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_type_enum',
		name: 'enum',
		schema: 'public',
	});
});

test('enums #4', async () => {
	const folder = pgSchema('folder');

	const from = {
		enum: folder.enum('enum', ['value']),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, {}, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP TYPE "folder"."enum";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_type_enum',
		name: 'enum',
		schema: 'folder',
	});
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.enum->folder2.enum',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "folder1"."enum" SET SCHEMA "folder2";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'move_type_enum',
		name: 'enum',
		schemaFrom: 'folder1',
		schemaTo: 'folder2',
	});
});

test('enums #7', async () => {
	const from = {
		enum: pgEnum('enum', ['value1']),
	};

	const to = {
		enum: pgEnum('enum', ['value1', 'value2']),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "public"."enum" ADD VALUE 'value2';`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_type_add_value',
		name: 'enum',
		schema: 'public',
		value: 'value2',
		before: '',
	});
});

test('enums #8', async () => {
	const from = {
		enum: pgEnum('enum', ['value1']),
	};

	const to = {
		enum: pgEnum('enum', ['value1', 'value2', 'value3']),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "public"."enum" ADD VALUE 'value2';`);
	expect(sqlStatements[1]).toBe(`ALTER TYPE "public"."enum" ADD VALUE 'value3';`);
	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_type_add_value',
		name: 'enum',
		schema: 'public',
		value: 'value2',
		before: '',
	});

	expect(statements[1]).toStrictEqual({
		type: 'alter_type_add_value',
		name: 'enum',
		schema: 'public',
		value: 'value3',
		before: '',
	});
});

test('enums #9', async () => {
	const from = {
		enum: pgEnum('enum', ['value1', 'value3']),
	};

	const to = {
		enum: pgEnum('enum', ['value1', 'value2', 'value3']),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "public"."enum" ADD VALUE 'value2' BEFORE 'value3';`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_type_add_value',
		name: 'enum',
		schema: 'public',
		value: 'value2',
		before: 'value3',
	});
});

test('enums #10', async () => {
	const schema = pgSchema('folder');
	const from = {
		enum: schema.enum('enum', ['value1']),
	};

	const to = {
		enum: schema.enum('enum', ['value1', 'value2']),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "folder"."enum" ADD VALUE 'value2';`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_type_add_value',
		name: 'enum',
		schema: 'folder',
		value: 'value2',
		before: '',
	});
});

test('enums #11', async () => {
	const schema1 = pgSchema('folder1');
	const from = {
		enum: schema1.enum('enum', ['value1']),
	};

	const to = {
		enum: pgEnum('enum', ['value1']),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.enum->public.enum',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "folder1"."enum" SET SCHEMA "public";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'move_type_enum',
		name: 'enum',
		schemaFrom: 'folder1',
		schemaTo: 'public',
	});
});

test('enums #12', async () => {
	const schema1 = pgSchema('folder1');
	const from = {
		enum: pgEnum('enum', ['value1']),
	};

	const to = {
		enum: schema1.enum('enum', ['value1']),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.enum->folder1.enum',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "public"."enum" SET SCHEMA "folder1";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'move_type_enum',
		name: 'enum',
		schemaFrom: 'public',
		schemaTo: 'folder1',
	});
});

test('enums #13', async () => {
	const from = {
		enum: pgEnum('enum1', ['value1']),
	};

	const to = {
		enum: pgEnum('enum2', ['value1']),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.enum1->public.enum2',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "public"."enum1" RENAME TO "enum2";`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_type_enum',
		nameFrom: 'enum1',
		nameTo: 'enum2',
		schema: 'public',
	});
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.enum1->folder2.enum2',
	]);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "folder1"."enum1" SET SCHEMA "folder2";`);
	expect(sqlStatements[1]).toBe(`ALTER TYPE "folder2"."enum1" RENAME TO "enum2";`);
	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'move_type_enum',
		name: 'enum1',
		schemaFrom: 'folder1',
		schemaTo: 'folder2',
	});
	expect(statements[1]).toStrictEqual({
		type: 'rename_type_enum',
		nameFrom: 'enum1',
		nameTo: 'enum2',
		schema: 'folder2',
	});
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.enum1->folder2.enum2',
	]);

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "folder1"."enum1" SET SCHEMA "folder2";`);
	expect(sqlStatements[1]).toBe(`ALTER TYPE "folder2"."enum1" RENAME TO "enum2";`);
	expect(sqlStatements[2]).toBe(`ALTER TYPE "folder2"."enum2" ADD VALUE 'value2' BEFORE 'value4';`);
	expect(sqlStatements[3]).toBe(`ALTER TYPE "folder2"."enum2" ADD VALUE 'value3' BEFORE 'value4';`);

	expect(statements.length).toBe(4);
	expect(statements[0]).toStrictEqual({
		type: 'move_type_enum',
		name: 'enum1',
		schemaFrom: 'folder1',
		schemaTo: 'folder2',
	});
	expect(statements[1]).toStrictEqual({
		type: 'rename_type_enum',
		nameFrom: 'enum1',
		nameTo: 'enum2',
		schema: 'folder2',
	});
	expect(statements[2]).toStrictEqual({
		type: 'alter_type_add_value',
		name: 'enum2',
		schema: 'folder2',
		value: 'value2',
		before: 'value4',
	});
	expect(statements[3]).toStrictEqual({
		type: 'alter_type_add_value',
		name: 'enum2',
		schema: 'folder2',
		value: 'value3',
		before: 'value4',
	});
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.enum1->public.enum2',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "public"."enum1" RENAME TO "enum2";`);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_type_enum',
		nameFrom: 'enum1',
		nameTo: 'enum2',
		schema: 'public',
	});
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.enum1->schema.enum1',
	]);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "public"."enum1" SET SCHEMA "schema";`);

	expect(sqlStatements.length).toBe(1);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'move_type_enum',
		name: 'enum1',
		schemaFrom: 'public',
		schemaTo: 'schema',
	});
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
	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'schema1.enum1->schema2.enum2',
	]);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER TYPE "schema1"."enum1" SET SCHEMA "schema2";`);
	expect(sqlStatements[1]).toBe(`ALTER TYPE "schema2"."enum1" RENAME TO "enum2";`);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'move_type_enum',
		name: 'enum1',
		schemaFrom: 'schema1',
		schemaTo: 'schema2',
	});
	expect(statements[1]).toStrictEqual({
		type: 'rename_type_enum',
		nameFrom: 'enum1',
		nameTo: 'enum2',
		schema: 'schema2',
	});
});

test('enums #19', async () => {
	const myEnum = pgEnum('my_enum', ["escape's quotes"]);

	const from = {};

	const to = { myEnum };

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toStrictEqual(
		'CREATE TYPE "public"."my_enum" AS ENUM(\'escape\'\'s quotes\');',
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

test('drop enum value', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
	};

	const enum2 = pgEnum('enum', ['value1', 'value3']);
	const to = {
		enum2,
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[1]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3');`);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [],
		deletedValues: [
			'value2',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
		],
		enumSchema: 'public',
		type: 'alter_type_drop_value',
	});
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: '',
				table: 'table',
				default: undefined,
				columnType: 'enum',
			},
			{
				column: 'column',
				tableSchema: 'new_schema',
				table: 'table',
				default: undefined,
				columnType: 'enum',
			},
		],
		deletedValues: [
			'value2',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
		],
		enumSchema: 'public',
		type: 'alter_type_drop_value',
	});
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
			column: enum2('column'),
		}),
		table2: schema.table('table', {
			column: enum2('column'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: '',
				table: 'table',
				default: undefined,
				columnType: 'enum',
			},
			{
				column: 'column',
				tableSchema: 'new_schema',
				table: 'table',
				columnType: 'enum',
				default: undefined,
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'public',
		type: 'alter_type_drop_value',
	});
});

test('enums as ts enum', async () => {
	enum Test {
		value = 'value',
	}

	const to = {
		enum: pgEnum('enum', Test),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value');`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'enum',
		schema: 'public',
		type: 'create_type_enum',
		values: ['value'],
	});
});

// +
test('column is enum type with default value. shuffle enum', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').default('value2'),
		}),
	};

	const enum2 = pgEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column').default('value2'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2'::text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2'::"public"."enum";`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: '',
				table: 'table',
				default: "'value2'",
				columnType: 'enum',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'public',
		type: 'alter_type_drop_value',
	});
});

// +
test('column is array enum type with default value. shuffle enum', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array().default(['value2']),
		}),
	};

	const enum2 = pgEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column').array().default(['value3']),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value3"}'::text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value3"}'::"public"."enum"[];`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum"[] USING "column"::"public"."enum"[];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: '',
				table: 'table',
				default: `'{"value3"}'`,
				columnType: 'enum[]',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'public',
		type: 'alter_type_drop_value',
	});
});

// +
test('column is array enum with custom size type with default value. shuffle enum', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array(3).default(['value2']),
		}),
	};

	const enum2 = pgEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column').array(3).default(['value2']),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value2"}'::text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value2"}'::"public"."enum"[3];`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum"[3] USING "column"::"public"."enum"[3];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: '',
				table: 'table',
				default: `'{"value2"}'`,
				columnType: 'enum[3]',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'public',
		type: 'alter_type_drop_value',
	});
});

// +
test('column is array enum with custom size type. shuffle enum', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array(3),
		}),
	};

	const enum2 = pgEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column').array(3),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[2]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[3]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum"[3] USING "column"::"public"."enum"[3];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: '',
				table: 'table',
				default: undefined,
				columnType: 'enum[3]',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'public',
		type: 'alter_type_drop_value',
	});
});

// +
test('column is array of enum with multiple dimenions with custom sizes type. shuffle enum', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array(3).array(2),
		}),
	};

	const enum2 = pgEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column').array(3).array(2),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[2]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[3]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum"[3][2] USING "column"::"public"."enum"[3][2];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: '',
				table: 'table',
				default: undefined,
				columnType: 'enum[3][2]',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'public',
		type: 'alter_type_drop_value',
	});
});

// +
test('column is array of enum with multiple dimenions type with custom size with default value. shuffle enum', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array(3).array(2).default([['value2']]),
		}),
	};

	const enum2 = pgEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column').array(3).array(2).default([['value2']]),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{{"value2"}}'::text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{{"value2"}}'::"public"."enum"[3][2];`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum"[3][2] USING "column"::"public"."enum"[3][2];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: '',
				table: 'table',
				default: `'{{\"value2\"}}'`,
				columnType: 'enum[3][2]',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'public',
		type: 'alter_type_drop_value',
	});
});

// +
test('column is enum type with default value. custom schema. shuffle enum', async () => {
	const schema = pgSchema('new_schema');

	const enum1 = schema.enum('enum', ['value1', 'value2', 'value3']);
	const from = {
		schema,
		enum1,
		table: pgTable('table', {
			column: enum1('column').default('value2'),
		}),
	};

	const enum2 = schema.enum('enum', ['value1', 'value3', 'value2']);
	const to = {
		schema,
		enum2,
		table: pgTable('table', {
			column: enum2('column').default('value2'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2'::text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "new_schema"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2'::"new_schema"."enum";`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "new_schema"."enum" USING "column"::"new_schema"."enum";`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: '',
				table: 'table',
				default: "'value2'",
				columnType: 'enum',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'new_schema',
		type: 'alter_type_drop_value',
	});
});

// +
test('column is array enum type with default value. custom schema. shuffle enum', async () => {
	const schema = pgSchema('new_schema');

	const enum1 = schema.enum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: schema.table('table', {
			column: enum1('column').array().default(['value2']),
		}),
	};

	const enum2 = schema.enum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: schema.table('table', {
			column: enum2('column').array().default(['value2']),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DEFAULT '{"value2"}'::text;`,
	);
	expect(sqlStatements[2]).toBe(`DROP TYPE "new_schema"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DEFAULT '{"value2"}'::"new_schema"."enum"[];`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "new_schema"."enum"[] USING "column"::"new_schema"."enum"[];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: 'new_schema',
				table: 'table',
				default: `'{"value2"}'`,
				columnType: 'enum[]',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'new_schema',
		type: 'alter_type_drop_value',
	});
});

// +
test('column is array enum type with custom size with default value. custom schema. shuffle enum', async () => {
	const schema = pgSchema('new_schema');

	const enum1 = schema.enum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: schema.table('table', {
			column: enum1('column').array(3).default(['value2']),
		}),
	};

	const enum2 = schema.enum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: schema.table('table', {
			column: enum2('column').array(3).default(['value2']),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DEFAULT '{"value2"}'::text;`,
	);
	expect(sqlStatements[2]).toBe(`DROP TYPE "new_schema"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DEFAULT '{"value2"}'::"new_schema"."enum"[3];`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "new_schema"."enum"[3] USING "column"::"new_schema"."enum"[3];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: 'new_schema',
				table: 'table',
				default: `'{"value2"}'`,
				columnType: 'enum[3]',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'new_schema',
		type: 'alter_type_drop_value',
	});
});

// +
test('column is array enum type with custom size. custom schema. shuffle enum', async () => {
	const schema = pgSchema('new_schema');

	const enum1 = schema.enum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: schema.table('table', {
			column: enum1('column').array(3),
		}),
	};

	const enum2 = schema.enum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: schema.table('table', {
			column: enum2('column').array(3),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`DROP TYPE "new_schema"."enum";`);
	expect(sqlStatements[2]).toBe(`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[3]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "new_schema"."enum"[3] USING "column"::"new_schema"."enum"[3];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: 'new_schema',
				table: 'table',
				default: undefined,
				columnType: 'enum[3]',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'new_schema',
		type: 'alter_type_drop_value',
	});
});

// +
test('column is enum type without default value. add default to column', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column'),
		}),
	};

	const enum2 = pgEnum('enum', ['value1', 'value3']);
	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column').default('value3'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value3';`);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: 'enum',
		newDefaultValue: "'value3'",
		schema: '',
		tableName: 'table',
		type: 'alter_table_alter_column_set_default',
	});
});

// +
test('change data type from standart type to enum', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: varchar('column'),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: enum1('column'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: true,
			name: 'enum',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: 'public',
	});
});

// +
test('change data type from standart type to enum. column has default', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').default('value2'),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').default('value3'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value3'::"public"."enum";`);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: "'value3'",
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: true,
			name: 'enum',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: 'public',
	});
});

// +
test('change data type from array standart type to array enum. column has default', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').array().default(['value2']),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array().default(['value3']),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value3"}'::"public"."enum"[];`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum"[] USING "column"::"public"."enum"[];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: `'{"value3"}'`,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: true,
			name: 'enum[]',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar[]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: 'public',
	});
});

// +
test('change data type from array standart type to array enum. column without default', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').array(),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum"[] USING "column"::"public"."enum"[];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: true,
			name: 'enum[]',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar[]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: 'public',
	});
});

// +
test('change data type from array standart type with custom size to array enum with custom size. column has default', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').array(3).default(['value2']),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array(3).default(['value3']),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value3"}'::"public"."enum"[3];`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum"[3] USING "column"::"public"."enum"[3];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: `'{"value3"}'`,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: true,
			name: 'enum[3]',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar[3]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: 'public',
	});
});

// +
test('change data type from array standart type with custom size to array enum with custom size. column without default', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').array(2),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array(2),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum"[2] USING "column"::"public"."enum"[2];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: true,
			name: 'enum[2]',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar[2]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: 'public',
	});
});

// +
test('change data type from enum type to standart type', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column'),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: varchar('column'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar;`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'varchar',
		},
		oldDataType: {
			isEnum: true,
			name: 'enum',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from enum type to standart type. column has default', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').default('value3'),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').default('value2'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar;`,
	);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2';`);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: "'value2'",
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'varchar',
		},
		oldDataType: {
			isEnum: true,
			name: 'enum',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from array enum type to array standart type', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array(),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').array(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar[];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'varchar[]',
		},
		oldDataType: {
			isEnum: true,
			name: 'enum[]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from array enum with custom size type to array standart type with custom size', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array(2),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').array(2),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar[2];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'varchar[2]',
		},
		oldDataType: {
			isEnum: true,
			name: 'enum[2]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

//
test('change data type from array enum type to array standart type. column has default', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array().default(['value2']),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').array().default(['value2']),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar[];`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value2"}';`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: `'{"value2"}'`,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'varchar[]',
		},
		oldDataType: {
			isEnum: true,
			name: 'enum[]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from array enum type with custom size to array standart type with custom size. column has default', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').array(3).default(['value2']),
		}),
	};

	const to = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').array(3).default(['value2']),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar[3];`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value2"}';`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: `'{"value2"}'`,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'varchar[3]',
		},
		oldDataType: {
			isEnum: true,
			name: 'enum[3]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from standart type to standart type', async () => {
	const from = {
		table: pgTable('table', {
			column: varchar('column'),
		}),
	};

	const to = {
		table: pgTable('table', {
			column: text('column'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'text',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from standart type to standart type. column has default', async () => {
	const from = {
		table: pgTable('table', {
			column: varchar('column').default('value3'),
		}),
	};

	const to = {
		table: pgTable('table', {
			column: text('column').default('value2'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2';`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: "'value2'",
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'text',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from standart type to standart type. columns are arrays', async () => {
	const from = {
		table: pgTable('table', {
			column: varchar('column').array(),
		}),
	};

	const to = {
		table: pgTable('table', {
			column: text('column').array(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text[];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'text[]',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar[]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from standart type to standart type. columns are arrays with custom sizes', async () => {
	const from = {
		table: pgTable('table', {
			column: varchar('column').array(2),
		}),
	};

	const to = {
		table: pgTable('table', {
			column: text('column').array(2),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text[2];`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'text[2]',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar[2]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from standart type to standart type. columns are arrays. column has default', async () => {
	const from = {
		table: pgTable('table', {
			column: varchar('column').array().default(['hello']),
		}),
	};

	const to = {
		table: pgTable('table', {
			column: text('column').array().default(['hello']),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text[];`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"hello"}';`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: `'{"hello"}'`,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'text[]',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar[]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from standart type to standart type. columns are arrays with custom sizes.column has default', async () => {
	const from = {
		table: pgTable('table', {
			column: varchar('column').array(2).default(['hello']),
		}),
	};

	const to = {
		table: pgTable('table', {
			column: text('column').array(2).default(['hello']),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text[2];`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"hello"}';`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: `'{"hello"}'`,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: false,
			name: 'text[2]',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar[2]',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: undefined,
	});
});

// +
test('change data type from one enum to other', async () => {
	const enum1 = pgEnum('enum1', ['value1', 'value3']);
	const enum2 = pgEnum('enum2', ['value1', 'value3']);

	const from = {
		enum1,
		enum2,
		table: pgTable('table', {
			column: enum1('column'),
		}),
	};

	const to = {
		enum1,
		enum2,
		table: pgTable('table', {
			column: enum2('column'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum2" USING "column"::text::"public"."enum2";`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: undefined,
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: true,
			name: 'enum2',
		},
		oldDataType: {
			isEnum: true,
			name: 'enum1',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: 'public',
	});
});

// +
test('change data type from one enum to other. column has default', async () => {
	const enum1 = pgEnum('enum1', ['value1', 'value3']);
	const enum2 = pgEnum('enum2', ['value1', 'value3']);

	const from = {
		enum1,
		enum2,
		table: pgTable('table', {
			column: enum1('column').default('value3'),
		}),
	};

	const to = {
		enum1,
		enum2,
		table: pgTable('table', {
			column: enum2('column').default('value3'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum2" USING "column"::text::"public"."enum2";`,
	);
	expect(sqlStatements[2]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value3';`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: "'value3'",
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: true,
			name: 'enum2',
		},
		oldDataType: {
			isEnum: true,
			name: 'enum1',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: 'public',
	});
});

// +
test('change data type from one enum to other. changed defaults', async () => {
	const enum1 = pgEnum('enum1', ['value1', 'value3']);
	const enum2 = pgEnum('enum2', ['value1', 'value3']);

	const from = {
		enum1,
		enum2,
		table: pgTable('table', {
			column: enum1('column').default('value3'),
		}),
	};

	const to = {
		enum1,
		enum2,
		table: pgTable('table', {
			column: enum2('column').default('value1'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum2" USING "column"::text::"public"."enum2";`,
	);
	expect(sqlStatements[2]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value1';`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: "'value1'",
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: true,
			name: 'enum2',
		},
		oldDataType: {
			isEnum: true,
			name: 'enum1',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: 'public',
	});
});

test('check filtering json statements. here we have recreate enum + set new type + alter default', async () => {
	const enum1 = pgEnum('enum1', ['value1', 'value3']);
	const from = {
		enum1,
		table: pgTable('table', {
			column: varchar('column').default('value3'),
		}),
	};

	const enum2 = pgEnum('enum1', ['value3', 'value1', 'value2']);
	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column').default('value2'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2'::text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "public"."enum1";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "public"."enum1" AS ENUM('value3', 'value1', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2'::"public"."enum1";`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum1" USING "column"::"public"."enum1";`,
	);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				columnType: 'enum1',
				default: "'value2'",
				table: 'table',
				tableSchema: '',
			},
		],
		deletedValues: [
			'value3',
		],
		enumSchema: 'public',
		name: 'enum1',
		newValues: [
			'value3',
			'value1',
			'value2',
		],
		type: 'alter_type_drop_value',
	});
	expect(statements[1]).toStrictEqual({
		columnAutoIncrement: undefined,
		columnDefault: "'value2'",
		columnName: 'column',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: {
			isEnum: true,
			name: 'enum1',
		},
		oldDataType: {
			isEnum: false,
			name: 'varchar',
		},
		schema: '',
		tableName: 'table',
		type: 'pg_alter_table_alter_column_set_type',
		typeSchema: 'public',
	});
});
