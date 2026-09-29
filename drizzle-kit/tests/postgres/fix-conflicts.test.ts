import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { errorToEnvelope } from 'src/cli/errors';
import { runGenerate } from 'src/cli/schema';
import { reconstruct } from 'src/dialects/postgres/snapshot';
import { expect, test } from 'vitest';
import { createFolderFlow, type FolderFlow, schemaState, tempDir } from './folder-flow';

const tags = pgTable('tags', { id: integer() });
const users = (score?: number, extra: Record<string, ReturnType<typeof integer>> = {}) =>
	pgTable('users', { id: integer(), score: score === undefined ? integer() : integer().default(score), ...extra });

const conflictingFork = async (flow: FolderFlow) => {
	await flow.generate('main', { users: pgTable('users', { id: integer(), note: varchar(), score: integer() }) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: users(1), tags });
	await flow.generate('b', { users: users(2) });
	flow.merge('main', 'a', 'b');
};

const resolved = { users: users(3), tags };

test('check and generate stop on a conflict and name the migrations that --fix-conflicts deletes', async () => {
	const flow = createFolderFlow();
	await conflictingFork(flow);

	const result = await flow.check('main');

	expect(result).toMatchObject({
		status: 'conflicts',
		fix: { migrations: ['20260101120002_a', '20260101120003_b'], customMigrations: [] },
	});
	expect(result.status === 'conflicts' && result.message).toContain(
		'To apply this fix, run: drizzle-kit generate --fix-conflicts',
	);
	await expect(flow.generate('main', resolved)).rejects.toThrow('drizzle-kit generate --fix-conflicts');
	expect(flow.folders('main')).toStrictEqual(['20260101120001_main', '20260101120002_a', '20260101120003_b']);
});

test('--fix-conflicts deletes both conflicting migrations and generates one migration from the fork point', async () => {
	const flow = createFolderFlow();
	await conflictingFork(flow);

	const { folder, deleted } = await flow.generate('main', resolved, { fixConflicts: true });

	expect(deleted).toStrictEqual(['20260101120002_a', '20260101120003_b']);
	expect(flow.folders('main')).toStrictEqual(['20260101120001_main', '20260101120004_main']);
	expect(flow.snapshot('main', folder!).prevIds).toStrictEqual([flow.snapshot('main', '20260101120001_main').id]);
	expect(flow.sql('main', folder!).split('--> statement-breakpoint\n').sort()).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "score" SET DEFAULT 3;',
		'ALTER TABLE "users" DROP COLUMN "note";',
		'CREATE TABLE "tags" (\n\t"id" integer\n);\n',
	]);
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(resolved));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', resolved)).toStrictEqual([]);
});

test('--fix-conflicts also deletes the children of a conflicting migration and names the custom ones', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users: users() });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: users(1) });
	await flow.generate('a', { users: users(1) }, { custom: true });
	await flow.generate('a', { users: users(1), tags });
	await flow.generate('b', { users: users(2) });
	flow.merge('main', 'a', 'b');
	const fix = {
		migrations: ['20260101120002_a', '20260101120003_a', '20260101120004_a', '20260101120005_b'],
		customMigrations: ['20260101120003_a'],
	};

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', fix });
	expect(result.status === 'conflicts' && result.message).toContain('These migrations are custom migrations.');

	const fixed = await flow.generate('main', resolved, { fixConflicts: true });

	expect(fixed.deleted).toStrictEqual(fix.migrations);
	expect(fixed).toMatchObject({ deleted_custom_migrations: [expect.stringMatching(/20260101120003_a$/)] });
	expect(flow.folders('main')).toStrictEqual(['20260101120001_main', fixed.folder]);
	expect(flow.state('main', fixed.folder!)).toStrictEqual(schemaState(resolved));
	expect(await flow.migrate('main', resolved)).toStrictEqual([]);
});

test('the migrations before a conflicting one stay, and --fix-conflicts merges the branches that remain', async () => {
	const flow = createFolderFlow();
	const x = pgTable('x', { id: integer() });
	const y = pgTable('y', { id: integer() });
	await flow.generate('main', { users: users() });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: users(), x });
	await flow.generate('a', { users: users(1), x });
	await flow.generate('b', { users: users(), y });
	await flow.generate('b', { users: users(2), y });
	flow.merge('main', 'a', 'b');
	const merged = { users: users(3), x, y };

	const { folder, deleted } = await flow.generate('main', merged, { fixConflicts: true });

	expect(deleted).toStrictEqual(['20260101120003_a', '20260101120005_b']);
	expect(flow.snapshot('main', folder!).prevIds).toStrictEqual(
		['20260101120004_b', '20260101120002_a'].map((it) => flow.snapshot('main', it).id),
	);
	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "users" ALTER COLUMN "score" SET DEFAULT 3;');
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(merged));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

// Check reports one conflict for each pair of leaves, and these branches conflict in two places.
test('--fix-conflicts fixes every conflict between two branches', async () => {
	const flow = createFolderFlow();
	const level = (value?: number) => ({ level: value === undefined ? integer() : integer().default(value) });
	await flow.generate('main', { users: users(undefined, level()) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: users(1, level()) });
	await flow.generate('a', { users: users(1, level(1)) });
	await flow.generate('b', { users: users(2, level()) });
	await flow.generate('b', { users: users(2, level(2)) });
	flow.merge('main', 'a', 'b');
	const merged = { users: users(3, level(3)) };

	const { folder, deleted } = await flow.generate('main', merged, { fixConflicts: true });

	expect(deleted).toStrictEqual(['20260101120002_a', '20260101120003_a', '20260101120004_b', '20260101120005_b']);
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(merged));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

test('--fix-conflicts deletes nothing in explain mode, also with --custom', async () => {
	const flow = createFolderFlow();
	await conflictingFork(flow);

	await flow.generate('main', resolved, { fixConflicts: true, explain: true });
	await flow.generate('main', resolved, { fixConflicts: true, explain: true, custom: true });

	expect(flow.folders('main')).toStrictEqual(expect.arrayContaining(['20260101120002_a', '20260101120003_b']));
});

test('--fix-conflicts deletes nothing while generate still needs rename hints', async () => {
	const flow = createFolderFlow();
	await conflictingFork(flow);
	const renamed = { users: pgTable('users', { id: integer(), points: integer().default(3) }), tags };

	const pending = await flow.generate('main', renamed, { fixConflicts: true });

	expect(pending.status).toBe('missing_hints');
	expect(flow.folders('main')).toStrictEqual(['20260101120001_main', '20260101120002_a', '20260101120003_b']);

	const { folder, deleted } = await flow.generate('main', renamed, {
		fixConflicts: true,
		hints: [{ type: 'rename', kind: 'column', from: ['public', 'users', 'score'], to: ['public', 'users', 'points'] }],
	});

	expect(deleted).toStrictEqual(['20260101120002_a', '20260101120003_b']);
	expect(flow.sql('main', folder!)).toContain('ALTER TABLE "users" RENAME COLUMN "score" TO "points";');
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(renamed));
	expect(await flow.migrate('main', renamed)).toStrictEqual([]);
});

// A tool that stores the output of generateDrizzleJson with a prevId can write a checkpoint into a branch.
test('a merge that would replay a checkpoint stops with an error and writes nothing', async () => {
	const flow = createFolderFlow();
	const t = pgTable('t', { id: integer() });
	const u = pgTable('u', { id: integer() });
	const withA = pgTable('u', { id: integer(), a: integer() });
	await flow.generate('main', { t, u });
	flow.branch('x', 'main');
	flow.branch('y', 'main');
	const { folder } = await flow.generate('x', { t, u: withA });
	const snapshot = flow.snapshot('x', folder!);
	const history = new Map(flow.folders('x').map((it) => flow.snapshot('x', it)).map((it) => [it.id, it]));
	flow.overwriteSnapshot(
		'x',
		folder!,
		JSON.stringify({
			type: 'checkpoint',
			version: '9',
			dialect: 'postgres',
			id: snapshot.id,
			prevIds: snapshot.prevIds,
			ddl: reconstruct(history, snapshot.id).entities.list(),
		}),
	);
	await flow.generate('y', { u });
	flow.merge('main', 'x', 'y');

	await expect(flow.generate('main', { u: withA, tags })).rejects.toThrow(
		`Cannot merge branches: checkpoint ${snapshot.id} is part of a branch that the merge replays, `
			+ 'and a checkpoint is supported only in linear history.',
	);
	expect(flow.folders('main')).toStrictEqual(['20260101120001_main', '20260101120002_x', '20260101120003_y']);
});

test('generate rejects --fix-conflicts for sqlite', async () => {
	const out = tempDir('dk-fix-conflicts-sqlite-');

	const error = await runGenerate({ dialect: 'sqlite', out, fixConflicts: true } as never).catch((e) => e);

	expect(errorToEnvelope(error)).toStrictEqual({
		status: 'error',
		error: {
			code: 'unsupported_command_dialect_error',
			command: 'generate',
			dialect: 'sqlite',
			option: 'fix-conflicts',
		},
	});
});
