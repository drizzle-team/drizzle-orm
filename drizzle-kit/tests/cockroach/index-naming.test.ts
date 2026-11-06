import { sql } from 'drizzle-orm';
import { check, cockroachTable, index, int4, primaryKey, text } from 'drizzle-orm/cockroach-core';
import { expect, test } from 'vitest';
import { diff, drizzleToDDL } from './mocks';

test('an index drop names the table of the index', async () => {
	const from = {
		users: cockroachTable('users', { id: int4('id'), name: text('name') }, (t) => [index('users_name').on(t.name)]),
	};
	const to = { users: cockroachTable('users', { id: int4('id'), name: text('name') }) };

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual(['DROP INDEX "public"."users"@"users_name";']);
});

test('an index rename names the table of the index', async () => {
	const from = {
		users: cockroachTable('users', { id: int4('id'), name: text('name') }, (t) => [index('users_name').on(t.name)]),
	};
	const to = {
		users: cockroachTable('users', { id: int4('id'), name: text('name') }, (t) => [index('users_name_2').on(t.name)]),
	};

	const { sqlStatements } = await diff(from, to, ['public.users.users_name->public.users.users_name_2']);

	expect(sqlStatements).toStrictEqual(['ALTER INDEX "public"."users"@"users_name" RENAME TO "users_name_2";']);
});

test('one index name on two tables of one schema validates', () => {
	const schema = {
		users: cockroachTable('users', { id: int4('id'), name: text('name') }, (t) => [index('names').on(t.name)]),
		posts: cockroachTable('posts', { id: int4('id'), name: text('name') }, (t) => [index('names').on(t.name)]),
	};

	const { ddl } = drizzleToDDL(schema);

	expect(ddl.indexes.list().map((it) => [it.table, it.name])).toStrictEqual([
		['users', 'names'],
		['posts', 'names'],
	]);
});

test('a constraint rename carries the kind and the columns of the constraint', async () => {
	const from = {
		users: cockroachTable('users', { id: int4('id').primaryKey(), name: text('name') }),
	};
	const to = {
		users: cockroachTable('users', { id: int4('id'), name: text('name') }, (t) => [
			primaryKey({ columns: [t.id], name: 'users_id' }),
		]),
	};

	const { statements } = await diff(from, to, ['public.users.users_pkey->public.users.users_id']);

	expect(statements).toContainEqual({
		type: 'rename_constraint',
		entityType: 'pks',
		schema: 'public',
		table: 'users',
		from: 'users_pkey',
		to: 'users_id',
		columns: ['id'],
	});
});

test('a check statement carries the columns of its expression', async () => {
	const from = {
		users: cockroachTable('users', { id: int4('id'), age: int4('age') }),
	};
	const to = {
		users: cockroachTable('users', { id: int4('id'), age: int4('age') }, (t) => [
			check('adult', sql`${t.age} > 21`),
		]),
	};

	const { statements } = await diff(from, to, []);

	const added = statements.find((it) => it.type === 'add_check');
	expect(added).toMatchObject({ type: 'add_check', columns: ['age'] });
});
