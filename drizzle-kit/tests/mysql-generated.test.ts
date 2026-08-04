import { SQL, sql } from 'drizzle-orm';
import { bigint, customType, index, int, mysqlTable, text, varchar, vectorIndex } from 'drizzle-orm/mysql-core';
import { expect, test } from 'vitest';
import { diffTestSchemasMysql } from './schemaDiffer';

test('generated as callback: add column with generated constraint', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			column: {
				generated: {
					as: "`users`.`name` || 'hello'",
					type: 'stored',
				},
				autoincrement: false,
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
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as callback: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} || 'to add'`, {
					mode: 'stored',
				}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'to add'",
				type: 'stored',
			},
			columnAutoIncrement: false,
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
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') STORED NOT NULL;",
	]);
});

test('generated as callback: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} || 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'to add'",
				type: 'virtual',
			},
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
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') VIRTUAL NOT NULL;",
	]);
});

test('generated as callback: drop generated constraint as stored', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name} || 'to delete'`,
				{ mode: 'stored' },
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: undefined,
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			oldColumn: {
				autoincrement: false,
				generated: {
					as: "`users`.`name` || 'to delete'",
					type: 'stored',
				},
				name: 'gen_name',
				notNull: false,
				onUpdate: undefined,
				primaryKey: false,
				type: 'text',
			},
			type: 'alter_table_alter_column_drop_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` MODIFY COLUMN `gen_name` text;',
	]);
});

test('generated as callback: drop generated constraint as virtual', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name} || 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: undefined,
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			oldColumn: {
				autoincrement: false,
				generated: {
					as: "`users`.`name` || 'to delete'",
					type: 'virtual',
				},
				name: 'gen_name',
				notNull: false,
				onUpdate: undefined,
				primaryKey: false,
				type: 'text',
			},
			tableName: 'users',
			type: 'alter_table_alter_column_drop_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	]);
});

test('generated as callback: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'hello'",
				type: 'stored',
			},
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
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as callback: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'hello'",
				type: 'virtual',
			},
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
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

test('generated as callback: change generated constraint', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'hello'",
				type: 'virtual',
			},
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
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

// ---

test('generated as sql: add column with generated constraint', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			column: {
				generated: {
					as: "`users`.`name` || 'hello'",
					type: 'stored',
				},
				autoincrement: false,
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
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as sql: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`\`users\`.\`name\` || 'to add'`, {
					mode: 'stored',
				}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'to add'",
				type: 'stored',
			},
			columnAutoIncrement: false,
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
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') STORED NOT NULL;",
	]);
});

test('generated as sql: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`\`users\`.\`name\` || 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'to add'",
				type: 'virtual',
			},
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
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') VIRTUAL NOT NULL;",
	]);
});

test('generated as sql: drop generated constraint as stored', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\` || 'to delete'`,
				{ mode: 'stored' },
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: undefined,
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			oldColumn: {
				autoincrement: false,
				generated: {
					as: "`users`.`name` || 'to delete'",
					type: 'stored',
				},
				name: 'gen_name',
				notNull: false,
				onUpdate: undefined,
				primaryKey: false,
				type: 'text',
			},
			type: 'alter_table_alter_column_drop_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` MODIFY COLUMN `gen_name` text;',
	]);
});

test('generated as sql: drop generated constraint as virtual', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\` || 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: undefined,
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			oldColumn: {
				autoincrement: false,
				generated: {
					as: "`users`.`name` || 'to delete'",
					type: 'virtual',
				},
				name: 'gen_name',
				notNull: false,
				onUpdate: undefined,
				primaryKey: false,
				type: 'text',
			},
			tableName: 'users',
			type: 'alter_table_alter_column_drop_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	]);
});

test('generated as sql: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\``,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'hello'",
				type: 'stored',
			},
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
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as sql: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\``,
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\` || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'hello'",
				type: 'virtual',
			},
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
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

test('generated as sql: change generated constraint', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\``,
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\` || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'hello'",
				type: 'virtual',
			},
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
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

// ---

test('generated as string: add column with generated constraint', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\`users\`.\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			column: {
				generated: {
					as: "`users`.`name` || 'hello'",
					type: 'stored',
				},
				autoincrement: false,
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
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as string: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(`\`users\`.\`name\` || 'to add'`, {
					mode: 'stored',
				}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'to add'",
				type: 'stored',
			},
			columnAutoIncrement: false,
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
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') STORED NOT NULL;",
	]);
});

test('generated as string: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(`\`users\`.\`name\` || 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'to add'",
				type: 'virtual',
			},
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
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') VIRTUAL NOT NULL;",
	]);
});

test('generated as string: drop generated constraint as stored', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\`users\`.\`name\` || 'to delete'`,
				{ mode: 'stored' },
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: undefined,
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			tableName: 'users',
			oldColumn: {
				autoincrement: false,
				generated: {
					as: "`users`.`name` || 'to delete'",
					type: 'stored',
				},
				name: 'gen_name',
				notNull: false,
				onUpdate: undefined,
				primaryKey: false,
				type: 'text',
			},
			type: 'alter_table_alter_column_drop_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` MODIFY COLUMN `gen_name` text;',
	]);
});

test('generated as string: drop generated constraint as virtual', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\`users\`.\`name\` || 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: undefined,
			columnName: 'gen_name',
			columnNotNull: false,
			columnOnUpdate: undefined,
			columnPk: false,
			newDataType: 'text',
			schema: '',
			oldColumn: {
				autoincrement: false,
				generated: {
					as: "`users`.`name` || 'to delete'",
					type: 'virtual',
				},
				name: 'gen_name',
				notNull: false,
				onUpdate: undefined,
				primaryKey: false,
				type: 'text',
			},
			tableName: 'users',
			type: 'alter_table_alter_column_drop_generated',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	]);
});

test('generated as string: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`\`users\`.\`name\``, {
				mode: 'virtual',
			}),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\`users\`.\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'hello'",
				type: 'stored',
			},
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
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as string: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`\`users\`.\`name\``),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\`users\`.\`name\` || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'hello'",
				type: 'virtual',
			},
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
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

test('generated as string: change generated constraint', async () => {
	const from = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`\`users\`.\`name\``),
		}),
	};
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\`users\`.\`name\` || 'hello'`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			columnAutoIncrement: false,
			columnDefault: undefined,
			columnGenerated: {
				as: "`users`.`name` || 'hello'",
				type: 'virtual',
			},
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
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

export const vector = customType<{
	data: string;
	config: { length: number };
	configRequired: true;
}>({
	dataType(config) {
		return `VECTOR(${config.length})`;
	},
});

test.only('generated as string: vector index and secondaryEngineAttribute', async () => {
	const from = {};
	const to = {
		users: mysqlTable('users', {
			id: bigint({ mode: "bigint" }).autoincrement().primaryKey(),
			name: varchar({ length: 255 }).notNull(),
			embedding: vector("embedding", { length: 3 }),
		}, (table) => {
			return {
				idx_embedding: vectorIndex({
					name: "idx_embedding",
					secondaryEngineAttribute: '{"type":"spann", "distance":"cosine"}',
				}).on(table.embedding),
			};
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			type: "create_table",
			tableName: "users",
			schema: undefined,
			columns: [
				{
					name: "id",
					type: "bigint",
					primaryKey: false,
					notNull: true,
					autoincrement: true,
				},
				{
					name: "name",
					type: "varchar(255)",
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
				{
					name: "embedding",
					type: "VECTOR(3)",
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
			],
			compositePKs: ["users_id;id"],
			compositePkName: "users_id",
			uniqueConstraints: [],
			internals: { tables: {}, indexes: {} },
			checkConstraints: [],
		},
		{
			type: "create_index",
			tableName: "users",
			data: 'idx_embedding;embedding;false;true;;;;{"type":"spann", "distance":"cosine"}',
			schema: undefined,
			internal: { tables: {}, indexes: {} },
		},
	]);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`users\` (
	\`id\` bigint AUTO_INCREMENT NOT NULL,
	\`name\` varchar(255) NOT NULL,
	\`embedding\` VECTOR(3),
	CONSTRAINT \`users_id\` PRIMARY KEY(\`id\`)
);
`,
		'CREATE VECTOR INDEX `idx_embedding` ON `users` (`embedding`) SECONDARY_ENGINE_ATTRIBUTE=\'{"type":"spann", "distance":"cosine"}\';',
	]);
});
