import 'dotenv/config';
import {
	bigint,
	char,
	decimal,
	double,
	float,
	int,
	mediumint,
	singlestoreTable,
	smallint,
	tinyint,
	varchar,
} from 'drizzle-orm/singlestore-core';
import * as fs from 'fs';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { prepareTestDatabase, pullDiff, TestDatabase } from './mocks';

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

if (!fs.existsSync('tests/singlestore/tmp')) {
	fs.mkdirSync('tests/singlestore/tmp', { recursive: true });
}

// TODO: Unskip this test when generated column is implemented
/* test.skip('generated always column: link to another column', async () => {
	const schema = {
		users: singlestoreTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
			),
		}),
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		db,
		schema,
		'generated-link-column',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
}); */

// TODO: Unskip this test when generated column is implemented
/* test.skip('generated always column virtual: link to another column', async () => {
	const schema = {
		users: singlestoreTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
				{ mode: 'virtual' },
			),
		}),
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		db,
		schema,
		'generated-link-column-virtual',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
}); */

test('Default value of character type column: char', async () => {
	const schema = {
		users: singlestoreTable('users', {
			id: int('id'),
			sortKey: char('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await pullDiff(db, schema, 'default-value-char-column');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('Default value of character type column: varchar', async () => {
	const schema = {
		users: singlestoreTable('users', {
			id: int('id'),
			sortKey: varchar('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await pullDiff(db, schema, 'default-value-varchar-column');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// TODO: Unskip this test when views are implemented
/* test('view #1', async () => {
	const users = singlestoreTable('users', { id: int('id') });
	const testView = singlestoreView('some_view', { id: int('id') }).as(
		sql`select \`drizzle\`.\`users\`.\`id\` AS \`id\` from \`drizzle\`.\`users\``,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		db,
		schema,
		'view-1',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
}); */

// TODO: Unskip this test when views are implemented
/* test('view #2', async () => {
	const users = singlestoreTable('some_users', { id: int('id') });
	const testView = singlestoreView('some_view', { id: int('id') }).algorithm('temptable').sqlSecurity('definer').as(
		sql`SELECT * FROM ${users}`,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		db,
		schema,
		'view-2',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
}); */

test('handle float type', async () => {
	const schema = {
		table: singlestoreTable('table', {
			col1: float(),
			col2: float({ precision: 2 }),
			col3: float({ precision: 2, scale: 1 }),
		}),
	};

	const { statements, sqlStatements } = await pullDiff(db, schema, 'handle-float-type');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('handle unsigned numerical types', async () => {
	const schema = {
		table: singlestoreTable('table', {
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

	const { statements, sqlStatements } = await pullDiff(db, schema, 'handle-unsigned-numerical-types');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5053
test('single quote default', async () => {
	const group = singlestoreTable('group', {
		id: varchar({ length: 10 }).notNull(),
		fk_organizaton_group: varchar({ length: 10 }).notNull(),
		saml_identifier: varchar({ length: 10 }).default('').notNull(),
		display_name: varchar({ length: 10 }).default('').notNull(),
	});

	const { sqlStatements } = await pullDiff(
		db,
		{ group },
		'single_quote_default',
	);

	expect(sqlStatements).toStrictEqual([]);
});
