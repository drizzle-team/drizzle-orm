import 'dotenv/config';
import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	char,
	check,
	decimal,
	double,
	float,
	foreignKey,
	int,
	longtext,
	mediumint,
	mediumtext,
	mysqlEnum,
	mysqlTable,
	mysqlView,
	primaryKey,
	serial,
	smallint,
	text,
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('Default value of character type column: char', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			sortKey: char('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'default-value-char');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('Default value of character type column: varchar', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			sortKey: varchar('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'default-value-varchar');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4602
test('introspect table with primary key and check', async () => {
	const schema = {
		table1: mysqlTable('table1', {
			column1: int().primaryKey(),
		}),
		table2: mysqlTable('table2', {
			column1: int(),
			column2: int(),
		}, (table) => [
			primaryKey({ columns: [table.column1, table.column2] }),
			check('age_check1', sql`${table.column1} > 21`),
		]),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'table-with-primary-key-and-check');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4110
test('introspect table with boolean(tinyint(1))', async () => {
	const schema = {
		table1: mysqlTable('table1', {
			column1: boolean(),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'table-with-boolean');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
