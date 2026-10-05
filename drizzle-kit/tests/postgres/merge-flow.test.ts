import { foreignKey, index, integer, pgEnum, pgTable, primaryKey, text, varchar } from 'drizzle-orm/pg-core';
import type { Hint } from 'src/cli/hints';
import { expect, test } from 'vitest';
import { columnRow, createFolderFlow, schemaState } from './folder-flow';
import type { PostgresSchema } from './mocks';

const users = pgTable('users', { id: integer() });
const likes = pgTable('likes', { id: integer() });
const groups = pgTable('groups', { id: integer() });
const posts = pgTable('posts', { id: integer() });
const usersWithEmail = pgTable('users', { id: integer(), email: varchar() });

test('a merge of three leaves lists every leaf, newest first, and holds only the new change', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	flow.branch('c', 'main');
	await flow.generate('a', { users, likes });
	await flow.generate('b', { users, groups });
	await flow.generate('c', { users, posts });
	flow.merge('main', 'a', 'b', 'c');
	const merged = { users: usersWithEmail, likes, groups, posts };

	const { folder } = await flow.generate('main', merged);

	expect(folder).toBe('20260101120005_main');
	expect(flow.snapshot('main', folder!)).toMatchObject({
		type: 'diff',
		prevIds: ['20260101120004_c', '20260101120003_b', '20260101120002_a'].map((it) => flow.snapshot('main', it).id),
		deltas: [{ op: 'create', row: columnRow('users', 'email', 'varchar') }],
	});
	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "users" ADD COLUMN "email" varchar;');
	expect(flow.state('main', '20260101120002_a')).toStrictEqual(schemaState({ users, likes }));
	expect(flow.state('main', '20260101120003_b')).toStrictEqual(schemaState({ users, groups }));
	expect(flow.state('main', '20260101120004_c')).toStrictEqual(schemaState({ users, posts }));
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(merged));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

test('a merge composes a branch of several migrations with a newer branch', async () => {
	const flow = createFolderFlow();
	const t1 = (a: boolean, b: boolean) =>
		pgTable('t1', {
			id: integer().primaryKey(),
			a: a ? varchar().notNull() : varchar(),
			b: b ? varchar().notNull() : varchar(),
		});
	await flow.generate('main', { t1: t1(false, false) });
	flow.branch('deep', 'main');
	flow.branch('shallow', 'main');
	const deepT1 = t1(false, false);
	await flow.generate('deep', { t1: deepT1, t2: pgTable('t2', { id: integer(), t1Id: integer() }) });
	await flow.generate('deep', {
		t1: deepT1,
		t2: pgTable('t2', { id: integer(), t1Id: integer().references(() => deepT1.id) }),
	});
	const deepAltered = t1(false, true);
	await flow.generate('deep', {
		t1: deepAltered,
		t2: pgTable('t2', { id: integer(), t1Id: integer().references(() => deepAltered.id) }),
	});
	await flow.generate('shallow', { t1: t1(true, false) });
	flow.merge('main', 'deep', 'shallow');
	const mergedT1 = t1(true, true);
	const merged = {
		t1: mergedT1,
		t2: pgTable('t2', { id: integer(), t1Id: integer().references(() => mergedT1.id), note: text() }),
	};

	const { folder } = await flow.generate('main', merged);

	expect(flow.snapshot('main', folder!).prevIds[0]).toBe(flow.snapshot('main', '20260101120005_shallow').id);
	expect(flow.snapshot('main', folder!)).toMatchObject({
		deltas: [{ op: 'create', row: columnRow('t2', 'note', 'text') }],
	});
	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "t2" ADD COLUMN "note" text;');
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(merged));
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

test('a merge that renames a column from another branch stores a rename, and check reads it as a rename', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users, likes: pgTable('likes', { id: integer(), c: varchar() }) });
	flow.branch('late', 'a');
	await flow.generate('b', { users, groups });
	flow.merge('main', 'a', 'b');

	const { folder } = await flow.generate(
		'main',
		{ users, groups, likes: pgTable('likes', { id: integer(), d: varchar() }) },
		{ hints: [{ type: 'rename', kind: 'column', from: ['public', 'likes', 'c'], to: ['public', 'likes', 'd'] }] },
	);

	// likes comes from branch a, which is not the first parent, so the renamed column exists only in the combined state.
	expect(flow.snapshot('main', folder!).prevIds[0]).toBe(flow.snapshot('main', '20260101120003_b').id);
	const deltas = flow.deltas('main', folder!);
	expect(deltas[0]).toStrictEqual({ op: 'rename', key: 'columns\0["public","likes","c"]', set: { name: 'd' } });
	// The rest are the instructions of the rename, one for every rule that points at columns.
	expect(deltas.slice(1).map((it) => it.op)).toStrictEqual([
		'update_list_items',
		...Array(4).fill('replace_in_list'),
	]);
	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "likes" RENAME COLUMN "c" TO "d";');

	await flow.generate('late', { users, likes: pgTable('likes', { id: integer(), c: varchar().notNull() }) });
	flow.merge('main', 'late');
	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120004_main', '20260101120005_late'] });
	expect(result.status === 'conflicts' && result.message).toContain(
		'rename_column: c on likes table (20260101120004_main)',
	);
});

test('a branch that arrives after a merge is compared with the snapshots behind the first parent', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	flow.branch('late', 'main');
	await flow.generate('a', { users, likes });
	await flow.generate('b', { users: pgTable('users', { id: integer(), email: integer() }) });
	flow.merge('main', 'a', 'b');
	await flow.generate('main', { users: pgTable('users', { id: integer(), email: integer() }), likes, posts });
	await flow.generate('late', { users: usersWithEmail });
	flow.merge('main', 'late');

	const result = await flow.check('main');

	expect(flow.snapshot('main', '20260101120004_main').prevIds[0]).toBe(flow.snapshot('main', '20260101120003_b').id);
	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120004_main', '20260101120005_late'] });
	expect(result.status === 'conflicts' && result.message).toContain(
		'add_column: email on users table (20260101120003_b)',
	);
	// In folder order, branch b and the late branch both add the column.
	await expect(flow.migrate('main', { users: usersWithEmail, likes, posts })).rejects.toThrow(
		'Failed query: ALTER TABLE "users" ADD COLUMN "email" varchar;',
	);
});

test('a branch that arrives after a merge and commutes merges again', async () => {
	const flow = createFolderFlow();
	const tags = pgTable('tags', { id: integer() });
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	flow.branch('late', 'main');
	await flow.generate('a', { users, likes });
	await flow.generate('b', { users, groups });
	flow.merge('main', 'a', 'b');
	await flow.generate('main', { users, likes, groups, posts });
	await flow.generate('late', { users, tags });
	flow.merge('main', 'late');
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	const merged = { users: usersWithEmail, likes, groups, posts, tags };

	const { folder } = await flow.generate('main', merged);

	expect(folder).toBe('20260101120006_main');
	expect(flow.snapshot('main', folder!)).toMatchObject({
		prevIds: ['20260101120005_late', '20260101120004_main'].map((it) => flow.snapshot('main', it).id),
		deltas: [{ op: 'create', row: columnRow('users', 'email', 'varchar') }],
	});
	expect(flow.state('main', '20260101120004_main')).toStrictEqual(schemaState({ users, likes, groups, posts }));
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(merged));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

test('deleting a merge reopens its branches, and the next generate merges them again', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users, likes });
	await flow.generate('b', { users, groups });
	flow.merge('main', 'a', 'b');
	await flow.generate('main', { users: usersWithEmail, likes, groups });
	flow.deleteFolder('main', '20260101120004_main');

	expect(flow.leaves('main')).toStrictEqual(['20260101120002_a', '20260101120003_b']);
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });

	const redo = { users, likes, groups, posts };
	const { folder } = await flow.generate('main', redo);

	expect(folder).toBe('20260101120005_main');
	expect(flow.snapshot('main', folder!).prevIds).toStrictEqual(
		['20260101120003_b', '20260101120002_a'].map((it) => flow.snapshot('main', it).id),
	);
	expect(flow.sql('main', folder!)).toBe('CREATE TABLE "posts" (\n\t"id" integer\n);\n');
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(redo));
	expect(await flow.migrate('main', redo)).toStrictEqual([]);
});

test('two branches that each started from an empty folder merge', async () => {
	const flow = createFolderFlow();
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users });
	await flow.generate('b', { posts });
	flow.merge('main', 'a', 'b');
	expect(flow.folders('main').map((it) => flow.snapshot('main', it).type)).toStrictEqual(['base', 'base']);
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	const merged = { users: usersWithEmail, posts };

	const { folder } = await flow.generate('main', merged);

	expect(flow.snapshot('main', folder!)).toMatchObject({
		type: 'diff',
		prevIds: ['20260101120002_b', '20260101120001_a'].map((it) => flow.snapshot('main', it).id),
		deltas: [{ op: 'create', row: columnRow('users', 'email', 'varchar') }],
	});
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(merged));
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

// Each branch renames something that a row of the other branch names too. The SQL of the branches runs in
// either order, so the combined state must hold every new name, whichever leaf is the first parent.
type RenameBranch = { schema: PostgresSchema; hints: Hint[] };
type RenameMerge = { name: string; base: PostgresSchema; branches: RenameBranch[]; merged: PostgresSchema };

const renameColumn = (table: string, from: string, to: string): Hint => ({
	type: 'rename',
	kind: 'column',
	from: ['public', table, from],
	to: ['public', table, to],
});

// A table with a primary key over three columns, and a foreign key that references that key.
const keyed = (first: string, second: string, third: string) => {
	const parent = pgTable('parent', {
		first: integer(first).notNull(),
		second: integer(second).notNull(),
		third: integer(third).notNull(),
	}, (t) => [primaryKey({ name: 'parent_pk', columns: [t.first, t.second, t.third] })]);
	const child = pgTable('child', { a: integer(), b: integer(), c: integer() }, (t) => [
		foreignKey({
			name: 'child_parent_fk',
			columns: [t.a, t.b, t.c],
			foreignColumns: [parent.first, parent.second, parent.third],
		}),
	]);
	return { parent, child };
};

const namedKey = (keyName: string, column: string) => ({
	t: pgTable('t', { x: integer(column).notNull(), z: integer().notNull() }, (t) => [
		primaryKey({ name: keyName, columns: [t.x, t.z] }),
	]),
});

const mood = pgEnum('mood', ['ok', 'sad']);
const feeling = pgEnum('feeling', ['ok', 'sad']);
const withEnum = (type: typeof mood, column: string) => ({
	[type.enumName]: type,
	t: pgTable('t', { id: integer(), state: type(column) }),
});

const indexed = (indexName: string, column: string) => ({
	t: pgTable('t', { id: integer(), email: varchar(column) }, (t) => [index(indexName).on(t.email)]),
});

const renameMerges: RenameMerge[] = [
	{
		name: 'two branches rename two columns of one key that a foreign key references',
		base: keyed('x', 'z', 'c'),
		branches: [
			{ schema: keyed('y', 'z', 'c'), hints: [renameColumn('parent', 'x', 'y')] },
			{ schema: keyed('x', 'w', 'c'), hints: [renameColumn('parent', 'z', 'w')] },
		],
		merged: keyed('y', 'w', 'c'),
	},
	{
		name: 'three branches each rename one column of one key',
		base: keyed('x', 'z', 'c'),
		branches: [
			{ schema: keyed('y', 'z', 'c'), hints: [renameColumn('parent', 'x', 'y')] },
			{ schema: keyed('x', 'w', 'c'), hints: [renameColumn('parent', 'z', 'w')] },
			{ schema: keyed('x', 'z', 'd'), hints: [renameColumn('parent', 'c', 'd')] },
		],
		merged: keyed('y', 'w', 'd'),
	},
	{
		name: 'a key rename against a rename of a column of that key',
		base: namedKey('t_pk', 'x'),
		branches: [
			{
				schema: namedKey('t_key', 'x'),
				hints: [{ type: 'rename', kind: 'primary_key', from: ['public', 't', 't_pk'], to: ['public', 't', 't_key'] }],
			},
			{ schema: namedKey('t_pk', 'y'), hints: [renameColumn('t', 'x', 'y')] },
		],
		merged: namedKey('t_key', 'y'),
	},
	{
		name: 'an enum rename against a rename of a column of that enum type',
		base: withEnum(mood, 'state'),
		branches: [
			{
				schema: withEnum(feeling, 'state'),
				hints: [{ type: 'rename', kind: 'enum', from: ['public', 'mood'], to: ['public', 'feeling'] }],
			},
			{ schema: withEnum(mood, 'status'), hints: [renameColumn('t', 'state', 'status')] },
		],
		merged: withEnum(feeling, 'status'),
	},
	{
		name: 'an index rename against a rename of a column of that index',
		base: indexed('t_email_ix', 'email'),
		branches: [
			{
				schema: indexed('t_contact_ix', 'email'),
				hints: [{
					type: 'rename',
					kind: 'index',
					from: ['public', 't', 't_email_ix'],
					to: ['public', 't', 't_contact_ix'],
				}],
			},
			{ schema: indexed('t_email_ix', 'contact'), hints: [renameColumn('t', 'email', 'contact')] },
		],
		merged: indexed('t_contact_ix', 'contact'),
	},
];

// The branch that generates last has the newest folder, so it is the first parent of the merge.
const firstParents = renameMerges.flatMap((it) => it.branches.map((_, first) => ({ ...it, first })));

test.each(firstParents)('$name, with branch $first as the first parent', async ({ base, branches, merged, first }) => {
	const flow = createFolderFlow();
	await flow.generate('main', base);
	const names = branches.map((_, idx) => `branch${idx}`);
	for (const name of names) flow.branch(name, 'main');
	const order = [...branches.keys()].filter((idx) => idx !== first).concat(first);
	for (const idx of order) {
		const { status } = await flow.generate(names[idx], branches[idx].schema, { hints: branches[idx].hints });
		expect(status).toBe('ok');
	}
	flow.merge('main', ...names);
	expect(flow.leaves('main').at(-1)).toMatch(new RegExp(`_branch${first}$`));

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	// The combined state already equals the schema, so no merge migration is written.
	expect(await flow.generate('main', merged)).toMatchObject({ status: 'no_changes' });
	expect(flow.folders('main')).toHaveLength(branches.length + 1);
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});
