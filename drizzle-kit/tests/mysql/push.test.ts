import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	binary,
	char,
	check,
	date,
	datetime,
	decimal,
	double,
	float,
	int,
	json,
	mediumint,
	mysqlEnum,
	mysqlTable,
	mysqlView,
	primaryKey,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import fs from 'fs';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diffPush, prepareTestDatabase, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}

let _: TestDatabase;
let db: DB;

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

if (!fs.existsSync('tests/push/mysql')) {
	fs.mkdirSync('tests/push/mysql');
}

test('all types', async () => {
	const schema1 = {
		allBigInts: mysqlTable('all_big_ints', {
			simple: bigint('simple', { mode: 'number' }),
			columnNotNull: bigint('column_not_null', { mode: 'number' }).notNull(),
			columnDefault: bigint('column_default', { mode: 'number' }).default(12),
			columnDefaultSql: bigint('column_default_sql', { mode: 'number' }).default(12),
		}),
		allBools: mysqlTable('all_bools', {
			simple: tinyint('simple'),
			columnNotNull: tinyint('column_not_null').notNull(),
			columnDefault: tinyint('column_default').default(1),
		}),
		allChars: mysqlTable('all_chars', {
			simple: char('simple', { length: 1 }),
			columnNotNull: char('column_not_null', { length: 45 }).notNull(),
			// columnDefault: char("column_default", { length: 1 }).default("h"),
			columnDefaultSql: char('column_default_sql', { length: 1 }).default('h'),
		}),
		allDateTimes: mysqlTable('all_date_times', {
			simple: datetime('simple', { mode: 'string', fsp: 1 }),
			columnNotNull: datetime('column_not_null', { mode: 'string' }).notNull(),
			columnDefault: datetime('column_default', { mode: 'string' }).default('2023-03-01 14:05:29'),
		}),
		allDates: mysqlTable('all_dates', {
			simple: date('simple', { mode: 'string' }),
			column_not_null: date('column_not_null', { mode: 'string' }).notNull(),
			column_default: date('column_default', { mode: 'string' }).default('2023-03-01'),
		}),
		allDecimals: mysqlTable('all_decimals', {
			simple: decimal('simple', { precision: 1, scale: 0 }),
			columnNotNull: decimal('column_not_null', { precision: 45, scale: 3 }).notNull(),
			columnDefault: decimal('column_default', { precision: 10, scale: 0 }).default('100'),
			columnDefaultSql: decimal('column_default_sql', { precision: 10, scale: 0 }).default('101'),
		}),

		allDoubles: mysqlTable('all_doubles', {
			simple: double('simple'),
			columnNotNull: double('column_not_null').notNull(),
			columnDefault: double('column_default').default(100),
			columnDefaultSql: double('column_default_sql').default(101),
		}),

		allEnums: mysqlTable('all_enums', {
			simple: mysqlEnum('simple', ['hi', 'hello']),
		}),

		allEnums1: mysqlTable('all_enums1', {
			simple: mysqlEnum('simple', ['hi', 'hello']).default('hi'),
		}),

		allFloats: mysqlTable('all_floats', {
			columnNotNull: float('column_not_null').notNull(),
			columnDefault: float('column_default').default(100),
			columnDefaultSql: float('column_default_sql').default(101),
		}),

		allInts: mysqlTable('all_ints', {
			simple: int('simple'),
			columnNotNull: int('column_not_null').notNull(),
			columnDefault: int('column_default').default(100),
			columnDefaultSql: int('column_default_sql').default(101),
		}),

		allIntsRef: mysqlTable('all_ints_ref', {
			simple: int('simple'),
			columnNotNull: int('column_not_null').notNull(),
			columnDefault: int('column_default').default(100),
			columnDefaultSql: int('column_default_sql').default(101),
		}),

		allJsons: mysqlTable('all_jsons', {
			columnDefaultObject: json('column_default_object').default({ hello: 'world world' }).notNull(),
			columnDefaultArray: json('column_default_array').default({
				hello: { 'world world': ['foo', 'bar'] },
				foo: 'bar',
				fe: 23,
			}),
			column: json('column'),
		}),

		allMInts: mysqlTable('all_m_ints', {
			simple: mediumint('simple'),
			columnNotNull: mediumint('column_not_null').notNull(),
			columnDefault: mediumint('column_default').default(100),
			columnDefaultSql: mediumint('column_default_sql').default(101),
		}),

		allReals: mysqlTable('all_reals', {
			simple: double('simple', { precision: 5, scale: 2 }),
			columnNotNull: double('column_not_null').notNull(),
			columnDefault: double('column_default').default(100),
			columnDefaultSql: double('column_default_sql').default(101),
		}),

		allSInts: mysqlTable('all_s_ints', {
			simple: smallint('simple'),
			columnNotNull: smallint('column_not_null').notNull(),
			columnDefault: smallint('column_default').default(100),
			columnDefaultSql: smallint('column_default_sql').default(101),
		}),

		allSmallSerials: mysqlTable('all_small_serials', {
			columnAll: serial('column_all').primaryKey().notNull(),
		}),

		allTInts: mysqlTable('all_t_ints', {
			simple: tinyint('simple'),
			columnNotNull: tinyint('column_not_null').notNull(),
			columnDefault: tinyint('column_default').default(10),
			columnDefaultSql: tinyint('column_default_sql').default(11),
		}),

		allTexts: mysqlTable('all_texts', {
			simple: text('simple'),
			columnNotNull: text('column_not_null').notNull(),
			columnDefault: text('column_default').default('hello'),
			columnDefaultSql: text('column_default_sql').default('hello'),
		}),

		allTimes: mysqlTable('all_times', {
			simple: time('simple', { fsp: 1 }),
			columnNotNull: time('column_not_null').notNull(),
			columnDefault: time('column_default').default('22:12:12'),
		}),

		allTimestamps: mysqlTable('all_timestamps', {
			columnDateNow: timestamp('column_date_now', { fsp: 1, mode: 'string' }).default(sql`(now())`),
			columnAll: timestamp('column_all', { mode: 'string' })
				.default('2023-03-01 14:05:29')
				.notNull(),
			column: timestamp('column', { mode: 'string' }).default('2023-02-28 16:18:31'),
		}),

		allVarChars: mysqlTable('all_var_chars', {
			simple: varchar('simple', { length: 100 }),
			columnNotNull: varchar('column_not_null', { length: 45 }).notNull(),
			columnDefault: varchar('column_default', { length: 100 }).default('hello'),
			columnDefaultSql: varchar('column_default_sql', { length: 100 }).default('hello'),
		}),

		allVarbinaries: mysqlTable('all_varbinaries', {
			simple: varbinary('simple', { length: 100 }),
			columnNotNull: varbinary('column_not_null', { length: 100 }).notNull(),
			columnDefault: varbinary('column_default', { length: 12 }).default(sql`(uuid_to_bin(uuid()))`),
		}),

		allYears: mysqlTable('all_years', {
			simple: year('simple'),
			columnNotNull: year('column_not_null').notNull(),
			columnDefault: year('column_default').default(2022),
		}),

		binafry: mysqlTable('binary', {
			simple: binary('simple', { length: 1 }),
			columnNotNull: binary('column_not_null', { length: 1 }).notNull(),
			columnDefault: binary('column_default', { length: 12 }).default(sql`(uuid_to_bin(uuid()))`),
		}),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema1,
	});

	expect(sqlStatements).toStrictEqual([]);
});

test('add check constraint to table', async () => {
	const schema1 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}),
	};
	const schema2 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}, (table) => [check('some_check1', sql`${table.values} < 100`), check('some_check2', sql`'test' < 100`)]),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE \`test\` ADD CONSTRAINT \`some_check1\` CHECK (\`test\`.\`values\` < 100);',
		`ALTER TABLE \`test\` ADD CONSTRAINT \`some_check2\` CHECK ('test' < 100);`,
	]);
});

test('drop check constraint to table', async () => {
	const schema1 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}, (table) => [
			check('some_check1', sql`${table.values} < 100`),
			check('some_check2', sql`'test' < 100`),
		]),
	};
	const schema2 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE \`test\` DROP CONSTRAINT \`some_check1\`;',
		`ALTER TABLE \`test\` DROP CONSTRAINT \`some_check2\`;`,
	]);
});

test('db has checks. Push with same names', async () => {
	const schema1 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => [
			check('some_check', sql`${table.values} < 100`),
		]),
	};
	const schema2 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => [
			check('some_check', sql`some new value`),
		]),
	};

	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([]);
});

test('create view', async () => {
	const table = mysqlTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table)),
	};

	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([
		`CREATE ALGORITHM = undefined
SQL SECURITY definer
VIEW \`view\` AS (select \`id\` from \`test\`);`,
	]);
});

test('drop view', async () => {
	const table = mysqlTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([
		'DROP VIEW \`view\`;',
	]);
});

test('alter view ".as"', async () => {
	const table = mysqlTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table).where(sql`${table.id} = 1`)),
	};

	const schema2 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table)),
	};

	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([]);
});

test('alter meta options with distinct in definition', async () => {
	const table = mysqlTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: mysqlView('view').withCheckOption('cascaded').sqlSecurity('definer').algorithm('merge').as((
			qb,
		) => qb.selectDistinct().from(table).where(sql`${table.id} = 1`)),
	};

	const schema2 = {
		test: table,
		view: mysqlView('view').withCheckOption('cascaded').sqlSecurity('definer').algorithm('undefined').as((qb) =>
			qb.selectDistinct().from(table)
		),
	};

	await expect(diffPush({ db, init: schema1, destination: schema2 })).rejects.toThrowError();
});

test('add generated column', async () => {
	const schema1 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const schema2 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
			generatedName1: text('gen_name1').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name} || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
		"ALTER TABLE `users` ADD `gen_name1` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter column add generated', async () => {
	const schema1 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name'),
			generatedName1: text('gen_name1'),
		}),
	};
	const schema2 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
			generatedName1: text('gen_name1').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name} || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
		'ALTER TABLE `users` DROP COLUMN `gen_name1`;',
		"ALTER TABLE `users` ADD `gen_name1` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter column drop generated', async () => {
	const schema1 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name}`,
				{ mode: 'stored' },
			),
			generatedName1: text('gen_name1').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name}`,
				{ mode: 'virtual' },
			),
		}),
	};
	const schema2 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name'),
			generatedName1: text('gen_name1'),
		}),
	};

	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` MODIFY COLUMN `gen_name` text;',
		'ALTER TABLE `users` DROP COLUMN `gen_name1`;',
		'ALTER TABLE `users` ADD `gen_name1` text;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter generated', async () => {
	const schema1 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name}`,
				{ mode: 'stored' },
			),
			generatedName1: text('gen_name1').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name}`,
				{ mode: 'virtual' },
			),
		}),
	};
	const schema2 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
			generatedName1: text('gen_name1').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name} || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([]);
});

test('composite pk', async () => {
	const schema1 = {};

	const schema2 = {
		table: mysqlTable('table', {
			col1: int('col1').notNull(),
			col2: int('col2').notNull(),
		}, (t) => [
			primaryKey({
				columns: [t.col1, t.col2],
			}),
		]),
	};

	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `table` (\n\t`col1` int NOT NULL,\n\t`col2` int NOT NULL,\n\tCONSTRAINT `table_col1_col2_pk` PRIMARY KEY(`col1`,`col2`)\n);\n',
	]);
});

test('rename with composite pk', async () => {
	const productsCategoriesTable = (tableName: string) => {
		return mysqlTable(tableName, {
			productId: varchar('product_id', { length: 10 }).notNull(),
			categoryId: varchar('category_id', { length: 10 }).notNull(),
		}, (t) => [
			primaryKey({
				columns: [t.productId, t.categoryId],
			}),
		]);
	};

	const schema1 = {
		table: productsCategoriesTable('products_categories'),
	};
	const schema2 = {
		test: productsCategoriesTable('products_to_categories'),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		renames: ['products_categories->products_to_categories'],
	});

	expect(sqlStatements).toStrictEqual([
		'RENAME TABLE `products_categories` TO `products_to_categories`;',
		'ALTER TABLE `products_to_categories` DROP PRIMARY KEY;',
		'ALTER TABLE `products_to_categories` ADD PRIMARY KEY (`product_id`,`category_id`);',
	]);
});
