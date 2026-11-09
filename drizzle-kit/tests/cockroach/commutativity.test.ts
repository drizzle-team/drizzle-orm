import { sql } from 'drizzle-orm';
import { cockroachTable, default as cockroachDefault, index, int4, text } from 'drizzle-orm/cockroach-core';
import { cockroachCommutativity, footprintsOf } from 'src/dialects/cockroach/commutativity';
import { expect, test } from 'vitest';
import { diff } from './mocks';

const base = { users: cockroachTable('users', { id: int4('id'), name: text('name') }) };

const footprints = async (to: Record<string, unknown>, renames: string[] = []) => {
	const { groupedStatements } = await diff(base, to as never, renames);
	return footprintsOf(groupedStatements);
};

test('a column rename conflicts with a new index on the renamed column', async () => {
	const rename = await footprints({
		users: cockroachTable('users', { id: int4('id'), fullName: text('full_name') }),
	}, ['public.users.name->public.users.full_name']);
	const indexOnName = await footprints({
		users: cockroachTable('users', { id: int4('id'), name: text('name') }, (t) => [index('users_name').on(t.name)]),
	});

	expect(cockroachCommutativity.findConflict(rename, indexOnName)).toBeDefined();
});

test('two index drops on two tables do not conflict', async () => {
	const from = {
		users: cockroachTable('users', { id: int4('id') }, (t) => [index('users_id').on(t.id)]),
		posts: cockroachTable('posts', { id: int4('id') }, (t) => [index('posts_id').on(t.id)]),
	};
	const dropsOfUsers = await diff(from, {
		users: cockroachTable('users', { id: int4('id') }),
		posts: from.posts,
	}, []);
	const dropsOfPosts = await diff(from, {
		users: from.users,
		posts: cockroachTable('posts', { id: int4('id') }),
	}, []);

	const a = footprintsOf(dropsOfUsers.groupedStatements);
	const b = footprintsOf(dropsOfPosts.groupedStatements);

	expect(a.map((it) => it.statementType)).toStrictEqual(['drop_index']);
	expect(b.map((it) => it.statementType)).toStrictEqual(['drop_index']);
	expect(cockroachCommutativity.findConflict(a, b)).toBeUndefined();
});

test('the same default on two branches does not conflict', async () => {
	const defaulted = {
		users: cockroachTable('users', { id: int4('id'), name: text('name').default(sql`'unknown'`) }),
	};

	const a = await footprints(defaulted);
	const b = await footprints(defaulted);

	expect(a).not.toHaveLength(0);
	expect(cockroachCommutativity.findConflict(a, b)).toBeUndefined();
});

test('two different defaults on one column conflict', async () => {
	const a = await footprints({ users: cockroachTable('users', { id: int4('id'), name: text('name').default('a') }) });
	const b = await footprints({ users: cockroachTable('users', { id: int4('id'), name: text('name').default('b') }) });

	expect(cockroachCommutativity.findConflict(a, b)).toBeDefined();
});
