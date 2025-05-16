import { integer, pgEnum, pgSchema, pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('enums #1', async () => {
	const to = {
		enum: pgEnum('enum', ['value']),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TYPE "enum" AS ENUM('value');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #2', async () => {
	const folder = pgSchema('folder');
	const to = {
		folder,
		enum: folder.enum('enum', ['value']),
	};

	const { sqlStatements: st } = await diff({ folder }, to, []);
	await push({ db, to: { folder } });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TYPE "folder"."enum" AS ENUM('value');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #3', async () => {
	const from = {
		enum: pgEnum('enum', ['value']),
	};

	const { sqlStatements: st } = await diff(from, {}, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to: {},
	});

	const st0 = [
		`DROP TYPE "enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #4', async () => {
	const folder = pgSchema('folder');

	const from = {
		folder,
		enum: folder.enum('enum', ['value']),
	};

	const { sqlStatements: st } = await diff(from, { folder }, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: { folder } });

	const st0 = [
		`DROP TYPE "folder"."enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, ['folder1->folder2']);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: ['folder1->folder2'],
	});

	const st0 = [
		`ALTER SCHEMA "folder1" RENAME TO "folder2";\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, [
		'folder1.enum->folder2.enum',
	]);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: ['folder1.enum->folder2.enum'],
	});

	const st0 = [
		`ALTER TYPE "folder1"."enum" SET SCHEMA "folder2";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #7', async () => {
	const from = {
		enum: pgEnum('enum', ['value1']),
	};

	const to = {
		enum: pgEnum('enum', ['value1', 'value2']),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TYPE "enum" ADD VALUE 'value2';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #8', async () => {
	const from = {
		enum: pgEnum('enum', ['value1']),
	};

	const to = {
		enum: pgEnum('enum', ['value1', 'value2', 'value3']),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TYPE "enum" ADD VALUE 'value2';`,
		`ALTER TYPE "enum" ADD VALUE 'value3';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #9', async () => {
	const from = {
		enum: pgEnum('enum', ['value1', 'value3']),
	};

	const to = {
		enum: pgEnum('enum', ['value1', 'value2', 'value3']),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [`ALTER TYPE "enum" ADD VALUE 'value2' BEFORE 'value3';`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #10', async () => {
	const schema = pgSchema('folder');
	const from = {
		schema,
		enum: schema.enum('enum', ['value1']),
	};

	const to = {
		schema,
		enum: schema.enum('enum', ['value1', 'value2']),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [`ALTER TYPE "folder"."enum" ADD VALUE 'value2';`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #11', async () => {
	const schema1 = pgSchema('folder1');
	const from = {
		schema1,
		enum: schema1.enum('enum', ['value1']),
	};

	const to = {
		schema1,
		enum: pgEnum('enum', ['value1']),
	};

	const renames = [
		'folder1.enum->public.enum',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [`ALTER TYPE "folder1"."enum" SET SCHEMA "public";`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #12', async () => {
	const schema1 = pgSchema('folder1');
	const from = {
		schema1,
		enum: pgEnum('enum', ['value1']),
	};

	const to = {
		schema1,
		enum: schema1.enum('enum', ['value1']),
	};

	const renames = [
		'public.enum->folder1.enum',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [`ALTER TYPE "enum" SET SCHEMA "folder1";`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #13', async () => {
	const from = {
		enum: pgEnum('enum1', ['value1']),
	};

	const to = {
		enum: pgEnum('enum2', ['value1']),
	};

	const renames = [
		'public.enum1->public.enum2',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [`ALTER TYPE "enum1" RENAME TO "enum2";`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #14', async () => {
	const folder1 = pgSchema('folder1');
	const folder2 = pgSchema('folder2');
	const from = {
		folder1,
		folder2,
		enum: folder1.enum('enum1', ['value1']),
	};

	const to = {
		folder1,
		folder2,
		enum: folder2.enum('enum2', ['value1']),
	};

	const renames = [
		'folder1.enum1->folder2.enum2',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		`ALTER TYPE "folder1"."enum1" SET SCHEMA "folder2";`,
		`ALTER TYPE "folder2"."enum1" RENAME TO "enum2";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #15', async () => {
	const folder1 = pgSchema('folder1');
	const folder2 = pgSchema('folder2');
	const from = {
		folder1,
		folder2,
		enum: folder1.enum('enum1', ['value1', 'value4']),
	};

	const to = {
		folder1,
		folder2,
		enum: folder2.enum('enum2', ['value1', 'value2', 'value3', 'value4']),
	};

	const renames = ['folder1.enum1->folder2.enum2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		`ALTER TYPE "folder1"."enum1" SET SCHEMA "folder2";`,
		`ALTER TYPE "folder2"."enum1" RENAME TO "enum2";`,
		`ALTER TYPE "folder2"."enum2" ADD VALUE 'value2' BEFORE 'value4';`,
		`ALTER TYPE "folder2"."enum2" ADD VALUE 'value3' BEFORE 'value4';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const renames = [
		'public.enum1->public.enum2',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [`ALTER TYPE "enum1" RENAME TO "enum2";`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #17', async () => {
	const schema = pgSchema('schema');
	const enum1 = pgEnum('enum1', ['value1']);
	const enum2 = schema.enum('enum1', ['value1']);

	const from = {
		schema,
		enum1,
		table: pgTable('table', {
			column: enum1('column'),
		}),
	};

	const to = {
		schema,
		enum2,
		table: pgTable('table', {
			column: enum2('column'),
		}),
	};

	const renames = [
		'public.enum1->schema.enum1',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [`ALTER TYPE "enum1" SET SCHEMA "schema";`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #18', async () => {
	const schema1 = pgSchema('schema1');
	const schema2 = pgSchema('schema2');

	const enum1 = schema1.enum('enum1', ['value1']);
	const enum2 = schema2.enum('enum2', ['value1']);

	const from = {
		schema1,
		schema2,
		enum1,
		table: pgTable('table', {
			column: enum1('column'),
		}),
	};

	const to = {
		schema1,
		schema2,
		enum2,
		table: pgTable('table', {
			column: enum2('column'),
		}),
	};

	const renames = [
		'schema1.enum1->schema2.enum2',
	];
	// change name and schema of the enum, no table changes
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		`ALTER TYPE "schema1"."enum1" SET SCHEMA "schema2";`,
		`ALTER TYPE "schema2"."enum1" RENAME TO "enum2";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('enums #19', async () => {
	const myEnum = pgEnum('my_enum', ["escape's quotes"]);

	const from = {};

	const to = { myEnum };

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = ["CREATE TYPE \"my_enum\" AS ENUM('escape''s quotes');"];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ADD COLUMN "col1" "my_enum";',
		'ALTER TABLE "table" ADD COLUMN "col2" integer;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ADD COLUMN "col1" "my_enum"[];',
		'ALTER TABLE "table" ADD COLUMN "col2" integer[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = ['CREATE TABLE "table" (\n\t"en" "schema"."e"\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'CREATE TABLE "table" (\n\t"en1" "schema"."e"[],\n\t"en2" "schema"."e"[]\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop enum', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		users: pgTable('users', {
			col: enum1().default('value1'),
		}),
	};

	const to = {
		users: pgTable('users', {
			col: text().default('value1'),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "col" DROP DEFAULT;',
		'ALTER TABLE "users" ALTER COLUMN "col" SET DATA TYPE text;',
		'ALTER TABLE "users" ALTER COLUMN "col" SET DEFAULT \'value1\';',
		`DROP TYPE "enum";`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";`,
	]);
});

test('enums as ts enum', async () => {
	enum Test {
		value = 'value',
	}

	const to = {
		enum: pgEnum('enum', Test),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([`CREATE TYPE "enum" AS ENUM('value');`]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum"[] USING "column"::"enum"[];`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value3"}';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum"[] USING "column"::"enum"[];`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value2"}';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum"[] USING "column"::"enum"[];`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum"[] USING "column"::"enum"[];`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum"[] USING "column"::"enum"[];`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{{"value2"}}';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;`,
		`DROP TYPE "new_schema"."enum";`,
		`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "new_schema"."enum" USING "column"::"new_schema"."enum";`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" DROP DEFAULT;`,
		`DROP TYPE "new_schema"."enum";`,
		`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "new_schema"."enum"[] USING "column"::"new_schema"."enum"[];`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DEFAULT '{"value2"}';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`,
		'ALTER TABLE "new_schema"."table" ALTER COLUMN "column" DROP DEFAULT;',
		`DROP TYPE "new_schema"."enum";`,
		`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "new_schema"."enum"[] USING "column"::"new_schema"."enum"[];`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DEFAULT '{"value2"}';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE text;`,
		`DROP TYPE "new_schema"."enum";`,
		`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "column" SET DATA TYPE "new_schema"."enum"[] USING "column"::"new_schema"."enum"[];`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value3'::"enum";`);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value3'::"enum";`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum"[] USING "column"::"enum"[];`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value3"}'::"enum"[];`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum"[] USING "column"::"enum"[];`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum"[] USING "column"::"enum"[];`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value3"}'::"enum"[];`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum"[] USING "column"::"enum"[];`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar;`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar;`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar[];`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar[];`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar[];`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value2"}';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE varchar[];`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"value2"}';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2';`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text[];`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text[];`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text[];`,
		// TODO: discuss with @AndriiSherman, redundand statement
		// `ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"hello"}';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text[];`,
		/*
				TODO: discuss with @AndriiSherman, redundand statement
				CREATE TABLE "table" (
        	"column" varchar[2] DEFAULT '{"hello"}'
				);

				ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text[2];
		 */
		// `ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT '{"hello"}';`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum2" USING "column"::text::"enum2";`,
	);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum2" USING "column"::text::"enum2";`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value3'::"enum2";`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum2" USING "column"::text::"enum2";`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value1'::"enum2";`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'DROP TYPE "enum1";',
		`CREATE TYPE "enum1" AS ENUM('value3', 'value1', 'value2');`,
		'ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;',
		'ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum1" USING "column"::"enum1";',
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2'::"enum1";`,
	]);
});
