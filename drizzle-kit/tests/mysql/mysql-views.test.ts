import { eq, sql } from 'drizzle-orm';
import { int, mysqlTable, mysqlView, text } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
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

test('create view #1', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
	};
	const to = {
		users: users,
		view: mysqlView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE ALGORITHM = undefined SQL SECURITY definer VIEW \`some_view\` AS (select \`id\` from \`users\`);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create view #2', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE ALGORITHM = merge SQL SECURITY definer VIEW \`some_view\` AS (SELECT * FROM \`users\`) WITH cascaded CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create view #3', async () => {
	const users = mysqlTable('users', {
		id: int().primaryKey().notNull(),
		name: text(),
	});
	const posts = mysqlTable('posts', {
		id: int().primaryKey(),
		content: text(),
		userId: int().references(() => users.id),
	});

	const from = { users, posts };
	const to = {
		users,
		posts,
		view: mysqlView('some_view').as((qb) => {
			return qb.select({ userId: sql`${users.id}`.as('user'), postId: sql`${posts.id}`.as('post') }).from(users)
				.leftJoin(
					posts,
					eq(posts.userId, users.id),
				);
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });

	await db.query(`INSERT INTO \`users\` (\`id\`, \`name\`) VALUE (1, 'Alex'), (2, 'Andrew')`);
	await db.query(
		`INSERT INTO \`posts\` (\`id\`, \`content\`, \`userId\`) VALUE (1, 'alex-content', 1), (3, 'andrew-content', 2)`,
	);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE ALGORITHM = undefined SQL SECURITY definer VIEW \`some_view\` AS (select \`users\`.\`id\` as \`user\`, \`posts\`.\`id\` as \`post\` from \`users\` left join \`posts\` on \`posts\`.\`userId\` = \`users\`.\`id\`);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create view with existing flag', async () => {
	const users = mysqlTable('users', {
		id: int(),
	});

	const from = {
		users: users,
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).existing(),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop view #1', async () => {
	const users = mysqlTable('users', {
		id: int('id'),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};

	const to = { users: users };

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [`DROP VIEW \`some_view\`;`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop view #2', async () => {
	const table = mysqlTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = ['DROP VIEW \`view\`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop view with existing flag', async () => {
	const users = mysqlTable('users', {
		id: int('id'),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).existing(),
	};
	const to = {
		users: users,
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename view', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: mysqlView('new_some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};

	const renames = ['some_view->new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [`RENAME TABLE \`some_view\` TO \`new_some_view\`;`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename view and alter meta options', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view1: mysqlView('view1', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
		view2: mysqlView('view2', {}).algorithm('undefined').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: mysqlView('view1new', {}).sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
		view2: mysqlView('view2new', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};

	const renames = ['view1->view1new', 'view2->view2new'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	/*
		UNDEFINED lets the server pick at execution time (often it still runs as a merge if the query is “mergeable”).
		Specifying MERGE when it’s not possible causes MySQL to store UNDEFINED with a warning,
		but the reverse (forcing UNDEFINED to overwrite MERGE) doesn’t happen via ALTER.

		https://dev.mysql.com/doc/refman/8.4/en/view-algorithms.html
	*/
	const st0: string[] = [
		'RENAME TABLE `view1` TO `view1new`;',
		'RENAME TABLE `view2` TO `view2new`;',
		`ALTER ALGORITHM = merge SQL SECURITY definer VIEW \`view2new\` AS SELECT * FROM \`users\` WITH cascaded CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename view with existing flag', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').existing(),
	};
	const to = {
		users: users,
		view: mysqlView('new_some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').existing(),
	};

	const renames = ['some_view->new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add meta to view', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER ALGORITHM = merge SQL SECURITY definer VIEW \`some_view\` AS SELECT * FROM \`users\` WITH cascaded CHECK OPTION;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add meta to view with existing flag', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).existing(),
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').existing(),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('push: alter meta to view', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER ALGORITHM = merge SQL SECURITY definer VIEW \`some_view\` AS SELECT * FROM \`users\` WITH cascaded CHECK OPTION;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('diff: alter meta to view', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('temptable').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const st0: string[] = [
		'ALTER ALGORITHM = merge SQL SECURITY definer VIEW \`some_view\` AS SELECT * FROM \`users\` WITH cascaded CHECK OPTION;',
	];
	expect(st).toStrictEqual(st0);
});

test('diff: alter meta to view with existing flag', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('temptable').sqlSecurity('invoker')
			.withCheckOption('cascaded').existing(),
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').existing(),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
});

test('push: alter meta to view with existing flag', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('invoker')
			.withCheckOption('cascaded').existing(),
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').existing(),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop meta from view', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`ALTER ALGORITHM = undefined SQL SECURITY definer VIEW \`some_view\` AS SELECT * FROM \`users\`;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop meta from view existing flag', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').existing(),
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).existing(),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('diff: alter view ".as" value', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('temptable').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('temptable').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users} WHERE ${users.id} = 1`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const st0: string[] = [
		`CREATE OR REPLACE ALGORITHM = temptable SQL SECURITY invoker VIEW \`some_view\` AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1) WITH cascaded CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
});

test('push: alter view ".as" value', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users} WHERE ${users.id} = 1`),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE OR REPLACE ALGORITHM = merge SQL SECURITY invoker VIEW \`some_view\` AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1) WITH cascaded CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // Do not trigger definition changes on push
});

test('alter view ".as"', async () => {
	const table = mysqlTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table).where(sql`${table.id} = 1`)),
	};

	const schema2 = {
		test: table,
		view: mysqlView('view').as((qb) => qb.select().from(table)),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'CREATE OR REPLACE ALGORITHM = undefined SQL SECURITY definer VIEW `view` AS (select `id` from `test`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // do not trigger definition changes on push
});

test('rename and alter view ".as" value', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: mysqlView('new_some_view', {}).algorithm('merge').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users} WHERE ${users.id} = 1`),
	};

	const renames = ['some_view->new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [
		`RENAME TABLE \`some_view\` TO \`new_some_view\`;`,
		`CREATE OR REPLACE ALGORITHM = merge SQL SECURITY invoker VIEW \`new_some_view\` AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1) WITH cascaded CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(['RENAME TABLE \`some_view\` TO \`new_some_view\`;']); // do not trigger definition chages on push
});

test('set existing', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: mysqlView('new_some_view', {}).algorithm('merge').sqlSecurity('invoker')
			.withCheckOption('cascaded').existing(),
	};

	const { sqlStatements: st1 } = await diff(from, to, []);
	const renames = [`some_view->new_some_view`];
	const { sqlStatements: st2 } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst1 } = await push({ db, to });

	// TODO: revise
	await _.clear();
	await push({ db, to: from });
	const { sqlStatements: pst2 } = await push({ db, to, renames });

	const st0: string[] = [
		`DROP VIEW \`some_view\`;`,
	];
	expect(st1).toStrictEqual(st0);
	expect(st2).toStrictEqual(st0);
	expect(pst1).toStrictEqual(st0);
	expect(pst2).toStrictEqual(st0);
});

test('drop existing', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('invoker').existing(),
	};
	const to = {
		users: users,
		view: mysqlView('new_some_view', {}).algorithm('merge').sqlSecurity('invoker').as(
			sql`SELECT * FROM ${users} WHERE ${users.id} = 1`,
		),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE ALGORITHM = merge SQL SECURITY invoker VIEW \`new_some_view\` AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
