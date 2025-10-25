import { sql } from 'drizzle-orm';
import { int, sqliteTable, sqliteView } from 'drizzle-orm/sqlite-core';
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
