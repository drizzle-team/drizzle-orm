import { sql } from 'drizzle-orm';
import { int, integer, sqliteTable, sqliteView } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

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

test('create view', async () => {
	const users = sqliteTable('users', { id: int('id').default(1) });
	const view = sqliteView('view').as((qb) => qb.select().from(users));
	const to = {
		users: users,
		testView: view,
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE TABLE \`users\` (\n\t\`id\` integer DEFAULT 1\n);\n`,
		`CREATE VIEW \`view\` AS select "id" from "users";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop view #1', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).as(sql`SELECT * FROM users`),
	};
	const to = {
		users,
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [`DROP VIEW \`view\`;`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop view #2', async () => {
	const table = sqliteTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: sqliteView('view').as((qb) => qb.select().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = ['DROP VIEW \`view\`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(phints).toStrictEqual([]);
});

test('alter view ".as" #1', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).as(sql`SELECT * FROM users`),
	};
	const to = {
		users,
		testView: sqliteView('view', { id: int('id') }).as(sql`SELECT * FROM users WHERE users.id = 1`),
	};
	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'DROP VIEW `view`;',
		'CREATE VIEW `view` AS SELECT * FROM users WHERE users.id = 1;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // ignore AS sql for 'push'
});

test('alter view ".as" #2', async () => {
	const table = sqliteTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: sqliteView('view').as((qb) => qb.select().from(table).where(sql`${table.id} = 1`)),
	};

	const schema2 = {
		test: table,
		view: sqliteView('view').as((qb) => qb.select().from(table)),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = ['DROP VIEW `view`;', 'CREATE VIEW `view` AS select "id" from "test";'];
	expect.soft(st).toStrictEqual(st0);
	expect.soft(pst).toStrictEqual([]); // ignore sql change for push

	expect(phints).toStrictEqual([]);
});

test('create view with existing flag', async () => {
	const view = sqliteView('view', {}).existing();
	const to = {
		testView: view,
	};

	const { statements, sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(statements.length).toBe(0);
});

test('drop view with existing flag', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).existing(),
	};
	const to = {
		users,
	};

	const { statements, sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(statements.length).toBe(0);
});

test('rename view with existing flag', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).existing(),
	};
	const to = {
		users,
		testView: sqliteView('new_view', { id: int('id') }).existing(),
	};

	const renames = ['view->new_view'];
	const { statements, sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(statements.length).toBe(0);
});

test('rename view and drop existing flag', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).existing(),
	};
	const to = {
		users,
		testView: sqliteView('new_view', { id: int('id') }).as(sql`SELECT * FROM users`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['CREATE VIEW `new_view` AS SELECT * FROM users;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename view and alter ".as"', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).as(sql`SELECT * FROM users`),
	};
	const to = {
		users,
		testView: sqliteView('new_view', { id: int('id') }).as(sql`SELECT * FROM users WHERE 1=1`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'DROP VIEW `view`;',
		'CREATE VIEW `new_view` AS SELECT * FROM users WHERE 1=1;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create view', async () => {
	const table = sqliteTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: sqliteView('view').as((qb) => qb.select().from(table)),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = [
		`CREATE VIEW \`view\` AS select "id" from "test";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(phints).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4520
test.skipIf(Date.now() < +new Date('2026-02-01'))('create 2 dependent views', async () => {
	const table1 = sqliteTable('table1', {
		col1: integer(),
		col2: integer(),
		col3: integer(),
	});
	const accountBalancesPMMV = sqliteView('accountBalancesPM').as(
		(qb) => {
			return qb
				.select({
					col1: table1.col1,
					col2: table1.col2,
					col3: table1.col3,
				})
				.from(table1);
		},
	);

	const accountBalancesMV = sqliteView('accountBalances').as(
		(qb) =>
			qb
				.select({
					accountId: accountBalancesPMMV.col1,
				})
				.from(accountBalancesPMMV),
	);

	const schema = { table1, accountBalancesMV, accountBalancesPMMV };
	const { sqlStatements: st1, next: n1 } = await diff({}, schema, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`col1` integer,\n\t`col2` integer,\n\t`col3` integer\n);\n',
		'CREATE VIEW `accountBalancesPM` AS select "col1", "col2", "col3" from "table1";',
		'CREATE VIEW `accountBalances` AS select "col1" from "accountBalancesPM";',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});
