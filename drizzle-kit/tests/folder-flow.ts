import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { reconstruct } from 'src/dialects/postgres/reconstruct';
import {
	createCockroachFolderFlow,
	schemaState as cockroachSchemaState,
	type TestSchema,
} from './cockroach/folder-flow';
import { createFolderFlow, schemaState as postgresSchemaState } from './postgres/folder-flow';

// The description of one schema step of a folder flow. Both dialects build the same columns, so one test body
// covers the two folder implementations.
export type { TestSchema };

export type CheckResult =
	| { status: 'passed' }
	| { status: 'conflicts'; folders: string[]; fix: string[] };

export type GenerateResult = { folder: string; deleted: string[] };

export type Flow = {
	name: string;
	schemaState: (state: TestSchema) => unknown;
	generate: (
		branch: string,
		state: TestSchema,
		options?: { fixConflicts?: boolean; custom?: boolean; hints?: unknown[]; at?: Date },
	) => Promise<GenerateResult>;
	check: (branch: string) => Promise<CheckResult>;
	up: (branch: string) => Promise<unknown>;
	folders: (branch: string) => string[];
	files: (branch: string) => [string, string][];
	snapshot: (branch: string, folder: string) => any;
	leaves: (branch: string) => string[];
	state: (branch: string, folder: string) => unknown;
	branch: (name: string, from?: string) => void;
	merge: (target: string, ...sources: string[]) => void;
	deleteFolder: (branch: string, folder: string) => void;
	overwriteSnapshot: (branch: string, folder: string, text: string) => void;
	renameFolder: (branch: string, from: string, to: string) => void;
	downgradeToOldFormat: (branch: string) => void;
};

export type FolderDialect = { name: string; createFlow: () => Flow };

const pgSchema = (state: TestSchema) => {
	const columns = Object.fromEntries(
		state.columns.map((name) => [name, name === 'id' ? integer('id').primaryKey() : text(name)]),
	);
	return {
		users: pgTable('users', columns as any, (t: any) => [
			...(state.indexOn ? [index(`${state.indexOn}_ix`).on(t[state.indexOn])] : []),
			...(state.check ? [check('name_ck', sql`${t.name} <> ''`)] : []),
		]),
	};
};

// Rewrites every postgres snapshot as a format 8 snapshot, which stores the full state of its migration.
const downgradePostgres = (flow: ReturnType<typeof createFolderFlow>, branch: string) => {
	const history = flow.history(branch);
	for (const folder of flow.folders(branch)) {
		const snapshot = flow.snapshot(branch, folder);
		const state = reconstruct(history, snapshot.id);
		flow.overwriteSnapshot(
			branch,
			folder,
			JSON.stringify({
				version: '8',
				dialect: 'postgres',
				id: snapshot.id,
				prevIds: snapshot.prevIds,
				ddl: state.entities.list(),
				renames: [],
			}),
		);
	}
};

export const postgresDialect: FolderDialect = {
	name: 'postgres',
	createFlow: () => {
		const flow = createFolderFlow();
		return {
			name: 'postgres',
			schemaState: (state) => postgresSchemaState(pgSchema(state) as never),
			generate: (branch, state, options = {}) => flow.generate(branch, pgSchema(state) as never, options as never),
			check: async (branch) => {
				const result = await flow.check(branch);
				return result.status === 'passed'
					? { status: 'passed' }
					: { status: 'conflicts', folders: result.folders, fix: result.fix.migrations };
			},
			up: (branch) => flow.up(branch),
			folders: (branch) => flow.folders(branch),
			files: (branch) => flow.files(branch).map(([folder, text]) => [folder, text] as [string, string]),
			snapshot: (branch, folder) => flow.snapshot(branch, folder),
			leaves: (branch) => flow.leaves(branch),
			state: (branch, folder) => flow.state(branch, folder),
			branch: (name, from) => flow.branch(name, from),
			merge: (target, ...sources) => flow.merge(target, ...sources),
			deleteFolder: (branch, folder) => flow.deleteFolder(branch, folder),
			overwriteSnapshot: (branch, folder, text) => flow.overwriteSnapshot(branch, folder, text),
			renameFolder: (branch, from, to) => flow.renameFolder(branch, from, to),
			downgradeToOldFormat: (branch) => downgradePostgres(flow, branch),
		};
	},
};

export const cockroachDialect: FolderDialect = {
	name: 'cockroach',
	createFlow: () => {
		const flow = createCockroachFolderFlow();
		return {
			name: 'cockroach',
			schemaState: cockroachSchemaState,
			generate: (branch, state, options = {}) => flow.generate(branch, state, options as never),
			check: (branch) => flow.check(branch),
			up: (branch) => flow.up(branch),
			folders: (branch) => flow.folders(branch),
			files: (branch) => flow.files(branch).map(([folder, text]) => [folder, text] as [string, string]),
			snapshot: (branch, folder) => flow.snapshot(branch, folder),
			leaves: (branch) => flow.leaves(branch),
			state: (branch, folder) => flow.state(branch, folder),
			branch: (name, from) => flow.branch(name, from),
			merge: (target, ...sources) => flow.merge(target, ...sources),
			deleteFolder: (branch, folder) => flow.deleteFolder(branch, folder),
			overwriteSnapshot: (branch, folder, text) => flow.overwriteSnapshot(branch, folder, text),
			renameFolder: (branch, from, to) => flow.renameFolder(branch, from, to),
			downgradeToOldFormat: (branch) => flow.downgradeToFormat1(branch),
		};
	},
};

export const dialects: FolderDialect[] = [postgresDialect, cockroachDialect];

export const rename = {
	column: (from: string, to: string) => ({
		type: 'rename',
		kind: 'column',
		from: ['public', 'users', from],
		to: ['public', 'users', to],
	}),
};
