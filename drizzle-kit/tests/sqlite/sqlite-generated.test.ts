import { SQL, sql } from 'drizzle-orm';
import { int, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// 1. add stored column to existing table - not supported +
// 2. add virtual column to existing table - supported +
// 3. create table with stored/virtual columns(pg, mysql, sqlite)
// 4. add stored generated to column -> not supported +
// 5. add virtual generated to column -> supported with drop+add column +
// 6. drop stored/virtual expression -> supported with drop+add column
// 7. alter generated expession -> stored not supported, virtual supported

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(() => {
	_ = prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

// should generate 0 statements + warning/error in console
test('generated as callback: add column with stored generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`id2` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `id2`, `name`) SELECT `id`, `id2`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add column with virtual generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};

	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} || 'to add'`, {
					mode: 'stored',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'to add\') STORED NOT NULL\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `name`) SELECT `id`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'to add\') VIRTUAL NOT NULL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: drop generated constraint as stored', async () => {
	const from = {
		users: sqliteTable('users', {
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
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: drop generated constraint as virtual', async () => {
	const from = {
		users: sqliteTable('users', {
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
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// no way to do it
test('generated as callback: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `name`) SELECT `id`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
				{ mode: 'stored' },
			),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// not supported
test('generated as callback: change stored generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
				{ mode: 'stored' },
			),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`id2` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `id2`, `name`) SELECT `id`, `id2`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: change virtual generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add table with column with stored generated constraint', async () => {
	const from = {};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` integer,\n\t`id2` integer,\n\t`name` text,\n\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add table with column with virtual generated constraint', async () => {
	const from = {};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` integer,\n\t`id2` integer,\n\t`name` text,\n\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// ---

test('generated as sql: add column with stored generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`"name" || \'hello\' || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`id2` integer,\n'
		+ '\t`name` text,\n'
		+ "\t`gen_name` text GENERATED ALWAYS AS (\"name\" || 'hello' || 'hello') STORED\n"
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `id2`, `name`) SELECT `id`, `id2`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: add column with virtual generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`"name" || \'hello\'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`"name" || 'to add'`, {
					mode: 'stored',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`id2` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'to add\') STORED NOT NULL\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `id2`, `name`) SELECT `id`, `id2`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`"name" || 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'to add\') VIRTUAL NOT NULL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: drop generated constraint as stored', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`"name" || 'to delete'`,
				{ mode: 'stored' },
			),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: drop generated constraint as virtual', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`"name" || 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// no way to do it
test('generated as sql: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`"name"`, {
				mode: 'virtual',
			}),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`"name" || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `name`) SELECT `id`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`"name"`, {
				mode: 'stored',
			}),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`"name" || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// not supported
test('generated as sql: change stored generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`"name"`, {
				mode: 'stored',
			}),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`"name" || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`id2` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `id2`, `name`) SELECT `id`, `id2`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: change virtual generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`"name"`),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`"name" || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: add table with column with stored generated constraint', async () => {
	const from = {};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`"name" || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` integer,\n\t`id2` integer,\n\t`name` text,\n\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: add table with column with virtual generated constraint', async () => {
	const from = {};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`"name" || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` integer,\n\t`id2` integer,\n\t`name` text,\n\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5241
test('generated as sql: change column with virtual generated constraint on another column', async () => {
	const schema1 = {
		table: sqliteTable('test_table', {
			id: text().primaryKey(),
			likes: integer('likes').notNull().default(0),
			dislikes: integer('dislikes').notNull().default(0),
			votes: integer('votes').generatedAlwaysAs(sql`likes + dislikes`),
			count: integer('count').notNull(),
		}),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });
	await db.run("insert into `test_table`(`id`,`count`) values('a',1);");

	const schema2 = {
		table: sqliteTable('test_table', {
			id: text().primaryKey(),
			likes: integer('likes').notNull().default(0),
			dislikes: integer('dislikes').notNull().default(0),
			votes: integer('votes').generatedAlwaysAs(sql`likes + dislikes`),
			count: integer('count'),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_test_table` (\n'
		+ '\t`id` text PRIMARY KEY,\n'
		+ '\t`likes` integer DEFAULT 0 NOT NULL,\n'
		+ '\t`dislikes` integer DEFAULT 0 NOT NULL,\n'
		+ '\t`votes` integer GENERATED ALWAYS AS (likes + dislikes) VIRTUAL,\n'
		+ '\t`count` integer\n'
		+ ');\n',
		'INSERT INTO `__new_test_table`(`id`, `likes`, `dislikes`, `count`) SELECT `id`, `likes`, `dislikes`, `count` FROM `test_table`;',
		'DROP TABLE `test_table`;',
		'ALTER TABLE `__new_test_table` RENAME TO `test_table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// ---

test('generated as string: add column with stored generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`"name" || \'hello\'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `name`) SELECT `id`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: add column with virtual generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`"name" || \'hello\'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(`"name" || 'to add'`, {
					mode: 'stored',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`id2` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'to add\') STORED NOT NULL\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `id2`, `name`) SELECT `id`, `id2`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(`"name" || 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'to add\') VIRTUAL NOT NULL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: drop generated constraint as stored', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`"name" || 'to delete'`,
				{ mode: 'stored' },
			),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: drop generated constraint as virtual', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`"name" || 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// no way to do it
test('generated as string: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`"name"`, {
				mode: 'virtual',
			}),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`"name" || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`id2` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `id2`, `name`) SELECT `id`, `id2`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`"name"`, {
				mode: 'stored',
			}),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`"name" || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// not supported
test('generated as string: change stored generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`"name"`, {
				mode: 'stored',
			}),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`"name" || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`name` text,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `name`) SELECT `id`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: change virtual generated constraint', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`"name"`),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`"name" || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: add table with column with stored generated constraint', async () => {
	const from = {};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`"name" || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` integer,\n\t`id2` integer,\n\t`name` text,\n\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') STORED\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: add table with column with virtual generated constraint', async () => {
	const from = {};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`"name" || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` integer,\n\t`id2` integer,\n\t`name` text,\n\t`gen_name` text GENERATED ALWAYS AS ("name" || \'hello\') VIRTUAL\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
