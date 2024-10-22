// test cases

import { SQL, sql } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('generated as callback: add column with generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			column: {
				generated: {
					as: '"users"."name" || \'hello\'',
					type: 'stored',
				},
				name: 'gen_name',
				notNull: false,
				primaryKey: false,
				type: 'text',
			},
			schema: '',
			tableName: 'users',
			type: 'alter_table_add_column',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS (\"users\".\"name\" || 'hello') STORED;`,
	]);
});

test('generated as callback: add generated constraint to an exisiting column', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} || 'to add'`),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: undefined,
			columnDefault: undefined,
			columnGenerated: { as: '"users"."name" || \'to add\'', type: 'stored' },
			columnName: 'gen_name',
			columnNotNull: true,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_set_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" drop column "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'to add\') STORED NOT NULL;',
	]);
});

test('generated as callback: drop generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name} || 'to delete'`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: undefined,
			columnDefault: undefined,
			columnGenerated: undefined,
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \"users\" ALTER COLUMN \"gen_name\" DROP EXPRESSION;`,
	]);
});

test('generated as callback: change generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: undefined,
			columnDefault: undefined,
			columnGenerated: { as: '"users"."name" || \'hello\'', type: 'stored' },
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_alter_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" drop column "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	]);
});

// ---

test('generated as sql: add column with generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			column: {
				generated: {
					as: '"users"."name" || \'hello\'',
					type: 'stored',
				},
				name: 'gen_name',
				notNull: false,
				primaryKey: false,
				type: 'text',
			},
			schema: '',
			tableName: 'users',
			type: 'alter_table_add_column',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS (\"users\".\"name\" || 'hello') STORED;`,
	]);
});

test('generated as sql: add generated constraint to an exisiting column', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`\"users\".\"name\" || 'to add'`),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: undefined,
			columnDefault: undefined,
			columnGenerated: { as: '"users"."name" || \'to add\'', type: 'stored' },
			columnName: 'gen_name',
			columnNotNull: true,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_set_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" drop column "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'to add\') STORED NOT NULL;',
	]);
});

test('generated as sql: drop generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'to delete'`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: undefined,
			columnDefault: undefined,
			columnGenerated: undefined,
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \"users\" ALTER COLUMN \"gen_name\" DROP EXPRESSION;`,
	]);
});

test('generated as sql: change generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\"`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: undefined,
			columnDefault: undefined,
			columnGenerated: { as: '"users"."name" || \'hello\'', type: 'stored' },
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_alter_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" drop column "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	]);
});

// ---

test('generated as string: add column with generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			column: {
				generated: {
					as: '"users"."name" || \'hello\'',
					type: 'stored',
				},
				name: 'gen_name',
				notNull: false,
				primaryKey: false,
				type: 'text',
			},
			schema: '',
			tableName: 'users',
			type: 'alter_table_add_column',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS (\"users\".\"name\" || 'hello') STORED;`,
	]);
});

test('generated as string: add generated constraint to an exisiting column', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(`\"users\".\"name\" || 'to add'`),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: undefined,
			columnDefault: undefined,
			columnGenerated: { as: '"users"."name" || \'to add\'', type: 'stored' },
			columnName: 'gen_name',
			columnNotNull: true,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_set_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" drop column "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'to add\') STORED NOT NULL;',
	]);
});

test('generated as string: drop generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\"users\".\"name\" || 'to delete'`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: undefined,
			columnDefault: undefined,
			columnGenerated: undefined,
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \"users\" ALTER COLUMN \"gen_name\" DROP EXPRESSION;`,
	]);
});

test('generated as string: change generated constraint', async () => {
	const from = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: undefined,
			columnDefault: undefined,
			columnGenerated: { as: '"users"."name" || \'hello\'', type: 'stored' },
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_alter_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" drop column "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	]);
});
