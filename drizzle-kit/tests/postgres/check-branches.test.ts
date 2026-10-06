import { index, integer, pgEnum, pgPolicy, pgRole, pgTable, primaryKey, text, varchar } from 'drizzle-orm/pg-core';
import { stripVTControlCharacters } from 'util';
import { expect, test } from 'vitest';
import { type CheckResult, createFolderFlow } from './folder-flow';

// The report lines, with folder names in place of the temporary folder paths.
const reportOf = (result: CheckResult) =>
	result.status === 'conflicts'
		? stripVTControlCharacters(result.message).replaceAll(/\S*[\\/](?=\d{14}_)/g, '').split('\n')
		: [];

test('a column that one branch adds and later drops conflicts with the same column on the other branch', async () => {
	const flow = createFolderFlow();
	const users = { users: pgTable('users', { id: integer() }) };

	await flow.generate('main', users);
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: pgTable('users', { id: integer(), c: varchar() }) });
	await flow.generate('b', { users: pgTable('users', { id: integer(), c: integer() }) });
	await flow.generate('a', users);
	flow.merge('main', 'a', 'b');

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120003_b', '20260101120004_a'] });
	// In folder order, both branches add the column before branch a drops it.
	await expect(flow.migrate('main', { users: pgTable('users', { id: integer(), c: integer() }) })).rejects.toThrow(
		'Failed query: ALTER TABLE "users" ADD COLUMN "c" integer;',
	);
});

test('a column rename on one branch commutes with dropping an index on that column on the other', async () => {
	const flow = createFolderFlow();

	await flow.generate('main', {
		users: pgTable('users', { id: integer(), c: varchar() }, (t) => [index('users_c_idx').on(t.c)]),
	});
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', {
		users: pgTable('users', { id: integer(), d: varchar() }, (t) => [index('users_c_idx').on(t.d)]),
	}, {
		hints: [{ type: 'rename', kind: 'column', from: ['public', 'users', 'c'], to: ['public', 'users', 'd'] }],
	});
	await flow.generate('b', { users: pgTable('users', { id: integer(), c: varchar() }) });
	flow.merge('main', 'a', 'b');

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', { users: pgTable('users', { id: integer(), d: varchar() }) })).toStrictEqual([]);
});

test('a primary key rename on one branch conflicts with a drop of that key on the other', async () => {
	const flow = createFolderFlow();
	const withKey = (name: string) => ({
		users: pgTable('users', { id: integer().notNull() }, (t) => [primaryKey({ name, columns: [t.id] })]),
	});

	await flow.generate('main', withKey('users_pk'));
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', withKey('users_key'), {
		hints: [{
			type: 'rename',
			kind: 'primary_key',
			from: ['public', 'users', 'users_pk'],
			to: ['public', 'users', 'users_key'],
		}],
	});
	await flow.generate('b', { users: pgTable('users', { id: integer().notNull() }) });
	flow.merge('main', 'a', 'b');

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	expect(reportOf(result)).toContainEqual(expect.stringContaining('rename_constraint on users table'));
	await expect(flow.migrate('main', {})).rejects.toThrow(
		'Failed query: ALTER TABLE "users" DROP CONSTRAINT "users_pk";',
	);
});

test('a new table with a column of an enum type conflicts with a rename of that enum', async () => {
	const flow = createFolderFlow();
	const mood = pgEnum('mood', ['ok', 'sad']);
	const feeling = pgEnum('feeling', ['ok', 'sad']);
	const users = (type: typeof mood) => pgTable('users', { id: integer(), state: type() });

	await flow.generate('main', { mood, users: users(mood) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { feeling, users: users(feeling) }, {
		hints: [{ type: 'rename', kind: 'enum', from: ['public', 'mood'], to: ['public', 'feeling'] }],
	});
	await flow.generate('b', { mood, users: users(mood), notes: pgTable('notes', { state: mood() }) });
	flow.merge('main', 'a', 'b');

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	await expect(flow.migrate('main', {})).rejects.toThrow('Failed query: CREATE TABLE "notes"');
});

test('NOT NULL on one branch and the default of the same column on the other pass', async () => {
	const flow = createFolderFlow();
	const merged = { users: pgTable('users', { id: integer(), email: varchar().notNull().default('none') }) };

	await flow.generate('main', { users: pgTable('users', { id: integer(), email: varchar() }) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: pgTable('users', { id: integer(), email: varchar().notNull() }) });
	await flow.generate('b', { users: pgTable('users', { id: integer(), email: varchar().default('none') }) });
	flow.merge('main', 'a', 'b');

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.generate('main', merged)).toMatchObject({ status: 'no_changes' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

test('NOT NULL on a column of an enum type passes with a rename of that enum on the other branch', async () => {
	const flow = createFolderFlow();
	const mood = pgEnum('mood', ['ok', 'sad']);
	const feeling = pgEnum('feeling', ['ok', 'sad']);
	const merged = { feeling, users: pgTable('users', { state: feeling().notNull() }) };

	await flow.generate('main', { mood, users: pgTable('users', { state: mood() }) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { mood, users: pgTable('users', { state: mood().notNull() }) });
	await flow.generate('b', { feeling, users: pgTable('users', { state: feeling() }) }, {
		hints: [{ type: 'rename', kind: 'enum', from: ['public', 'mood'], to: ['public', 'feeling'] }],
	});
	flow.merge('main', 'a', 'b');

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.generate('main', merged)).toMatchObject({ status: 'no_changes' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

test('a new policy for a role conflicts with a rename of that role', async () => {
	const flow = createFolderFlow();
	const users = (...policies: ReturnType<typeof pgPolicy>[]) => pgTable('users', { id: integer() }, () => policies);
	const staff = pgRole('staff');
	const team = pgRole('team');

	await flow.generate('main', { staff, users: users() });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { team, users: users() }, {
		hints: [{ type: 'rename', kind: 'role', from: ['staff'], to: ['team'] }],
	});
	await flow.generate('b', { staff, users: users(pgPolicy('staff_reads', { for: 'select', to: staff })) });
	flow.merge('main', 'a', 'b');

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	await expect(flow.migrate('main', {})).rejects.toThrow('CREATE POLICY "staff_reads" ON "users"');
});

test('a new policy conflicts with a drop of the last policy of its table, which disables row level security', async () => {
	const flow = createFolderFlow();
	const policy = (name: string) => pgPolicy(name, { for: 'select', to: 'public' });
	const users = (...policies: ReturnType<typeof pgPolicy>[]) => pgTable('users', { id: integer() }, () => policies);

	await flow.generate('main', { users: users(policy('readers')) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: users() });
	await flow.generate('b', { users: users(policy('readers'), policy('writers')) });
	flow.merge('main', 'a', 'b');

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	// The SQL of both branches runs in either order. The database then has the new policy on a table without
	// row level security, so postgres does not enforce the policy.
	expect(await flow.migrate('main', { users: users(policy('writers')) })).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
	]);
});

test('a new foreign key conflicts with a drop of the primary key that it references', async () => {
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer().primaryKey() });
	const plainUsers = pgTable('users', { id: integer().notNull() });
	const posts = pgTable('posts', { userId: integer() });

	await flow.generate('main', { users, posts });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: plainUsers, posts });
	await flow.generate('b', { users, posts: pgTable('posts', { userId: integer().references(() => users.id) }) });
	flow.merge('main', 'a', 'b');

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	await expect(flow.migrate('main', {})).rejects.toThrow('Failed query: ALTER TABLE "posts" ADD CONSTRAINT');
});

test('an index and a table that take one name conflict', async () => {
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer(), email: varchar() });

	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', {
		users: pgTable('users', { id: integer(), email: varchar() }, (t) => [index('tags').on(t.email)]),
	});
	await flow.generate('b', { users, tags: pgTable('tags', { id: integer() }) });
	flow.merge('main', 'a', 'b');

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	await expect(flow.migrate('main', {})).rejects.toThrow('Failed query: CREATE TABLE "tags"');
});

test('branches that touch unrelated entities pass', async () => {
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer() });

	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users, likes: pgTable('likes', { id: integer() }) });
	await flow.generate('a', { users, likes: pgTable('likes', { id: integer(), postId: integer() }) });
	await flow.generate('b', { users: pgTable('users', { id: integer(), email: varchar() }) });
	flow.merge('main', 'a', 'b');

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
});

test('overlapping branches fail and the report names both conflicting snapshots', async () => {
	const flow = createFolderFlow();

	await flow.generate('main', { users: pgTable('users', { email: varchar() }) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: pgTable('users', { email: text() }) });
	await flow.generate('a', {
		users: pgTable('users', { email: text() }),
		likes: pgTable('likes', { id: integer() }),
	});
	await flow.generate('b', { users: pgTable('users', { email: integer() }) });
	flow.merge('main', 'a', 'b');

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120003_a', '20260101120004_b'] });
	const message = result.status === 'conflicts' ? result.message : '';
	expect(message).toContain('(20260101120002_a)');
	expect(message).toContain('(20260101120004_b)');
	expect(message).not.toContain('(20260101120003_a)');
});

test('with three leaves every pair of branches is compared', async () => {
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer() });
	const likes = pgTable('likes', { id: integer() });

	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users, likes });
	await flow.generate('b', { users: pgTable('users', { id: integer(), email: varchar() }) });
	flow.branch('c', 'b');
	await flow.generate('c', { users: pgTable('users', { id: integer(), email: text() }) });
	await flow.generate('b', { users: pgTable('users', { id: integer(), email: integer() }), likes });
	flow.merge('main', 'a', 'b', 'c');

	expect(flow.leaves('main')).toStrictEqual(['20260101120002_a', '20260101120004_c', '20260101120005_b']);

	const result = await flow.check('main');

	// The third leaf conflicts with the first leaf on likes and with the second leaf on users.email.
	// Each pair is grouped under its own fork point.
	expect(reportOf(result)).toStrictEqual([
		'',
		' Conflicting migrations detected  Found 2 conflicts across 3 migrations',
		'',
		'  20260101120001_main',
		'  ├── 20260101120002_a',
		'  │   └─ ⚠ create_table: likes in public schema (20260101120002_a)',
		'  └── 20260101120003_b',
		'      20260101120005_b',
		'      └─ ⚠ create_table: likes in public schema (20260101120005_b)',
		'',
		'  20260101120003_b',
		'  ├── 20260101120004_c',
		'  │   └─ ⚠ alter_column: email on users table (20260101120004_c)',
		'  └── 20260101120005_b',
		'      └─ ⚠ alter_column: email on users table (20260101120005_b)',
		'',
		'To fix the conflicts, drizzle-kit can delete the conflicting migration branches, which is 3 migrations in '
		+ 'total, and generate one new migration from your schema. It deletes these folders:',
		'  20260101120002_a',
		'  20260101120004_c',
		'  20260101120005_b',
		'Every database that already ran a deleted migration must be reset.',
		'To apply this fix, run:',
		'  drizzle-kit generate --fix-conflicts',
	]);
});

test('renaming column c and replacing index c in one migration passes', async () => {
	const flow = createFolderFlow();
	const likes = pgTable('likes', { id: integer() });

	await flow.generate('main', {
		users: pgTable('users', { id: integer(), c: varchar() }, (t) => [index('c').on(t.c)]),
	});
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	// Index c has the old name of column c, so the column rename must not match the index.
	await flow.generate('a', {
		users: pgTable('users', { id: integer(), d: varchar() }, (t) => [index('users_d_idx').on(t.d)]),
	}, {
		hints: [
			{ type: 'rename', kind: 'column', from: ['public', 'users', 'c'], to: ['public', 'users', 'd'] },
			{ type: 'create', kind: 'index', entity: ['public', 'users', 'users_d_idx'] },
		],
	});
	await flow.generate('b', {
		users: pgTable('users', { id: integer(), c: varchar() }, (t) => [index('c').on(t.c)]),
		likes,
	});
	flow.merge('main', 'a', 'b');

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(
		await flow.migrate('main', {
			users: pgTable('users', { id: integer(), d: varchar() }, (t) => [index('users_d_idx').on(t.d)]),
			likes,
		}),
	).toStrictEqual([]);
});
