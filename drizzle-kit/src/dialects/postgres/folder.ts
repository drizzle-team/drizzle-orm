import { readFileSync } from 'fs';
import { basename, dirname } from 'path';
import { CheckCliError, type DrizzleCliErrorMeta } from '../../cli/errors';
import { originUUID } from '../../utils';
import { assertSnapshotStatus, prepareOutFolder, validatorForDialect } from '../../utils/utils-node';
import type { PostgresDDL } from './ddl';
import { KeyCollisionError, missingBaseMessage, missingParentMessage, reconstruct, startingState } from './reconstruct';
import type { PostgresSnapshot } from './snapshot';

// One snapshot.json of a migrations folder. `raw` is its parsed JSON, and it is undefined when the file is
// not JSON. `path` names the snapshot in an error: it is the path of the file, or the folder name when the
// snapshots do not come from a disk.
type FolderEntry = { folder: string; path: string; raw: unknown };

type FolderFile = { folder: string; path: string; snapshot: PostgresSnapshot };

// The valid snapshots of a migrations folder.
export type MigrationsFolder = {
	// One file for each snapshot.json, in folder-name order.
	files: FolderFile[];
	// The snapshots by id, in folder-name order. reconstruct needs this order.
	snapshots: ReadonlyMap<string, PostgresSnapshot>;
	// The first id is the leaf with the newest folder name.
	leafIds: string[];
};

// migrate runs folders in localeCompare order, and drizzle-kit applies them in code unit order.
export const sortsAfter = (folder: string, parent: string) => folder > parent && folder.localeCompare(parent) > 0;

type NamedFile = Pick<FolderEntry, 'folder' | 'path'>;

export const folderOrderError = (node: NamedFile, parent: NamedFile) =>
	new CheckCliError(
		'order',
		`Migration ${node.folder} sorts before its parent ${parent.folder}, so migrate can run it first. `
			+ `Rename the folders so that ${node.folder} sorts after ${parent.folder}.`,
		{ snapshot: node.path, parentSnapshot: parent.path },
	);

type Header = { id: string; prevIds: string[]; dialect: unknown; type: unknown };

// The history rules need the id of every file, and the list of parents of every postgres snapshot.
const hasHeader = (raw: any): raw is Header =>
	typeof raw?.id === 'string' && (raw.dialect !== 'postgres' || Array.isArray(raw.prevIds));

// The rules cover the snapshots with the dialect `postgres`, which formats 8 and 9 have. A file of another
// dialect or of an older format is left to the status check.
export const assertHistory = (entries: FolderEntry[]) => {
	const nodes = entries.flatMap(({ raw, ...file }) =>
		hasHeader(raw) && raw.dialect === 'postgres'
			? [{ ...file, id: raw.id, prevIds: raw.prevIds, type: raw.type }]
			: []
	);
	if (nodes.length === 0) return;

	// A file with no header would look like a missing parent, so it is reported first.
	const unreadable = entries.find((it) => !hasHeader(it.raw));
	if (unreadable) assertSnapshotStatus(unreadable.path, 'malformed');

	const byId = new Map(nodes.map((it) => [it.id, it]));
	const broken = (node: NamedFile, message: string, meta: DrizzleCliErrorMeta = {}) =>
		new CheckCliError('malformed', message, { snapshot: node.path, ...meta });

	if (nodes.every((it) => it.type === 'diff')) {
		throw broken(nodes[0], missingBaseMessage(nodes[0].folder));
	}
	// A snapshot of an older format has no `type`, so its folder still gets the request to run up.
	const [base, secondBase] = nodes.filter((it) => it.type === 'base');
	if (secondBase) {
		throw broken(
			secondBase,
			`The migrations folder has two base snapshots, in ${base.folder} and ${secondBase.folder}. `
				+ 'A folder must have one base snapshot, which is its first migration. Delete one of the two migration '
				+ 'folders together with every migration that follows it, then run generate again.',
			{ baseSnapshot: base.path },
		);
	}
	for (const node of nodes) {
		if (node.type === 'diff' && (node.prevIds[0] ?? originUUID) === originUUID) {
			throw broken(node, missingBaseMessage(node.folder));
		}
		for (const parentId of node.prevIds) {
			if (parentId === originUUID) continue;
			const parent = byId.get(parentId);
			if (!parent) throw broken(node, missingParentMessage(node.folder, parentId), { parentId });
			if (!sortsAfter(node.folder, parent.folder)) throw folderOrderError(node, parent);
		}
	}
};

// Throws for the first file that is not a valid snapshot of the latest format.
export const validFiles = (entries: FolderEntry[]): FolderFile[] => {
	const validate = validatorForDialect('postgresql');
	return entries.map(({ folder, path, raw }) => {
		assertSnapshotStatus(path, typeof raw === 'object' && raw !== null ? validate(raw).status : 'malformed');
		return { folder, path, snapshot: raw as PostgresSnapshot };
	});
};

// `files` must be in folder-name order.
export const loadFolder = (files: FolderFile[]): MigrationsFolder => {
	const snapshots = new Map(files.map((it) => [it.snapshot.id, it.snapshot]));
	const parentIds = new Set([...snapshots.values()].flatMap((it) => it.prevIds));
	return { files, snapshots, leafIds: [...snapshots.keys()].filter((id) => !parentIds.has(id)).reverse() };
};

// Every snapshot.json of the migrations folder `out`, in folder-name order.
export const readEntries = (out: string): FolderEntry[] =>
	prepareOutFolder(out).snapshots.map((path) => {
		let raw: unknown;
		try {
			raw = JSON.parse(readFileSync(path, 'utf8'));
		} catch {}
		return { folder: basename(dirname(path)), path, raw };
	});

// The checks run in this order: a file that cannot be read, the history rules, the status of each file.
export const readFolder = (out: string): MigrationsFolder => {
	const entries = readEntries(out);
	assertHistory(entries);
	return loadFolder(validFiles(entries));
};

// `deleted` holds the paths of migration folders.
export const withoutMigrations = (migrations: MigrationsFolder, deleted: string[]): MigrationsFolder =>
	loadFolder(migrations.files.filter((it) => !deleted.includes(dirname(it.path))));

// The folder names of the leaves, in folder-name order.
export const leafFolders = (migrations: MigrationsFolder): string[] =>
	migrations.files.filter((it) => migrations.leafIds.includes(it.snapshot.id)).map((it) => it.folder);

const malformed = (file: FolderFile, problem: string) =>
	new CheckCliError(
		'malformed',
		`${problem} Restore the migration folder from git, or delete ${file.folder} and every later migration, `
			+ 'then run generate again.',
		{ snapshot: file.path },
	);

// When two files hold one id, `snapshots` holds the snapshot of the last one, and this is its file.
const fileOf = (migrations: MigrationsFolder, id: string) =>
	migrations.files.find((it) => it.snapshot === migrations.snapshots.get(id));

export const stateOf = (migrations: MigrationsFolder, id: string): PostgresDDL => {
	try {
		return reconstruct(migrations.snapshots, id);
	} catch (e) {
		const file = fileOf(migrations, id);
		// The error of reconstruct for an id that the folder does not hold already says what to do.
		if (!file) throw e;
		throw malformed(file, `Cannot reconstruct the state of migration ${file.folder}: ${(e as Error).message}`);
	}
};

// The state that the next migration starts from: the state of the only leaf, or the combined state of
// several leaves.
export const combinedState = (migrations: MigrationsFolder): PostgresDDL => {
	// Every leaf is reconstructed as a separate state. The combined state applies the deltas of the other
	// leaves to the state of the first parent, so it alone can hide a leaf that does not reconstruct.
	const leaves = migrations.leafIds.map((id) => stateOf(migrations, id));
	if (leaves.length === 1) return leaves[0];
	try {
		return startingState(migrations.snapshots, migrations.leafIds);
	} catch (e) {
		// Every leaf reconstructs, so the delta that throws is one that another parent brings into the merge.
		if (!(e instanceof KeyCollisionError) || !e.snapshotId) throw e;
		const file = fileOf(migrations, e.snapshotId)!;
		throw malformed(file, `Cannot reconstruct the combined state at migration ${file.folder}: ${e.message}`);
	}
};
