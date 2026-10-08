import { originUUID } from '../../utils';
import { type DDL, type Delta, findRow, isEqual, type Row, splitDeltaKey } from '../dialect';
import { fromEntities, type PostgresDDL } from './ddl';
import type { PostgresDiffSnapshot, PostgresSnapshot } from './snapshot';

type State = Pick<DDL, 'entities' | 'key' | '_'>;

// A delta gives one key to two different entities: a rename moves an entity onto a taken key, or a create
// names a taken key with other values. The message names the entity of the delta. Reconstruct sets
// `snapshotId` to the snapshot that holds the delta.
export class KeyCollisionError extends Error {
	snapshotId?: string;

	constructor(message: string) {
		super(`${message} Two migrations gave one name to two different entities.`);
	}
}

// `colliders` are the entities that share their key with another entity after the rename. `update` put the
// state back, so the state holds the renamed entity under its old key.
const renameCollision = (state: State, delta: { op: string; key: string; set: Row }, colliders: Row[]) => {
	const [entityType, from] = splitDeltaKey(delta.key);
	const to = state.key(entityType, { ...findRow(state, delta.key), ...delta.set });
	const moved = `The ${delta.op} delta moves ${entityType} ${from} to ${to}`;
	if (colliders.some((it) => it.entityType === entityType && state.key(entityType, it) === to)) {
		return new KeyCollisionError(`${moved}, and another row of ${entityType} already has the key ${to}.`);
	}
	const [{ entityType: moving }] = colliders;
	return new KeyCollisionError(
		`${moved}, and it also moves an entity of ${moving} onto the key ${state.key(moving, colliders[0])}, which `
			+ `another entity of ${moving} already has.`,
	);
};

// A rename follows the edges, and a drop follows none. A delta that does not fit the state has these rules:
// a drop, an alter or a rename of a missing entity is skipped. A create onto a taken key does nothing when
// the entity at that key is equal in all fields, and it throws when a field differs. A rename that moves an
// entity onto a taken key throws, and so does an alter whose fields change the key.
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
		} else if (delta.op === 'alter' || delta.op === 'rename') {
			const { status, data } = state.entities.update({ set: delta.set, where: delta.key });
			if (status === 'CONFLICT') throw renameCollision(state, delta, data);
		} else {
			throw new Error(
				`A delta has the operation "${(delta as { op: string }).op}". `
					+ 'A delta must be a create, a drop, an alter or a rename.',
			);
		}
	}
	return state;
};

// Every snapshot of a migrations folder by id, in folder-name order.
type Snapshots = ReadonlyMap<string, PostgresSnapshot>;

// The folder loader and reconstruct report a broken history with the same messages.
export const missingParentMessage = (snapshot: string, parentId: string) =>
	`Cannot reconstruct snapshot ${snapshot}: snapshot ${parentId} is missing from the migrations folder. `
	+ `Restore the missing migration folder from git, or delete ${snapshot} and every later migration, then run generate again.`;

export const missingBaseMessage = (snapshot: string) =>
	`Cannot reconstruct snapshot ${snapshot}: its history does not reach a base snapshot. `
	+ `Restore the first migration folder from git, or delete ${snapshot} and every later migration, then run generate again.`;

// `child` is the snapshot that lists `id` as a parent.
const lookup = (snapshots: Snapshots, id: string, child?: string): PostgresSnapshot => {
	const snapshot = snapshots.get(id);
	if (snapshot) return snapshot;
	throw new Error(
		child
			? missingParentMessage(child, id)
			: `Cannot reconstruct snapshot ${id}: it is not in the migrations folder. Check the snapshot id, or restore the migration folder from git.`,
	);
};

// The walk stops at ids in `known`.
const historyOf = (snapshots: Snapshots, ids: string[], child?: string, known = new Set<string>()): Set<string> => {
	const found = new Set<string>();
	const stack = ids.map((id) => [id, child] as const);
	while (stack.length) {
		const [id, childId] = stack.pop()!;
		if (id === originUUID || found.has(id) || known.has(id)) continue;
		found.add(id);
		for (const parentId of lookup(snapshots, id, childId).prevIds) stack.push([parentId, id]);
	}
	return found;
};

// A delta that throws gets the id of its snapshot, so that a command can name the migration folder.
const applySnapshot = (state: PostgresDDL, snapshot: PostgresDiffSnapshot) => {
	try {
		applyDeltas(state, snapshot.deltas);
	} catch (e) {
		if (e instanceof KeyCollisionError) e.snapshotId = snapshot.id;
		throw e;
	}
};

// Turns the state of the first parent into the combined state: it applies the deltas of the snapshots that
// reach a merge only through its other parents, in the order of `snapshots`. A rename changes the entities
// that the state holds at that moment, so a rename of one branch also reaches the entities that another
// branch added or renamed. The base snapshot is in the history of the first parent, so every snapshot here
// is a diff snapshot.
const applyOtherParents = (state: PostgresDDL, snapshots: Snapshots, prevIds: string[], child?: string) => {
	const [first, ...others] = prevIds;
	const rest = historyOf(snapshots, others, child, historyOf(snapshots, [first], child));
	for (const [id, snapshot] of snapshots) {
		if (rest.has(id) && snapshot.type === 'diff') applySnapshot(state, snapshot);
	}
};

// The state after the snapshot `id`. `snapshots` must iterate in folder-name order, because a merge applies
// the rest of its history in that order.
export const reconstruct = (snapshots: Snapshots, id: string): PostgresDDL => {
	// The diff snapshots on the path of first parents from `id` back to the base snapshot.
	const diffs: PostgresDiffSnapshot[] = [];
	let snapshot = lookup(snapshots, id);
	while (snapshot.type === 'diff') {
		diffs.push(snapshot);
		const parentId = snapshot.prevIds[0];
		// More diff snapshots than the folder holds means that the first parents form a cycle.
		if (!parentId || parentId === originUUID || diffs.length > snapshots.size) {
			throw new Error(missingBaseMessage(snapshot.id));
		}
		snapshot = lookup(snapshots, parentId, snapshot.id);
	}
	const state = fromEntities(snapshot.ddl);
	for (const it of diffs.reverse()) {
		if (it.prevIds.length > 1) applyOtherParents(state, snapshots, it.prevIds, it.id);
		applySnapshot(state, it);
	}
	return state;
};

// The state that the deltas of a snapshot with these parents start from. `snapshots` must iterate in
// folder-name order, as for reconstruct.
export const startingState = (snapshots: Snapshots, prevIds: string[]): PostgresDDL => {
	if ((prevIds[0] ?? originUUID) === originUUID) return fromEntities([]);
	const state = reconstruct(snapshots, prevIds[0]);
	if (prevIds.length > 1) applyOtherParents(state, snapshots, prevIds);
	return state;
};
