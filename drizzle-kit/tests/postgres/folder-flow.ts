import { PGlite } from '@electric-sql/pglite';
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
import { handle } from 'src/cli/commands/generate-postgres';
import { handle as pullHandle } from 'src/cli/commands/pull-postgres';
import { upPgHandler } from 'src/cli/commands/up-postgres';
import { preparePostgresDB } from 'src/cli/connections';
import { type CliContext, runWithCliContext } from 'src/cli/context';
import { CheckCliError } from 'src/cli/errors';
import { type Hint, HintsHandler } from 'src/cli/hints';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import type { Delta } from 'src/dialects/dialect';
import { fromJson } from 'src/dialects/postgres/convertor';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { fromDrizzleSchema, fromExports, SchemaSource } from 'src/dialects/postgres/drizzle';
import { prepareSnapshot } from 'src/dialects/postgres/serializer';
import { type PostgresSnapshot, reconstruct, startingState } from 'src/dialects/postgres/snapshot';
import { BREAKPOINT } from 'src/utils';
import { prepareOutFolder } from 'src/utils/utils-node';
import { onTestFinished, vi } from 'vitest';
import { type PostgresSchema, push } from './mocks';

// `fix` lists the folders that generate --fix-conflicts deletes.
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
	name?: string;
	at?: Date;
	fixConflicts?: boolean;
	custom?: boolean;
	explain?: boolean;
	output?: CliContext['output'];
};

// Runs the output quietly: json mode turns off the human log, and hints resolve renames without prompts.
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

// A branch is a folder that holds only that branch's migration folders, like a git checkout of it.
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

	// pull also writes schema.ts and relations.ts next to the migration folders.
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

	// The SQL that the SQL writers give for the stored statements, joined like a migration file.
	const statementsSql = (branch: string, folder: string) =>
		fromJson(statements(branch, folder)).sqlStatements.join(BREAKPOINT);

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

	// It leaves out the migrations that --fix-conflicts deletes, so with conflicts it is the state that
	// generate --fix-conflicts diffs the schema against.
	const stateBeforeGenerate = (branch: string, schema: PostgresSchema) =>
		quietly(async () => {
			const stored = prepareOutFolder(dirOf(branch));
			const { fix } = await checkSnapshots(stored.snapshots, 'postgresql');
			const deleted = new Set(fix?.migrations);
			const kept = stored.snapshots.filter((it) => !deleted.has(dirname(it)));
			return (await prepareSnapshot(kept, fromExports(schema))).ddlPrev;
		});

	const deltas = (branch: string, folder: string): Delta[] => {
		const it = snapshot(branch, folder);
		if (it.type !== 'diff') throw new Error(`${folder} is a ${it.type} snapshot. Pass the folder of a diff snapshot.`);
		return it.deltas;
	};

	// Generate and pull name each folder from the current time in seconds.
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

	// `deleted` lists the folders that `fixConflicts` deleted.
	const generate = async (branch: string, schema: PostgresSchema, options: GenerateOptions = {}) => {
		const result = await atTime(options.at?.getTime(), () =>
			handle({
				dialect: 'postgresql',
				filenames: [],
				schemaSource: SchemaSource.fromSchema(fromExports(schema)),
				out: dirOf(branch),
				breakpoints: true,
				name: options.name ?? branch,
				custom: options.custom ?? false,
				bundle: false,
				fixConflicts: options.fixConflicts,
				explain: options.explain ?? false,
				hints: new HintsHandler(options.hints),
			}), options.output);
		const folder = 'migration_path' in result ? basename(dirname(result.migration_path)) : undefined;
		const deleted = 'deleted_migrations' in result ? (result.deleted_migrations ?? []).map((it) => basename(it)) : [];
		return { ...result, folder, deleted };
	};

	const pull = async (branch: string, client: PGlite) => {
		const db = await preparePostgresDB({ driver: 'pglite', client });
		const filters = { schemas: undefined, tables: undefined, entities: undefined, extensions: undefined };
		const migrations = { table: '__drizzle_migrations', schema: 'drizzle' };
		const credentials = { driver: 'pglite', url: 'memory://' } as const;
		await atTime(undefined, () => pullHandle('camel', dirOf(branch), true, credentials, filters, migrations, db));
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

	// `path` is a migration folder, or one file inside the branch.
	const deleteFolder = (branch: string, path: string) => rmSync(join(dirOf(branch), path), { recursive: true });

	const overwriteFile = (branch: string, path: string, text: string) => writeFileSync(join(dirOf(branch), path), text);

	const renameFolder = (branch: string, from: string, to: string) =>
		renameSync(join(dirOf(branch), from), join(dirOf(branch), to));

	const overwriteSnapshot = (branch: string, folder: string, text: string) =>
		writeFileSync(join(dirOf(branch), folder, 'snapshot.json'), text);

	// Returns the statements that push still needs after migrate. An empty list means the database matches the schema.
	const migrate = async (branch: string, schema: PostgresSchema) => {
		const client = new PGlite();
		try {
			await migrateFolder(drizzle({ client }), { migrationsFolder: dirOf(branch) });
			const db = { query: async (query: string, params?: any[]) => (await client.query<any>(query, params)).rows };
			const { sqlStatements } = await push({ db, to: schema });
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
		generate,
		pull,
		check,
		up,
		merge,
		seed,
		deleteFolder,
		overwriteFile,
		renameFolder,
		overwriteSnapshot,
		migrate,
	};
};

export type FolderFlow = ReturnType<typeof createFolderFlow>;
