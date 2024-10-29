import { pgEnum, pgSchema, pgTable } from 'drizzle-orm/pg-core';
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
		schema: 'public',
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
	expect(sqlStatements[0]).toBe(`ALTER TABLE "public"."table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "public"."table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				schema: 'public',
				table: 'table',
			},
			{
				column: 'column',
				schema: 'new_schema',
				table: 'table',
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
		schema: 'public',
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
			column: enum1('column'),
		}),
		table2: schema.table('table', {
			column: enum1('column'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "public"."table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "public"."table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				schema: 'public',
				table: 'table',
			},
			{
				column: 'column',
				schema: 'new_schema',
				table: 'table',
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
		schema: 'public',
		type: 'alter_type_drop_value',
	});
});
