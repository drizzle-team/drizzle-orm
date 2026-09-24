import { apply, type Delta } from '../dialect';
import { fromEntities, type PostgresDDL, type PostgresEntity } from './ddl';
import type { JsonStatement } from './statements';

/**
 * v9 base+diff snapshot format for postgres.
 *
 * A file is EITHER a state file (`base`/`checkpoint`: carries the whole `ddl`, nothing else)
 * or a diff file. `base` is the root; `checkpoint` is a mid-history full-state anchor; a
 * reader treats both identically ("stop, read ddl").
 *
 * A diff carries two representations of one migration:
 *  - `deltas`  — structural (create/drop/alter over the keyed set) → reconstructs STATE with
 *                `apply`, needs no interpreter and has no rename ambiguity.
 *  - `statements` — the resolved semantic `JsonStatement[]` → what commutativity's per-statement
 *                `footprint` analyses, and where rename intent lives (`rename_table`, …).
 *
 * There is no `basedOn`: a diff's anchor is derivable — the single parent for a linear node,
 * the fork point for a merge — both returned by {@link forkPoint} over `prevIds`. And no
 * `renames`: the resolved rename intent is already in `statements`, so a separate list would
 * be redundant. No integrity fingerprint either — reconstruction is correct by construction
 * (delta/apply are round-trip tested; `apply` throws on a torn delta), and the v8→v9 conversion
 * checks each node against its original v8 ddl (scripts/snapshots-to-diffs.ts).
 */
export type PostgresStateSnapshot = {
	type: 'base' | 'checkpoint';
	version: '9';
	dialect: 'postgres';
	id: string;
	prevIds: string[];
	ddl: PostgresEntity[];
};

export type PostgresDiffSnapshot = {
	type: 'diff';
	version: '9';
	dialect: 'postgres';
	id: string;
	prevIds: string[];
	deltas: Delta[];
	statements: JsonStatement[];
};

export type PostgresSnapshotFile = PostgresStateSnapshot | PostgresDiffSnapshot;

const ORIGIN = '00000000-0000-0000-0000-000000000000';
type Anc = { prevIds: string[] };

// Ancestors of `startId`, inclusive of itself (a parent that is already an ancestor of every
// other parent IS the fork point and must stay a candidate). Ignores the ORIGIN sentinel and
// ids outside the given map.
const ancestorsOf = (byId: Map<string, Anc>, startId: string, cache: Map<string, Set<string>>): Set<string> => {
	const hit = cache.get(startId);
	if (hit) return hit;
	const seen = new Set<string>();
	const stack = [startId];
	while (stack.length) {
		const id = stack.pop()!;
		if (seen.has(id)) continue;
		const node = byId.get(id);
		if (!node) continue;
		seen.add(id);
		for (const prev of node.prevIds) stack.push(prev);
	}
	cache.set(startId, seen);
	return seen;
};

/**
 * The anchor of a diff, from its parents: the deepest node that is an ancestor of all of them.
 * Returns the single parent for a linear node, the fork point (LCA) for a merge — one call
 * covers both. Null when the parents share no real ancestor.
 */
export const forkPoint = (byId: Map<string, Anc>, parentIds: string[]): string | null => {
	const cache = new Map<string, Set<string>>();
	let common: Set<string> | null = null;
	for (const id of parentIds) {
		const ancestors = ancestorsOf(byId, id, cache);
		if (common === null) {
			common = new Set(ancestors);
			continue;
		}
		for (const c of common) if (!ancestors.has(c)) common.delete(c);
	}
	if (!common || common.size === 0) return null;

	let best: string | null = null;
	let bestSize = -1;
	for (const candidate of common) {
		if (candidate === ORIGIN) continue;
		const reach = ancestorsOf(byId, candidate, cache);
		if (![...common].every((id) => reach.has(id))) continue;
		if (reach.size > bestSize) {
			best = candidate;
			bestSize = reach.size;
		}
	}
	return best;
};

/**
 * Reconstruct a node's full ddl from a set of v9 files, deriving each diff's anchor from its
 * `prevIds` (via {@link forkPoint}) and replaying `deltas` with `apply`. Memoized on the DDL —
 * safe because `apply` deep-clones its base and returns a NEW DDL, so one memoized ancestor
 * feeds many children without corruption. `apply` throws on a drop/alter of a missing key, so
 * a torn delta fails loudly here.
 */
export function reconstruct(
	filesById: Map<string, PostgresSnapshotFile>,
	id: string,
	memo: Map<string, PostgresDDL> = new Map(),
): PostgresDDL {
	const hit = memo.get(id);
	if (hit) return hit;
	const file = filesById.get(id);
	if (!file) throw new Error(`v9 reader: no snapshot for id ${id}`);

	let ddl: PostgresDDL;
	if (file.type === 'diff') {
		const parents = file.prevIds.filter((p) => p !== ORIGIN && filesById.has(p));
		const anchor = forkPoint(filesById, parents);
		if (!anchor) {
			throw new Error(`v9 reader: ${id} has no reconstructable anchor (parents: ${parents.join(', ') || 'none'})`);
		}
		ddl = apply(reconstruct(filesById, anchor, memo), file.deltas);
	} else {
		ddl = fromEntities(file.ddl);
	}

	memo.set(id, ddl);
	return ddl;
}
