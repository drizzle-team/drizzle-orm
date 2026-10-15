import { PGlite } from '@electric-sql/pglite';
import { is } from 'drizzle-orm';
import { PgRole } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate as migrateFolder } from 'drizzle-orm/pglite/migrator';
import {
	cpSync,
	type Dirent,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, relative } from 'path';
import { checkHandler, checkSnapshots } from 'src/cli/commands/check';
import { schemaWarnings as checkSchema } from 'src/cli/commands/check-postgres';
import { handle } from 'src/cli/commands/generate-postgres';
import { handle as pullHandle } from 'src/cli/commands/pull-postgres';
import { upPgHandler } from 'src/cli/commands/up-postgres';
import { preparePostgresDB } from 'src/cli/connections';
import { type CliContext, runWithCliContext } from 'src/cli/context';
import { CheckCliError } from 'src/cli/errors';
import { type Hint, HintsHandler, type RenameCreateHintKind } from 'src/cli/hints';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import type { Delta } from 'src/dialects/dialect';
import { fromSnapshotStatements } from 'src/dialects/postgres/convertor';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { fromDrizzleSchema, fromExports, SchemaSource } from 'src/dialects/postgres/drizzle';
import { combinedState as folderCombinedState, readFolder, withoutMigrations } from 'src/dialects/postgres/folder';
import { reconstruct, startingState } from 'src/dialects/postgres/reconstruct';
import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import { BREAKPOINT } from 'src/utils';
import { expect, onTestFinished, vi } from 'vitest';
import { writeSnapshot } from '../other/check-fixtures';
import { type PostgresSchema, push } from './mocks';

// This file holds helpers that run the real postgres CLI commands on temporary migrations folders.
// `createFolderFlow` keeps one folder for each git branch and runs `generate`, `check`, `up` and `pull` on it.
// `generate` and `pull` run with a fake clock, because they name each new folder from the current time. `migrate`
// applies a folder to PGlite and returns the statements that `push` still needs. `forkFlow` generates a base and
// the migrations of several branches, then copies every branch into main. `createFormat8Flow` writes format 8
// snapshots. The snapshot tests of this folder use these helpers, for example `merge-flow.test.ts` and `fuzz.ts`.

// The result of `check` as data that a test can compare. `fix` lists the folders that generate
// --fix-conflicts deletes.
export type CheckResult =
	| { status: 'passed' }
	| {
		status: 'conflicts';
		folders: string[];
		message: string;
		fix: { migrations: string[]; customMigrations: string[] };
	};

export type GenerateOptions = {
	hints?: Hint[];
	at?: Date;
	fixConflicts?: boolean;
	custom?: boolean;
	explain?: boolean;
	output?: CliContext['output'];
};

// Runs a command without console text or prompts: the json output turns off the human log, and
// `interactive: false` turns off the prompts.
const quietly = <T>(fn: () => Promise<T>) => runWithCliContext({ output: 'json', interactive: false }, fn);

export const tempDir = (prefix: string) => {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
};

export const columnRow = (table: string, name: string, type = 'integer', notNull = false) => ({
	entityType: 'columns' as const,
	schema: 'public',
	table,
	name,
	type,
	typeSchema: null,
	notNull,
	dimensions: 0,
	default: null,
	generated: null,
	identity: null,
});

export const schemaState = (schema: PostgresSchema) => {
	const { schema: interim } = fromDrizzleSchema(fromExports(schema), () => true);
	return normalizeDDL(interimToDDL(interim).ddl.entities.list());
};

// The expected JSON output of a command that stops on a malformed snapshot in `folder`.
export const malformedEnvelope = (folder: string) => ({
	status: 'error',
	error: {
		code: 'check_error',
		kind: 'malformed',
		snapshot: expect.stringContaining(join(folder, 'snapshot.json')),
	},
});

export const reconstructFix = (folder: string) =>
	`Restore the migration folder from git, or delete ${folder} and every later migration, then run generate again.`;

// Runs the CLI commands on the migration folders of several git branches. A branch is a folder that holds
// only the migration folders of that branch, like a git checkout of it.
export const createFolderFlow = () => {
	const root = tempDir('dk-folder-flow-');
	const branches = new Map<string, string>();
	let clock = Date.UTC(2026, 0, 1, 12, 0, 0);

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

	// The `isDirectory` filter skips schema.ts and relations.ts, which pull writes next to the migration folders.
	const folders = (branch: string) =>
		readdirSync(dirOf(branch), { withFileTypes: true }).filter((it) => it.isDirectory()).map((it) => it.name).sort();

	// Every file of the branch with its content, so that a test can assert that a command changed nothing.
	const files = (branch: string) =>
		(readdirSync(dirOf(branch), { recursive: true, withFileTypes: true }) as Dirent[])
			.filter((it) => it.isFile())
			.map((it) => join(it.parentPath, it.name))
			.sort()
			.map((path) => [relative(dirOf(branch), path), readFileSync(path, 'utf8')]);

	const snapshot = (branch: string, folder: string): PostgresSnapshot =>
		JSON.parse(readFileSync(join(dirOf(branch), folder, 'snapshot.json'), 'utf8'));

	const sql = (branch: string, folder: string) => readFileSync(join(dirOf(branch), folder, 'migration.sql'), 'utf8');

	const statements = (branch: string, folder: string) => snapshot(branch, folder).statements;

	// Rebuilds the SQL of a migration from its stored statements, joined like migration.sql, so that a test can
	// compare the two.
	const statementsSql = (branch: string, folder: string) =>
		fromSnapshotStatements(statements(branch, folder)).join(BREAKPOINT);

	const leaves = (branch: string) => {
		const snapshots = folders(branch).map((folder) => ({ folder, ...snapshot(branch, folder) }));
		const parents = new Set(snapshots.flatMap((it) => it.prevIds));
		return snapshots.filter((it) => !parents.has(it.id)).map((it) => it.folder);
	};

	const history = (branch: string) =>
		new Map(folders(branch).map((it) => snapshot(branch, it)).map((it) => [it.id, it]));

	const state = (branch: string, folder: string) =>
		normalizeDDL(reconstruct(history(branch), snapshot(branch, folder).id).entities.list());

	const combinedState = (branch: string, folder: string) =>
		normalizeDDL(startingState(history(branch), snapshot(branch, folder).prevIds).entities.list());

	// The state that the next generate diffs the schema against. With conflicts, it is the state of generate
	// --fix-conflicts, because it omits the migrations that --fix-conflicts deletes.
	const stateBeforeGenerate = (branch: string) =>
		quietly(async () => {
			const stored = readFolder(dirOf(branch));
			const { fix } = await checkSnapshots(stored.files, 'postgresql');
			return folderCombinedState(withoutMigrations(stored, fix?.migrations ?? []));
		});

	const deltas = (branch: string, folder: string): Delta[] => {
		const it = snapshot(branch, folder);
		if (it.type !== 'diff') throw new Error(`${folder} is a ${it.type} snapshot. Pass the folder of a diff snapshot.`);
		return it.deltas;
	};

	// Runs `fn` with a fake clock, one second after the last run by default. Generate and pull name each folder
	// from the current time in seconds, so each run gets a new folder name that sorts last.
	const atTime = async <T>(at: number | undefined, fn: () => Promise<T>, output: CliContext['output'] = 'json') => {
		const time = at ?? clock + 1000;
		clock = Math.max(clock, time);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(time);
		try {
			return await runWithCliContext({ output, interactive: false }, fn);
		} finally {
			vi.useRealTimers();
		}
	};

	// Returns the result of generate as it is. A test calls it when it expects that generate writes no migration.
	const tryGenerate = (branch: string, schema: PostgresSchema, options: GenerateOptions = {}) =>
		atTime(options.at?.getTime(), () =>
			handle({
				dialect: 'postgresql',
				filenames: [],
				schemaSource: SchemaSource.fromSchema(fromExports(schema)),
				out: dirOf(branch),
				breakpoints: true,
				name: branch,
				custom: options.custom ?? false,
				bundle: false,
				fixConflicts: options.fixConflicts,
				explain: options.explain ?? false,
				hints: new HintsHandler(options.hints),
			}), options.output);

	// Runs generate and throws when it writes no migration. `folder` is the folder of the new migration, and
	// `deleted` lists the folders that `fixConflicts` deleted.
	const generate = async (branch: string, schema: PostgresSchema, options: GenerateOptions = {}) => {
		const result = await tryGenerate(branch, schema, options);
		if (!('migration_path' in result)) {
			throw new Error(
				`generate wrote no migration on branch ${branch}, and its status is ${result.status}. `
					+ 'Call tryGenerate when the test expects no migration.',
			);
		}
		const folder = basename(dirname(result.migration_path));
		const deleted = (result.deleted_migrations ?? []).map((it) => basename(it));
		return { ...result, folder, deleted };
	};

	const pull = async (branch: string, client: PGlite) => {
		const db = await preparePostgresDB({ driver: 'pglite', client });
		const filters = { schemas: undefined, tables: undefined, entities: undefined, extensions: undefined };
		const migrations = { table: '__drizzle_migrations', schema: 'drizzle' };
		const credentials = { driver: 'pglite', url: 'memory://' } as const;
		await atTime(
			undefined,
			() => pullHandle('camel', dirOf(branch), true, credentials, filters, migrations, false, db),
		);
	};

	const check = async (branch: string): Promise<CheckResult> => {
		try {
			await quietly(() => checkHandler(dirOf(branch), 'postgresql'));
			return { status: 'passed' };
		} catch (e) {
			if (!(e instanceof CheckCliError) || e.meta?.kind !== 'conflicts') throw e;
			const details = e.meta.details as { branches: { leafPath: string | null }[] }[];
			const folders = details.flatMap((it) => it.branches.flatMap((b) => (b.leafPath ? [basename(b.leafPath)] : [])));
			const fix = e.meta.fix as { migrations: string[]; customMigrations: string[] };
			return {
				status: 'conflicts',
				folders: [...new Set(folders)].sort(),
				message: e.humanMessage,
				fix: {
					migrations: fix.migrations.map((it) => basename(it)),
					customMigrations: fix.customMigrations.map((it) => basename(it)),
				},
			};
		}
	};

	// Returns the warnings that check gives when it compares `schema` with the migrations of the branch. The folder
	// must pass check first.
	const schemaWarnings = (branch: string, schema: PostgresSchema) =>
		quietly(() => checkSchema(readFolder(dirOf(branch)), SchemaSource.fromSchema(fromExports(schema))));

	const up = (branch: string) => quietly(async () => upPgHandler(dirOf(branch)));

	const merge = (target: string, ...sources: string[]) => {
		for (const source of sources) {
			for (const folder of folders(source)) {
				const dst = join(dirOf(target), folder);
				if (!existsSync(dst)) cpSync(join(dirOf(source), folder), dst, { recursive: true });
			}
		}
	};

	const seed = (branch: string, from: string) => cpSync(from, dirOf(branch), { recursive: true });

	// Deletes `path` as a hand edit does. `path` is a migration folder or one file inside the branch.
	const deleteFolder = (branch: string, path: string) => rmSync(join(dirOf(branch), path), { recursive: true });

	const overwriteFile = (branch: string, path: string, text: string) => writeFileSync(join(dirOf(branch), path), text);

	const renameFolder = (branch: string, from: string, to: string) =>
		renameSync(join(dirOf(branch), from), join(dirOf(branch), to));

	const overwriteSnapshot = (branch: string, folder: string, text: string) =>
		writeFileSync(join(dirOf(branch), folder, 'snapshot.json'), text);

	// Adds deltas to the end of a diff snapshot, as a hand edit of the file does.
	const appendDeltas = (branch: string, folder: string, ...added: Delta[]) => {
		const edited = { ...snapshot(branch, folder), deltas: [...deltas(branch, folder), ...added] };
		overwriteSnapshot(branch, folder, JSON.stringify(edited, null, 2));
	};

	// Returns the statements that push still needs after migrate. An empty list means the database matches
	// `schema`.
	const migrate = async (branch: string, schema: PostgresSchema) => {
		const client = new PGlite();
		try {
			await migrateFolder(drizzle({ client }), { migrationsFolder: dirOf(branch) });
			const db = { query: async (query: string, params?: any[]) => (await client.query<any>(query, params)).rows };
			// `entities` limits push to the roles of `schema`, because the database also has roles of its own.
			const roles = Object.values(schema).filter((it) => is(it, PgRole)).map((it) => it.name);
			const entities = roles.length > 0 ? { roles: { include: roles } } : undefined;
			const { sqlStatements } = await push({ db, to: schema, entities });
			return sqlStatements;
		} finally {
			await client.close();
		}
	};

	return {
		branch,
		folders,
		files,
		snapshot,
		sql,
		statements,
		statementsSql,
		leaves,
		history,
		state,
		combinedState,
		stateBeforeGenerate,
		deltas,
		tryGenerate,
		generate,
		pull,
		check,
		schemaWarnings,
		up,
		merge,
		seed,
		deleteFolder,
		overwriteFile,
		renameFolder,
		overwriteSnapshot,
		appendDeltas,
		migrate,
	};
};

export type FolderFlow = ReturnType<typeof createFolderFlow>;

type Format8File = { folder: string; id: string; prevIds: string[]; ddl?: unknown[]; renames?: string[] };

// Writes one format 8 snapshot for each file, and returns a flow whose branch main holds these folders.
export const createFormat8Flow = (files: Format8File[]) => {
	const dir = tempDir('dk-format-8-');
	for (const { folder, ddl = [], renames = [], ...header } of files) {
		writeSnapshot(dir, folder, { version: '8', dialect: 'postgres', ...header, ddl, renames });
	}
	const flow = createFolderFlow();
	flow.seed('main', dir);
	return flow;
};

// A step is one migration of a branch: the schema after it, with the options that generate needs for it.
export type Step = GenerateOptions & { schema: PostgresSchema };
// The input of `forkFlow`. `base` is the schema of the base snapshot, where the branches fork. `first` is the
// index of the branch whose leaf becomes the first parent of a merge, and it defaults to the last branch.
export type Fork = { base: PostgresSchema; branches: Step[][]; first?: number };

export const step = (schema: PostgresSchema, ...hints: Hint[]): Step => ({ schema, hints });

// Builds a rename hint for generate. `from` and `to` are the name parts of the entity joined by dots, for
// example `public.users.email`.
export const rename = (kind: RenameCreateHintKind, from: string, to: string) =>
	({ type: 'rename', kind, from: from.split('.'), to: to.split('.') }) as unknown as Hint;

// Generates `base` on main and the steps of each branch on a branch of its own, then merges the branches
// into main. The branches have the names a, b, c and so on. The branch `first` generates last, so its leaf
// has the newest folder name. `folders` holds the migration folders of each branch.
export const forkFlow = async ({ base, branches, first = branches.length - 1 }: Fork) => {
	const flow = createFolderFlow();
	await flow.generate('main', base);
	const names = branches.map((_, idx) => String.fromCharCode(97 + idx));
	for (const name of names) flow.branch(name, 'main');
	const folders: string[][] = branches.map(() => []);
	const order = [...branches.keys()].filter((idx) => idx !== first).concat(first);
	for (const idx of order) {
		for (const { schema, ...options } of branches[idx]) {
			folders[idx].push((await flow.generate(names[idx], schema, options)).folder);
		}
	}
	flow.merge('main', ...names);
	expect(flow.leaves('main').at(-1)).toBe(folders[first].at(-1));
	return { flow, folders };
};
