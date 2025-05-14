import { SQL, sql } from 'drizzle-orm';
import { int, singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('generated as callback: add column with generated constraint', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as callback: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text NOT NULL GENERATED ALWAYS AS (`users`.`name` || 'to add') STORED;",
	]);
});

test('generated as callback: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text NOT NULL GENERATED ALWAYS AS (`users`.`name` || 'to add') VIRTUAL;",
	]);
});

test('generated as callback: drop generated constraint as stored', async () => {
	const from = {
		users: singlestoreTable('users', {
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
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};
	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` MODIFY COLUMN `gen_name` text;',
	]);
});

test('generated as callback: drop generated constraint as virtual', async () => {
	const from = {
		users: singlestoreTable('users', {
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
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	]);
});

test('generated as callback: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: singlestoreTable('users', {
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
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as callback: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

test('generated as callback: change generated constraint', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

// ---

test('generated as sql: add column with generated constraint', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as sql: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
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

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text NOT NULL GENERATED ALWAYS AS (`users`.`name` || 'to add') STORED;",
	]);
});

test('generated as sql: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
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

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text NOT NULL GENERATED ALWAYS AS (`users`.`name` || 'to add') VIRTUAL;",
	]);
});

test('generated as sql: drop generated constraint as stored', async () => {
	const from = {
		users: singlestoreTable('users', {
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
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` MODIFY COLUMN `gen_name` text;',
	]);
});

test('generated as sql: drop generated constraint as virtual', async () => {
	const from = {
		users: singlestoreTable('users', {
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
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	]);
});

test('generated as sql: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: singlestoreTable('users', {
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
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as sql: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\``,
			),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\` || 'hello'`,
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

test('generated as sql: change generated constraint', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\``,
			),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\`users\`.\`name\` || 'hello'`,
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

// ---

test('generated as string: add column with generated constraint', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\`users\`.\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as string: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
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

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` MODIFY COLUMN `gen_name` text NOT NULL GENERATED ALWAYS AS (`users`.`name` || 'to add') STORED;",
	]);
});

test('generated as string: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
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

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text NOT NULL GENERATED ALWAYS AS (`users`.`name` || 'to add') VIRTUAL;",
	]);
});

test('generated as string: drop generated constraint as stored', async () => {
	const from = {
		users: singlestoreTable('users', {
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
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` MODIFY COLUMN `gen_name` text;',
	]);
});

test('generated as string: drop generated constraint as virtual', async () => {
	const from = {
		users: singlestoreTable('users', {
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
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` DROP COLUMN `gen_name`;',
		'ALTER TABLE `users` ADD `gen_name` text;',
	]);
});

test('generated as string: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`\`users\`.\`name\``, {
				mode: 'virtual',
			}),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\`users\`.\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
	]);
});

test('generated as string: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`\`users\`.\`name\``),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\`users\`.\`name\` || 'hello'`,
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});

test('generated as string: change generated constraint', async () => {
	const from = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`\`users\`.\`name\``),
		}),
	};
	const to = {
		users: singlestoreTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\`users\`.\`name\` || 'hello'`,
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` drop column `gen_name`;',
		"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
	]);
});
