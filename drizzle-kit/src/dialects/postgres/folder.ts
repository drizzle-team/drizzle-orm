import { readFileSync } from 'fs';
import { basename, dirname } from 'path';
import { CheckCliError, type DrizzleCliErrorMeta } from '../../cli/errors';
import { originUUID } from '../../utils';
import { assertSnapshotStatus, prepareOutFolder, validatorForDialect } from '../../utils/utils-node';
import type { PostgresDDL } from './ddl';
import { KeyCollisionError, reconstruct, startingState } from './reconstruct';
import type { PostgresSnapshot } from './snapshot';

// A snapshot.json as it is read, before any check. `raw` is undefined when the file is not JSON. `path`
// names the snapshot in errors, and the programmatic API passes the folder name there.
type FolderEntry = { folder: string; path: string; raw: unknown };

type FolderFile = { folder: string; path: string; snapshot: PostgresSnapshot };

// A checked migrations folder, which the commands read their states and leaves from.
export type MigrationsFolder = {
	// In folder-name order. Errors and `withoutMigrations` read the folder name and the path of a snapshot here.
	files: FolderFile[];
	// The input of `reconstruct`, in folder-name order, because a merge applies its other branches in that order.
	snapshots: ReadonlyMap<string, PostgresSnapshot>;
	// In reverse folder-name order. generate uses this list as the parents of the next snapshot, and the first
	// parent of a merge must be the leaf with the newest folder name.
	leafIds: string[];
};

// Tells whether migration `folder` runs after `parent`. migrate sorts the folders with localeCompare, and
// drizzle-kit sorts them by code units, so `folder` must sort after `parent` in both orders.
export const sortsAfter = (folder: string, parent: string) => folder > parent && folder.localeCompare(parent) > 0;

type NamedFile = Pick<FolderEntry, 'folder' | 'path'>;

export const folderOrderError = (node: NamedFile, parent: NamedFile) =>
	new CheckCliError(
		'order',
		`Migration ${node.folder} sorts before its parent ${parent.folder}, so migrate can run it first. `
			+ `Rename the folders so that ${node.folder} sorts after ${parent.folder}.`,
		{ snapshot: node.path, parentSnapshot: parent.path },
	);

const missingParentMessage = (snapshot: string, parentId: string) =>
	`Cannot reconstruct snapshot ${snapshot}: snapshot ${parentId} is missing from the migrations folder. `
	+ `Restore the missing migration folder from git, or delete ${snapshot} and every later migration, then run generate again.`;

const missingBaseMessage = (snapshot: string) =>
	`Cannot reconstruct snapshot ${snapshot}: its history does not reach a base snapshot. `
	+ `Restore the first migration folder from git, or delete ${snapshot} and every later migration, then run generate again.`;

type Header = { id: string; prevIds: string[]; dialect: unknown; type: unknown };

// Tells whether a parsed file has the fields that the history rules read: an id, and for a postgres
// snapshot also the list of parents.
const hasHeader = (raw: any): raw is Header =>
	typeof raw?.id === 'string' && (raw.dialect !== 'postgres' || Array.isArray(raw.prevIds));

// Throws when the history of the folder is broken: a missing parent, no base snapshot or two of them, or a
// migration that sorts before its parent. It checks only the files with the dialect `postgres`, which formats
// 8 and 9 have. The status check reports a file of another dialect or of an older format.
export const assertHistory = (entries: FolderEntry[]) => {
	const nodes = entries.flatMap(({ raw, ...file }) =>
		hasHeader(raw) && raw.dialect === 'postgres'
			? [{ ...file, id: raw.id, prevIds: raw.prevIds, type: raw.type }]
			: []
	);
	if (nodes.length === 0) return;

	// A file that fails `hasHeader` would look like a missing parent below, so `unreadable` is reported first.
	const unreadable = entries.find((it) => !hasHeader(it.raw));
	if (unreadable) assertSnapshotStatus(unreadable.path, 'malformed');

	const byId = new Map(nodes.map((it) => [it.id, it]));
	const broken = (node: NamedFile, message: string, meta: DrizzleCliErrorMeta = {}) =>
		new CheckCliError('malformed', message, { snapshot: node.path, ...meta });

	if (nodes.every((it) => it.type === 'diff')) {
		throw broken(nodes[0], missingBaseMessage(nodes[0].folder));
	}
	// A format 8 snapshot has no `type`, so it never counts as a second `base`. Its folder gets the request to
	// run up from the status check.
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

// Turns the entries into snapshot files. It throws the status error for the first entry that is not a valid
// format 9 snapshot.
export const validFiles = (entries: FolderEntry[]): FolderFile[] => {
	const validate = validatorForDialect('postgresql');
	return entries.map(({ folder, path, raw }) => {
		assertSnapshotStatus(path, typeof raw === 'object' && raw !== null ? validate(raw).status : 'malformed');
		return { folder, path, snapshot: raw as PostgresSnapshot };
	});
};

// Builds a `MigrationsFolder` from checked files. `files` must be in folder-name order, because `snapshots`
// and `leafIds` take their order from it.
export const loadFolder = (files: FolderFile[]): MigrationsFolder => {
	const snapshots = new Map(files.map((it) => [it.snapshot.id, it.snapshot]));
	const parentIds = new Set([...snapshots.values()].flatMap((it) => it.prevIds));
	return { files, snapshots, leafIds: [...snapshots.keys()].filter((id) => !parentIds.has(id)).reverse() };
};

// Reads every snapshot.json of the migrations folder `out` in folder-name order, and checks nothing.
export const readEntries = (out: string): FolderEntry[] =>
	prepareOutFolder(out).snapshots.map((path) => {
		let raw: unknown;
		try {
			raw = JSON.parse(readFileSync(path, 'utf8'));
		} catch {}
		return { folder: basename(dirname(path)), path, raw };
	});

// Reads and checks the migrations folder `out`, and throws for the first problem. A file that is not JSON
// comes first, then the history rules, then the status of each file.
export const readFolder = (out: string): MigrationsFolder => {
	const entries = readEntries(out);
	assertHistory(entries);
	return loadFolder(validFiles(entries));
};

// The folder without the migrations that a conflict fix deletes. `deleted` holds the paths of migration folders.
export const withoutMigrations = (migrations: MigrationsFolder, deleted: string[]): MigrationsFolder =>
	loadFolder(migrations.files.filter((it) => !deleted.includes(dirname(it.path))));

// The folder names of the leaves in folder-name order, for messages that name the leaves.
export const leafFolders = (migrations: MigrationsFolder): string[] =>
	migrations.files.filter((it) => migrations.leafIds.includes(it.snapshot.id)).map((it) => it.folder);

const malformed = (file: FolderFile, problem: string) =>
	new CheckCliError(
		'malformed',
		`${problem} Restore the migration folder from git, or delete ${file.folder} and every later migration, `
			+ 'then run generate again.',
		{ snapshot: file.path },
	);

// Finds the file of snapshot `id`, so that an error can name its folder. When two files hold one id,
// `snapshots` keeps the snapshot of the last file, and `fileOf` gives that file.
const fileOf = (migrations: MigrationsFolder, id: string) =>
	migrations.files.find((it) => it.snapshot === migrations.snapshots.get(id));

export const stateOf = (migrations: MigrationsFolder, id: string): PostgresDDL => {
	try {
		return reconstruct(migrations.snapshots, id);
	} catch (e) {
		const file = fileOf(migrations, id);
		// No `file` means that the folder does not hold `id`. The error of `reconstruct` for this case already
		// says what to do.
		if (!file) throw e;
		throw malformed(file, `Cannot reconstruct the state of migration ${file.folder}: ${(e as Error).message}`);
	}
};

// The state that the next migration starts from: the state of the only leaf, or the combined state of
// several leaves.
export const combinedState = (migrations: MigrationsFolder): PostgresDDL => {
	// `stateOf` checks each leaf on its own. `startingState` applies the deltas of the other leaves to the state
	// of the first leaf, so it can succeed although one of the other leaves does not reconstruct.
	const leaves = migrations.leafIds.map((id) => stateOf(migrations, id));
	if (leaves.length === 1) return leaves[0];
	try {
		return startingState(migrations.snapshots, migrations.leafIds);
	} catch (e) {
		// Every leaf reconstructs on its own, so a `KeyCollisionError` here comes from a delta of another branch
		// that collides with the state of the first leaf.
		if (!(e instanceof KeyCollisionError) || !e.snapshotId) throw e;
		const file = fileOf(migrations, e.snapshotId)!;
		throw malformed(file, `Cannot reconstruct the combined state at migration ${file.folder}: ${e.message}`);
	}
};
