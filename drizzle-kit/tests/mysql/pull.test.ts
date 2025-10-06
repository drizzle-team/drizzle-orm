import 'dotenv/config';
import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	blob,
	boolean,
	char,
	check,
	customType,
	decimal,
	double,
	float,
	foreignKey,
	index,
	int,
	json,
	longblob,
	longtext,
	mediumblob,
	mediumint,
	mediumtext,
	mysqlEnum,
	mysqlTable,
	mysqlView,
	primaryKey,
	serial,
	smallint,
	text,
	tinyblob,
	tinyint,
	tinytext,
	varchar,
} from 'drizzle-orm/mysql-core';
import * as fs from 'fs';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diffIntrospect, prepareTestDatabase, TestDatabase } from './mocks';

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

if (!fs.existsSync('tests/mysql/tmp')) {
	fs.mkdirSync('tests/mysql/tmp', { recursive: true });
}

test('generated always column: link to another column', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
			),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'generated-link');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('generated always column virtual: link to another column', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
				{ mode: 'virtual' },
			),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'generated-link-virtual');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('Default value of character type column: char', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			sortKey: char('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'default-value-char');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3318
// https://github.com/drizzle-team/drizzle-orm/issues/1754
test('Default value of character type column: varchar', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			sortKey: varchar('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'default-value-varchar');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4786
test('Default value of character type column: enum', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			status: mysqlEnum(['0', '1', '2']).default('0'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'default-value-enum');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3559
// https://github.com/drizzle-team/drizzle-orm/issues/4713
test('Default value of empty string column: enum, char, varchar, text, tinytext, mediumtext, longtext', async () => {
	const schema = {
		table1: mysqlTable('table1', {
			column1: mysqlEnum(['0', '1', '2', '']).default(''),
			column2: char({ length: 50 }).default(''),
			column3: varchar({ length: 50 }).default(''),
			column4: text().default(''),
			column5: tinytext().default(''),
			column6: mediumtext().default(''),
			column7: longtext().default(''),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'default-value-of-empty-string');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('introspect checks', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: serial('id'),
			name: varchar('name', { length: 255 }),
			age: int('age'),
		}, (table) => [check('some_check', sql`${table.age} > 21`)]),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'checks');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('view #1', async () => {
	const users = mysqlTable('users', { id: int('id') });
	const testView = mysqlView('some_view', { id: int('id') }).as(
		sql`select \`drizzle\`.\`users\`.\`id\` AS \`id\` from \`drizzle\`.\`users\``,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'view-1');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('view #2', async () => {
	const users = mysqlTable('some_users', { id: int('id') });
	const testView = mysqlView('some_view', { id: int('id') }).algorithm('temptable').sqlSecurity('definer').as(
		sql`SELECT * FROM ${users}`,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'view-2');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('handle float type', async () => {
	const schema = {
		table: mysqlTable('table', {
			col1: float(),
			col2: float({ precision: 2 }),
			col3: float({ precision: 2, scale: 1 }),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'float-type');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('handle unsigned numerical types', async () => {
	const schema = {
		table: mysqlTable('table', {
			col1: int({ unsigned: true }),
			col2: tinyint({ unsigned: true }),
			col3: smallint({ unsigned: true }),
			col4: mediumint({ unsigned: true }),
			col5: bigint({ mode: 'number', unsigned: true }),
			col6: float({ unsigned: true }),
			col7: float({ precision: 2, scale: 1, unsigned: true }),
			col8: double({ unsigned: true }),
			col9: double({ precision: 2, scale: 1, unsigned: true }),
			col10: decimal({ unsigned: true }),
			col11: decimal({ precision: 2, scale: 1, unsigned: true }),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'unsigned-numerical-types');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('instrospect strings with single quotes', async () => {
	const schema = {
		columns: mysqlTable('columns', {
			enum: mysqlEnum('my_enum', ['escape\'s quotes "', 'escape\'s quotes 2 "']).default('escape\'s quotes "'),
			text: text('text').default('escape\'s quotes " '),
			varchar: varchar('varchar', { length: 255 }).default('escape\'s quotes " '),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'strings-with-single-quotes');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3297
test('introspect varchar with \r\n in default, column name starts with number', async () => {
	// TODO: revise: seems like corner case
	const schema = {
		table1: mysqlTable('table1', {
			column1: varchar({ length: 24 }).notNull().default(' aaa\r\nbbbb'),
			'2column_': tinyint('2column_').default(0).notNull(),
			column3: decimal({ precision: 2, scale: 1, unsigned: true }).notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'introspect-varchar-with-breakline');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('charSet and collate', async () => {
	const schema = {
		columns: mysqlTable('columns', {
			name1: varchar('name1', { length: 1 }).charSet('big5').collate('big5_chinese_ci'),
			name2: char('name2').charSet('big5').collate('big5_chinese_ci'),
			name3: text('name3').charSet('big5').collate('big5_chinese_ci'),
			name4: tinytext('name4').charSet('big5').collate('big5_chinese_ci'),
			name5: mediumtext('name5').charSet('big5').collate('big5_chinese_ci'),
			name6: longtext('name6').charSet('big5').collate('big5_chinese_ci'),
			name7: mysqlEnum('test_enum', ['1', '2']).charSet('big5').collate('big5_chinese_ci'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'charSet_and_collate');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2988
// https://github.com/drizzle-team/drizzle-orm/issues/4653
test('introspect bigint, mediumint, int, smallint, tinyint', async () => {
	const schema = {
		columns: mysqlTable('columns', {
			column1: tinyint(),
			column2: smallint(),
			column3: int(),
			column4: mediumint(),
			column5: bigint({ mode: 'bigint' }),
			column6: bigint({ mode: 'number' }),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'introspect-int');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/1428
// https://github.com/drizzle-team/drizzle-orm/issues/3552
// https://github.com/drizzle-team/drizzle-orm/issues/4602
test('introspect table with primary key and check', async () => {
	const schema = {
		table1: mysqlTable('table1', {
			column1: int().autoincrement().primaryKey(),
		}),
		table2: mysqlTable('table2', {
			column1: int().autoincrement(),
		}, (table) => [
			primaryKey({ columns: [table.column1] }),
		]),
		table3: mysqlTable('table3', {
			column1: int(),
			column2: int(),
		}, (table) => [
			primaryKey({ columns: [table.column1, table.column2] }),
			check('age_check1', sql`${table.column1} > 21`),
		]),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'table-with-primary-key-and-check');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4415
test('introspect table with fk', async () => {
	const table1 = mysqlTable('table1', {
		column1: int().primaryKey(),
	});
	const table2 = mysqlTable('table2', {
		column1: int(),
		column2: int().references(() => table1.column1),
	}, (table) => [
		foreignKey({ columns: [table.column1], foreignColumns: [table1.column1], name: 'custom_fk' }),
	]);
	const schema = { table1, table2 };

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'table-with-fk');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4115
test('introspect fk name with onDelete, onUpdate set', async () => {
	const table1 = mysqlTable('table1', {
		column1: int().primaryKey(),
	});
	const table2 = mysqlTable('table2', {
		column1: int(),
	}, (table) => [
		foreignKey({ columns: [table.column1], foreignColumns: [table1.column1], name: 'custom_fk' }),
	]);
	const schema = { table1, table2 };

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'fk-with-on-delete-and-on-update');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4110
test('introspect table with boolean(tinyint(1))', async () => {
	const schema = {
		table1: mysqlTable('table1', {
			column1: boolean(),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'table-with-boolean');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3046
// TODO: revise: seems like drizzle-kit can't do this right now
test('introspect index on json', async () => {
	const schema = {
		table1: mysqlTable('table1', {
			column1: json(),
		}, (table) => [
			index('custom_json_index').on(
				sql`(((cast(json_unquote(json_extract(${table.column1}, _utf8mb4'$.data.nestedJsonProperty.')) as char(30) charset utf8mb4) collate utf8mb4_bin)))`,
			),
		]),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'index-on-json');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('introspect blob, tinyblob, mediumblob, longblob', async () => {
	const schema = {
		columns: mysqlTable('columns', {
			column1: tinyblob(),
			column2: mediumblob(),
			column3: blob(),
			column4: mediumblob(),
			column5: longblob(),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'introspect-blobs');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3480
test('introspect bit(1); custom type', async () => {
	const schema = {
		table1: mysqlTable('table1', {
			column1: customType({ dataType: () => 'bit(1)' })().default("b'1'"), // this fails
			column2: customType({ dataType: () => 'bit(1)' })().default(sql`b'1'`), // this works fine
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'introspect-bit(1)');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
