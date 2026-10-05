import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { basename } from 'path';
import { errorToEnvelope } from 'src/cli/errors';
import { runGenerate } from 'src/cli/schema';
import { expect, onTestFinished, test, vi } from 'vitest';
import { createFolderFlow, type FolderFlow, schemaState, tempDir } from './folder-flow';
import type { PostgresSchema } from './mocks';

const tags = pgTable('tags', { id: integer() });
const users = (score?: number, extra: Record<string, ReturnType<typeof integer>> = {}) =>
	pgTable('users', { id: integer(), score: score === undefined ? integer() : integer().default(score), ...extra });

const forkPoint = { users: pgTable('users', { id: integer(), note: varchar(), score: integer() }) };

const conflictingFork = async (flow: FolderFlow) => {
	await flow.generate('main', forkPoint);
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
		'To apply this fix, run:\n  drizzle-kit generate --fix-conflicts',
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

test('--fix-conflicts in explain mode names the migrations that the fix deletes and deletes nothing', async () => {
	const flow = createFolderFlow();
	await conflictingFork(flow);
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	onTestFinished(() => log.mockRestore());
	const explainAsText = async (schema: PostgresSchema) => {
		log.mockClear();
		await flow.generate('main', schema, { fixConflicts: true, explain: true, output: 'text' });
		return log.mock.calls.map((call) => String(call[0])).join('\n');
	};

	const explained = await flow.generate('main', resolved, { fixConflicts: true, explain: true });
	const unchanged = await flow.generate('main', forkPoint, { fixConflicts: true, explain: true });
	const explainedText = await explainAsText(resolved);
	const unchangedText = await explainAsText(forkPoint);
	const fix = 'fix' in explained ? explained.fix : undefined;

	expect(flow.folders('main')).toStrictEqual(['20260101120001_main', '20260101120002_a', '20260101120003_b']);
	expect(explained.status).toBe('ok');
	expect(fix?.customMigrations).toStrictEqual([]);
	expect(unchanged).toMatchObject({ status: 'no_changes', fix });
	expect(explainedText).toMatch(/It deletes these folders:\n {2}\S+\/20260101120002_a\n {2}\S+\/20260101120003_b\n/);
	expect(explainedText).toContain('generate one new migration');
	expect(unchangedText).toContain(
		'The remaining migrations already match your schema, so the fix writes no new migration.',
	);
	expect(unchangedText).not.toContain('generate one new migration');

	const { deleted } = await flow.generate('main', resolved, { fixConflicts: true });

	expect(fix?.migrations.map((it) => basename(it))).toStrictEqual(deleted);
	expect(deleted).toStrictEqual(['20260101120002_a', '20260101120003_b']);
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
