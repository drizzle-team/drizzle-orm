// The replay of postgres snapshot format 9: how keyed deltas and instructions change a state, how a state is
// rebuilt from a history of snapshots, and how a merge combines its branches.
//
// This code is part of the format. A change to it can give another state for a folder that already exists,
// with no error. So this module imports no other module. It gets the rows and the key functions as data,
// and it never reads the reference rules. A wanted change to the replay is a new snapshot format with a new
// module next to this one, and `up` rebuilds the folders of format 9 with this module.

type Row = Record<string, any>;

// A keyed delta names one row by its key, which is the entity type, `\0` and the identity of the row. A
// `rename` changes the key of its row, because the user decided it.
export type KeyedDelta =
	| { op: 'create'; row: Row }
	| { op: 'drop'; key: string }
	| { op: 'alter'; key: string; set: Row }
	| { op: 'rename'; key: string; set: Row };

// An instruction follows a rename. It selects the rows of one entity type by the values of their fields,
// never by key, and writes the new name into them. So it also reaches a row that another branch added or
// renamed. `update` sets fields. `replace_in_list` replaces a string in a list of strings.
// `update_list_items` sets fields of the objects in a list that have the values of `match`.
export type Instruction =
	| { op: 'update'; type: string; where: Row; set: Row }
	| { op: 'replace_in_list'; type: string; where: Row; field: string; from: string; to: string }
	| { op: 'update_list_items'; type: string; where: Row; field: string; match: Row; set: Row };

export type Delta = KeyedDelta | Instruction;

// The rows by entity type and identity, and the function that gives the identity of a row of each entity type.
export type ReplayState = {
	store: Map<string, Map<string, Row>>;
	identity: Record<string, (row: Row) => string>;
};

// Returns [entityType, identity].
export const splitDeltaKey = (key: string): [string, string] => {
	const idx = key.indexOf('\0'); // the identity is JSON and never contains \0
	return [key.slice(0, idx), key.slice(idx + 1)];
};

const rowAt = (state: ReplayState, key: string): Row | undefined => {
	const [entityType, identity] = splitDeltaKey(key);
	return state.store.get(entityType)?.get(identity);
};

// A rename or an instruction moves a row onto a key that another row holds.
export class KeyCollisionError extends Error {
	constructor(op: string, entityType: string, from: string, to: string, readonly taken: Row) {
		super(
			`The ${op} delta moves ${entityType} ${from} to ${to}, and another row of ${entityType} already has the key ${to}. `
				+ 'Two migrations gave one name to two different entities.',
		);
	}
}

const hasFields = (row: Row, where: Row): boolean => {
	for (const field in where) if (row[field] !== where[field]) return false;
	return true;
};

// Runs the deltas in order against the rows that the state has at that moment. An instruction names its
// entity type, the field values to match and the fields to change. An instruction that matches no row
// changes nothing. An instruction scans every row of its entity type.
export const applyDeltas = (state: ReplayState, deltas: Delta[]) => {
	const { store, identity: identityOf } = state;
	const target = (d: { op: string; key: string }): [Map<string, Row>, string, Row] => {
		const [entityType, identity] = splitDeltaKey(d.key);
		const bucket = store.get(entityType);
		const row = bucket?.get(identity);
		if (!bucket || !row) {
			throw new Error(
				`The ${d.op} delta targets a missing entity: ${
					d.key.replace('\0', ' ')
				}. The deltas do not match the state they are applied to. Check that no snapshot is missing from the history.`,
			);
		}
		return [bucket, identity, row];
	};
	// `moved` holds rows that are already removed from the bucket, with their old identity.
	const insertMoved = (op: string, entityType: string, bucket: Map<string, Row>, moved: [string, Row][]) => {
		for (const [oldIdentity, row] of moved) {
			const identity = identityOf[entityType](row);
			const taken = bucket.get(identity);
			if (taken) throw new KeyCollisionError(op, entityType, oldIdentity, identity, taken);
			bucket.set(identity, row);
		}
	};
	for (const d of deltas) {
		if (d.op === 'create') {
			// The state gets a copy, so a later alter of the row does not change the delta.
			const row = { ...d.row };
			store.get(row.entityType)!.set(identityOf[row.entityType](row), row);
		} else if (d.op === 'drop') {
			const [bucket, identity] = target(d);
			bucket.delete(identity);
		} else if (d.op === 'alter') {
			Object.assign(target(d)[2], d.set);
		} else if (d.op === 'rename') {
			const [bucket, oldIdentity, row] = target(d);
			bucket.delete(oldIdentity);
			Object.assign(row, d.set);
			insertMoved(d.op, row.entityType, bucket, [[oldIdentity, row]]);
		} else if (d.op === 'update') {
			const bucket = store.get(d.type)!;
			const moved: [string, Row][] = [];
			for (const [identity, row] of bucket) {
				if (!hasFields(row, d.where)) continue;
				Object.assign(row, d.set);
				if (identityOf[d.type](row) !== identity) moved.push([identity, row]);
			}
			for (const [identity] of moved) bucket.delete(identity);
			insertMoved(d.op, d.type, bucket, moved);
		} else {
			const change = d.op === 'replace_in_list'
				? (it: unknown) => (it === d.from ? d.to : it)
				: (it: Row) => (hasFields(it, d.match) ? { ...it, ...d.set } : it);
			for (const row of store.get(d.type)!.values()) {
				if (hasFields(row, d.where)) row[d.field] = (row[d.field] as any[]).map(change);
			}
		}
	}
};

// What the replay reads of a snapshot.
type Snapshot =
	& { id: string; prevIds: string[] }
	& ({ type: 'base'; ddl: any[] } | { type: 'diff'; deltas: Delta[] });

type History<T extends Snapshot> = ReadonlyMap<string, T>;

// What the caller gives for a rebuild. The caller owns the entity definitions and the state hash.
export type Rebuild<S extends { _: ReplayState }, T extends Snapshot> = {
	// Makes a state from the rows of a base snapshot.
	start: (rows: any[]) => S;
	// Throws when `state` is not the state that `snapshot` recorded.
	verify: (state: S, snapshot: T) => void;
};

// The first snapshot of a folder lists this id as its only parent.
const originId = '00000000-0000-0000-0000-000000000000';

// The folder loader and the rebuild report a broken history with the same messages.
export const missingParentMessage = (snapshot: string, parentId: string) =>
	`Cannot rebuild snapshot ${snapshot}: snapshot ${parentId} is missing from the migrations folder. `
	+ `Restore the missing migration folder from git, or delete ${snapshot} and every later migration, then run generate again.`;

export const missingBaseMessage = (snapshot: string) =>
	`Cannot rebuild snapshot ${snapshot}: its history does not reach a base snapshot. `
	+ `Restore the first migration folder from git, or delete ${snapshot} and every later migration, then run generate again.`;

// `child` is the snapshot that lists `id` as a parent.
const lookup = <T extends Snapshot>(snapshots: History<T>, id: string, child?: string): T => {
	const snapshot = snapshots.get(id);
	if (snapshot) return snapshot;
	throw new Error(
		child
			? missingParentMessage(child, id)
			: `Cannot rebuild snapshot ${id}: it is not in the migrations folder. Check the snapshot id, or restore the migration folder from git.`,
	);
};

// The walk stops at ids in `known`.
const historyOf = (
	snapshots: History<Snapshot>,
	ids: string[],
	child?: string,
	known = new Set<string>(),
): Set<string> => {
	const found = new Set<string>();
	const stack = ids.map((id) => [id, child] as const);
	while (stack.length) {
		const [id, childId] = stack.pop()!;
		if (id === originId || found.has(id) || known.has(id)) continue;
		found.add(id);
		for (const parentId of lookup(snapshots, id, childId).prevIds) stack.push([parentId, id]);
	}
	return found;
};

// Adds to the first parent's state the snapshots that reach a merge only through its other parents.
// This replay skips a drop, alter or rename of a missing row, and applyDeltas alone would throw for it. An
// instruction always runs, and it changes the rows that match at that moment, so a rename of one branch also
// reaches the rows that another branch added or renamed. A create onto a taken key overwrites the row
// there. A rename or an instruction that moves a row onto a taken key throws, as in every applyDeltas
// call. A base adds its rows as creates, because two branches that each started from an empty folder share
// no ancestor.
const replayBranches = (state: ReplayState, snapshots: History<Snapshot>, prevIds: string[], child?: string) => {
	const [first, ...others] = prevIds;
	const replayed = historyOf(snapshots, others, child, historyOf(snapshots, [first], child));
	for (const [id, snapshot] of snapshots) {
		if (!replayed.has(id)) continue;
		const deltas: Delta[] = snapshot.type === 'diff'
			? snapshot.deltas
			: snapshot.ddl.map((row) => ({ op: 'create', row }));
		for (const it of deltas) {
			if (!('key' in it) || rowAt(state, it.key)) applyDeltas(state, [it]);
		}
	}
};

// The state after the snapshot `id`. `snapshots` must iterate in folder-name order, because a merge replays
// the other branches in that order.
export const rebuild = <S extends { _: ReplayState }, T extends Snapshot>(
	snapshots: History<T>,
	id: string,
	{ start, verify }: Rebuild<S, T>,
): S => {
	const chain: (Snapshot & { type: 'diff' })[] = [];
	let snapshot: Snapshot = lookup(snapshots, id);
	while (snapshot.type === 'diff') {
		chain.push(snapshot);
		const parentId = snapshot.prevIds[0];
		// A chain longer than the history means the first parents form a cycle.
		if (!parentId || parentId === originId || chain.length > snapshots.size) {
			throw new Error(missingBaseMessage(snapshot.id));
		}
		snapshot = lookup(snapshots, parentId, snapshot.id);
	}
	const state = start(snapshot.ddl);
	const verifyAfter = (it: Snapshot) => verify(state, lookup(snapshots, it.id));
	for (let idx = chain.length - 1; idx >= 0; idx--) {
		const it = chain[idx];
		if (it.prevIds.length > 1) {
			// The merge replay skips deltas that do not fit, so a wrong state of the first parent would stay hidden.
			verifyAfter(chain[idx + 1] ?? snapshot);
			replayBranches(state._, snapshots, it.prevIds, it.id);
		}
		applyDeltas(state._, it.deltas);
	}
	verifyAfter(chain[0] ?? snapshot);
	return state;
};

// The state that the deltas of a snapshot with these parents start from. `snapshots` must iterate in
// folder-name order, as for rebuild.
export const combineParents = <S extends { _: ReplayState }, T extends Snapshot>(
	snapshots: History<T>,
	prevIds: string[],
	how: Rebuild<S, T>,
): S => {
	if ((prevIds[0] ?? originId) === originId) return how.start([]);
	const state = rebuild(snapshots, prevIds[0], how);
	if (prevIds.length > 1) replayBranches(state._, snapshots, prevIds);
	return state;
};
