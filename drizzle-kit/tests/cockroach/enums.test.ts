import { cockroachEnum, cockroachSchema, cockroachTable, int4, text, varchar } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('enums #1', async ({ db }) => {
	const to = {
		enum: cockroachEnum('enum', ['value']),
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

test.concurrent('enums #2', async ({ db }) => {
	const folder = cockroachSchema('folder');
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

test.concurrent('enums #3', async ({ db }) => {
	const from = {
		enum: cockroachEnum('enum', ['value']),
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

test.concurrent('enums #4', async ({ db }) => {
	const folder = cockroachSchema('folder');

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

test.concurrent('enums #5', async ({ db }) => {
	const folder1 = cockroachSchema('folder1');
	const folder2 = cockroachSchema('folder2');

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

test.concurrent('enums #6', async ({ db }) => {
	const folder1 = cockroachSchema('folder1');
	const folder2 = cockroachSchema('folder2');

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

test.concurrent('enums #7', async ({ db }) => {
	const from = {
		enum: cockroachEnum('enum', ['value1']),
	};

	const to = {
		enum: cockroachEnum('enum', ['value1', 'value2']),
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

test.concurrent('enums #8', async ({ db }) => {
	const from = {
		enum: cockroachEnum('enum', ['value1']),
	};

	const to = {
		enum: cockroachEnum('enum', ['value1', 'value2', 'value3']),
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

test.concurrent('enums #9', async ({ db }) => {
	const from = {
		enum: cockroachEnum('enum', ['value1', 'value3']),
	};

	const to = {
		enum: cockroachEnum('enum', ['value1', 'value2', 'value3']),
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

test.concurrent('enums #10', async ({ db }) => {
	const schema = cockroachSchema('folder');
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

test.concurrent('enums #11', async ({ db }) => {
	const schema1 = cockroachSchema('folder1');
	const from = {
		schema1,
		enum: schema1.enum('enum', ['value1']),
	};

	const to = {
		schema1,
		enum: cockroachEnum('enum', ['value1']),
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

test.concurrent('enums #12', async ({ db }) => {
	const schema1 = cockroachSchema('folder1');
	const from = {
		schema1,
		enum: cockroachEnum('enum', ['value1']),
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

test.concurrent('enums #13', async ({ db }) => {
	const from = {
		enum: cockroachEnum('enum1', ['value1']),
	};

	const to = {
		enum: cockroachEnum('enum2', ['value1']),
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

test.concurrent('enums #14', async ({ db }) => {
	const folder1 = cockroachSchema('folder1');
	const folder2 = cockroachSchema('folder2');
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

test.concurrent('enums #15', async ({ db }) => {
	const folder1 = cockroachSchema('folder1');
	const folder2 = cockroachSchema('folder2');
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

test.concurrent('enums #16', async ({ db }) => {
	const enum1 = cockroachEnum('enum1', ['value1']);
	const enum2 = cockroachEnum('enum2', ['value1']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
	};

	const to = {
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column'),
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

test.concurrent('enums #17', async ({ db }) => {
	const schema = cockroachSchema('schema');
	const enum1 = cockroachEnum('enum1', ['value1']);
	const enum2 = schema.enum('enum1', ['value1']);

	const from = {
		schema,
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
	};

	const to = {
		schema,
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column'),
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

test.concurrent('enums #18', async ({ db }) => {
	const schema1 = cockroachSchema('schema1');
	const schema2 = cockroachSchema('schema2');

	const enum1 = schema1.enum('enum1', ['value1']);
	const enum2 = schema2.enum('enum2', ['value1']);

	const from = {
		schema1,
		schema2,
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
	};

	const to = {
		schema1,
		schema2,
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column'),
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

test.concurrent('enums #19', async ({ db }) => {
	const myEnum = cockroachEnum('my_enum', ["escape's quotes"]);

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

test.concurrent('enums #20', async ({ db }) => {
	const myEnum = cockroachEnum('my_enum', ['one', 'two', 'three']);

	const from = {
		myEnum,
		table: cockroachTable('table', {
			id: int4('id').primaryKey(),
		}),
	};

	const to = {
		myEnum,
		table: cockroachTable('table', {
			id: int4('id').primaryKey(),
			col1: myEnum('col1'),
			col2: int4('col2'),
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
		'ALTER TABLE "table" ADD COLUMN "col2" int4;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('enums #21', async ({ db }) => {
	const myEnum = cockroachEnum('my_enum', ['one', 'two', 'three']);

	const from = {
		myEnum,
		table: cockroachTable('table', {
			id: int4('id').primaryKey(),
		}),
	};

	const to = {
		myEnum,
		table: cockroachTable('table', {
			id: int4('id').primaryKey(),
			col1: myEnum('col1').array(),
			col2: int4('col2').array(),
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
		'ALTER TABLE "table" ADD COLUMN "col2" int4[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('enums #22', async ({ db }) => {
	const schema = cockroachSchema('schema');
	const en = schema.enum('e', ['a', 'b']);

	const from = {
		schema,
		en,
	};

	const to = {
		schema,
		en,
		table: cockroachTable('table', {
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

test.concurrent('enums #23', async ({ db }) => {
	const schema = cockroachSchema('schema');
	const en = schema.enum('e', ['a', 'b']);

	const from = {
		schema,
		en,
	};

	const to = {
		schema,
		en,
		table: cockroachTable('table', {
			en1: en().array(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'CREATE TABLE "table" (\n\t"en1" "schema"."e"[]\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('drop enum value', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3']);
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

test.concurrent('drop enum values', async ({ db }) => {
	const newSchema = cockroachSchema('mySchema');
	const enum3 = cockroachEnum('enum_users_customer_and_ship_to_settings_roles', [
		'addedToTop',
		'custAll',
		'custAdmin',
		'custClerk',
		'custInvoiceManager',
		'addedToMiddle',
		'custMgf',
		'custApprover',
		'custOrderWriter',
		'custBuyer',
	]);
	const schema1 = {
		enum3,
		table: cockroachTable('enum_table', {
			id: enum3(),
		}),
		newSchema,
		table1: newSchema.table('enum_table', {
			id: enum3(),
		}),
	};

	const enum4 = cockroachEnum('enum_users_customer_and_ship_to_settings_roles', [
		'addedToTop',
		'custAll',
		'custAdmin',
		'custClerk',
		'custInvoiceManager',
		'custApprover',
		'custOrderWriter',
		'custBuyer',
	]);
	const schema2 = {
		enum4,
		table: cockroachTable('enum_table', {
			id: enum4(),
		}),
		newSchema,
		table1: newSchema.table('enum_table', {
			id: enum4(),
		}),
	};

	const schemas = ['public', 'mySchema'];
	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas });

	const st0 = [
		`ALTER TABLE "enum_table" ALTER COLUMN "id" SET DATA TYPE text;`,
		`ALTER TABLE "mySchema"."enum_table" ALTER COLUMN "id" SET DATA TYPE text;`,
		`DROP TYPE "enum_users_customer_and_ship_to_settings_roles";`,
		`CREATE TYPE "enum_users_customer_and_ship_to_settings_roles" AS ENUM('addedToTop', 'custAll', 'custAdmin', 'custClerk', 'custInvoiceManager', 'custApprover', 'custOrderWriter', 'custBuyer');`,
		`ALTER TABLE "enum_table" ALTER COLUMN "id" SET DATA TYPE "enum_users_customer_and_ship_to_settings_roles" USING "id"::"enum_users_customer_and_ship_to_settings_roles";`,
		`ALTER TABLE "mySchema"."enum_table" ALTER COLUMN "id" SET DATA TYPE "enum_users_customer_and_ship_to_settings_roles" USING "id"::"enum_users_customer_and_ship_to_settings_roles";`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('drop enum', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		users: cockroachTable('users', {
			col: enum1().default('value1'),
		}),
	};

	const to = {
		users: cockroachTable('users', {
			col: text().default('value1'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" ALTER COLUMN "col" DROP DEFAULT;',
		'ALTER TABLE "users" ALTER COLUMN "col" SET DATA TYPE string;',
		'ALTER TABLE "users" ALTER COLUMN "col" SET DEFAULT \'value1\';',
		`DROP TYPE "enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('drop enum value. enum is columns data type', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);

	const schema = cockroachSchema('new_schema');

	const from = {
		schema,
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
		table2: schema.table('table', {
			column: enum1('test_column'),
		}),
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3']);
	const to = {
		schema,
		enum2,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
		table2: schema.table('table', {
			column: enum1('test_column'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3');`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum" USING "test_column"::"enum";`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DATA TYPE "enum" USING "test_column"::"enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('drop enum value. column of enum type; drop default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);
	const from = {
		enum1,
		table: cockroachTable('table', {
			column1: enum1().default('value2'),
		}),
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3']);
	const to = {
		enum2,
		table: cockroachTable('table', {
			column1: enum2(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "column1" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "column1" DROP DEFAULT;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3');`,
		'ALTER TABLE "table" ALTER COLUMN "column1" SET DATA TYPE "enum" USING "column1"::"enum";',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4295
test.concurrent('drop enum value. column of enum type with default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);
	const from = {
		enum1,
		table: cockroachTable('table', {
			column1: enum1().default('value1'),
		}),
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3']);
	const to = {
		enum2,
		table: cockroachTable('table', {
			column1: enum2().default('value1'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "column1" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "column1" DROP DEFAULT;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3');`,
		'ALTER TABLE "table" ALTER COLUMN "column1" SET DATA TYPE "enum" USING "column1"::"enum";',
		`ALTER TABLE \"table\" ALTER COLUMN \"column1\" SET DEFAULT 'value1'::\"enum\";`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('shuffle enum values', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);

	const schema = cockroachSchema('new_schema');

	const from = {
		schema,
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
		table2: schema.table('table', {
			column: enum1('test_column'),
		}),
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		schema,
		enum2,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
		table2: schema.table('table', {
			column: enum1('test_column'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum" USING "test_column"::"enum";`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DATA TYPE "enum" USING "test_column"::"enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('column is enum type with default value. shuffle enum', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').default('value2'),
		}),
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column').default('value2'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		'ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum" USING "test_column"::"enum";',
		'ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT \'value2\'::"enum";',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('enums as ts enum', async ({ db }) => {
	enum Test {
		value = 'value',
	}

	const to = {
		enum: cockroachEnum('enum', Test),
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

test.concurrent('column is enum type with default value. shuffle enum', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').default('value2'),
		}),
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column').default('value2'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum" USING "test_column"::"enum";`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT 'value2'::"enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('column is array enum type with default value. shuffle enum', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array().default(['value2']),
		}),
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column').array().default(['value3']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum"[] USING "test_column"::"enum"[];`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT '{value3}'::"enum"[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('column is array enum with custom size type with default value. shuffle enum', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array(3).default(['value2']),
		}),
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column').array(3).default(['value2']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum"[] USING "test_column"::"enum"[];`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT '{value2}'::"enum"[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('column is array enum with custom size type. shuffle enum', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array(3),
		}),
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column').array(3),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`DROP TYPE "enum";`,
		`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum"[] USING "test_column"::"enum"[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('column is enum type with default value. custom schema. shuffle enum', async ({ db }) => {
	const schema = cockroachSchema('new_schema');

	const enum1 = schema.enum('enum', ['value1', 'value2', 'value3']);
	const from = {
		schema,
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').default('value2'),
		}),
	};

	const enum2 = schema.enum('enum', ['value1', 'value3', 'value2']);
	const to = {
		schema,
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column').default('value2'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;`,
		`DROP TYPE "new_schema"."enum";`,
		`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "new_schema"."enum" USING "test_column"::"new_schema"."enum";`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT 'value2'::"new_schema"."enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('column is array enum type with default value. custom schema. shuffle enum', async ({ db }) => {
	const schema = cockroachSchema('new_schema');

	const enum1 = schema.enum('enum', ['value1', 'value2', 'value3']);

	const from = {
		schema,
		enum1,
		table: schema.table('table', {
			column: enum1('test_column').array().default(['value2']),
		}),
	};

	const enum2 = schema.enum('enum', ['value1', 'value3', 'value2']);
	const to = {
		schema,
		enum2,
		table: schema.table('table', {
			column: enum2('test_column').array().default(['value2']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" DROP DEFAULT;`,
		`DROP TYPE "new_schema"."enum";`,
		`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DATA TYPE "new_schema"."enum"[] USING "test_column"::"new_schema"."enum"[];`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DEFAULT '{value2}'::"new_schema"."enum"[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('column is array enum type with custom size with default value. custom schema. shuffle enum', async ({ db }) => {
	const schema = cockroachSchema('new_schema');

	const enum1 = schema.enum('enum', ['value1', 'value2', 'value3']);

	const from = {
		schema,
		enum1,
		table: schema.table('table', {
			column: enum1('test_column').array(3).default(['value2']),
		}),
	};

	const enum2 = schema.enum('enum', ['value1', 'value3', 'value2']);
	const to = {
		schema,
		enum2,
		table: schema.table('table', {
			column: enum2('test_column').array(3).default(['value2']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		'ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" DROP DEFAULT;',
		`DROP TYPE "new_schema"."enum";`,
		`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DATA TYPE "new_schema"."enum"[] USING "test_column"::"new_schema"."enum"[];`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DEFAULT '{value2}'::"new_schema"."enum"[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('column is array enum type with custom size. custom schema. shuffle enum', async ({ db }) => {
	const schema = cockroachSchema('new_schema');

	const enum1 = schema.enum('enum', ['value1', 'value2', 'value3']);

	const from = {
		schema,
		enum1,
		table: schema.table('table', {
			column: enum1('test_column').array(3),
		}),
	};

	const enum2 = schema.enum('enum', ['value1', 'value3', 'value2']);
	const to = {
		schema,
		enum2,
		table: schema.table('table', {
			column: enum2('test_column').array(3),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DATA TYPE text;`,
		`DROP TYPE "new_schema"."enum";`,
		`CREATE TYPE "new_schema"."enum" AS ENUM('value1', 'value3', 'value2');`,
		`ALTER TABLE "new_schema"."table" ALTER COLUMN "test_column" SET DATA TYPE "new_schema"."enum"[] USING "test_column"::"new_schema"."enum"[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('column is enum type without default value. add default to column', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
	};

	const enum2 = cockroachEnum('enum', ['value1', 'value3']);
	const to = {
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column').default('value3'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT 'value3'::"enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from standart type to enum', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column'),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum" USING "test_column"::"enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from standart type to enum. column has default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').default('value2'),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').default('value3'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum" USING "test_column"::"enum";`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT 'value3'::"enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from array standart type to array enum. column has default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').array().default(['value2']),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array().default(['value3']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum"[] USING "test_column"::"enum"[];`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT '{value3}'::"enum"[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from array standart type to array enum. column without default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').array(),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum"[] USING "test_column"::"enum"[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from array standart type with custom size to array enum with custom size. column has default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').array(3).default(['value2']),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array(3).default(['value3']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum"[] USING "test_column"::"enum"[];`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT '{value3}'::"enum"[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from array standart type with custom size to array enum with custom size. column without default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').array(2),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array(2),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum"[] USING "test_column"::"enum"[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from enum type to standart type', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE varchar;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from array enum type to standart type', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array(),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').array(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE varchar[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from enum type to standart type. column has default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').default('value3'),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').default('value2'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE varchar;`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT 'value2';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from array enum type to array standart type', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array(),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').array(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE varchar[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from array enum with custom size type to array standart type with custom size', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array(2),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').array(2),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE varchar[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

//
test.concurrent('change data type from array enum type to array standart type. column has default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array().default(['value2']),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').array().default(['value2']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE varchar[];`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT '{value2}'::varchar[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from array enum type with custom size to array standart type with custom size. column has default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value2']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('test_column').array(3).default(['value2']),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').array(3).default(['value2']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE varchar[];`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT '{value2}'::varchar[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from standart type to standart type', async ({ db }) => {
	const from = {
		table: cockroachTable('table', {
			column: varchar('test_column'),
		}),
	};

	const to = {
		table: cockroachTable('table', {
			column: text('test_column'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE string;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from standart type to standart type. column has default', async ({ db }) => {
	const from = {
		table: cockroachTable('table', {
			column: varchar('test_column').default('value3'),
		}),
	};

	const to = {
		table: cockroachTable('table', {
			column: text('test_column').default('value2'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE string;`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT 'value2';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// TODO if leave "column" as name - strange error occurres. Could be bug in cockroachdb
test.concurrent('change data type from standart type to standart type. columns are arrays', async ({ db }) => {
	const from = {
		table: cockroachTable('table', {
			test_column: varchar('test_column').array(),
		}),
	};

	const to = {
		table: cockroachTable('table', {
			test_column: text('test_column').array(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE string[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from standart type to standart type. columns are arrays with custom sizes', async ({ db }) => {
	const from = {
		table: cockroachTable('table', {
			test_column: varchar('test_column').array(2),
		}),
	};

	const to = {
		table: cockroachTable('table', {
			test_column: text('test_column').array(2),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE string[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from standart type to standart type. columns are arrays. column has default', async ({ db }) => {
	const from = {
		table: cockroachTable('table', {
			test_column: varchar('test_column').array().default(['hello']),
		}),
	};

	const to = {
		table: cockroachTable('table', {
			test_column: text('test_column').array().default(['hello']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE string[];`,
		// TODO: discuss with @AndriiSherman, redundand statement
		// `ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT '{"hello"}';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from standart type to standart type. columns are arrays with custom sizes.column has default', async ({ db }) => {
	const from = {
		table: cockroachTable('table', {
			column: varchar('test_column').array(2).default(['hello']),
		}),
	};

	const to = {
		table: cockroachTable('table', {
			column: text('test_column').array(2).default(['hello']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE string[];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from one enum to other', async ({ db }) => {
	const enum1 = cockroachEnum('enum1', ['value1', 'value3']);
	const enum2 = cockroachEnum('enum2', ['value1', 'value3']);

	const from = {
		enum1,
		enum2,
		table: cockroachTable('table', {
			column: enum1('test_column'),
		}),
	};

	const to = {
		enum1,
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum2" USING "test_column"::text::"enum2";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from one enum to other. column has default', async ({ db }) => {
	const enum1 = cockroachEnum('enum1', ['value1', 'value3']);
	const enum2 = cockroachEnum('enum2', ['value1', 'value3']);

	const from = {
		enum1,
		enum2,
		table: cockroachTable('table', {
			column: enum1('test_column').default('value3'),
		}),
	};

	const to = {
		enum1,
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column').default('value3'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum2" USING "test_column"::text::"enum2";`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT 'value3'::"enum2";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from one enum to other. changed defaults', async ({ db }) => {
	const enum1 = cockroachEnum('enum1', ['value1', 'value3']);
	const enum2 = cockroachEnum('enum2', ['value1', 'value3']);

	const from = {
		enum1,
		enum2,
		table: cockroachTable('table', {
			column: enum1('test_column').default('value3'),
		}),
	};

	const to = {
		enum1,
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column').default('value1'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum2" USING "test_column"::text::"enum2";`,
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT 'value1'::"enum2";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('check filtering json statements. here we have recreate enum + set new type + alter default', async ({ db }) => {
	const enum1 = cockroachEnum('enum1', ['value1', 'value3']);
	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('test_column').default('value3'),
		}),
	};

	const enum2 = cockroachEnum('enum1', ['value3', 'value1', 'value2']);
	const to = {
		enum2,
		table: cockroachTable('table', {
			column: enum2('test_column').default('value2'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'DROP TYPE "enum1";',
		`CREATE TYPE "enum1" AS ENUM('value3', 'value1', 'value2');`,
		'ALTER TABLE "table" ALTER COLUMN "test_column" DROP DEFAULT;',
		'ALTER TABLE "table" ALTER COLUMN "test_column" SET DATA TYPE "enum1" USING "test_column"::"enum1";',
		`ALTER TABLE "table" ALTER COLUMN "test_column" SET DEFAULT 'value2'::"enum1";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('add column with same name as enum', async ({ db }) => {
	const statusEnum = cockroachEnum('status', ['inactive', 'active', 'banned']);

	const schema1 = {
		statusEnum,
		table1: cockroachTable('table1', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		statusEnum,
		table1: cockroachTable('table1', {
			id: int4('id').primaryKey(),
			status: statusEnum('status').default('inactive'),
		}),
		table2: cockroachTable('table2', {
			id: int4('id').primaryKey(),
			status: statusEnum('status').default('inactive'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		'CREATE TABLE "table2" (\n\t"id" int4 PRIMARY KEY,\n\t"status" "status" DEFAULT \'inactive\'::"status"\n);\n',
		'ALTER TABLE "table1" ADD COLUMN "status" "status" DEFAULT \'inactive\'::"status";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('enums ordering', async ({ db }) => {
	const schema1 = {
		enum: cockroachEnum('settings', ['all', 'admin']),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const schema3 = {
		enum: cockroachEnum('settings', ['new', 'all', 'admin']),
	};

	const { sqlStatements: st2, next: n2 } = await diff(n1, schema3, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema3 });

	expect(st2).toStrictEqual(["ALTER TYPE \"settings\" ADD VALUE 'new' BEFORE 'all';"]);
	expect(pst2).toStrictEqual(["ALTER TYPE \"settings\" ADD VALUE 'new' BEFORE 'all';"]);

	const schema4 = {
		enum3: cockroachEnum('settings', ['new', 'all', 'new2', 'admin']),
	};

	const { sqlStatements: st3, next: n3 } = await diff(n2, schema4, []);
	const { sqlStatements: pst3 } = await push({ db, to: schema4 });

	const st0 = [
		`ALTER TYPE "settings" ADD VALUE 'new2' BEFORE 'admin';`,
	];

	expect(st3).toStrictEqual(st0);
	expect(pst3).toStrictEqual(st0);

	const { sqlStatements: st4 } = await diff(n3, schema4, []);
	const { sqlStatements: pst4 } = await push({ db, to: schema4 });
	expect(st4).toStrictEqual([]);
	expect(pst4).toStrictEqual([]);
});

test.concurrent('change data type from standart type to enum. column has default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('column').default('value2'),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('column').default('value3'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;',
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";`,
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value3'::"enum";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from standart type to enum. set default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('column'),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('column').default('value1'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";',
		`ALTER TABLE \"table\" ALTER COLUMN \"column\" SET DEFAULT 'value1'::"enum";`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from standart type to enum. altered column has no default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('column').default('value2'),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('column'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;',
		'ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('change data type from standart type to enum. column has no default', async ({ db }) => {
	const enum1 = cockroachEnum('enum', ['value1', 'value3']);

	const from = {
		enum1,
		table: cockroachTable('table', {
			column: varchar('column'),
		}),
	};

	const to = {
		enum1,
		table: cockroachTable('table', {
			column: enum1('column'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
