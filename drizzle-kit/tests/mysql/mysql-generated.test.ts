import { SQL, sql } from 'drizzle-orm';
import { int, mysqlTable, text } from 'drizzle-orm/mysql-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

// https://github.com/drizzle-team/drizzle-orm/issues/2616
test('generated as callback: create table with generated constraint #1', async () => {
	const to = {
		users: mysqlTable('users', {
			name: text('name'),
			generatedName: text('gen_name').notNull().generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"CREATE TABLE `users` (\n\t`name` text,\n\t`gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED NOT NULL\n);\n",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// TODO
// why to use generated with literal?
// Looks like invalid use case
test.skip('generated as callback: create table with generated constraint #2', async () => {
	const to = {
		users: mysqlTable('users', {
			name: text('name'),
			generatedName: text('gen_name').notNull().generatedAlwaysAs('Default', { mode: 'stored' }),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"CREATE TABLE `users` (\n\t`name` text,\n\t`gen_name` text GENERATED ALWAYS AS ('Default') STORED NOT NULL\n);\n",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add column with generated constraint #1', async () => {
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add column with generated constraint #2', async () => {
	const schema1 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const schema2 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
			generatedName1: text('gen_name1').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name} || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
		"ALTER TABLE `users` ADD `gen_name1` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add generated constraints to an exisiting columns', async () => {
	const schema1 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name'),
			generatedName1: text('gen_name1'),
		}),
	};
	const schema2 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
			generatedName1: text('gen_name1').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name} || 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
		'ALTER TABLE `users` DROP COLUMN `gen_name1`;',
		"ALTER TABLE `users` ADD `gen_name1` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') STORED NOT NULL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') VIRTUAL NOT NULL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: drop generated constraint', async () => {
	const schema1 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name}`,
				{ mode: 'stored' },
			),
			generatedName1: text('gen_name1').generatedAlwaysAs(
				(): SQL => sql`${schema2.users.name}`,
				{ mode: 'virtual' },
			),
		}),
	};
	const schema2 = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name'),
			generatedName1: text('gen_name1'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE `users` MODIFY COLUMN `gen_name` text;',
		'ALTER TABLE `users` DROP COLUMN `gen_name1`;',
		'ALTER TABLE `users` ADD `gen_name1` text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['ALTER TABLE `users` MODIFY COLUMN `gen_name` text;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
});

test('generated as callback: change generated constraint #1', async () => {
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
});

test('generated as callback: change generated constraint #2', async () => {
	const schema1 = {
		users: mysqlTable('users', {
			id: int('id'),
			gen1: text().generatedAlwaysAs((): SQL => sql`${schema1.users.id}`, { mode: 'stored' }),
			gen2: text().generatedAlwaysAs((): SQL => sql`${schema1.users.id}`, { mode: 'virtual' }),
		}),
	};

	const schema2 = {
		users: mysqlTable('users', {
			id: int('id'),
			gen1: text().generatedAlwaysAs((): SQL => sql`${schema2.users.id} || 'hello'`, { mode: 'stored' }),
			gen2: text().generatedAlwaysAs((): SQL => sql`${schema2.users.id} || 'hello'`, { mode: 'virtual' }),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen1`;',
		"ALTER TABLE `users` ADD `gen1` text GENERATED ALWAYS AS (`users`.`id` || 'hello') STORED;",
		'ALTER TABLE `users` DROP COLUMN `gen2`;',
		"ALTER TABLE `users` ADD `gen2` text GENERATED ALWAYS AS (`users`.`id` || 'hello') VIRTUAL;",
	];
	expect.soft(st).toStrictEqual(st0);
	expect.soft(pst).toStrictEqual([]);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') STORED NOT NULL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') VIRTUAL NOT NULL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['ALTER TABLE `users` MODIFY COLUMN `gen_name` text;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') STORED NOT NULL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'to add') VIRTUAL NOT NULL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` MODIFY COLUMN `gen_name` text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
});

test('generated as string: with backslashes', async () => {
	const to = {
		users: mysqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`'users\\\\hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE TABLE \`users\` (
	\`id\` int,
	\`id2\` int,
	\`name\` text,
	\`gen_name\` text GENERATED ALWAYS AS ('users\\\\hello') VIRTUAL
);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
