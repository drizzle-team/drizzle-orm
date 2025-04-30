import { sql } from 'drizzle-orm';
import { int, mysqlTable, mysqlView } from 'drizzle-orm/mysql-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE ALGORITHM = undefined\nSQL SECURITY definer\nVIEW \`some_view\` AS (select \`id\` from \`users\`);`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE ALGORITHM = merge\nSQL SECURITY definer\nVIEW \`some_view\` AS (SELECT * FROM \`users\`)\nWITH cascaded CHECK OPTION;`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([]);
});

test('drop view', async () => {
	const users = mysqlTable('users', {
		id: int('id'),
	});

	const from = {
		users: users,
		view: mysqlView('some_view', {}).algorithm('merge').sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};

	const to = { users: users };

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([`DROP VIEW \`some_view\`;`]);
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

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([]);
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

	const { sqlStatements } = await diff(from, to, ['some_view->new_some_view']);
	expect(sqlStatements).toStrictEqual([`RENAME TABLE \`some_view\` TO \`new_some_view\`;`]);
});

test('rename view and alter meta options', async () => {
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
		view: mysqlView('new_some_view', {}).sqlSecurity('definer')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements } = await diff(from, to, [
		'some_view->new_some_view',
	]);

	expect(sqlStatements).toStrictEqual([
		`RENAME TABLE \`some_view\` TO \`new_some_view\`;`,
		`ALTER ALGORITHM = undefined\nSQL SECURITY definer\nVIEW \`new_some_view\` AS SELECT * FROM \`users\`\nWITH cascaded CHECK OPTION;`,
	]);
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

	const { sqlStatements } = await diff(from, to, ['some_view->new_some_view']);

	expect(sqlStatements).toStrictEqual([]);
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

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`ALTER ALGORITHM = merge\nSQL SECURITY definer\nVIEW \`some_view\` AS SELECT * FROM \`users\`\nWITH cascaded CHECK OPTION;`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([]);
});

test('alter meta to view', async () => {
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER ALGORITHM = merge\nSQL SECURITY definer\nVIEW \`some_view\` AS SELECT * FROM \`users\`\nWITH cascaded CHECK OPTION;`,
	]);
});

test('alter meta to view with existing flag', async () => {
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([]);
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

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER ALGORITHM = undefined\nSQL SECURITY definer\nVIEW \`some_view\` AS SELECT * FROM \`users\`;`,
	]);
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

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([]);
});

test('alter view ".as" value', async () => {
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

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE OR REPLACE ALGORITHM = temptable\nSQL SECURITY invoker\nVIEW \`some_view\` AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1)\nWITH cascaded CHECK OPTION;`,
	]);
});

test('rename and alter view ".as" value', async () => {
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
		view: mysqlView('new_some_view', {}).algorithm('temptable').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users} WHERE ${users.id} = 1`),
	};

	const { sqlStatements } = await diff(from, to, [
		'some_view->new_some_view',
	]);

	expect(sqlStatements).toStrictEqual([
		`RENAME TABLE \`some_view\` TO \`new_some_view\`;`,
		`CREATE OR REPLACE ALGORITHM = temptable\nSQL SECURITY invoker\nVIEW \`new_some_view\` AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1)\nWITH cascaded CHECK OPTION;`,
	]);
});

test('set existing', async () => {
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
		view: mysqlView('new_some_view', {}).algorithm('temptable').sqlSecurity('invoker')
			.withCheckOption('cascaded').existing(),
	};

	const { sqlStatements: st1 } = await diff(from, to, []);
	const { sqlStatements: st2 } = await diff(from, to, [`some_view->new_some_view`]);

	expect(st1).toStrictEqual([
		`DROP VIEW \`some_view\`;`,
	]);
	expect(st2).toStrictEqual([
		`DROP VIEW \`some_view\`;`,
	]);
});

test('drop existing', async () => {
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
		view: mysqlView('new_some_view', {}).algorithm('temptable').sqlSecurity('invoker')
			.withCheckOption('cascaded').as(sql`SELECT * FROM ${users} WHERE ${users.id} = 1`),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE ALGORITHM = temptable\nSQL SECURITY invoker\nVIEW \`new_some_view\` AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1)\nWITH cascaded CHECK OPTION;`,
	]);
});
