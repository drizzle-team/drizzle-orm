import { sql } from 'drizzle-orm';
import { check, cockroachTable, index, int4, text } from 'drizzle-orm/cockroach-core';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { checkHandler } from 'src/cli/commands/check';
import { handle } from 'src/cli/commands/generate-cockroach';
import { upCockroachHandler } from 'src/cli/commands/up-cockroach';
import { runWithCliContext } from 'src/cli/context';
import { CheckCliError } from 'src/cli/errors';
import { type Hint, HintsHandler } from 'src/cli/hints';
import { readFolder, stateOf } from 'src/dialects/cockroach/folder';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { onTestFinished, vi } from 'vitest';
import { type CockroachDBSchema, drizzleToDDL } from './mocks';

// The description of one schema step of a folder flow, shared by the postgres and cockroach harnesses.
export type TestSchema = { columns: readonly string[]; indexOn?: string; check?: boolean };

export type FolderFlow = ReturnType<typeof createCockroachFolderFlow>;

const columnsOf = (state: TestSchema) =>
	state.columns.map((name) => (name === 'id' ? `id: int4('id').primaryKey()` : `${name}: text('${name}')`)).join(', ');

const buildersOf = (state: TestSchema) =>
	[
		...(state.indexOn ? [`index('${state.indexOn}_ix').on(t.${state.indexOn})`] : []),
		...(state.check ? [`check('name_ck', sql\`\${t.name} <> ''\`)`] : []),
	].join(', ');

// Writes the schema as a module that the cockroach handler loads, because it reads schema files.
export const schemaFile = (state: TestSchema) => {
	const builders = buildersOf(state);
	const tail = builders ? `, (t) => [${builders}]` : '';
	return `import { sql } from 'drizzle-orm';\n`
		+ `import { check, cockroachTable, index, int4, text } from 'drizzle-orm/cockroach-core';\n`
		+ `export const users = cockroachTable('users', { ${columnsOf(state)} }${tail});\n`;
};

// The cockroach schema object for the same state, so that a test can compare a reconstructed state with it.
export const schemaObject = (state: TestSchema): CockroachDBSchema => {
	const columns = Object.fromEntries(
		state.columns.map((name) => [name, name === 'id' ? int4('id').primaryKey() : text(name)]),
	);
	return {
		users: cockroachTable('users', columns, (t: any) => [
			...(state.indexOn ? [index(`${state.indexOn}_ix`).on(t[state.indexOn])] : []),
			...(state.check ? [check('name_ck', sql`${t.name} <> ''`)] : []),
		]),
	} as CockroachDBSchema;
};

export const schemaState = (state: TestSchema) => normalizeDDL(drizzleToDDL(schemaObject(state)).ddl.entities.list());

let clock = Date.UTC(2026, 0, 1, 12, 0, 0);

const leafFoldersOf = (leafIds: string[], files: { folder: string; snapshot: { id: string } }[]) =>
	files.filter((it) => leafIds.includes(it.snapshot.id)).map((it) => it.folder);

// Runs the cockroach CLI commands on the migration folders of several git branches, like `createFolderFlow` does
// for postgres.
export const createCockroachFolderFlow = () => {
	const root = mkdtempSync(join('tests/cockroach/tmp', 'folder-flow-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const branches = new Map<string, string>();

	const dirOf = (branch: string) => {
		const dir = branches.get(branch);
		if (!dir) throw new Error(`Branch "${branch}" does not exist. Create it with branch() first.`);
		return dir;
	};

	const branch = (name: string, from?: string) => {
		const dir = mkdtempSync(join(root, `${name}-`));
		if (from) cpSync(dirOf(from), dir, { recursive: true });
		branches.set(name, dir);
	};
	branch('main');

	const folders = (branch: string) =>
		readdirSync(dirOf(branch), { withFileTypes: true })
			.filter((it) => it.isDirectory())
			.map((it) => it.name)
			.sort();

	// Every file of the branch with its content, so that a test can assert that a command changed nothing.
	const files = (branch: string) =>
		folders(branch)
			.flatMap((folder) => ['snapshot.json', 'migration.sql'].map((file) => `${folder}/${file}`))
			.filter((file) => existsSync(join(dirOf(branch), file)))
			.map((file) => [file, readFileSync(join(dirOf(branch), file), 'utf8')] as [string, string])
			.sort(([a], [b]) => (a < b ? -1 : 1));

	const snapshot = (branch: string, folder: string) =>
		JSON.parse(readFileSync(join(dirOf(branch), folder, 'snapshot.json'), 'utf8'));

	const leaves = (branch: string) => {
		const stored = readFolder(dirOf(branch));
		return leafFoldersOf(stored.leafIds, stored.files);
	};

	const state = (branch: string, folder: string) => {
		const stored = readFolder(dirOf(branch));
		const it = stored.files.find((file) => file.folder === folder)!;
		return normalizeDDL(stateOf(stored, it.snapshot.id).entities.list());
	};

	const generate = async (
		branch: string,
		state: TestSchema,
		options: { fixConflicts?: boolean; custom?: boolean; hints?: Hint[]; at?: Date } = {},
	) => {
		const dir = dirOf(branch);
		const schemaPath = join(dir, `schema-${Math.random().toString(36).slice(2)}.ts`);
		writeFileSync(schemaPath, schemaFile(state));
		const time = options.at?.getTime() ?? clock + 1000;
		clock = Math.max(clock, time);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(time);
		try {
			const result = await runWithCliContext({ output: 'json', interactive: false }, () =>
				handle({
					dialect: 'cockroach',
					filenames: [schemaPath],
					schemaSource: undefined as never,
					out: dir,
					breakpoints: true,
					name: branch,
					custom: options.custom ?? false,
					bundle: false,
					fixConflicts: options.fixConflicts,
					explain: false,
					hints: new HintsHandler(options.hints),
				}));
			if (!('migration_path' in result)) {
				throw new Error(`generate wrote no migration on branch ${branch}, and its status is ${result.status}.`);
			}
			return {
				folder: basename(join(result.migration_path, '..')),
				deleted: (result.deleted_migrations ?? []).map((it) => basename(it)),
			};
		} finally {
			rmSync(schemaPath, { force: true });
			vi.useRealTimers();
		}
	};

	const check = async (branch: string) => {
		try {
			await runWithCliContext({ output: 'json', interactive: false }, () => checkHandler(dirOf(branch), 'cockroach'));
			return { status: 'passed' as const };
		} catch (e) {
			if (!(e instanceof CheckCliError) || e.meta?.kind !== 'conflicts') throw e;
			const details = e.meta.details as { branches: { leafPath: string | null }[] }[];
			return {
				status: 'conflicts' as const,
				folders: [
					...new Set(
						details.flatMap((it) => it.branches.flatMap((b) => (b.leafPath ? [basename(b.leafPath)] : []))),
					),
				].sort(),
				fix: (e.meta.fix as { migrations: string[] }).migrations.map((it) => basename(it)),
			};
		}
	};

	const up = (branch: string) =>
		runWithCliContext({ output: 'json', interactive: false }, () => upCockroachHandler(dirOf(branch)));

	const merge = (target: string, ...sources: string[]) => {
		for (const source of sources) {
			for (const folder of folders(source)) {
				const dst = join(dirOf(target), folder);
				if (!existsSync(dst)) cpSync(join(dirOf(source), folder), dst, { recursive: true });
			}
		}
	};

	const deleteFolder = (branch: string, folder: string) => rmSync(join(dirOf(branch), folder), { recursive: true });

	const renameFolder = (branch: string, from: string, to: string) =>
		renameSync(join(dirOf(branch), from), join(dirOf(branch), to));

	const overwriteSnapshot = (branch: string, folder: string, text: string) =>
		writeFileSync(join(dirOf(branch), folder, 'snapshot.json'), text);

	// Rewrites every snapshot as a format 1 snapshot, which stores the full state of its migration.
	const downgradeToFormat1 = (branch: string) => {
		const stored = readFolder(dirOf(branch));
		const states = new Map([...stored.snapshots.keys()].map((id) => [id, stateOf(stored, id)]));
		for (const file of stored.files) {
			overwriteSnapshot(
				branch,
				file.folder,
				JSON.stringify(
					{
						version: '1',
						dialect: 'cockroach',
						id: file.snapshot.id,
						prevIds: file.snapshot.prevIds,
						ddl: states.get(file.snapshot.id)!.entities.list(),
						renames: [],
					},
					null,
					2,
				),
			);
		}
	};

	return {
		dirOf,
		branch,
		folders,
		files,
		snapshot,
		leaves,
		state,
		generate,
		check,
		up,
		merge,
		deleteFolder,
		renameFolder,
		overwriteSnapshot,
		downgradeToFormat1,
	};
};
