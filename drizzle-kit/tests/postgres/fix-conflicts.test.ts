import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { basename } from 'path';
import { errorToEnvelope } from 'src/cli/errors';
import { runGenerate } from 'src/cli/schema';
import { expect, onTestFinished, test, vi } from 'vitest';
import { forkFlow, rename, schemaState, step, tempDir } from './folder-flow';
import type { PostgresSchema } from './mocks';

// Verifies `generate --fix-conflicts`. `check` and a plain `generate` stop on a conflict and name the migrations
// that the fix deletes. The fix deletes the conflicting migrations and their children, keeps the migrations
// before them, and writes one migration from the remaining state to the schema. Explain mode and missing rename
// hints delete nothing, and `generate` rejects the option for sqlite. `migrate` runs the folder on PGlite to
// compare the database with the schema.

const tags = pgTable('tags', { id: integer() });
const users = (score?: number, extra: Record<string, ReturnType<typeof integer>> = {}) =>
	pgTable('users', { id: integer(), score: score === undefined ? integer() : integer().default(score), ...extra });

const forkPoint = { users: pgTable('users', { id: integer(), note: varchar(), score: integer() }) };

const conflictingFork = () =>
	forkFlow({ base: forkPoint, branches: [[step({ users: users(1), tags })], [step({ users: users(2) })]] });

const resolved = { users: users(3), tags };

test('check and generate stop on a conflict and name the migrations that --fix-conflicts deletes', async () => {
	const { flow } = await conflictingFork();

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
	const { flow } = await conflictingFork();

	const { folder, deleted } = await flow.generate('main', resolved, { fixConflicts: true });

	expect(deleted).toStrictEqual(['20260101120002_a', '20260101120003_b']);
	expect(flow.folders('main')).toStrictEqual(['20260101120001_main', '20260101120004_main']);
	expect(flow.snapshot('main', folder).prevIds).toStrictEqual([flow.snapshot('main', '20260101120001_main').id]);
	expect(flow.sql('main', folder).split('--> statement-breakpoint\n').sort()).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "score" SET DEFAULT 3;',
		'ALTER TABLE "users" DROP COLUMN "note";',
		'CREATE TABLE "tags" (\n\t"id" integer\n);\n',
	]);
	expect(flow.state('main', folder)).toStrictEqual(schemaState(resolved));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', resolved)).toStrictEqual([]);
});

test('--fix-conflicts also deletes the children of a conflicting migration and names the custom ones', async () => {
	const { flow } = await forkFlow({
		base: { users: users() },
		branches: [
			[step({ users: users(1) }), { schema: { users: users(1) }, custom: true }, step({ users: users(1), tags })],
			[step({ users: users(2) })],
		],
	});
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
	expect(flow.state('main', fixed.folder)).toStrictEqual(schemaState(resolved));
	expect(await flow.migrate('main', resolved)).toStrictEqual([]);
});

test('the migrations before a conflicting one stay, and --fix-conflicts merges the branches that remain', async () => {
	const x = pgTable('x', { id: integer() });
	const y = pgTable('y', { id: integer() });
	const { flow } = await forkFlow({
		base: { users: users() },
		branches: [
			[step({ users: users(), x }), step({ users: users(1), x })],
			[step({ users: users(), y }), step({ users: users(2), y })],
		],
	});
	const merged = { users: users(3), x, y };

	const { folder, deleted } = await flow.generate('main', merged, { fixConflicts: true });

	expect(deleted).toStrictEqual(['20260101120003_a', '20260101120005_b']);
	expect(flow.snapshot('main', folder).prevIds).toStrictEqual(
		['20260101120004_b', '20260101120002_a'].map((it) => flow.snapshot('main', it).id),
	);
	expect(flow.sql('main', folder)).toBe('ALTER TABLE "users" ALTER COLUMN "score" SET DEFAULT 3;');
	expect(flow.state('main', folder)).toStrictEqual(schemaState(merged));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

// `check` reports one conflict for each pair of leaves. These branches conflict on `score` and on `level`,
// so the fix must also cover the conflict that `check` does not report.
test('--fix-conflicts fixes every conflict between two branches', async () => {
	const level = (value?: number) => ({ level: value === undefined ? integer() : integer().default(value) });
	const { flow } = await forkFlow({
		base: { users: users(undefined, level()) },
		branches: [
			[step({ users: users(1, level()) }), step({ users: users(1, level(1)) })],
			[step({ users: users(2, level()) }), step({ users: users(2, level(2)) })],
		],
	});
	const merged = { users: users(3, level(3)) };

	const { folder, deleted } = await flow.generate('main', merged, { fixConflicts: true });

	expect(deleted).toStrictEqual(['20260101120002_a', '20260101120003_a', '20260101120004_b', '20260101120005_b']);
	expect(flow.state('main', folder)).toStrictEqual(schemaState(merged));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

test('--fix-conflicts in explain mode names the migrations that the fix deletes and deletes nothing', async () => {
	const { flow } = await conflictingFork();
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	onTestFinished(() => log.mockRestore());
	const explainAsText = async (schema: PostgresSchema) => {
		log.mockClear();
		await flow.tryGenerate('main', schema, { fixConflicts: true, explain: true, output: 'text' });
		return log.mock.calls.map((call) => String(call[0])).join('\n');
	};

	const explained = await flow.tryGenerate('main', resolved, { fixConflicts: true, explain: true });
	const unchanged = await flow.tryGenerate('main', forkPoint, { fixConflicts: true, explain: true });
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
	const { flow } = await conflictingFork();
	const renamed = { users: pgTable('users', { id: integer(), points: integer().default(3) }), tags };

	const pending = await flow.tryGenerate('main', renamed, { fixConflicts: true });

	expect(pending.status).toBe('missing_hints');
	expect(flow.folders('main')).toStrictEqual(['20260101120001_main', '20260101120002_a', '20260101120003_b']);

	const { folder, deleted } = await flow.generate('main', renamed, {
		fixConflicts: true,
		hints: [rename('column', 'public.users.score', 'public.users.points')],
	});

	expect(deleted).toStrictEqual(['20260101120002_a', '20260101120003_b']);
	expect(flow.sql('main', folder)).toContain('ALTER TABLE "users" RENAME COLUMN "score" TO "points";');
	expect(flow.state('main', folder)).toStrictEqual(schemaState(renamed));
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
