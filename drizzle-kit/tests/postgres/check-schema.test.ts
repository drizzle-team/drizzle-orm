import { integer, pgPolicy, pgTable, varchar } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { createFolderFlow } from './folder-flow';

const users = pgTable('users', { id: integer() });
const usersWithEmail = pgTable('users', { id: integer(), email: varchar() });
const guarded = (...names: string[]) => ({
	users: pgTable('users', { id: integer() }, () => names.map((name) => pgPolicy(name, { for: 'select' }))),
});

test('check gives no warning when the schema equals the state of the only leaf', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users });

	expect(await flow.schemaWarnings('main', { users })).toStrictEqual([]);
});

test('check warns when the schema has a change that no migration holds, and writes nothing', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users });
	const before = flow.files('main');

	const warnings = await flow.schemaWarnings('main', { users: usersWithEmail });

	expect(warnings).toStrictEqual([
		'The schema has changes that no migration holds. The newest migration is 20260101120001_main. '
		+ 'Run drizzle-kit generate to write a migration for these changes.',
	]);
	expect(flow.files('main')).toStrictEqual(before);

	await flow.generate('main', { users: usersWithEmail });
	expect(await flow.schemaWarnings('main', { users: usersWithEmail })).toStrictEqual([]);
});

// Each branch drops another policy, so no branch disables row level security. After both migrations the
// table has row level security and no policy, and only a merge migration turns it off.
test('check warns that a merge migration is needed when the schema differs from the combined state of two branches', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', guarded('readers', 'writers'));
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', guarded('writers'));
	await flow.generate('b', guarded('readers'));
	flow.merge('main', 'a', 'b');
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });

	const warnings = await flow.schemaWarnings('main', guarded());

	expect(warnings).toStrictEqual([
		'The migrations folder has 2 branches that are not merged: 20260101120002_a, 20260101120003_b. '
		+ 'The schema differs from their combined state, so a merge migration is needed. '
		+ 'Run drizzle-kit generate to write it.',
	]);

	const { folder } = await flow.generate('main', guarded());
	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;');
	expect(await flow.schemaWarnings('main', guarded())).toStrictEqual([]);
});

test('check gives no warning when the combined state of two branches equals the schema', async () => {
	const flow = createFolderFlow();
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users, likes });
	await flow.generate('b', { users, groups });
	flow.merge('main', 'a', 'b');

	expect(await flow.schemaWarnings('main', { users, likes, groups })).toStrictEqual([]);
});

test('check warns about a renamed column and asks for no rename decision', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users: usersWithEmail });

	const warnings = await flow.schemaWarnings('main', {
		users: pgTable('users', { id: integer(), contact: varchar() }),
	});

	expect(warnings).toStrictEqual([expect.stringContaining('The schema has changes that no migration holds.')]);
});

test('check warns when the folder has no migration and the schema is not empty', async () => {
	const flow = createFolderFlow();

	expect(await flow.schemaWarnings('main', { users })).toStrictEqual([
		'The schema has changes that no migration holds, because the migrations folder has no migration. '
		+ 'Run drizzle-kit generate to write the first migration.',
	]);
	expect(await flow.schemaWarnings('main', {})).toStrictEqual([]);
});

test('check says that the schema was not compared when the schema has an error', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users });

	const warnings = await flow.schemaWarnings('main', {
		first: pgTable('duplicate', { id: integer() }),
		second: pgTable('duplicate', { id: integer() }),
	});

	expect(warnings).toStrictEqual([
		'The schema was not compared with the migrations, because the schema has errors. '
		+ 'Run drizzle-kit generate to see them.',
	]);
});
