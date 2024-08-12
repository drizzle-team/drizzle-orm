import { foreignKey, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { JsonRecreateTableStatement } from 'src/jsonStatements';
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
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
	});
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
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
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
		`ALTER TABLE \`users\` ALTER COLUMN "name" TO "name" text NOT NULL;`,
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
		`ALTER TABLE \`users\` ALTER COLUMN "name" TO "name" text;`,
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
		`ALTER TABLE \`users\` ALTER COLUMN "name" TO "name" text NOT NULL DEFAULT 'name';`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE \`users\` ADD \`age\` integer NOT NULL;`,
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
		`ALTER TABLE \`users\` ALTER COLUMN "name" TO "name" text;`,
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
		`ALTER TABLE \`users\` ALTER COLUMN "name" TO "name" integer DEFAULT 123;`,
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
		`ALTER TABLE \`users\` ALTER COLUMN "table_id" TO "table_id" integer REFERENCES table(id) ON DELETE no action ON UPDATE no action;`,
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
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`users\` RENAME TO \`__old__generate_users\`;`,
	);
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`users\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`table_id\` integer
);\n`);
	expect(sqlStatements[2]).toBe(
		`INSERT INTO \`users\`("id", "table_id") SELECT "id", "table_id" FROM \`__old__generate_users\`;`,
	);
	expect(sqlStatements[3]).toBe(
		`DROP TABLE \`__old__generate_users\`;`,
	);
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
		referenceData: [
			{
				columnsFrom: [
					'table_id',
				],
				columnsTo: [
					'id',
				],
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
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE `users` RENAME TO `__old__generate_users`;',
	);
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`users\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`table_id\` integer,
\tFOREIGN KEY (\`table_id\`) REFERENCES \`table2\`(\`id\`) ON UPDATE no action ON DELETE no action
);\n`);
	expect(sqlStatements[2]).toBe(
		`INSERT INTO \`users\`("id", "table_id") SELECT "id", "table_id" FROM \`__old__generate_users\`;`,
	);
	expect(sqlStatements[3]).toBe(
		`DROP TABLE \`__old__generate_users\`;`,
	);
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
		referenceData: [
			{
				columnsFrom: [
					'column',
					'column_1',
				],
				columnsTo: [
					'age',
					'age_1',
				],
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
	} as JsonRecreateTableStatement);

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`users\` RENAME TO \`__old__generate_users\`;`,
	);
	expect(sqlStatements[1]).toBe(
		`CREATE TABLE \`users\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`column\` integer,
\t\`column_1\` integer,
\tFOREIGN KEY (\`column\`,\`column_1\`) REFERENCES \`table\`(\`age\`,\`age_1\`) ON UPDATE no action ON DELETE no action
);
`,
	);
	expect(sqlStatements[2]).toBe(
		`INSERT INTO \`users\`("id", "column", "column_1") SELECT "id", "column", "column_1" FROM \`__old__generate_users\`;`,
	);
	expect(sqlStatements[3]).toBe(
		`DROP TABLE \`__old__generate_users\`;`,
	);
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
		uniqueConstraints: [],
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`users\` RENAME TO \`__old__generate_users\`;`,
	);
	expect(sqlStatements[1]).toBe(
		`CREATE TABLE \`users\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`column\` integer,
\t\`column_1\` integer
);
`,
	);
	expect(sqlStatements[2]).toBe(
		`INSERT INTO \`users\`("id", "column", "column_1") SELECT "id", "column", "column_1" FROM \`__old__generate_users\`;`,
	);
	expect(sqlStatements[3]).toBe(
		`DROP TABLE \`__old__generate_users\`;`,
	);
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
		uniqueConstraints: [],
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`users\` RENAME TO \`__old__generate_users\`;`,
	);
	expect(sqlStatements[1]).toBe(
		`CREATE TABLE \`users\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`column\` integer,
\t\`column_1\` integer
);
`,
	);
	expect(sqlStatements[2]).toBe(
		`INSERT INTO \`users\`("id", "column", "column_1") SELECT "id", "column", "column_1" FROM \`__old__generate_users\`;`,
	);
	expect(sqlStatements[3]).toBe(
		`DROP TABLE \`__old__generate_users\`;`,
	);
});
