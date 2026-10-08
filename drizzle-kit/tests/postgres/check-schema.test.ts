import { integer, pgPolicy, pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { createFolderFlow, forkFlow, step } from './folder-flow';

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

	expect(warnings).toStrictEqual([{
		kind: 'schema_changed',
		message: 'The schema differs from the migrations. The newest migration is 20260101120001_main. '
			+ 'Run drizzle-kit generate --explain to see the difference, and drizzle-kit generate to write a '
			+ 'migration for it.',
	}]);
	expect(flow.files('main')).toStrictEqual(before);

	await flow.generate('main', { users: usersWithEmail });
	expect(await flow.schemaWarnings('main', { users: usersWithEmail })).toStrictEqual([]);
});

// Each branch drops another policy, so no branch disables row level security. After both migrations the
// table has row level security and no policy, and only a merge migration turns it off.
test('check warns that a merge migration is needed when the schema differs from the combined state of two branches', async () => {
	const { flow } = await forkFlow({
		base: guarded('readers', 'writers'),
		branches: [[step(guarded('writers'))], [step(guarded('readers'))]],
	});
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });

	const warnings = await flow.schemaWarnings('main', guarded());

	expect(warnings).toStrictEqual([{
		kind: 'merge_needed',
		message: 'The migrations folder has 2 branches that are not merged: 20260101120002_a, 20260101120003_b. '
			+ 'The schema differs from their combined state, so a merge migration is needed. '
			+ 'Run drizzle-kit generate --explain to see the difference, and drizzle-kit generate to write the '
			+ 'merge migration.',
	}]);

	const { folder } = await flow.generate('main', guarded());
	expect(flow.sql('main', folder)).toBe('ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;');
	expect(await flow.schemaWarnings('main', guarded())).toStrictEqual([]);
});

test('check gives no warning when the combined state of two branches equals the schema', async () => {
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });
	const { flow } = await forkFlow({
		base: { users },
		branches: [[step({ users, likes })], [step({ users, groups })]],
	});

	expect(await flow.schemaWarnings('main', { users, likes, groups })).toStrictEqual([]);
});

test('check warns about a renamed column and asks for no rename decision', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users: usersWithEmail });

	const warnings = await flow.schemaWarnings('main', {
		users: pgTable('users', { id: integer(), contact: varchar() }),
	});

	expect(warnings).toMatchObject([{ kind: 'schema_changed' }]);
});

test('check warns when the folder has no migration and the schema is not empty', async () => {
	const flow = createFolderFlow();

	expect(await flow.schemaWarnings('main', { users })).toStrictEqual([{
		kind: 'schema_changed',
		message: 'The migrations folder has no migration, and the schema is not empty. '
			+ 'Run drizzle-kit generate to write the first migration.',
	}]);
	expect(await flow.schemaWarnings('main', {})).toStrictEqual([]);
});

test('check says that the schema was not compared when the schema has an error', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users });

	const warnings = await flow.schemaWarnings('main', {
		first: pgTable('duplicate', { id: integer() }),
		second: pgTable('duplicate', { id: integer() }),
	});

	expect(warnings).toStrictEqual([{
		kind: 'not_compared',
		message: 'The schema was not compared with the migrations, because the schema has errors. '
			+ 'Run drizzle-kit generate to see them.',
	}]);
});

test('check says that the schema was not compared when the comparison throws', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users });

	const warnings = await flow.schemaWarnings('main', { users: pgTable('users', { id: serial().default(1) }) });

	expect(warnings).toStrictEqual([{
		kind: 'not_compared',
		message: 'The schema was not compared with the migrations, because the comparison failed with an error. '
			+ 'Run drizzle-kit generate to see whether it fails in the same way. '
			+ 'The error: Unexpected default for serial type: 1',
	}]);
});
