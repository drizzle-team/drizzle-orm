import Database from 'better-sqlite3';
import { SQL, sql } from 'drizzle-orm';
import { AnySQLiteColumn, check, int, integer, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import * as fs from 'fs';
import { interimToDDL } from 'src/dialects/sqlite/ddl';
import { fromDatabaseForDrizzle } from 'src/dialects/sqlite/introspect';
import { expect, test } from 'vitest';
import { dbFrom, diffAfterPull, push } from './mocks';

fs.mkdirSync('tests/sqlite/tmp', { recursive: true });

test('introspect tables with fk constraint', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', {
		id: integer(),
		name: text(),
	});

	const posts = sqliteTable('posts', {
		id: integer(),
		userId: integer('user_id').references(() => users.id).references(() => users.id, {
			onDelete: 'no action',
			onUpdate: 'no action',
		}),
	});
	const schema = { users, posts };

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'fk-tables');

	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4247
// TODO AnySQLiteColumn should be prefixed by `type` after introspection
test('introspect table with self reference', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', {
		id: integer(),
		name: text(),
		invited_id: integer().references((): AnySQLiteColumn => users.id),
	});

	const schema = { users };

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'self-ref-table');

	expect(sqlStatements).toStrictEqual([]);
});

test('generated always column: link to another column', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		users: sqliteTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs((): SQL => sql`\`email\``),
		}),
	};

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'generated-link-column');

	expect(sqlStatements).toStrictEqual([]);
});

test('generated always column virtual: link to another column', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		users: sqliteTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs((): SQL => sql`\`email\``, { mode: 'virtual' }),
		}),
	};

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'generated-link-column-virtual');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('complex generated always', async () => {
	const sqlite = new Database(':memory:');

	const generatedExpression = `trim(
		coalesce(\`first_name\`, '') || ' ' || coalesce(\`last_name\`, '') ||
		(CASE WHEN nullif(trim(coalesce(\`suffix\`, '')), '') IS NOT NULL THEN ' ' || trim(coalesce(\`suffix\`, '')) ELSE '' END)
	)`;

	const schema = {
		users: sqliteTable('users', {
			id: int('id'),
			firstName: text('first_name'),
			lastName: text('last_name'),
			suffix: text('suffix'),
			fullName: text('full_name').generatedAlwaysAs((): SQL => sql.raw(generatedExpression), { mode: 'virtual' }),
		}),
	};

	const { statements, sqlStatements, initDDL, resultDdl } = await diffAfterPull(
		sqlite,
		schema,
		'complex generated always',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(
		initDDL.columns.one({ name: 'full_name' })?.generated,
	).toEqual({
		as: `(${generatedExpression})`,
		type: 'virtual',
	});
	expect(
		resultDdl.columns.one({ name: 'full_name' })?.generated,
	).toEqual({
		as: `(${generatedExpression})`,
		type: 'virtual',
	});
});

test('instrospect strings with single quotes', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		columns: sqliteTable('columns', {
			text: text('text').default('escape\'s quotes " '),
		}),
	};

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'introspect-strings-with-single-quotes');

	expect(sqlStatements).toStrictEqual([]);
});

test('introspect checks', async () => {
	const sqlite = new Database(':memory:');

	const initSchema = {
		users: sqliteTable(
			'users',
			{
				id: int('id'),
				name: text('name'),
				age: int('age'),
			},
			(
				table,
			) => [check('some_check1', sql`${table.age} > 21`), check('some_check2', sql`${table.age} IN (21, 22, 23)`)],
		),
	};

	const db = dbFrom(sqlite);
	await push({
		db,
		to: initSchema,
	});

	const schema = await fromDatabaseForDrizzle(db);
	const { ddl, errors } = interimToDDL(schema);

	expect(errors.length).toBe(0);
	expect(ddl.checks.list().length).toBe(2);
	expect(ddl.checks.list()[0].name).toBe('some_check1');
	expect(ddl.checks.list()[0].value).toBe('"age" > 21');
	expect(ddl.checks.list()[1].name).toBe('some_check2');
	expect(ddl.checks.list()[1].value).toBe('"age" IN (21, 22, 23)');
});

test('view #1', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', { id: int('id') });
	const testView = sqliteView('some_view', { id: int('id') }).as(sql`SELECT * FROM ${users}`);
	// view with \n newlines
	const testView2 = sqliteView('some_view2', { id: int('id') }).as(
		sql`SELECT\n*\nFROM\n${users}`,
	);
	const testView3 = sqliteView('some_view3', { id: int('id') }).as(
		sql`WITH temp as (SELECT 1) SELECT\n*\nFROM\n${users}`,
	);

	const schema = {
		users: users,
		testView,
		testView2,
		testView3,
	};

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'view-1');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('broken view', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', { id: int('id') });
	const testView1 = sqliteView('some_view1', { id: int('id') }).as(sql`SELECT id FROM ${users}`);
	const testView2 = sqliteView('some_view2', { id: int('id'), name: text('name') }).as(
		sql`SELECT id, name FROM ${users}`,
	);

	const schema = {
		users: users,
		testView1,
		testView2,
	};

	const { statements, sqlStatements, resultDdl } = await diffAfterPull(sqlite, schema, 'broken-view');

	expect(
		resultDdl.views.one({
			name: 'some_view2',
		})?.error,
	).toBeTypeOf('string');
	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
