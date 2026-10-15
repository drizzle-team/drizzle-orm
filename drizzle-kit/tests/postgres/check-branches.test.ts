import { index, integer, pgEnum, pgPolicy, pgRole, pgTable, primaryKey, text, varchar } from 'drizzle-orm/pg-core';
import { stripVTControlCharacters } from 'util';
import { expect, test } from 'vitest';
import { type CheckResult, createFolderFlow, forkFlow, rename, step } from './folder-flow';

// Gives the lines of a conflict report with folder names in place of the temporary folder paths, so that a
// test can compare exact lines.
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
	// `migrate` runs the folders in name order, so the folder of branch b adds the column `c` again before
	// branch a drops it.
	await expect(flow.migrate('main', { users: pgTable('users', { id: integer(), c: integer() }) })).rejects.toThrow(
		'Failed query: ALTER TABLE "users" ADD COLUMN "c" integer;',
	);
});

test('a primary key rename on one branch conflicts with a drop of that key on the other', async () => {
	const withKey = (name: string) => ({
		users: pgTable('users', { id: integer().notNull() }, (t) => [primaryKey({ name, columns: [t.id] })]),
	});
	const { flow } = await forkFlow({
		base: withKey('users_pk'),
		branches: [
			[step(withKey('users_key'), rename('primary_key', 'public.users.users_pk', 'public.users.users_key'))],
			[step({ users: pgTable('users', { id: integer().notNull() }) })],
		],
	});

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	expect(reportOf(result)).toContainEqual(expect.stringContaining('rename_constraint on users table'));
	await expect(flow.migrate('main', {})).rejects.toThrow(
		'Failed query: ALTER TABLE "users" DROP CONSTRAINT "users_pk";',
	);
});

test('a new table with a column of an enum type conflicts with a rename of that enum', async () => {
	const mood = pgEnum('mood', ['ok', 'sad']);
	const feeling = pgEnum('feeling', ['ok', 'sad']);
	const users = (type: typeof mood) => pgTable('users', { id: integer(), state: type() });
	const { flow } = await forkFlow({
		base: { mood, users: users(mood) },
		branches: [
			[step({ feeling, users: users(feeling) }, rename('enum', 'public.mood', 'public.feeling'))],
			[step({ mood, users: users(mood), notes: pgTable('notes', { state: mood() }) })],
		],
	});

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	await expect(flow.migrate('main', {})).rejects.toThrow('Failed query: CREATE TABLE "notes"');
});

test('a new policy for a role conflicts with a rename of that role', async () => {
	const users = (...policies: ReturnType<typeof pgPolicy>[]) => pgTable('users', { id: integer() }, () => policies);
	const staff = pgRole('staff');
	const team = pgRole('team');
	const { flow } = await forkFlow({
		base: { staff, users: users() },
		branches: [
			[step({ team, users: users() }, rename('role', 'staff', 'team'))],
			[step({ staff, users: users(pgPolicy('staff_reads', { for: 'select', to: staff })) })],
		],
	});

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	await expect(flow.migrate('main', {})).rejects.toThrow('CREATE POLICY "staff_reads" ON "users"');
});

test('a new policy conflicts with a drop of the last policy of its table, which disables row level security', async () => {
	const policy = (name: string) => pgPolicy(name, { for: 'select', to: 'public' });
	const users = (...policies: ReturnType<typeof pgPolicy>[]) => pgTable('users', { id: integer() }, () => policies);
	const { flow } = await forkFlow({
		base: { users: users(policy('readers')) },
		branches: [
			[step({ users: users() })],
			[step({ users: users(policy('readers'), policy('writers')) })],
		],
	});

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	// The SQL of both branches runs, but the table `users` ends with the policy `writers` and without row level
	// security. Postgres does not enforce that policy, so push must still enable row level security.
	expect(await flow.migrate('main', { users: users(policy('writers')) })).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
	]);
});

test('a new foreign key conflicts with a drop of the primary key that it references', async () => {
	const users = pgTable('users', { id: integer().primaryKey() });
	const plainUsers = pgTable('users', { id: integer().notNull() });
	const posts = pgTable('posts', { userId: integer() });
	const { flow } = await forkFlow({
		base: { users, posts },
		branches: [
			[step({ users: plainUsers, posts })],
			[step({ users, posts: pgTable('posts', { userId: integer().references(() => users.id) }) })],
		],
	});

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	await expect(flow.migrate('main', {})).rejects.toThrow('Failed query: ALTER TABLE "posts" ADD CONSTRAINT');
});

test('an index and a table that take one name conflict', async () => {
	const users = pgTable('users', { id: integer(), email: varchar() });
	const { flow } = await forkFlow({
		base: { users },
		branches: [
			[step({ users: pgTable('users', { id: integer(), email: varchar() }, (t) => [index('tags').on(t.email)]) })],
			[step({ users, tags: pgTable('tags', { id: integer() }) })],
		],
	});

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	await expect(flow.migrate('main', {})).rejects.toThrow('Failed query: CREATE TABLE "tags"');
});

test('overlapping branches fail and the report names both conflicting snapshots', async () => {
	const { flow } = await forkFlow({
		base: { users: pgTable('users', { email: varchar() }) },
		branches: [
			[
				step({ users: pgTable('users', { email: text() }) }),
				step({ users: pgTable('users', { email: text() }), likes: pgTable('likes', { id: integer() }) }),
			],
			[step({ users: pgTable('users', { email: integer() }) })],
		],
	});

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

	// The leaf `20260101120005_b` conflicts with `20260101120002_a` on `likes`, and with `20260101120004_c` on
	// `users.email`. The report groups each conflicting pair under its own fork point.
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
