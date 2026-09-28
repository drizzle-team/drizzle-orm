import { integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { columnRow, createFolderFlow, schemaState } from './folder-flow';

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
	expect(flow.snapshot('main', folder!)).toMatchObject({
		deltas: [{ op: 'rename', key: 'columns\0["public","likes","c"]', set: { name: 'd' } }],
	});
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

test('with ignored conflicts the merge SQL starts from the newest leaf and the merge rebuilds to the schema', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users: pgTable('users', { email: varchar() }) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: pgTable('users', { email: varchar().notNull() }) });
	await flow.generate('b', { users: pgTable('users', { email: integer() }) });
	flow.merge('main', 'a', 'b');
	const resolved = { users: pgTable('users', { email: integer().notNull() }) };

	const { folder } = await flow.generate('main', resolved, { ignoreConflicts: true });

	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;');
	expect(flow.snapshot('main', folder!).prevIds).toStrictEqual(
		['20260101120003_b', '20260101120002_a'].map((it) => flow.snapshot('main', it).id),
	);
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(resolved));
});
