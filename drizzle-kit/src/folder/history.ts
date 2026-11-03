import { readFileSync } from 'fs';
import { basename, dirname } from 'path';
import { CheckCliError, type DrizzleCliErrorMeta } from '../cli/errors';
import type { DDL, Row } from '../dialects/dialect';
import { originUUID } from '../utils';
import type { Dialect } from '../utils/schemaValidator';
import { assertSnapshotStatus, prepareOutFolder, validatorForDialect } from '../utils/utils-node';
import { type FolderSnapshot, KeyCollisionError, reconstruct, startingState } from './reconstruct';

type State = Pick<DDL, 'entities' | 'key' | '_'>;

// A snapshot.json as it is read, before any check. `raw` is undefined when the file is not JSON. `path`
// names the snapshot in errors, and the programmatic API passes the folder name there.
export type FolderEntry = { folder: string; path: string; raw: unknown };

export type FolderFile<TSnapshot> = { folder: string; path: string; snapshot: TSnapshot };

// A checked migrations folder, which the commands read their states and leaves from.
export type MigrationsFolder<TSnapshot> = {
	// In folder-name order. Errors and `withoutMigrations` read the folder name and the path of a snapshot here.
	files: FolderFile<TSnapshot>[];
	// The input of `reconstruct`, in folder-name order, because a merge applies its other branches in that order.
	snapshots: ReadonlyMap<string, TSnapshot>;
	// In reverse folder-name order. generate uses this list as the parents of the next snapshot, and the first
	// parent of a merge must be the leaf with the newest folder name.
	leafIds: string[];
};

// What the history rules need to know about a dialect. `dialect` picks the snapshot validator, `snapshotDialect`
// is the `dialect` field of a snapshot, and `fromEntities` builds a state from the rows of a base snapshot.
export type FolderDialect<TState extends State> = {
	dialect: Dialect;
	snapshotDialect: string;
	fromEntities: (entities: Row[]) => TState;
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

// Tells whether a parsed file has the fields that the history rules read: an id, the dialect of the folder and
// the list of parents.
const hasHeader = (raw: any, { snapshotDialect }: FolderDialect<State>): raw is Header =>
	typeof raw?.id === 'string' && raw.dialect === snapshotDialect && Array.isArray(raw.prevIds);

// Throws when the history of the folder is broken: a missing parent, no base snapshot or two of them, or a
// migration that sorts before its parent. The status check reports a file of another dialect or of an older
// format.
export const assertHistory = (entries: FolderEntry[], description: FolderDialect<State>) => {
	const nodes = entries.flatMap(({ raw, ...file }) =>
		hasHeader(raw, description) ? [{ ...file, id: raw.id, prevIds: raw.prevIds, type: raw.type }] : []
	);
	if (nodes.length === 0) return;

	// A file that fails `hasHeader` would look like a missing parent below, so `unreadable` is reported first.
	const unreadable = entries.find((it) => !hasHeader(it.raw, description));
	if (unreadable) assertSnapshotStatus(unreadable.path, 'malformed');

	const byId = new Map(nodes.map((it) => [it.id, it]));
	const broken = (node: NamedFile, message: string, meta: DrizzleCliErrorMeta = {}) =>
		new CheckCliError('malformed', message, { snapshot: node.path, ...meta });

	if (nodes.every((it) => it.type === 'diff')) {
		throw broken(nodes[0], missingBaseMessage(nodes[0].folder));
	}
	// An old snapshot has no `type`, so it never counts as a second `base`. Its folder gets the request to
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
// snapshot of the dialect.
export const validFiles = <TSnapshot>(
	entries: FolderEntry[],
	{ dialect }: FolderDialect<State>,
): FolderFile<TSnapshot>[] => {
	const validate = validatorForDialect(dialect);
	return entries.map(({ folder, path, raw }) => {
		assertSnapshotStatus(path, typeof raw === 'object' && raw !== null ? validate(raw).status : 'malformed');
		return { folder, path, snapshot: raw as TSnapshot };
	});
};

// Builds a `MigrationsFolder` from checked files. `files` must be in folder-name order, because `snapshots`
// and `leafIds` take their order from it.
export const loadFolder = <TSnapshot extends { id: string; prevIds: string[] }>(
	files: FolderFile<TSnapshot>[],
): MigrationsFolder<TSnapshot> => {
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
export const readFolder = <TSnapshot extends FolderSnapshot>(
	out: string,
	description: FolderDialect<State>,
): MigrationsFolder<TSnapshot> => {
	const entries = readEntries(out);
	assertHistory(entries, description);
	return loadFolder(validFiles<TSnapshot>(entries, description));
};

// The folder without the migrations that a conflict fix deletes. `deleted` holds the paths of migration folders.
export const withoutMigrations = <TSnapshot extends { id: string; prevIds: string[] }>(
	migrations: MigrationsFolder<TSnapshot>,
	deleted: string[],
): MigrationsFolder<TSnapshot> => loadFolder(migrations.files.filter((it) => !deleted.includes(dirname(it.path))));

// The folder names of the leaves in folder-name order, for messages that name the leaves.
export const leafFolders = <TSnapshot extends { id: string }>(migrations: MigrationsFolder<TSnapshot>): string[] =>
	migrations.files.filter((it) => migrations.leafIds.includes(it.snapshot.id)).map((it) => it.folder);

const malformed = (file: FolderFile<unknown>, problem: string) =>
	new CheckCliError(
		'malformed',
		`${problem} Restore the migration folder from git, or delete ${file.folder} and every later migration, `
			+ 'then run generate again.',
		{ snapshot: file.path },
	);

// Finds the file of snapshot `id`, so that an error can name its folder. When two files hold one id,
// `snapshots` keeps the snapshot of the last file, and `fileOf` gives that file.
const fileOf = <TSnapshot>(migrations: MigrationsFolder<TSnapshot>, id: string) =>
	migrations.files.find((it) => it.snapshot === migrations.snapshots.get(id));

export const stateOf = <TSnapshot extends FolderSnapshot, TState extends State>(
	migrations: MigrationsFolder<TSnapshot>,
	id: string,
	{ fromEntities }: FolderDialect<TState>,
): TState => {
	try {
		return reconstruct(migrations.snapshots, id, fromEntities);
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
export const combinedState = <TSnapshot extends FolderSnapshot, TState extends State>(
	migrations: MigrationsFolder<TSnapshot>,
	description: FolderDialect<TState>,
): TState => {
	// `stateOf` checks each leaf on its own. `startingState` applies the deltas of the other leaves to the state
	// of the first leaf, so it can succeed although one of the other leaves does not reconstruct.
	const leaves = migrations.leafIds.map((id) => stateOf(migrations, id, description));
	if (leaves.length === 1) return leaves[0];
	try {
		return startingState(migrations.snapshots, migrations.leafIds, description.fromEntities);
	} catch (e) {
		// Every leaf reconstructs on its own, so a `KeyCollisionError` here comes from a delta of another branch
		// that collides with the state of the first leaf.
		if (!(e instanceof KeyCollisionError) || !e.snapshotId) throw e;
		const file = fileOf(migrations, e.snapshotId)!;
		throw malformed(file, `Cannot reconstruct the combined state at migration ${file.folder}: ${e.message}`);
	}
};
