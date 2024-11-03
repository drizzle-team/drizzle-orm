import { sql } from 'drizzle-orm';
import { int, mysqlTable, mysqlView } from 'drizzle-orm/mysql-core';
import { expect, test } from 'vitest';
import { diffTestSchemasMysql } from './schemaDiffer';

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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'mysql_create_view',
		name: 'some_view',
		algorithm: 'undefined',
		replace: false,
		definition: 'select `id` from `users`',
		withCheckOption: undefined,
		sqlSecurity: 'definer',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE ALGORITHM = undefined
SQL SECURITY definer
VIEW \`some_view\` AS (select \`id\` from \`users\`);`);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'mysql_create_view',
		name: 'some_view',
		algorithm: 'merge',
		replace: false,
		definition: 'SELECT * FROM \`users\`',
		withCheckOption: 'cascaded',
		sqlSecurity: 'definer',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE ALGORITHM = merge
SQL SECURITY definer
VIEW \`some_view\` AS (SELECT * FROM \`users\`)
WITH cascaded CHECK OPTION;`);
});

test('create view with existing flag', async () => {
	const users = mysqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
	};
	const to = {
		users: users,
		view: mysqlView('some_view', {}).existing(),
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('drop view', async () => {
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
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_view',
		name: 'some_view',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP VIEW \`some_view\`;`);
});

test('drop view with existing flag', async () => {
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
	};

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, [
		'public.some_view->public.new_some_view',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_view',
		nameFrom: 'some_view',
		nameTo: 'new_some_view',
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`RENAME TABLE \`some_view\` TO \`new_some_view\`;`);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, [
		'public.some_view->public.new_some_view',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'rename_view',
		nameFrom: 'some_view',
		nameTo: 'new_some_view',
	});
	expect(statements[1]).toStrictEqual({
		algorithm: 'undefined',
		columns: {},
		definition: 'SELECT * FROM `users`',
		isExisting: false,
		name: 'new_some_view',
		sqlSecurity: 'definer',
		type: 'alter_mysql_view',
		withCheckOption: 'cascaded',
	});
	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`RENAME TABLE \`some_view\` TO \`new_some_view\`;`);
	expect(sqlStatements[1]).toBe(`ALTER ALGORITHM = undefined
SQL SECURITY definer
VIEW \`new_some_view\` AS SELECT * FROM \`users\`
WITH cascaded CHECK OPTION;`);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, [
		'public.some_view->public.new_some_view',
	]);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		algorithm: 'merge',
		columns: {},
		definition: 'SELECT * FROM `users`',
		isExisting: false,
		name: 'some_view',
		sqlSecurity: 'definer',
		type: 'alter_mysql_view',
		withCheckOption: 'cascaded',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER ALGORITHM = merge
SQL SECURITY definer
VIEW \`some_view\` AS SELECT * FROM \`users\`
WITH cascaded CHECK OPTION;`);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		algorithm: 'merge',
		columns: {},
		definition: 'SELECT * FROM `users`',
		isExisting: false,
		name: 'some_view',
		sqlSecurity: 'definer',
		type: 'alter_mysql_view',
		withCheckOption: 'cascaded',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER ALGORITHM = merge
SQL SECURITY definer
VIEW \`some_view\` AS SELECT * FROM \`users\`
WITH cascaded CHECK OPTION;`);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		algorithm: 'undefined',
		columns: {},
		definition: 'SELECT * FROM `users`',
		isExisting: false,
		name: 'some_view',
		sqlSecurity: 'definer',
		type: 'alter_mysql_view',
		withCheckOption: undefined,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER ALGORITHM = undefined
SQL SECURITY definer
VIEW \`some_view\` AS SELECT * FROM \`users\`;`);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		algorithm: 'temptable',
		definition: 'SELECT * FROM `users` WHERE `users`.`id` = 1',
		name: 'some_view',
		sqlSecurity: 'invoker',
		type: 'mysql_create_view',
		withCheckOption: 'cascaded',
		replace: true,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE OR REPLACE ALGORITHM = temptable
SQL SECURITY invoker
VIEW \`some_view\` AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1)
WITH cascaded CHECK OPTION;`);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, [
		'public.some_view->public.new_some_view',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		nameFrom: 'some_view',
		nameTo: 'new_some_view',
		type: 'rename_view',
	});
	expect(statements[1]).toStrictEqual({
		algorithm: 'temptable',
		definition: 'SELECT * FROM `users` WHERE `users`.`id` = 1',
		name: 'new_some_view',
		sqlSecurity: 'invoker',
		type: 'mysql_create_view',
		withCheckOption: 'cascaded',
		replace: true,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`RENAME TABLE \`some_view\` TO \`new_some_view\`;`);
	expect(sqlStatements[1]).toBe(`CREATE OR REPLACE ALGORITHM = temptable
SQL SECURITY invoker
VIEW \`new_some_view\` AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1)
WITH cascaded CHECK OPTION;`);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, [
		'public.some_view->public.new_some_view',
	]);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, [
		'public.some_view->public.new_some_view',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		name: 'new_some_view',
		type: 'drop_view',
	});
	expect(statements[1]).toStrictEqual({
		algorithm: 'temptable',
		definition: 'SELECT * FROM `users` WHERE `users`.`id` = 1',
		name: 'new_some_view',
		sqlSecurity: 'invoker',
		type: 'mysql_create_view',
		withCheckOption: 'cascaded',
		replace: false,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`DROP VIEW \`new_some_view\`;`);
	expect(sqlStatements[1]).toBe(`CREATE ALGORITHM = temptable
SQL SECURITY invoker
VIEW \`new_some_view\` AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1)
WITH cascaded CHECK OPTION;`);
});
