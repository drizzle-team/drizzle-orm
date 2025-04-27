import { sql } from 'drizzle-orm';
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
import { diff } from './mocks-sqlite';

test('create table with id', async (t) => {
	const schema = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const { sqlStatements } = await diff({}, schema, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`users\` (\n\t\`id\` integer PRIMARY KEY AUTOINCREMENT\n);\n`,
	]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([`ALTER TABLE \`users\` ADD \`name\` text NOT NULL;`]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(
		[
			'ALTER TABLE `users` ADD `name` text;',
			'ALTER TABLE `users` ADD `email` text;',
		],
	);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(
		[
			"ALTER TABLE `users` ADD `name1` text DEFAULT 'name';",
			'ALTER TABLE `users` ADD `name2` text NOT NULL;',
			"ALTER TABLE `users` ADD `name3` text DEFAULT 'name' NOT NULL;",
		],
	);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(
		['ALTER TABLE `users` ADD `name` text;'],
	);
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

	const { sqlStatements } = await diff(schema1, schema2, []);
	expect(sqlStatements).toStrictEqual(
		[
			'ALTER TABLE `users` ADD `report_to` integer REFERENCES users(id);',
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_users` (\n'
			+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
			+ '\t`report_to` integer,\n'
			+ '\tFOREIGN KEY (`report_to`) REFERENCES `users`(`id`)\n'
			+ ');\n',
			'INSERT INTO `__new_users`(`id`) SELECT `id` FROM `users`;',
			'DROP TABLE `users`;',
			'ALTER TABLE `__new_users` RENAME TO `users`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(
		['ALTER TABLE `users` ADD `password` text NOT NULL;'],
	);
});

test('add generated stored column', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`123`, { mode: 'stored' }),
		}),
	};
	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_users` (\n'
			+ '\t`id` integer,\n'
			+ '\t`gen_name` text GENERATED ALWAYS AS (123) STORED\n'
			+ ');\n',
			'INSERT INTO `__new_users`(`id`) SELECT `id` FROM `users`;',
			'DROP TABLE `users`;',
			'ALTER TABLE `__new_users` RENAME TO `users`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
});

test('add generated virtual column', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`123`, { mode: 'virtual' }),
		}),
	};
	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual(
		[
			'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (123) VIRTUAL;',
		],
	);
});

test('alter column make generated', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			generatedName: text('gen_name'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`123`, { mode: 'stored' }),
		}),
	};
	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_users` (\n'
			+ '\t`id` integer,\n'
			+ '\t`gen_name` text GENERATED ALWAYS AS (123) STORED\n'
			+ ');\n',
			'INSERT INTO `__new_users`(`id`) SELECT `id` FROM `users`;',
			'DROP TABLE `users`;',
			'ALTER TABLE `__new_users` RENAME TO `users`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(
		['ALTER TABLE `users` ADD `password` text NOT NULL;'],
	);
});

test('drop column', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(
		['ALTER TABLE `users` DROP COLUMN `name`;'],
	);
});

test('rename column', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: integer().primaryKey({ autoIncrement: true }),
			name: text(),
			email: text(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: integer().primaryKey({ autoIncrement: true }),
			name: text(),
			email: text('email2'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, ['users.email->users.email2']);

	expect(sqlStatements).toStrictEqual(
		['ALTER TABLE `users` RENAME COLUMN `email` TO `email2`;'],
	);
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

	const { sqlStatements } = await diff(schema1, schema2, []);
	expect(sqlStatements).toStrictEqual(
		['CREATE INDEX `reportee_idx` ON `users` (`report_to`);'],
	);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_users` (\n'
			+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
			+ '\t`report_to` integer,\n'
			+ '\tFOREIGN KEY (`report_to`) REFERENCES `users`(`id`)\n'
			+ ');\n',
			'INSERT INTO `__new_users`(`id`, `report_to`) SELECT `id`, `report_to` FROM `users`;',
			'DROP TABLE `users`;',
			'ALTER TABLE `__new_users` RENAME TO `users`;',
			'PRAGMA foreign_keys=ON;',
		],
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_users` (\n'
			+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
			+ '\t`report_to` integer,\n'
			+ '\tFOREIGN KEY (`report_to`) REFERENCES `users`(`id`)\n'
			+ ');\n',
			'INSERT INTO `__new_users`(`id`, `report_to`) SELECT `id`, `report_to` FROM `users`;',
			'DROP TABLE `users`;',
			'ALTER TABLE `__new_users` RENAME TO `users`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
});

test('alter column rename #1', async (t) => {
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

	const { sqlStatements } = await diff(schema1, schema2, ['users.name->users.name1']);

	expect(sqlStatements).toStrictEqual(
		['ALTER TABLE `users` RENAME COLUMN `name` TO `name1`;'],
	);
});

test('alter column rename #2', async (t) => {
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

	const { sqlStatements } = await diff(schema1, schema2, [
		'users.name->users.name1',
	]);

	expect(sqlStatements).toStrictEqual(
		[
			'ALTER TABLE `users` RENAME COLUMN `name` TO `name1`;',
			'ALTER TABLE `users` ADD `email` text;',
		],
	);
});

test('alter column rename #3', async (t) => {
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

	const { sqlStatements } = await diff(schema1, schema2, [
		'users.name->users.name1',
	]);

	expect(sqlStatements).toStrictEqual(
		[
			'ALTER TABLE `users` RENAME COLUMN `name` TO `name1`;',
			'ALTER TABLE `users` DROP COLUMN `email`;',
		],
	);
});

test('rename column in composite pk', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int(),
			id2: int(),
			name: text('name'),
		}, (t) => ({ pk: primaryKey({ columns: [t.id, t.id2] }) })),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int(),
			id3: int(),
			name: text('name'),
		}, (t) => ({ pk: primaryKey({ columns: [t.id, t.id3] }) })),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'users.id2->users.id3',
	]);

	expect(sqlStatements).toStrictEqual(
		['ALTER TABLE `users` RENAME COLUMN `id2` TO `id3`;'],
	);
});

test('alter column rename + alter type', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: int('name1'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'users.name->users.name1',
	]);

	expect(sqlStatements).toStrictEqual(
		[
			'ALTER TABLE `users` RENAME COLUMN `name` TO `name1`;',
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_users` (\n'
			+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
			+ '\t`name1` integer\n'
			+ ');\n',
			'INSERT INTO `__new_users`(`id`, `name1`) SELECT `id`, `name1` FROM `users`;',
			'DROP TABLE `users`;',
			'ALTER TABLE `__new_users` RENAME TO `users`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_table` (\n'
			+ '\t`id1` integer,\n'
			+ '\t`id2` integer,\n'
			+ '\tPRIMARY KEY(`id1`, `id2`)\n'
			+ ');\n',
			'INSERT INTO `__new_table`(`id1`, `id2`) SELECT `id1`, `id2` FROM `table`;',
			'DROP TABLE `table`;',
			'ALTER TABLE `__new_table` RENAME TO `table`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { statements, sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_table` (\n\t`name` text\n);\n',
			'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
			'DROP TABLE `table`;',
			'ALTER TABLE `__new_table` RENAME TO `table`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { statements, sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_table` (\n\t`name` text NOT NULL\n);\n',
			'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
			'DROP TABLE `table`;',
			'ALTER TABLE `__new_table` RENAME TO `table`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { statements, sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			"CREATE TABLE `__new_table` (\n\t`name` text DEFAULT 'dan'\n);\n",
			'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
			'DROP TABLE `table`;',
			'ALTER TABLE `__new_table` RENAME TO `table`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { statements, sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_table` (\n\t`name` text\n);\n',
			'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
			'DROP TABLE `table`;',
			'ALTER TABLE `__new_table` RENAME TO `table`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { statements, sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			"CREATE TABLE `__new_table` (\n\t`name` text DEFAULT 'dan' NOT NULL\n);\n",
			'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
			'DROP TABLE `table`;',
			'ALTER TABLE `__new_table` RENAME TO `table`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { statements, sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			"CREATE TABLE `__new_table` (\n\t`name` text DEFAULT 'dan' NOT NULL\n);\n",
			'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
			'DROP TABLE `table`;',
			'ALTER TABLE `__new_table` RENAME TO `table`;',
			'PRAGMA foreign_keys=ON;',
			'CREATE INDEX `index_name` ON `table` (`name`);',
		],
	);
});

test('alter column add default not null with indexes #2', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name').notNull().default('dan'),
		}, (table) => ({
			someIndex: index('index_name').on(table.name),
		})),
	};

	const { statements, sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			"CREATE TABLE `__new_table` (\n\t`name` text DEFAULT 'dan' NOT NULL\n);\n",
			'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
			'DROP TABLE `table`;',
			'ALTER TABLE `__new_table` RENAME TO `table`;',
			'PRAGMA foreign_keys=ON;',
			'CREATE INDEX `index_name` ON `table` (`name`);',
		],
	);
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

	const { statements, sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_table` (\n\t`name` text\n);\n',
			'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
			'DROP TABLE `table`;',
			'ALTER TABLE `__new_table` RENAME TO `table`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `table` DROP COLUMN `name`;',
		'ALTER TABLE `table` ADD `name` text NOT NULL;',
	]);
});

test('recreate table with nested references', async (t) => {
	const users1 = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name'),
		age: integer('age'),
	});

	const subscriptions1 = sqliteTable('subscriptions', {
		id: int('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').references(() => users1.id),
		customerId: text('customer_id'),
	});

	const schema1 = {
		users: users1,
		subscriptions: subscriptions1,
		subscriptionMetadata: sqliteTable('subscriptions_metadata', {
			id: int('id').primaryKey({ autoIncrement: true }),
			subscriptionId: text('subscription_id').references(() => subscriptions1.id),
		}),
	};

	const users2 = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: false }),
		name: text('name'),
		age: integer('age'),
	});

	const subscriptions2 = sqliteTable('subscriptions', {
		id: int('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').references(() => users2.id),
		customerId: text('customer_id'),
	});

	const schema2 = {
		users: users2,
		subscriptions: subscriptions2,
		subscriptionMetadata: sqliteTable('subscriptions_metadata', {
			id: int('id').primaryKey({ autoIncrement: true }),
			subscriptionId: text('subscription_id').references(() => subscriptions2.id),
		}),
	};

	const { statements, sqlStatements } = await diff(
		schema1,
		schema2,
		[],
	);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_users` (\n'
			+ '\t`id` integer PRIMARY KEY,\n'
			+ '\t`name` text,\n'
			+ '\t`age` integer\n'
			+ ');\n',
			'INSERT INTO `__new_users`(`id`, `name`, `age`) SELECT `id`, `name`, `age` FROM `users`;',
			'DROP TABLE `users`;',
			'ALTER TABLE `__new_users` RENAME TO `users`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
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

	const { sqlStatements } = await diff(schema1, schem2, []);

	expect(sqlStatements).toStrictEqual(
		["ALTER TABLE `table` ADD `text` text DEFAULT 'escape''s quotes';"],
	);
});
