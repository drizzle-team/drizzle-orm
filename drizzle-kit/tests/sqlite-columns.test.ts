import {
	AnySQLiteColumn,
	foreignKey,
	index,
	int,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';
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
	expect(statements.length).toBe(2);
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
	expect(statements[0]).toStrictEqual({
		type: 'create_reference',
		tableName: 'users',
		schema: '',
		data: 'users_report_to_users_id_fk;users;report_to;users;id;no action;no action',
	});
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
		type: 'create_reference',
		tableName: 'users',
		schema: '',
		data: 'reportee_fk;users;report_to;users;id;no action;no action',
	});
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
		type: 'create_composite_pk',
		tableName: 'table',
		data: 'id1,id2',
	});
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
		type: 'alter_table_alter_column_drop_notnull',
		tableName: 'table',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: undefined,
		columnOnUpdate: undefined,
		columnNotNull: false,
		columnAutoIncrement: false,
		columnPk: false,
	});
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
		type: 'alter_table_alter_column_set_notnull',
		tableName: 'table',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: undefined,
		columnOnUpdate: undefined,
		columnNotNull: true,
		columnAutoIncrement: false,
		columnPk: false,
	});
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
		type: 'alter_table_alter_column_set_default',
		tableName: 'table',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnAutoIncrement: false,
		newDefaultValue: "'dan'",
		columnPk: false,
	});
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
		type: 'alter_table_alter_column_drop_default',
		tableName: 'table',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnDefault: undefined,
		columnAutoIncrement: false,
		columnPk: false,
	});
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

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: false,
		columnName: 'name',
		columnNotNull: true,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: 'text',
		newDefaultValue: "'dan'",
		schema: '',
		tableName: 'table',
		type: 'alter_table_alter_column_set_default',
	});

	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: false,
		columnName: 'name',
		columnNotNull: true,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: 'text',
		newDefaultValue: "'dan'",
		schema: '',
		tableName: 'table',
		type: 'alter_table_alter_column_set_default',
	});
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

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: false,
		columnDefault: undefined,
		columnName: 'name',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: 'text',
		schema: '',
		tableName: 'table',
		type: 'alter_table_alter_column_drop_default',
	});

	expect(statements[0]).toStrictEqual({
		columnAutoIncrement: false,
		columnDefault: undefined,
		columnName: 'name',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: 'text',
		schema: '',
		tableName: 'table',
		type: 'alter_table_alter_column_drop_default',
	});
});
