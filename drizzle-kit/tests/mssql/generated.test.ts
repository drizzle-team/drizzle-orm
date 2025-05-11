import { SQL, sql } from 'drizzle-orm';
import { int, mssqlTable, text } from 'drizzle-orm/mssql-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('generated as callback: add column with generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') PERSISTED;",
	]);
});

test('generated as callback: add generated constraint to an exisiting column as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} || 'to add'`, {
					mode: 'persisted',
				}),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'to add') PERSISTED NOT NULL;",
	]);
});

test('generated as callback: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
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
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'to add') VIRTUAL NOT NULL;",
	]);
});

// TODO decide what is the strategy here
test.todo('generated as callback: drop generated constraint as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name} || 'to delete'`,
				{ mode: 'persisted' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		'ALTER TABLE [users] ADD [gen_name] text;',
	]);
});

test('generated as callback: drop generated constraint as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
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
		users: mssqlTable('users', {
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
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		'ALTER TABLE [users] ADD [gen_name] text;',
	]);
});

test('generated as callback: change generated constraint type from virtual to PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
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
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') PERSISTED;",
	]);
});

test('generated as callback: change generated constraint type from PERSISTED to virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
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
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') VIRTUAL;",
	]);
});

test('generated as callback: change generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
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
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') VIRTUAL;",
	]);
});

// ---

test('generated as sql: add column with generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] || 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') PERSISTED;",
	]);
});

test('generated as sql: add generated constraint to an exisiting column as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`[users].[name] || 'to add'`, {
					mode: 'persisted',
				}),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'to add') PERSISTED NOT NULL;",
	]);
});

test('generated as sql: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`[users].[name] || 'to add'`, {
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
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'to add') VIRTUAL NOT NULL;",
	]);
});

// TODO decide what strategy should be used. Recreate or store in some other column users data
test.todo('generated as sql: drop generated constraint as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] || 'to delete'`,
				{ mode: 'persisted' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
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
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		'ALTER TABLE [users] ADD [gen_name] text;',
	]);
});

test('generated as sql: drop generated constraint as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] || 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
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
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		'ALTER TABLE [users] ADD [gen_name] text;',
	]);
});

test('generated as sql: change generated constraint type from virtual to PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name]`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] || 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') PERSISTED;",
	]);
});

test('generated as sql: change generated constraint type from PERSISTED to virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name]`,
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] || 'hello'`,
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') VIRTUAL;",
	]);
});

test('generated as sql: change generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name]`,
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] || 'hello'`,
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') VIRTUAL;",
	]);
});

// ---

test('generated as string: add column with generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] || 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') PERSISTED;",
	]);
});

test('generated as string: add generated constraint to an exisiting column as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(`[users].[name] || 'to add'`, {
					mode: 'persisted',
				}),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'to add') PERSISTED NOT NULL;",
	]);
});

test('generated as string: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(`[users].[name] || 'to add'`, {
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
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'to add') VIRTUAL NOT NULL;",
	]);
});

test('generated as string: drop generated constraint as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] || 'to delete'`,
				{ mode: 'persisted' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
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
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		'ALTER TABLE [users] ADD [gen_name] text;',
	]);
});

test('generated as string: drop generated constraint as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] || 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
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
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		'ALTER TABLE [users] ADD [gen_name] text;',
	]);
});

test('generated as string: change generated constraint type from virtual to PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`[users].[name]`, {
				mode: 'virtual',
			}),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] || 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') PERSISTED;",
	]);
});

test('generated as string: change generated constraint type from PERSISTED to virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`[users].[name]`),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] || 'hello'`,
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') VIRTUAL;",
	]);
});

test('generated as string: change generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(`[users].[name]`),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] || 'hello'`,
			),
		}),
	};

	const { sqlStatements } = await diff(
		from,
		to,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] text AS ([users].[name] || 'hello') VIRTUAL;",
	]);
});
