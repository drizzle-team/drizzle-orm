import { cockroachTable, index, int4, text } from 'drizzle-orm/cockroach-core';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { assertConflictOptions, checkHandler } from 'src/cli/commands/check';
import { handle } from 'src/cli/commands/generate-cockroach';
import { runWithCliContext } from 'src/cli/context';
import { CheckCliError } from 'src/cli/errors';
import { type Hint, HintsHandler } from 'src/cli/hints';
import { readFolder, stateOf } from 'src/dialects/cockroach/folder';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { expect, onTestFinished, test, vi } from 'vitest';
import { type CockroachDBSchema, drizzleToDDL } from './mocks';

const tempDir = () => {
	const dir = mkdtempSync(join('tests/cockroach/tmp', 'merge-flow-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
};

let clock = Date.UTC(2026, 0, 1, 12, 0, 0);

const schemaFile = (body: string) =>
	`import { cockroachTable, index, int4, text } from 'drizzle-orm/cockroach-core';\n${body}\n`;

const generate = async (
	out: string,
	body: string,
	options: { fixConflicts?: boolean; hints?: Hint[] } = {},
) => {
	const schemaPath = join(out, `schema-${Math.random().toString(36).slice(2)}.ts`);
	writeFileSync(schemaPath, schemaFile(body));
	clock += 1000;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(clock);
	try {
		return await runWithCliContext({ output: 'json', interactive: false }, () =>
			handle({
				dialect: 'cockroach',
				filenames: [schemaPath],
				schemaSource: undefined as never,
				out,
				breakpoints: true,
				name: 'test',
				custom: false,
				bundle: false,
				fixConflicts: options.fixConflicts,
				explain: false,
				hints: new HintsHandler(options.hints),
			}));
	} finally {
		vi.useRealTimers();
	}
};

const folders = (out: string) => readdirSync(out).filter((it) => !it.endsWith('.ts')).sort();

const check = async (out: string) => {
	try {
		await runWithCliContext({ output: 'json', interactive: false }, () => checkHandler(out, 'cockroach'));
		return { status: 'passed' as const };
	} catch (e) {
		if (!(e instanceof CheckCliError) || e.meta?.kind !== 'conflicts') throw e;
		const details = e.meta.details as { branches: { leafPath: string | null }[] }[];
		return {
			status: 'conflicts' as const,
			folders: [
				...new Set(
					details.flatMap((it) =>
						it.branches.flatMap((branch) => (branch.leafPath ? [basename(branch.leafPath)] : []))
					),
				),
			].sort(),
			fix: (e.meta.fix as { migrations: string[] }).migrations.map((it) => basename(it)),
		};
	}
};

const schemaState = (schema: CockroachDBSchema) => normalizeDDL(drizzleToDDL(schema).ddl.entities.list());

const base = `export const users = cockroachTable('users', { id: int4('id').primaryKey() });`;

test('check reports a rename against an index on the renamed column, and the fix repairs the folder', async () => {
	const root = tempDir();
	const main = join(root, 'main');
	const a = join(root, 'a');
	const b = join(root, 'b');
	mkdirSync(main);
	mkdirSync(a);
	mkdirSync(b);

	await generate(main, base);
	cpSync(main, a, { recursive: true });
	cpSync(main, b, { recursive: true });

	const rename: Hint = {
		type: 'rename',
		kind: 'column',
		from: ['public', 'users', 'id'],
		to: ['public', 'users', 'user_id'],
	};
	await generate(a, `export const users = cockroachTable('users', { userId: int4('user_id').primaryKey() });`, {
		hints: [rename],
	});
	await generate(
		b,
		`export const users = cockroachTable('users', { id: int4('id').primaryKey() }, (t) => [index('users_id').on(t.id)]);`,
	);
	cpSync(a, main, { recursive: true });
	cpSync(b, main, { recursive: true });

	const before = await check(main);
	expect(before.status).toBe('conflicts');
	if (before.status !== 'conflicts') throw new Error('no conflicts');
	expect(before.folders).toHaveLength(2);
	expect(before.folders).toStrictEqual(folders(main).slice(1));

	const merged: CockroachDBSchema = {
		users: cockroachTable(
			'users',
			{ userId: int4('user_id').primaryKey() },
			(t) => [index('users_id').on(t.userId)],
		),
	};
	const mergedBody =
		`export const users = cockroachTable('users', { userId: int4('user_id').primaryKey() }, (t) => [index('users_id').on(t.userId)]);`;

	const result = await generate(main, mergedBody, { fixConflicts: true, hints: [rename] });
	expect(result.status).toBe('ok');
	if (!('deleted_migrations' in result)) throw new Error('the fix deleted no migration');
	expect(result.deleted_migrations!.map((it) => basename(it)).sort()).toStrictEqual(before.fix);

	expect((await check(main)).status).toBe('passed');

	const stored = readFolder(main);
	const last = stored.files[stored.files.length - 1];
	expect(normalizeDDL(stateOf(stored, last.snapshot.id).entities.list())).toStrictEqual(schemaState(merged));
});

test('--ignore-conflicts names --fix-conflicts for cockroach', () => {
	expect(() => assertConflictOptions('generate', 'cockroach', { ignoreConflicts: true })).toThrow(/--fix-conflicts/);
	expect(() => assertConflictOptions('generate', 'mysql', { fixConflicts: true })).toThrow(/--ignore-conflicts/);
	expect(() => assertConflictOptions('generate', 'cockroach', { fixConflicts: true })).not.toThrow();
});
