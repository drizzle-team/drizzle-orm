import { foreignKey, index, int, integer, sqliteTable, sqliteView, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { JsonRecreateTableStatement, JsonStatement } from 'src/jsonStatements';
import { expect, test } from 'vitest';
import { diffTestSchemasLibSQL } from './schemaDiffer';

test('drop autoincrement', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
		}),
	};

	const { statements } = await diffTestSchemasLibSQL(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}],
		compositePKs: [],
		columnsToTransfer: ['id'],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonStatement);
});

test('set autoincrement', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const { statements } = await diffTestSchemasLibSQL(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [{
			autoincrement: true,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}],
		compositePKs: [],
		columnsToTransfer: ['id'],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
	});
});

test('set not null', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_alter_column_set_notnull',
		tableName: 'users',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: undefined,
		columnOnUpdate: undefined,
		columnNotNull: true,
		columnAutoIncrement: false,
		columnPk: false,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` ALTER COLUMN `name` TO `name` text NOT NULL;',
	);
});

test('drop not null', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_alter_column_drop_notnull',
		tableName: 'users',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: undefined,
		columnOnUpdate: undefined,
		columnNotNull: false,
		columnAutoIncrement: false,
		columnPk: false,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` ALTER COLUMN `name` TO `name` text;',
	);
});

test('set default. set not null. add column', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull().default('name'),
			age: int('age').notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(3);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_alter_column_set_default',
		tableName: 'users',
		columnName: 'name',
		newDefaultValue: "'name'",
		schema: '',
		newDataType: 'text',
		columnOnUpdate: undefined,
		columnNotNull: true,
		columnAutoIncrement: false,
		columnPk: false,
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_table_alter_column_set_notnull',
		tableName: 'users',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: "'name'",
		columnOnUpdate: undefined,
		columnNotNull: true,
		columnAutoIncrement: false,
		columnPk: false,
	});
	expect(statements[2]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: undefined,
		column: {
			name: 'age',
			type: 'integer',
			primaryKey: false,
			notNull: true,
			autoincrement: false,
		},
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		"ALTER TABLE `users` ALTER COLUMN `name` TO `name` text NOT NULL DEFAULT 'name';",
	);
	expect(sqlStatements[1]).toBe(
		'ALTER TABLE `users` ADD `age` integer NOT NULL;',
	);
});

test('drop default. drop not null', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull().default('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_alter_column_drop_default',
		tableName: 'users',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: undefined,
		columnOnUpdate: undefined,
		columnNotNull: false,
		columnAutoIncrement: false,
		columnPk: false,
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_table_alter_column_drop_notnull',
		tableName: 'users',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: undefined,
		columnOnUpdate: undefined,
		columnNotNull: false,
		columnAutoIncrement: false,
		columnPk: false,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` ALTER COLUMN `name` TO `name` text;',
	);
});

test('set data type. set default', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: int('name').default(123),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_alter_column_set_type',
		tableName: 'users',
		columnName: 'name',
		newDataType: 'integer',
		oldDataType: 'text',
		schema: '',
		columnDefault: 123,
		columnOnUpdate: undefined,
		columnNotNull: false,
		columnAutoIncrement: false,
		columnPk: false,
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_table_alter_column_set_default',
		tableName: 'users',
		columnName: 'name',
		schema: '',
		newDataType: 'integer',
		newDefaultValue: 123,
		columnOnUpdate: undefined,
		columnNotNull: false,
		columnAutoIncrement: false,
		columnPk: false,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` ALTER COLUMN `name` TO `name` integer DEFAULT 123;',
	);
});

test('add foriegn key', async (t) => {
	const schema = {
		table: sqliteTable('table', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			tableId: int('table_id'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			tableId: int('table_id').references(() => schema.table.id),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_reference',
		tableName: 'users',
		data: 'users_table_id_table_id_fk;users;table_id;table;id;no action;no action',
		schema: '',
		columnNotNull: false,
		columnDefault: undefined,
		columnType: 'integer',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` ALTER COLUMN `table_id` TO `table_id` integer REFERENCES table(id) ON DELETE no action ON UPDATE no action;',
	);
});

test('drop foriegn key', async (t) => {
	const schema = {
		table: sqliteTable('table', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			tableId: int('table_id').references(() => schema.table.id, {
				onDelete: 'cascade',
			}),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			tableId: int('table_id'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				autoincrement: true,
				generated: undefined,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'table_id',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		columnsToTransfer: ['id', 'table_id'],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
	});

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`PRAGMA foreign_keys=OFF;`);
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`table_id\` integer
);\n`);
	expect(sqlStatements[2]).toBe(
		'INSERT INTO `__new_users`(`id`, `table_id`) SELECT `id`, `table_id` FROM `users`;',
	);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
	);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
});

test('alter foriegn key', async (t) => {
	const tableRef = sqliteTable('table', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name'),
	});
	const tableRef2 = sqliteTable('table2', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name'),
	});

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			tableId: int('table_id').references(() => tableRef.id, {
				onDelete: 'cascade',
			}),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			tableId: int('table_id').references(() => tableRef2.id),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				autoincrement: true,
				generated: undefined,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'table_id',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		columnsToTransfer: ['id', 'table_id'],
		referenceData: [
			{
				columnsFrom: ['table_id'],
				columnsTo: ['id'],
				name: 'users_table_id_table2_id_fk',
				onDelete: 'no action',
				onUpdate: 'no action',
				tableFrom: 'users',
				tableTo: 'table2',
			},
		],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
	});

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`PRAGMA foreign_keys=OFF;`);
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`table_id\` integer,
\tFOREIGN KEY (\`table_id\`) REFERENCES \`table2\`(\`id\`) ON UPDATE no action ON DELETE no action
);\n`);
	expect(sqlStatements[2]).toBe(
		'INSERT INTO `__new_users`(`id`, `table_id`) SELECT `id`, `table_id` FROM `users`;',
	);
	expect(sqlStatements[3]).toBe(
		'DROP TABLE `users`;',
	);
	expect(sqlStatements[4]).toBe(
		'ALTER TABLE `__new_users` RENAME TO `users`;',
	);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
});

test('add foriegn key for multiple columns', async (t) => {
	const tableRef = sqliteTable('table', {
		id: int('id').primaryKey({ autoIncrement: true }),
		age: int('age'),
		age1: int('age_1'),
	});

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			column: int('column'),
			column1: int('column_1'),
		}),
		tableRef,
	};

	const schema2 = {
		tableRef,
		users: sqliteTable(
			'users',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				column: int('column'),
				column1: int('column_1'),
			},
			(table) => ({
				foreignKey: foreignKey({
					columns: [table.column, table.column1],
					foreignColumns: [tableRef.age, tableRef.age1],
				}),
			}),
		),
	};
	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				autoincrement: true,
				generated: undefined,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'column',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'column_1',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		columnsToTransfer: ['id', 'column', 'column_1'],
		referenceData: [
			{
				columnsFrom: ['column', 'column_1'],
				columnsTo: ['age', 'age_1'],
				name: 'users_column_column_1_table_age_age_1_fk',
				onDelete: 'no action',
				onUpdate: 'no action',
				tableFrom: 'users',
				tableTo: 'table',
			},
		],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonRecreateTableStatement);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`PRAGMA foreign_keys=OFF;`);
	expect(sqlStatements[1]).toBe(
		`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`column\` integer,
\t\`column_1\` integer,
\tFOREIGN KEY (\`column\`,\`column_1\`) REFERENCES \`table\`(\`age\`,\`age_1\`) ON UPDATE no action ON DELETE no action
);\n`,
	);
	expect(sqlStatements[2]).toBe(
		'INSERT INTO `__new_users`(`id`, `column`, `column_1`) SELECT `id`, `column`, `column_1` FROM `users`;',
	);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
	);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
});

test('drop foriegn key for multiple columns', async (t) => {
	const tableRef = sqliteTable('table', {
		id: int('id').primaryKey({ autoIncrement: true }),
		age: int('age'),
		age1: int('age_1'),
	});

	const schema1 = {
		users: sqliteTable(
			'users',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				column: int('column'),
				column1: int('column_1'),
			},
			(table) => ({
				foreignKey: foreignKey({
					columns: [table.column, table.column1],
					foreignColumns: [tableRef.age, tableRef.age1],
				}),
			}),
		),
		tableRef,
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			column: int('column'),
			column1: int('column_1'),
		}),
		tableRef,
	};
	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				autoincrement: true,
				generated: undefined,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'column',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'column_1',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		columnsToTransfer: ['id', 'column', 'column_1'],
		uniqueConstraints: [],
		checkConstraints: [],
	});

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`PRAGMA foreign_keys=OFF;`);
	expect(sqlStatements[1]).toBe(
		`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`column\` integer,
\t\`column_1\` integer
);\n`,
	);
	expect(sqlStatements[2]).toBe(
		'INSERT INTO `__new_users`(`id`, `column`, `column_1`) SELECT `id`, `column`, `column_1` FROM `users`;',
	);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
	);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
});

test('alter column drop generated', async (t) => {
	const from = {
		users: sqliteTable('table', {
			id: int('id').primaryKey().notNull(),
			name: text('name').generatedAlwaysAs('drizzle is the best').notNull(),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			id: int('id').primaryKey().notNull(),
			name: text('name').notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		from,
		to,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: false,
		columnDefault: undefined,
		columnGenerated: undefined,
		columnName: 'name',
		columnNotNull: true,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: 'text',
		schema: '',
		tableName: 'table',
		type: 'alter_table_alter_column_drop_generated',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER TABLE \`table\` DROP COLUMN \`name\`;`);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE \`table\` ADD \`name\` text NOT NULL;`,
	);
});

test('recreate table with nested references', async (t) => {
	let users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name'),
		age: integer('age'),
	});
	let subscriptions = sqliteTable('subscriptions', {
		id: int('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').references(() => users.id),
		customerId: text('customer_id'),
	});
	const schema1 = {
		users: users,
		subscriptions: subscriptions,
		subscriptionMetadata: sqliteTable('subscriptions_metadata', {
			id: int('id').primaryKey({ autoIncrement: true }),
			subscriptionId: text('subscription_id').references(
				() => subscriptions.id,
			),
		}),
	};

	users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: false }),
		name: text('name'),
		age: integer('age'),
	});
	const schema2 = {
		users: users,
		subscriptions: subscriptions,
		subscriptionMetadata: sqliteTable('subscriptions_metadata', {
			id: int('id').primaryKey({ autoIncrement: true }),
			subscriptionId: text('subscription_id').references(
				() => subscriptions.id,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				generated: undefined,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'name',
				notNull: false,
				primaryKey: false,
				type: 'text',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'age',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		columnsToTransfer: ['id', 'name', 'age'],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
	});

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`PRAGMA foreign_keys=OFF;`);
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name\` text,
\t\`age\` integer
);\n`);
	expect(sqlStatements[2]).toBe(
		'INSERT INTO `__new_users`(`id`, `name`, `age`) SELECT `id`, `name`, `age` FROM `users`;',
	);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
	);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
});

test('set not null with index', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}, (table) => ({
			someIndex: index('users_name_index').on(table.name),
		})),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}, (table) => ({
			someIndex: index('users_name_index').on(table.name),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_alter_column_set_notnull',
		tableName: 'users',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: undefined,
		columnOnUpdate: undefined,
		columnNotNull: true,
		columnAutoIncrement: false,
		columnPk: false,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` ALTER COLUMN `name` TO `name` text NOT NULL;',
	);
});

test('drop not null with two indexes', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
			age: int('age').notNull(),
		}, (table) => ({
			someUniqeIndex: uniqueIndex('users_name_unique').on(table.name),
			someIndex: index('users_age_index').on(table.age),
		})),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			age: int('age').notNull(),
		}, (table) => ({
			someUniqeIndex: uniqueIndex('users_name_unique').on(table.name),
			someIndex: index('users_age_index').on(table.age),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_alter_column_drop_notnull',
		tableName: 'users',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: undefined,
		columnOnUpdate: undefined,
		columnNotNull: false,
		columnAutoIncrement: false,
		columnPk: false,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE \`users\` ALTER COLUMN `name` TO `name` text;',
	);
});

test('rename table. change autoncrement', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
			age: int('age').notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users1', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: int('age').notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		['public.users->public.users1'],
	);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'rename_table',
		tableNameFrom: 'users',
		tableNameTo: 'users1',
		fromSchema: undefined,
		toSchema: undefined,
	});
	expect(statements[1]).toStrictEqual({
		type: 'recreate_table',
		checkConstraints: [],
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'name',
			notNull: false,
			primaryKey: false,
			type: 'text',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'age',
			notNull: true,
			primaryKey: false,
			type: 'integer',
		}],
		columnsToTransfer: ['id', 'name', 'age'],
		compositePKs: [],
		referenceData: [],
		tableName: 'users1',
		uniqueConstraints: [],
	} as JsonStatement);

	expect(sqlStatements.length).toBe(7);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` RENAME TO `users1`;',
	);
	expect(sqlStatements[1]).toBe(
		'PRAGMA foreign_keys=OFF;',
	);
	expect(sqlStatements[2]).toBe(
		`CREATE TABLE \`__new_users1\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name\` text,
\t\`age\` integer NOT NULL
);\n`,
	);
	expect(sqlStatements[3]).toBe(
		'INSERT INTO `__new_users1`(`id`, `name`, `age`) SELECT `id`, `name`, `age` FROM `users1`;',
	);
	expect(sqlStatements[4]).toBe(
		'DROP TABLE `users1`;',
	);
	expect(sqlStatements[5]).toBe(
		'ALTER TABLE `__new_users1` RENAME TO `users1`;',
	);
	expect(sqlStatements[6]).toBe(
		'PRAGMA foreign_keys=ON;',
	);
});

test('rename column. change autoncrement', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
			age: int('age').notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name1'),
			age: int('age').notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		['public.users.name->public.users.name1'],
	);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_rename_column',
		newColumnName: 'name1',
		oldColumnName: 'name',
		tableName: 'users',
		schema: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'recreate_table',
		checkConstraints: [],
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'name1',
			notNull: false,
			primaryKey: false,
			type: 'text',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'age',
			notNull: true,
			primaryKey: false,
			type: 'integer',
		}],
		columnsToTransfer: ['id', 'name1', 'age'],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		uniqueConstraints: [],
	} as JsonStatement);

	expect(sqlStatements.length).toBe(7);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` RENAME COLUMN `name` TO `name1`;',
	);
	expect(sqlStatements[1]).toBe(
		'PRAGMA foreign_keys=OFF;',
	);
	expect(sqlStatements[2]).toBe(
		`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name1\` text,
\t\`age\` integer NOT NULL
);\n`,
	);
	expect(sqlStatements[3]).toBe(
		'INSERT INTO `__new_users`(`id`, `name1`, `age`) SELECT `id`, `name1`, `age` FROM `users`;',
	);
	expect(sqlStatements[4]).toBe(
		'DROP TABLE `users`;',
	);
	expect(sqlStatements[5]).toBe(
		'ALTER TABLE `__new_users` RENAME TO `users`;',
	);
	expect(sqlStatements[6]).toBe(
		'PRAGMA foreign_keys=ON;',
	);
});

test('rename table. change autoncrement. dropped column', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
			age: int('age').notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users1', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		['public.users->public.users1'],
	);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'rename_table',
		tableNameFrom: 'users',
		tableNameTo: 'users1',
		fromSchema: undefined,
		toSchema: undefined,
	});
	expect(statements[1]).toStrictEqual({
		type: 'recreate_table',
		checkConstraints: [],
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'name',
			notNull: false,
			primaryKey: false,
			type: 'text',
		}],
		columnsToTransfer: ['id', 'name'],
		compositePKs: [],
		referenceData: [],
		tableName: 'users1',
		uniqueConstraints: [],
	} as JsonStatement);

	expect(sqlStatements.length).toBe(7);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` RENAME TO `users1`;',
	);
	expect(sqlStatements[1]).toBe(
		'PRAGMA foreign_keys=OFF;',
	);
	expect(sqlStatements[2]).toBe(
		`CREATE TABLE \`__new_users1\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name\` text
);\n`,
	);
	expect(sqlStatements[3]).toBe(
		'INSERT INTO `__new_users1`(`id`, `name`) SELECT `id`, `name` FROM `users1`;',
	);
	expect(sqlStatements[4]).toBe(
		'DROP TABLE `users1`;',
	);
	expect(sqlStatements[5]).toBe(
		'ALTER TABLE `__new_users1` RENAME TO `users1`;',
	);
	expect(sqlStatements[6]).toBe(
		'PRAGMA foreign_keys=ON;',
	);
});

test('rename table. change autoncrement. added column', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users1', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: int('age'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		['public.users->public.users1'],
	);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'rename_table',
		tableNameFrom: 'users',
		tableNameTo: 'users1',
		fromSchema: undefined,
		toSchema: undefined,
	});
	expect(statements[1]).toStrictEqual({
		type: 'recreate_table',
		checkConstraints: [],
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'name',
			notNull: false,
			primaryKey: false,
			type: 'text',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'age',
			notNull: false,
			primaryKey: false,
			type: 'integer',
		}],
		columnsToTransfer: ['id', 'name'],
		compositePKs: [],
		referenceData: [],
		tableName: 'users1',
		uniqueConstraints: [],
	} as JsonStatement);

	expect(sqlStatements.length).toBe(7);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` RENAME TO `users1`;',
	);
	expect(sqlStatements[1]).toBe(
		'PRAGMA foreign_keys=OFF;',
	);
	expect(sqlStatements[2]).toBe(
		`CREATE TABLE \`__new_users1\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name\` text,
\t\`age\` integer
);\n`,
	);
	expect(sqlStatements[3]).toBe(
		'INSERT INTO `__new_users1`(`id`, `name`) SELECT `id`, `name` FROM `users1`;',
	);
	expect(sqlStatements[4]).toBe(
		'DROP TABLE `users1`;',
	);
	expect(sqlStatements[5]).toBe(
		'ALTER TABLE `__new_users1` RENAME TO `users1`;',
	);
	expect(sqlStatements[6]).toBe(
		'PRAGMA foreign_keys=ON;',
	);
});

test('rename column. change autoncrement. added column', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name1'),
			age: int('age').notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		['public.users.name->public.users.name1'],
	);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_rename_column',
		newColumnName: 'name1',
		oldColumnName: 'name',
		tableName: 'users',
		schema: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'recreate_table',
		checkConstraints: [],
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'name1',
			notNull: false,
			primaryKey: false,
			type: 'text',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'age',
			notNull: true,
			primaryKey: false,
			type: 'integer',
		}],
		columnsToTransfer: ['id', 'name1'],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		uniqueConstraints: [],
	} as JsonStatement);

	expect(sqlStatements.length).toBe(7);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` RENAME COLUMN `name` TO `name1`;',
	);
	expect(sqlStatements[1]).toBe(
		'PRAGMA foreign_keys=OFF;',
	);
	expect(sqlStatements[2]).toBe(
		`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name1\` text,
\t\`age\` integer NOT NULL
);\n`,
	);
	expect(sqlStatements[3]).toBe(
		'INSERT INTO `__new_users`(`id`, `name1`) SELECT `id`, `name1` FROM `users`;',
	);
	expect(sqlStatements[4]).toBe(
		'DROP TABLE `users`;',
	);
	expect(sqlStatements[5]).toBe(
		'ALTER TABLE `__new_users` RENAME TO `users`;',
	);
	expect(sqlStatements[6]).toBe(
		'PRAGMA foreign_keys=ON;',
	);
});

test('rename table. rename column. change autoncrement', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
			age: int('age').notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users1', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name1'),
			age: int('age').notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		['public.users->public.users1', 'public.users1.name->public.users1.name1'],
	);

	expect(statements.length).toBe(3);
	expect(statements[0]).toStrictEqual({
		type: 'rename_table',
		tableNameFrom: 'users',
		tableNameTo: 'users1',
		fromSchema: undefined,
		toSchema: undefined,
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_table_rename_column',
		newColumnName: 'name1',
		oldColumnName: 'name',
		tableName: 'users1',
		schema: '',
	});
	expect(statements[2]).toStrictEqual({
		type: 'recreate_table',
		checkConstraints: [],
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'name1',
			notNull: false,
			primaryKey: false,
			type: 'text',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'age',
			notNull: true,
			primaryKey: false,
			type: 'integer',
		}],
		columnsToTransfer: ['id', 'name1', 'age'],
		compositePKs: [],
		referenceData: [],
		tableName: 'users1',
		uniqueConstraints: [],
	} as JsonStatement);

	expect(sqlStatements.length).toBe(8);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` RENAME TO `users1`;',
	);
	expect(sqlStatements[1]).toBe(
		'ALTER TABLE `users1` RENAME COLUMN `name` TO `name1`;',
	);
	expect(sqlStatements[2]).toBe(
		'PRAGMA foreign_keys=OFF;',
	);
	expect(sqlStatements[3]).toBe(
		`CREATE TABLE \`__new_users1\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name1\` text,
\t\`age\` integer NOT NULL
);\n`,
	);
	expect(sqlStatements[4]).toBe(
		'INSERT INTO `__new_users1`(`id`, `name1`, `age`) SELECT `id`, `name1`, `age` FROM `users1`;',
	);
	expect(sqlStatements[5]).toBe(
		'DROP TABLE `users1`;',
	);
	expect(sqlStatements[6]).toBe(
		'ALTER TABLE `__new_users1` RENAME TO `users1`;',
	);
	expect(sqlStatements[7]).toBe(
		'PRAGMA foreign_keys=ON;',
	);
});

test('change autoncrement. add column. drop column', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			age: int('age'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		checkConstraints: [],
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'age',
			notNull: false,
			primaryKey: false,
			type: 'integer',
		}],
		columnsToTransfer: ['id'],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		uniqueConstraints: [],
	} as JsonStatement);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(
		'PRAGMA foreign_keys=OFF;',
	);
	expect(sqlStatements[1]).toBe(
		`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`age\` integer
);\n`,
	);
	expect(sqlStatements[2]).toBe(
		'INSERT INTO `__new_users`(`id`) SELECT `id` FROM `users`;',
	);
	expect(sqlStatements[3]).toBe(
		'DROP TABLE `users`;',
	);
	expect(sqlStatements[4]).toBe(
		'ALTER TABLE `__new_users` RENAME TO `users`;',
	);
	expect(sqlStatements[5]).toBe(
		'PRAGMA foreign_keys=ON;',
	);
});

test('change autoncrement. views existing', async (t) => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		age: int('age'),
	});
	const usersView = sqliteView('some_view').as((qb) => qb.select().from(users));

	const schema1 = {
		users,
		usersView,
	};

	const users1 = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: false }),
		age: int('age'),
		some: text('some'),
	});
	const usersView1 = sqliteView('some_view').as((qb) => qb.select().from(users1));
	const schema2 = {
		users: users1,
		usersView: usersView1,
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(3);
	expect(statements[0]).toStrictEqual({
		name: 'some_view',
		type: 'drop_view',
	} as JsonStatement);
	expect(statements[1]).toStrictEqual({
		type: 'recreate_table',
		checkConstraints: [],
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'age',
			notNull: false,
			primaryKey: false,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'some',
			notNull: false,
			primaryKey: false,
			type: 'text',
		}],
		columnsToTransfer: ['id', 'age'],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		uniqueConstraints: [],
	} as JsonStatement);

	expect(sqlStatements.length).toBe(8);
	expect(sqlStatements[0]).toBe(
		'DROP VIEW `some_view`;',
	);
	expect(sqlStatements[1]).toBe(
		'PRAGMA foreign_keys=OFF;',
	);
	expect(sqlStatements[2]).toBe(
		`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`age\` integer,
\t\`some\` text
);\n`,
	);
	expect(sqlStatements[3]).toBe(
		'INSERT INTO `__new_users`(`id`, `age`) SELECT `id`, `age` FROM `users`;',
	);
	expect(sqlStatements[4]).toBe(
		'DROP TABLE `users`;',
	);
	expect(sqlStatements[5]).toBe(
		'ALTER TABLE `__new_users` RENAME TO `users`;',
	);
	expect(sqlStatements[6]).toBe(
		'PRAGMA foreign_keys=ON;',
	);
	expect(sqlStatements[7]).toBe(
		'CREATE VIEW `some_view` AS select "id", "age", "some" from "users";',
	);
});
