import { sql } from 'drizzle-orm';
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import { diffTestSchemasLibSQL, diffTestSchemasSqlite } from './schemaDiffer';

// https://github.com/drizzle-team/drizzle-orm/issues/5822
// When a table has to be recreated and a new column is added in the same
// migration, the generated `INSERT ... SELECT` must not select the newly added
// column from the old table, because it doesn't exist there yet.

test('sqlite recreate table does not select added columns from the old table', async () => {
	// Dropping the NOT NULL constraint on column2 forces SQLite to recreate the
	// table; column3 is added in the same migration.
	const schema1 = {
		test: sqliteTable('test', {
			column1: text('column1').notNull(),
			column2: text('column2').notNull(),
		}),
	};

	const schema2 = {
		test: sqliteTable('test', {
			column1: text('column1').notNull(),
			column2: text('column2'),
			column3: text('column3'),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(schema1, schema2, []);

	expect(sqlStatements).toContain(
		'INSERT INTO `__new_test`("column1", "column2") SELECT "column1", "column2" FROM `test`;',
	);

	for (const statement of sqlStatements) {
		expect(statement).not.toContain('SELECT "column1", "column2", "column3" FROM `test`');
	}
});

test('libsql recreate table does not select added columns from the old table', async () => {
	// LibSQL can drop NOT NULL in place, so a constraint change is used to force a
	// table recreate; column3 is added in the same migration.
	const schema1 = {
		test: sqliteTable('test', {
			column1: text('column1').notNull(),
			column2: text('column2').notNull(),
		}),
	};

	const schema2 = {
		test: sqliteTable('test', {
			column1: text('column1').notNull(),
			column2: text('column2').notNull(),
			column3: text('column3'),
		}, (t) => [check('ck', sql`${t.column1} <> ''`)]),
	};

	const { sqlStatements } = await diffTestSchemasLibSQL(schema1, schema2, []);

	expect(sqlStatements).toContain(
		'INSERT INTO `__new_test`("column1", "column2") SELECT "column1", "column2" FROM `test`;',
	);

	for (const statement of sqlStatements) {
		expect(statement).not.toContain('SELECT "column1", "column2", "column3" FROM `test`');
	}
});
