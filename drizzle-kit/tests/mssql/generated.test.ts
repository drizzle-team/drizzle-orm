import { SQL, sql } from 'drizzle-orm';
import { int, mssqlSchema, mssqlTable, text, varchar } from 'drizzle-orm/mssql-core';
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

test('generated as callback: add column with generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} + 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello') PERSISTED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add generated constraint to an exisiting column as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} + 'to add'`, {
					mode: 'persisted',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'to add') PERSISTED;",
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} + 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'to add');",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: drop generated constraint as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name} + 'to delete'`,
				{ mode: 'persisted' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = ['ALTER TABLE [users] DROP COLUMN [gen_name];', 'ALTER TABLE [users] ADD [gen_name] text;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: drop generated constraint as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name} + 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = ['ALTER TABLE [users] DROP COLUMN [gen_name];', 'ALTER TABLE [users] ADD [gen_name] text;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as callback: change generated constraint type from virtual to PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
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
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} + 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello') PERSISTED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0); // push is triggered cause mode changed
});

test('generated as callback: change generated constraint type from PERSISTED to virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
				{ mode: 'persisted' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} + 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello');",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0); // push will not be ignored cause type changed
});

test('generated as callback: change generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} + 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello');",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // push will be ignored cause type was not changed
});

// ---

test('generated as sql: add column with generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] + 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = ["ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello') PERSISTED;"];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: add generated constraint to an exisiting column as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`[users].[name] + 'to add'`, {
					mode: 'persisted',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'to add') PERSISTED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`[users].[name] + 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'to add');",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: drop generated constraint as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] + 'to delete'`,
				{ mode: 'persisted' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = ['ALTER TABLE [users] DROP COLUMN [gen_name];', 'ALTER TABLE [users] ADD [gen_name] text;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: drop generated constraint as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] + 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		'ALTER TABLE [users] ADD [gen_name] text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: change generated constraint type from virtual to PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
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
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] + 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello') PERSISTED;",
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: change generated constraint type from PERSISTED to virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name]`,
				{ mode: 'persisted' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] + 'hello'`,
				{ mode: 'virtual' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello');",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as sql: change generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name]`,
				{ mode: 'persisted' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`[users].[name] + 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello') PERSISTED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
});

// ---

test('generated as string: add column with generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] + 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello') PERSISTED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: add generated constraint to an exisiting column as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(`[users].[name] + 'to add'`, {
					mode: 'persisted',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'to add') PERSISTED;",
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(`[users].[name] + 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'to add');",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: drop generated constraint as PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] + 'to delete'`,
				{ mode: 'persisted' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		'ALTER TABLE [users] ADD [gen_name] text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: drop generated constraint as virtual', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] + 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		'ALTER TABLE [users] ADD [gen_name] text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: change generated constraint type from virtual to PERSISTED', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(`[users].[name]`, {
				mode: 'virtual',
			}),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] + 'hello'`,
				{ mode: 'persisted' },
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello') PERSISTED;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: change generated constraint type from PERSISTED to virtual', async () => {
	const newSchema = mssqlSchema('new_schema');
	const from = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(`[users].[name]`, { mode: 'persisted' }),
		}),
	};
	const to = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] + 'hello'`,
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
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE [new_schema].[users] DROP COLUMN [gen_name];',
		"ALTER TABLE [new_schema].[users] ADD [gen_name] AS ([users].[name] + 'hello');",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('generated as string: change generated constraint', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(`[users].[name]`),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: varchar('name', { length: 255 }),
			generatedName: text('gen_name').generatedAlwaysAs(
				`[users].[name] + 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello');",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // push ignores definition changes
});

test('alter generated constraint', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema1.users.name}`),
		}),
	};
	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
			id2: int('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name} + 'hello'`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0: string[] = [
		'ALTER TABLE [users] DROP COLUMN [gen_name];',
		"ALTER TABLE [users] ADD [gen_name] AS ([users].[name] + 'hello');",
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // push ignores definition changes
});
