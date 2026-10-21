import { originUUID } from '../../utils';
import { type DDL, type Delta, findRow, isEqual, parseEntityKey, type Row } from '../dialect';
import { fromEntities, type PostgresDDL } from './ddl';
import type { PostgresDiffSnapshot, PostgresSnapshot } from './snapshot';

type State = Pick<DDL, 'entities' | 'key' | '_'>;

// Thrown by `applyDeltas` when a delta gives one key to two different entities. `applySnapshot` sets
// `snapshotId`, so that a command can name the migration folder of the delta.
export class KeyCollisionError extends Error {
	snapshotId?: string;

	constructor(message: string) {
		super(`${message} Two migrations gave one name to two different entities.`);
	}
}

// Builds the error for an alter or a rename that `update` refused with `CONFLICT`. `update` restored the
// state, so the state still holds the renamed entity under its old key.
const renameCollision = (state: State, delta: { op: string; key: string; set: Row }) => {
	const [entityType, from] = parseEntityKey(delta.key);
	const to = state.key(entityType, { ...findRow(state, delta.key), ...delta.set });
	return new KeyCollisionError(
		`The ${delta.op} delta moves ${entityType} ${from} to ${to}, and another row of ${entityType} already has the key ${to}.`,
	);
};

// Applies `deltas` to `state` in place. A rename also moves the dependent entities through the edges, and a
// drop removes only its own entity. A drop, an alter or a rename of a missing entity does nothing, and so does
// a create of an equal entity. A merge needs these rules, and they hold outside a merge too. A create with
// other values, or an alter or a rename onto a taken key, throws a `KeyCollisionError`.
export const applyDeltas = <T extends State>(state: T, deltas: Delta[]): T => {
	for (const delta of deltas) {
		if (delta.op === 'create') {
			const { status, data: stored } = state.entities.push(delta.row);
			if (status === 'OK') continue;
			// `stored` holds every field of its entity type, so a field that the delta omits counts as null.
			if (Object.keys(stored).every((field) => isEqual(stored[field], delta.row[field] ?? null))) continue;
			const entityType = stored.entityType;
			throw new KeyCollisionError(
				`The create delta adds ${entityType} ${state.key(entityType, stored)}, and another entity of ${entityType} `
					+ 'with other values already has this key.',
			);
		} else if (delta.op === 'drop') {
			state.entities.delete(delta.key);
		} else {
			const { status } = state.entities.update({ set: delta.set, where: delta.key });
			if (status === 'CONFLICT') throw renameCollision(state, delta);
		}
	}
	return state;
};

// Every snapshot of a migrations folder by id. The map must iterate in folder-name order.
type Snapshots = ReadonlyMap<string, PostgresSnapshot>;

const lookup = (snapshots: Snapshots, id: string): PostgresSnapshot => {
	const snapshot = snapshots.get(id);
	if (snapshot) return snapshot;
	throw new Error(
		`Cannot reconstruct snapshot ${id}: it is not in the migrations folder. Check the snapshot id, or restore the migration folder from git.`,
	);
};

// Collects `ids` and all their ancestors. The walk stops at the ids in `known`.
const historyOf = (snapshots: Snapshots, ids: string[], known = new Set<string>()): Set<string> => {
	const found = new Set<string>();
	const stack = [...ids];
	while (stack.length) {
		const id = stack.pop()!;
		if (id === originUUID || found.has(id) || known.has(id)) continue;
		found.add(id);
		stack.push(...lookup(snapshots, id).prevIds);
	}
	return found;
};

// Applies the deltas of `snapshot`. A `KeyCollisionError` gets the snapshot id, so that a command can name the
// migration folder.
const applySnapshot = (state: PostgresDDL, snapshot: PostgresDiffSnapshot) => {
	try {
		applyDeltas(state, snapshot.deltas);
	} catch (e) {
		if (e instanceof KeyCollisionError) e.snapshotId = snapshot.id;
		throw e;
	}
};

// Turns the state of the first parent into the combined state of a merge. It applies the deltas of each
// snapshot that only the other parents reach, in the order of `snapshots`. Every such snapshot is a diff
// snapshot, because the base snapshot is in the history of the first parent.
const applyOtherParents = (state: PostgresDDL, snapshots: Snapshots, prevIds: string[]) => {
	const [first, ...others] = prevIds;
	const rest = historyOf(snapshots, others, historyOf(snapshots, [first]));
	for (const [id, snapshot] of snapshots) {
		if (rest.has(id) && snapshot.type === 'diff') applySnapshot(state, snapshot);
	}
};

// Gives the state after snapshot `id`. `snapshots` must iterate in folder-name order, because a merge applies
// the snapshots of its other branches in that order.
export const reconstruct = (snapshots: Snapshots, id: string): PostgresDDL => {
	// `diffs` collects the diff snapshots on the path of first parents from `id` back to the base snapshot.
	const diffs: PostgresDiffSnapshot[] = [];
	let snapshot = lookup(snapshots, id);
	while (snapshot.type === 'diff') {
		diffs.push(snapshot);
		snapshot = lookup(snapshots, snapshot.prevIds[0]);
	}
	const state = fromEntities(snapshot.ddl);
	for (const it of diffs.reverse()) {
		if (it.prevIds.length > 1) applyOtherParents(state, snapshots, it.prevIds);
		applySnapshot(state, it);
	}
	return state;
};

// Gives the state that a new snapshot with the parents `prevIds` starts from. For several parents it is the
// combined state of the merge. `snapshots` must iterate in folder-name order, as for `reconstruct`.
export const startingState = (snapshots: Snapshots, prevIds: string[]): PostgresDDL => {
	if ((prevIds[0] ?? originUUID) === originUUID) return fromEntities([]);
	const state = reconstruct(snapshots, prevIds[0]);
	if (prevIds.length > 1) applyOtherParents(state, snapshots, prevIds);
	return state;
};
