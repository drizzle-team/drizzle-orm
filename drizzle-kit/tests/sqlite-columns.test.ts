import {
	AnySQLiteColumn,
	foreignKey,
	index,
	int,
	integer,
	primaryKey,
	sqliteTable,
	sqliteView,
	text,
} from 'drizzle-orm/sqlite-core';
import { JsonRecreateTableStatement, JsonStatement } from 'src/jsonStatements';
import { expect, test } from 'vitest';
import { diffTestSchemasSqlite } from './schemaDiffer';

test('create table with id', async (t) => {
	const schema = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const { statements } = await diffTestSchemasSqlite({}, schema, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [
			{
				name: 'id',
				type: 'integer',
				primaryKey: true,
				notNull: true,
				autoincrement: true,
			},
		],
		uniqueConstraints: [],
		referenceData: [],
		compositePKs: [],
		checkConstraints: [],
	});
});

test('add columns #1', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}),
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: undefined,
		column: {
			name: 'name',
			type: 'text',
			primaryKey: false,
			notNull: true,
			autoincrement: false,
		},
	});
});

test('add columns #2', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email'),
		}),
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: undefined,
		column: {
			name: 'name',
			type: 'text',
			primaryKey: false,
			notNull: false,
			autoincrement: false, // TODO: add column has autoincrement???
		},
	});
	expect(statements[1]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: undefined,
		column: {
			name: 'email',
			type: 'text',
			primaryKey: false,
			notNull: false,
			autoincrement: false,
		},
	});
});

test('add columns #3', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name1: text('name1').default('name'),
			name2: text('name2').notNull(),
			name3: text('name3').default('name').notNull(),
		}),
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

	expect(statements.length).toBe(3);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: undefined,
		column: {
			name: 'name1',
			type: 'text',
			primaryKey: false,
			notNull: false,
			autoincrement: false, // TODO: add column has autoincrement???
			default: "'name'",
		},
	});
	expect(statements[1]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: undefined,
		column: {
			name: 'name2',
			type: 'text',
			primaryKey: false,
			notNull: true,
			autoincrement: false, // TODO: add column has autoincrement???
		},
	});
	expect(statements[2]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: undefined,
		column: {
			name: 'name3',
			type: 'text',
			primaryKey: false,
			notNull: true,
			autoincrement: false, // TODO: add column has autoincrement???
			default: "'name'",
		},
	});
});

test('add columns #4', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name', { enum: ['one', 'two'] }),
		}),
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: undefined,
		column: {
			name: 'name',
			type: 'text',
			primaryKey: false,
			notNull: false,
			autoincrement: false,
		},
	});
});

test('add columns #5', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		reporteeId: int('report_to').references((): AnySQLiteColumn => users.id),
	});

	const schema2 = {
		users,
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

	// TODO: Fix here
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: 'users_report_to_users_id_fk;users;report_to;users;id;no action;no action',
		column: {
			name: 'report_to',
			type: 'integer',
			primaryKey: false,
			notNull: false,
			autoincrement: false,
		},
	});
});

test('add columns #6', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email').unique().notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email').unique().notNull(),
			password: text('password').notNull(),
		}),
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: undefined,
		column: {
			name: 'password',
			type: 'text',
			primaryKey: false,
			notNull: true,
			autoincrement: false,
		},
	});
});

test('add index #1', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			reporteeId: int('report_to').references((): AnySQLiteColumn => users.id),
		}),
	};

	const users = sqliteTable(
		'users',
		{
			id: int('id').primaryKey({ autoIncrement: true }),
			reporteeId: int('report_to').references((): AnySQLiteColumn => users.id),
		},
		(t) => {
			return {
				reporteeIdx: index('reportee_idx').on(t.reporteeId),
			};
		},
	);

	const schema2 = {
		users,
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_index',
		tableName: 'users',
		internal: {
			indexes: {},
		},
		schema: '',
		data: 'reportee_idx;report_to;false;',
	});
});

test('add foreign key #1', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			reporteeId: int('report_to'),
		}),
	};

	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		reporteeId: int('report_to').references((): AnySQLiteColumn => users.id),
	});

	const schema2 = {
		users,
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual(
		{
			type: 'recreate_table',
			columns: [{
				autoincrement: true,
				generated: undefined,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			}, {
				autoincrement: false,
				generated: undefined,
				name: 'report_to',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			}],
			compositePKs: [],
			referenceData: [{
				columnsFrom: ['report_to'],
				columnsTo: ['id'],
				name: 'users_report_to_users_id_fk',
				tableFrom: 'users',
				tableTo: 'users',
				onDelete: 'no action',
				onUpdate: 'no action',
			}],
			columnsToTransfer: ['id', 'report_to'],
			tableName: 'users',
			uniqueConstraints: [],
			checkConstraints: [],
		} as JsonRecreateTableStatement,
	);
});

test('add foreign key #2', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			reporteeId: int('report_to'),
		}),
	};

	const schema2 = {
		users: sqliteTable(
			'users',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				reporteeId: int('report_to'),
			},
			(t) => {
				return {
					reporteeFk: foreignKey({
						columns: [t.reporteeId],
						foreignColumns: [t.id],
						name: 'reportee_fk',
					}),
				};
			},
		),
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		columns: [{
			autoincrement: true,
			generated: undefined,
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'report_to',
			notNull: false,
			primaryKey: false,
			type: 'integer',
		}],
		compositePKs: [],
		referenceData: [{
			columnsFrom: ['report_to'],
			columnsTo: ['id'],
			name: 'reportee_fk',
			tableFrom: 'users',
			tableTo: 'users',
			onDelete: 'no action',
			onUpdate: 'no action',
		}],
		columnsToTransfer: ['id', 'report_to'],
		tableName: 'users',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonRecreateTableStatement);
});

test('alter column change name #1', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name1'),
		}),
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, [
		'public.users.name->public.users.name1',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_rename_column',
		tableName: 'users',
		schema: '',
		oldColumnName: 'name',
		newColumnName: 'name1',
	});
});

test('alter column change name #2', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name1'),
			email: text('email'),
		}),
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, [
		'public.users.name->public.users.name1',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_rename_column',
		tableName: 'users',
		schema: '',
		oldColumnName: 'name',
		newColumnName: 'name1',
	});
	expect(statements[1]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'users',
		referenceData: undefined,
		column: {
			name: 'email',
			notNull: false,
			primaryKey: false,
			type: 'text',
			autoincrement: false,
		},
	});
});

test('alter column change name #3', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name1'),
		}),
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, [
		'public.users.name->public.users.name1',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_rename_column',
		tableName: 'users',
		schema: '',
		oldColumnName: 'name',
		newColumnName: 'name1',
	});

	expect(statements[1]).toStrictEqual({
		type: 'alter_table_drop_column',
		tableName: 'users',
		schema: '',
		columnName: 'email',
	});
});

test('alter table add composite pk', async (t) => {
	const schema1 = {
		table: sqliteTable('table', {
			id1: integer('id1'),
			id2: integer('id2'),
		}),
	};

	const schema2 = {
		table: sqliteTable(
			'table',
			{
				id1: integer('id1'),
				id2: integer('id2'),
			},
			(t) => {
				return {
					pk: primaryKey({ columns: [t.id1, t.id2] }),
				};
			},
		),
	};

	const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'id1',
			notNull: false,
			primaryKey: false,
			type: 'integer',
		}, {
			autoincrement: false,
			generated: undefined,
			name: 'id2',
			notNull: false,
			primaryKey: false,
			type: 'integer',
		}],
		columnsToTransfer: ['id1', 'id2'],
		compositePKs: [['id1', 'id2']],
		referenceData: [],
		tableName: 'table',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonStatement);
});

test('alter column drop not null', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name').notNull(),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
		from,
		to,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'name',
			notNull: false,
			primaryKey: false,
			type: 'text',
		}],
		compositePKs: [],
		columnsToTransfer: ['name'],
		referenceData: [],
		tableName: 'table',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonStatement);
});

test('alter column add not null', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name').notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
		from,
		to,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'name',
			notNull: true,
			primaryKey: false,
			type: 'text',
		}],
		columnsToTransfer: ['name'],
		compositePKs: [],
		referenceData: [],
		tableName: 'table',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonStatement);
});

test('alter column add default', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name').default('dan'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
		from,
		to,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'name',
			notNull: false,
			primaryKey: false,
			type: 'text',
			default: "'dan'",
		}],
		columnsToTransfer: ['name'],
		compositePKs: [],
		referenceData: [],
		tableName: 'table',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonStatement);
});

test('alter column drop default', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name').default('dan'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
		from,
		to,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'name',
			notNull: false,
			primaryKey: false,
			type: 'text',
		}],
		columnsToTransfer: ['name'],
		compositePKs: [],
		referenceData: [],
		tableName: 'table',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonStatement);
});

test('alter column add default not null', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name').notNull().default('dan'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
		from,
		to,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'name',
			notNull: true,
			primaryKey: false,
			type: 'text',
			default: "'dan'",
		}],
		columnsToTransfer: ['name'],
		compositePKs: [],
		referenceData: [],
		tableName: 'table',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonStatement);
});

test('alter column add default not null with indexes', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name'),
		}, (table) => ({
			someIndex: index('index_name').on(table.name),
		})),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name').notNull().default('dan'),
		}, (table) => ({
			someIndex: index('index_name').on(table.name),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
		from,
		to,
		[],
	);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'name',
			notNull: true,
			primaryKey: false,
			type: 'text',
			default: "'dan'",
		}],
		columnsToTransfer: ['name'],
		compositePKs: [],
		referenceData: [],
		tableName: 'table',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonStatement);
	expect(statements[1]).toStrictEqual({
		data: 'index_name;name;false;',
		schema: '',
		tableName: 'table',
		type: 'create_index',
		internal: undefined,
	});
	expect(sqlStatements.length).toBe(7);
	expect(sqlStatements[0]).toBe(`PRAGMA foreign_keys=OFF;`);
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`__new_table\` (
\t\`name\` text DEFAULT 'dan' NOT NULL
);\n`);
	expect(sqlStatements[2]).toBe(
		`INSERT INTO \`__new_table\`(\`name\`) SELECT \`name\` FROM \`table\`;`,
	);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`table\`;`);
	expect(sqlStatements[4]).toBe(`ALTER TABLE \`__new_table\` RENAME TO \`table\`;`);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
	expect(sqlStatements[6]).toBe(`CREATE INDEX \`index_name\` ON \`table\` (\`name\`);`);
});

test('alter column drop default not null', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name').notNull().default('dan'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
		from,
		to,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		columns: [{
			autoincrement: false,
			generated: undefined,
			name: 'name',
			notNull: false,
			primaryKey: false,
			type: 'text',
		}],
		columnsToTransfer: ['name'],
		compositePKs: [],
		referenceData: [],
		tableName: 'table',
		uniqueConstraints: [],
		checkConstraints: [],
	} as JsonStatement);
	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`PRAGMA foreign_keys=OFF;`);
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`__new_table\` (
\t\`name\` text
);\n`);
	expect(sqlStatements[2]).toBe(
		`INSERT INTO \`__new_table\`(\`name\`) SELECT \`name\` FROM \`table\`;`,
	);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`table\`;`);
	expect(sqlStatements[4]).toBe(`ALTER TABLE \`__new_table\` RENAME TO \`table\`;`);
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

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
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
	expect(sqlStatements[1]).toBe(`ALTER TABLE \`table\` ADD \`name\` text NOT NULL;`);
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
			subscriptionId: text('subscription_id').references(() => subscriptions.id),
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
			subscriptionId: text('subscription_id').references(() => subscriptions.id),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
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
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
		columnsToTransfer: ['id', 'name', 'age'],
	} as JsonStatement);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`PRAGMA foreign_keys=OFF;`);
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name\` text,
\t\`age\` integer
);\n`);
	expect(sqlStatements[2]).toBe(
		`INSERT INTO \`__new_users\`(\`id\`, \`name\`, \`age\`) SELECT \`id\`, \`name\`, \`age\` FROM \`users\`;`,
	);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements[4]).toBe(`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
});

test('text default values escape single quotes', async (t) => {
	const schema1 = {
		table: sqliteTable('table', {
			id: integer('id').primaryKey(),
		}),
	};

	const schem2 = {
		table: sqliteTable('table', {
			id: integer('id').primaryKey(),
			text: text('text').default("escape's quotes"),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(schema1, schem2, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toStrictEqual(
		"ALTER TABLE `table` ADD `text` text DEFAULT 'escape''s quotes';",
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

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
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

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
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

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
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

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
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

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
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

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
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

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
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

	const { statements, sqlStatements } = await diffTestSchemasSqlite(
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
