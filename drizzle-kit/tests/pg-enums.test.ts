import { integer, pgEnum, pgSchema, pgTable, serial } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('enums #1', async () => {
	const to = {
		enum: pgEnum('enum', ['value']),
	};

	const { statements } = await diffTestSchemas({}, to, []);

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

	const { statements } = await diffTestSchemas({}, to, []);

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

	const { statements } = await diffTestSchemas(from, {}, []);

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

	const { statements } = await diffTestSchemas(from, {}, []);

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

	const { statements } = await diffTestSchemas(from, to, ['folder1->folder2']);

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

	const { statements } = await diffTestSchemas(from, to, [
		'folder1.enum->folder2.enum',
	]);

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

	const { statements } = await diffTestSchemas(from, to, []);

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

	const { statements } = await diffTestSchemas(from, to, []);

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

	const { statements } = await diffTestSchemas(from, to, []);

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

	const { statements } = await diffTestSchemas(from, to, []);

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

	const { statements } = await diffTestSchemas(from, to, [
		'folder1.enum->public.enum',
	]);

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

	const { statements } = await diffTestSchemas(from, to, [
		'public.enum->folder1.enum',
	]);

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

	const { statements } = await diffTestSchemas(from, to, [
		'public.enum1->public.enum2',
	]);

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

	const { statements } = await diffTestSchemas(from, to, [
		'folder1.enum1->folder2.enum2',
	]);

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

	const { statements } = await diffTestSchemas(from, to, [
		'folder1.enum1->folder2.enum2',
	]);

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

	const { statements } = await diffTestSchemas(from, to, [
		'public.enum1->public.enum2',
	]);

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

	const { statements } = await diffTestSchemas(from, to, [
		'public.enum1->schema.enum1',
	]);

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
	const { statements } = await diffTestSchemas(from, to, [
		'schema1.enum1->schema2.enum2',
	]);

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
		'DO $$ BEGIN\n CREATE TYPE "public"."my_enum" AS ENUM(\'escape\'\'s quotes\');\nEXCEPTION\n WHEN duplicate_object THEN null;\nEND $$;\n',
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
