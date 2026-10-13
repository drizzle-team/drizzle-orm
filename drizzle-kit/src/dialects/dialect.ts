export type Row = Record<string, any>;

// A delta is one change to a state. It names one entity by its key, which is the entity type, `\0` and the
// identity of the entity. A `rename` changes the key of its entity, because the user decided it.
export type Delta =
	| { op: 'create'; row: Row }
	| { op: 'drop'; key: string }
	| { op: 'alter'; key: string; set: Row }
	| { op: 'rename'; key: string; set: Row };

export const splitDeltaKey = (key: string): [entityType: string, identity: string] => {
	const idx = key.indexOf('\0'); // the identity is JSON and never contains \0
	if (idx < 0) {
		throw new Error(
			`The key ${key} has no entity type. Pass the key as a delta holds it: the entity type, "\\0" and the identity.`,
		);
	}
	return [key.slice(0, idx), key.slice(idx + 1)];
};

export type Field =
	| 'string'
	| 'number'
	| 'boolean'
	| 'string[]'
	| 'string?'
	| 'number?'
	| 'boolean?'
	| readonly (string | null)[] // enum
	| { [k: string]: Field } // nested object
	| readonly [{ [k: string]: Field }]; // array of objects
export type Def = Record<string, Field>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type FieldType<F> = F extends 'string' ? string
	: F extends 'number' ? number
	: F extends 'boolean' ? boolean
	: F extends 'string[]' ? string[]
	: F extends 'string?' ? string | null
	: F extends 'number?' ? number | null
	: F extends 'boolean?' ? boolean | null
	: F extends readonly [infer E] ? (E extends Record<string, Field> ? InferRow<E>[] : F[number])
	: F extends readonly (string | null)[] ? F[number]
	: F extends Record<string, Field> ? InferRow<F> | null
	: never;

type InferRow<D> = Simplify<{ -readonly [K in keyof D]: FieldType<D[K]> }>;

export type InferEntities<D> = { [K in keyof D]: Simplify<InferRow<D[K]> & { entityType: K }> };

export type Alter<T extends Row> = Simplify<
	& { $diffType: 'alter' }
	& { [K in keyof T as K extends 'schema' | 'table' | 'name' | 'entityType' ? K : never]: T[K] }
	& { [K in keyof T as K extends 'schema' | 'table' | 'name' | 'entityType' ? never : K]?: { from: T[K]; to: T[K] } }
	& { $left: T; $right: T }
>;
export type Create<T extends Row> = Simplify<{ $diffType: 'create' } & T>;
export type Drop<T extends Row> = Simplify<{ $diffType: 'drop' } & T>;

type CreatesOf<M extends Record<string, Row>, K extends keyof M> = { [P in K]: Create<M[P]> }[K];
type DropsOf<M extends Record<string, Row>, K extends keyof M> = { [P in K]: Drop<M[P]> }[K];
type AltersOf<M extends Record<string, Row>, K extends keyof M> = { [P in K]: Alter<M[P]> }[K];

export type IdFn = (row: Row) => string;
export type FieldSrc = string | { list: string; pick?: string; skipWhen?: string };

export type EdgeSpec<T extends string = string> = {
	to: T;
	map: Record<string, FieldSrc>;
	cascade?: boolean;
	when?: (r: Row) => boolean;
};

type FieldName<F> = Extract<keyof F, string>;
type Src<S> = FieldName<S> | { list: FieldName<S>; pick?: string; skipWhen?: string };
export type EdgeOf<D, S extends keyof D> = {
	[T in keyof D]: {
		to: T;
		map: { [P in FieldName<D[T]>]?: Src<D[S]> };
		cascade?: boolean;
		when?: (r: Row) => boolean;
	};
}[keyof D];

export type Edge = {
	to: string;
	cascade: boolean;
	resolve: (r: Row) => string[];
	relocate: (r: Row, from: Row, to: Row) => Row | null;
};

export type Store = Map<string, Map<string, Row>>; // entityType → (identityKey → row)

type Dep = { row: Row; edge: Edge; type: string };

type Internals = {
	store: Store;
	defs: Record<string, Def>;
	identity: Record<string, IdFn>;
	edges: Record<string, Edge[]>;
	nulls: Record<string, Row>;
};

type Where<T> = { [K in keyof T]?: T[K] | { CONTAINS: any } } & Record<string, any>;
type SetOps<T> = { [K in keyof T]?: T[K] | ((item: any) => any) } & Record<string, any>;

type Processors<T extends Row = Row> = {
	push: (
		input: Partial<T> & Record<string, any>,
		uniques?: (keyof T & string)[],
	) => { status: 'OK' | 'CONFLICT'; data: T };
	pushAll: (items: Iterable<Row>) => { status: 'OK'; count: number } | { status: 'CONFLICT'; key: string };
	list: (where?: Where<T>) => T[];
	one: (where?: Where<T>) => T | null;
	// A string `where` is the key of one entity, as a delta holds it. The entity is then found without a search.
	update: (cfg: { set: SetOps<T>; where?: Where<T> | string }) => { status: 'OK' | 'CONFLICT'; data: T[] };
	delete: (where?: Where<T> | string) => T[];
	drop: (where?: Where<T>) => T[];
	validate: (row: unknown) => boolean;
	hasDiff: (alter: Row) => boolean;
};

export type DDL<TMap extends Record<string, Row> = Record<string, Row>> =
	& { [K in keyof TMap]: Processors<TMap[K]> }
	& {
		entities: Processors<TMap[keyof TMap]>;
		key: (type: string, row: Row) => string;
		_: Internals;
		$entities?: TMap;
	};

export type AnyDDL = {
	entities: { list: (where?: Row) => Row[] };
	key: (type: string, row: Row) => string;
};

const qualifiedKey = (t: string, k: string) => t + '\0' + k; // an identity is unique only inside one entity type

const COMMON_FIELDS = ['schema', 'table', 'name'] as const;

export function isEqual(a: any, b: any): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => isEqual(v, b[i]));
	}
	if (a && b && typeof a === 'object') {
		const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
		return keys.every((k) => isEqual(a[k], b[k]));
	}
	return false;
}

function matches(row: Row, where: Row): boolean {
	for (const [k, v] of Object.entries(where)) {
		if (v === undefined) continue;
		if (v && typeof v === 'object' && (v as any).CONTAINS !== undefined) {
			const t = row[k];
			if (!Array.isArray(t) || !t.some((e) => isEqual(e, (v as any).CONTAINS))) return false;
		} else if (!isEqual(row[k], v)) return false;
	}
	return true;
}

const nonNullableType = (s: string) => (s.endsWith('?') ? s.slice(0, -1) : s);

export function validateRow(data: any, def: Def, deep = false): boolean {
	if (typeof data !== 'object' || data === null) return false;
	for (const k of new Set([...Object.keys(data), ...Object.keys(def)])) {
		if (!deep && k === 'entityType') continue;
		const f = (def as any)[k] as Field | undefined;
		if (!f) return false;
		if (f === 'string[]') {
			if (!Array.isArray(data[k]) || !data[k].every((e: any) => typeof e === 'string')) return false;
		} else if (typeof f === 'string') {
			const nullable = f.endsWith('?');
			if (data[k] === null) {
				if (!nullable) return false;
			} else if (typeof data[k] !== nonNullableType(f)) return false;
		} else if (Array.isArray(f)) {
			if (typeof f[0] === 'string' || f[0] === null) {
				if (!(f as readonly any[]).some((e) => e === data[k])) return false; // enum
			} else {
				if (!Array.isArray(data[k])) return false; // array of objects
				if (!data[k].every((e: any) => validateRow(e, (f as any)[0], true))) return false;
			}
		} else {
			if (data[k] !== null && !validateRow(data[k], f as Def, true)) return false; // nested object
		}
	}
	return true;
}

function compileEdge(spec: EdgeSpec, idOf: IdFn): Edge {
	type LE = { targetField: string; list: string; pick?: string; skipWhen?: string };
	const scalars: [string, string][] = []; // [targetField, sourceField]
	let listEdge: LE | null = null;
	for (const [targetField, src] of Object.entries(spec.map)) {
		if (typeof src === 'string') scalars.push([targetField, src]);
		else listEdge = { targetField, ...src };
	}
	const readList = (row: Row): string[] => {
		const arr = row[listEdge!.list];
		if (!Array.isArray(arr)) return [];
		const out: string[] = [];
		for (const it of arr) {
			if (listEdge!.skipWhen && it?.[listEdge!.skipWhen]) continue;
			const v = listEdge!.pick ? it?.[listEdge!.pick] : it;
			if (typeof v === 'string') out.push(v);
		}
		return out;
	};

	return {
		to: spec.to,
		cascade: spec.cascade ?? true,
		resolve: (row) => {
			if (spec.when && !spec.when(row)) return [];
			const base: Row = {};
			for (const [targetField, sourceField] of scalars) base[targetField] = row[sourceField];
			if (!listEdge) return [idOf(base)];
			return readList(row).map((v) => idOf({ ...base, [listEdge!.targetField]: v }));
		},
		// null unless the row's mapped fields currently equal `from`'s identity
		// components (self-guard); else the patch re-pointing them at `to`.
		relocate: (row, from, to) => {
			if (spec.when && !spec.when(row)) return null;
			for (const [targetField, sourceField] of scalars) {
				if (!isEqual(row[sourceField], from[targetField])) return null; // this row doesn't point at `from`
			}
			if (!listEdge) {
				// scalar edge: rewrite the mapped source fields
				const patch: Row = {};
				for (const [targetField, sourceField] of scalars) patch[sourceField] = to[targetField];
				return patch;
			}
			// list edge: rewrite only the matching element, plus the shared prefix.
			const arr = row[listEdge.list];
			if (!Array.isArray(arr)) return null;
			let changed = false;
			const next = arr.map((it) => {
				if (listEdge!.skipWhen && it?.[listEdge!.skipWhen]) return it;
				const v = listEdge!.pick ? it?.[listEdge!.pick] : it;
				if (!isEqual(v, from[listEdge!.targetField])) return it;
				changed = true;
				return listEdge!.pick ? { ...it, [listEdge!.pick]: to[listEdge!.targetField] } : to[listEdge!.targetField];
			});
			if (!changed) return null;
			const patch: Row = { [listEdge.list]: next };
			for (const [targetField, sourceField] of scalars) patch[sourceField] = to[targetField];
			return patch;
		},
	};
}

function reverseIndex(store: Store, edges: Record<string, Edge[]>): Map<string, Dep[]> {
	const idx = new Map<string, Dep[]>();
	for (const [type, bucket] of store) {
		const typeEdges = edges[type];
		if (!typeEdges || !typeEdges.length) continue;
		for (const row of bucket.values()) {
			for (const edge of typeEdges) {
				for (const targetKey of edge.resolve(row)) {
					const q = qualifiedKey(edge.to, targetKey);
					let list = idx.get(q);
					if (!list) idx.set(q, list = []);
					list.push({ row, edge, type });
				}
			}
		}
	}
	return idx;
}

function makeProcessors(ctx: Internals, type?: string): Processors {
	const { store, defs, identity, edges, nulls } = ctx;
	const keyOf = (row: Row) => identity[row.entityType](row);
	const bucketOf = (t: string) => {
		let b = store.get(t);
		if (!b) store.set(t, b = new Map());
		return b;
	};
	const scope = (): Row[] => {
		if (type) return [...(store.get(type)?.values() ?? [])];
		const out: Row[] = [];
		for (const b of store.values()) out.push(...b.values());
		return out;
	};
	const setRow = (row: Row) => bucketOf(row.entityType).set(keyOf(row), row);

	const rekey = () => {
		const all: Row[] = [];
		for (const b of store.values()) all.push(...b.values());
		for (const b of store.values()) b.clear();
		for (const r of all) bucketOf(r.entityType).set(keyOf(r), r);
	};

	const prepare = (input: Row): Row => {
		const entityType = type ?? input.entityType;
		const out: Row = { ...nulls[entityType] };
		for (const k in input) if (input[k] !== undefined && k in out) out[k] = input[k];
		out.entityType = entityType;
		return out;
	};

	const push: Processors['push'] = (input, uniques) => {
		const row = prepare(input);
		const k = keyOf(row);
		let conflict: Row | undefined;
		if (uniques) {
			conflict = scope().find((e) => e.entityType === row.entityType && uniques.every((u) => isEqual(row[u], e[u])));
		} else conflict = store.get(row.entityType)?.get(k);
		if (conflict) return { status: 'CONFLICT', data: conflict };
		setRow(row);
		return { status: 'OK', data: row };
	};

	const pushAll: Processors['pushAll'] = (items) => {
		const seen = new Set<string>();
		for (const [t, b] of store) for (const key of b.keys()) seen.add(qualifiedKey(t, key));
		const prepared: Row[] = [];
		for (const it of items) {
			const row = prepare(it);
			const q = qualifiedKey(row.entityType, keyOf(row));
			if (seen.has(q)) return { status: 'CONFLICT', key: keyOf(row) };
			seen.add(q);
			prepared.push(row);
		}
		for (const row of prepared) setRow(row);
		return { status: 'OK', count: prepared.length };
	};

	const list: Processors['list'] = (where) => {
		const from = scope();
		return where ? from.filter((r) => matches(r, where)) : from;
	};
	const one: Processors['one'] = (
		where,
	) => (where ? scope().find((r) => matches(r, where)) ?? null : scope()[0] ?? null);

	const applySet = (row: Row, set: Row): Row => {
		const next: Row = { ...row };
		for (const [k, v] of Object.entries(set)) {
			if (!(k in row)) continue;
			const cur = row[k];
			next[k] = typeof v === 'function' ? (Array.isArray(cur) ? cur.map(v as any) : (v as any)(cur)) : v;
		}
		return next;
	};

	const select = (where?: Row | string): Row[] => {
		if (typeof where !== 'string') return list(where);
		const row = findRow({ _: ctx }, where);
		return row && (!type || type === row.entityType) ? [row] : [];
	};

	const update: Processors['update'] = ({ set, where }) => {
		const targets = select(where);
		const planned = targets.map((row) => ({ row, next: applySet(row, set) }));

		// Only a key change can end in a conflict, so only then the entities are copied to put them back. The
		// copy is taken here, before any selected entity changes in place.
		const copies: [string, Row][] = [];
		if (planned.some(({ row, next }) => keyOf(next) !== keyOf(row))) {
			for (const b of store.values()) for (const r of b.values()) copies.push([r.entityType, { ...r }]);
		}
		const restore = () => {
			for (const b of store.values()) b.clear();
			for (const [t, r] of copies) bucketOf(t).set(keyOf(r), r);
		};

		type Seed = { type: string; oldKey: string; oldRow: Row; newRow: Row };
		const seeds: Seed[] = [];
		for (const { row, next } of planned) {
			const oldRow = { ...row };
			const oldKey = keyOf(oldRow);
			const hasKeyChanged = keyOf(next) !== oldKey;
			Object.assign(row, next);
			if (hasKeyChanged) seeds.push({ type: row.entityType, oldKey, oldRow, newRow: row });
		}

		if (seeds.length) {
			const idx = reverseIndex(store, edges);
			const visited = new Set(seeds.map((s) => qualifiedKey(s.type, s.oldKey)));
			const queue = [...seeds];
			for (let i = 0; i < queue.length; i++) {
				const s = queue[i];
				for (const dep of idx.get(qualifiedKey(s.type, s.oldKey)) ?? []) {
					const patch = dep.edge.relocate(dep.row, s.oldRow, s.newRow);
					if (!patch) continue;
					const depOld = { ...dep.row };
					const depOldKey = keyOf(depOld);
					Object.assign(dep.row, patch);
					const depNewKey = keyOf(dep.row);
					if (depNewKey !== depOldKey) {
						const q = qualifiedKey(dep.type, depOldKey);
						if (!visited.has(q)) {
							visited.add(q);
							queue.push({ type: dep.type, oldKey: depOldKey, oldRow: depOld, newRow: dep.row });
						}
					}
				}
			}

			const held = new Set<string>();
			const colliders: Row[] = [];
			for (const b of store.values()) {
				for (const r of b.values()) {
					const q = qualifiedKey(r.entityType, keyOf(r));
					if (held.has(q)) colliders.push(r);
					else held.add(q);
				}
			}
			if (colliders.length) {
				restore();
				return { status: 'CONFLICT', data: colliders };
			}

			rekey(); // rows moved keys — rebuild the buckets once.
		}

		return { status: 'OK', data: targets };
	};

	const del: Processors['delete'] = (where) => {
		const targets = select(where);
		for (const row of targets) store.get(row.entityType)?.delete(keyOf(row));
		return targets;
	};

	const drop: Processors['drop'] = (where) => {
		const targets = list(where);
		if (!targets.length) return [];
		const idx = reverseIndex(store, edges);
		const seen = new Set<string>();
		const queue: Row[] = [];
		const seed = (row: Row) => {
			const q = qualifiedKey(row.entityType, keyOf(row));
			if (!seen.has(q)) {
				seen.add(q);
				queue.push(row);
			}
		};
		targets.forEach(seed);
		const deleted: Row[] = [];
		for (let i = 0; i < queue.length; i++) {
			const row = queue[i];
			store.get(row.entityType)?.delete(keyOf(row));
			deleted.push(row);
			for (const dep of idx.get(qualifiedKey(row.entityType, keyOf(row))) ?? []) {
				if (dep.edge.cascade) seed(dep.row);
			}
		}
		return deleted;
	};

	const validate: Processors['validate'] = (row) => {
		if (typeof row !== 'object' || row === null) return false;
		const entityType = type ?? (row as any).entityType;
		const d = defs[entityType];
		return d ? validateRow(row, d) : false;
	};

	const hasDiff: Processors['hasDiff'] = (alter) =>
		Object.entries(alter).some(([k, v]) => k !== '$left' && k !== '$right' && isChangePair(v));

	return { push, pushAll, list, one, update, delete: del, drop, validate, hasDiff };
}

export function create<const D extends Record<string, Def>>(
	defs: D,
	opts: {
		identity: Record<keyof D, IdFn>;
		edges?: { [S in keyof D]?: EdgeOf<D, S>[] };
	},
): DDL<InferEntities<D>> {
	const { identity, edges: edgeSpecs = {} } = opts as {
		identity: Record<string, IdFn>;
		edges?: Record<string, EdgeSpec[]>;
	};

	const store: Store = new Map();
	const nulls: Record<string, Row> = {};
	for (const t of Object.keys(defs)) {
		if (t === 'entities' || t === '_' || t === 'key') throw new Error(`Illegal entity type name: "${t}"`);
		if (!identity[t]) throw new Error(`Missing identity generator for "${t}"`);
		store.set(t, new Map());
		nulls[t] = Object.fromEntries(Object.keys(defs[t]).map((k) => [k, null]));
	}
	const edges: Record<string, Edge[]> = {};
	for (const [t, specs] of Object.entries(edgeSpecs)) {
		edges[t] = (specs as EdgeSpec[]).map((s) => {
			if (!identity[s.to]) throw new Error(`Edge on "${t}" targets unknown type "${s.to}"`);
			return compileEdge(s, identity[s.to]);
		});
	}

	const internals: Internals = { store, defs, identity, edges, nulls };
	return build<InferEntities<D>>(internals);
}

function build<M extends Record<string, Row>>(internals: Internals): DDL<M> {
	const ddl: any = { _: internals, key: (t: string, row: Row) => internals.identity[t](row) };
	ddl.entities = makeProcessors(internals); // aggregate view
	for (const t of Object.keys(internals.defs)) ddl[t] = makeProcessors(internals, t);
	return ddl as DDL<M>;
}

function _diff(
	a: AnyDDL,
	b: AnyDDL,
	type: string | undefined,
	mode: 'all' | 'create' | 'drop' | 'createdrop' | 'alter',
): Row[] {
	const where = type ? { entityType: type } : undefined;
	const keyBy = (ddl: AnyDDL, rows: Row[]) => {
		const m: Record<string, Row> = {};
		for (const r of rows) m[qualifiedKey(r.entityType, ddl.key(r.entityType, r))] = r;
		return m;
	};
	const left = keyBy(a, a.entities.list(where));
	const right = keyBy(b, b.entities.list(where));

	const created: Row[] = [];
	const dropped: Row[] = [];
	const altered: Row[] = [];

	for (const [k, oldRow] of Object.entries(left)) {
		const newRow = right[k];
		if (!newRow) {
			if (mode === 'all' || mode === 'drop' || mode === 'createdrop') {
				dropped.push({ $diffType: 'drop', ...oldRow });
			}
		} else if (mode === 'all' || mode === 'alter') {
			const changes: Row = {};
			let changed = false;
			for (const f of new Set([...Object.keys(oldRow), ...Object.keys(newRow)])) {
				if (f === 'entityType') continue;
				if (!isEqual(oldRow[f], newRow[f])) {
					changed = true;
					changes[f] = { from: oldRow[f], to: newRow[f] };
				}
			}
			if (changed) {
				const commons: Row = {};
				for (const c of COMMON_FIELDS) if (newRow[c] !== undefined && newRow[c] !== null) commons[c] = newRow[c];
				altered.push({
					$diffType: 'alter',
					entityType: newRow.entityType,
					...commons,
					...changes,
					$left: oldRow,
					$right: newRow,
				});
			}
		}
		delete right[k];
	}
	if (mode === 'all' || mode === 'create' || mode === 'createdrop') {
		for (const newRow of Object.values(right)) created.push({ $diffType: 'create', ...newRow });
	}
	return [...created, ...dropped, ...altered];
}

type Coll<M> = keyof M & string;
export function diff<M extends Record<string, Row>, K extends Coll<M> = Coll<M>>(
	a: DDL<M>,
	b: DDL<M>,
	type?: K,
): (CreatesOf<M, K> | DropsOf<M, K>)[] {
	return _diff(a, b, type, 'createdrop') as any;
}
export namespace diff {
	export function all<M extends Record<string, Row>, K extends Coll<M> = Coll<M>>(
		a: DDL<M>,
		b: DDL<M>,
		type?: K,
	): (CreatesOf<M, K> | DropsOf<M, K> | AltersOf<M, K>)[] {
		return _diff(a, b, type, 'all') as any;
	}
	export function creates<M extends Record<string, Row>, K extends Coll<M> = Coll<M>>(
		a: DDL<M>,
		b: DDL<M>,
		type?: K,
	): CreatesOf<M, K>[] {
		return _diff(a, b, type, 'create') as any;
	}
	export function drops<M extends Record<string, Row>, K extends Coll<M> = Coll<M>>(
		a: DDL<M>,
		b: DDL<M>,
		type?: K,
	): DropsOf<M, K>[] {
		return _diff(a, b, type, 'drop') as any;
	}
	export function alters<M extends Record<string, Row>, K extends Coll<M> = Coll<M>>(
		a: DDL<M>,
		b: DDL<M>,
		type?: K,
	): AltersOf<M, K>[] {
		return _diff(a, b, type, 'alter') as any;
	}
}

export const key = (ddl: AnyDDL, type: string, row: Row): string => ddl.key(type, row);

/* ------------------------------------------------------------------ deltas */

const qualifiedKeyOf = (ddl: AnyDDL, r: Row): string => qualifiedKey(r.entityType, ddl.key(r.entityType, r));
export const findRow = (ddl: { _: { store: Store } }, key: string): Row | undefined => {
	const [entityType, identity] = splitDeltaKey(key);
	return ddl._.store.get(entityType)?.get(identity);
};
// These names must match the meta fields that `_diff` adds to each row.
const stripMeta = (r: Row): Row => {
	const { $diffType: _1, $left: _2, $right: _3, ...rest } = r as any;
	return rest;
};
const isChangePair = (v: any): v is { from: any; to: any } => !!v && typeof v === 'object' && 'from' in v && 'to' in v;

// `rows` must be the diff.all(a, b) rows, because drop keys come from `a` and alter keys from `b`.
export function delta<M extends Record<string, Row>>(
	a: DDL<M>,
	b: DDL<M>,
	rows: Row[] = _diff(a, b, undefined, 'all'),
): Delta[] {
	const out: Delta[] = [];
	for (const r of rows) {
		if (r.$diffType === 'create') {
			out.push({ op: 'create', row: stripMeta(r) });
		} else if (r.$diffType === 'drop') {
			out.push({ op: 'drop', key: qualifiedKeyOf(a, r) }); // r is the whole old row
		} else {
			const set: Row = {};
			for (const [k, v] of Object.entries(r)) {
				if (k === '$diffType' || k === '$left' || k === '$right' || k === 'entityType') continue;
				if (isChangePair(v)) set[k] = v.to;
			}
			// The alter row holds only the changed fields, so a nameless entity (privileges)
			// can build its key only from the whole new row.
			out.push({ op: 'alter', key: qualifiedKeyOf(b, (r as any).$right as Row), set });
		}
	}
	return out;
}

export function copyDDL<M extends Record<string, Row>>(ddl: DDL<M>): DDL<M> {
	const src = ddl._;
	const store: Store = new Map();
	for (const entityType of Object.keys(src.defs)) store.set(entityType, new Map());
	for (const [entityType, bucket] of src.store) {
		const copy = store.get(entityType)!;
		for (const [identity, row] of bucket) copy.set(identity, structuredClone(row));
	}
	return build<M>({ ...src, store });
}

// Renames the entity `from` in `ddl` and returns the delta of that change. The result is null when the state
// does not change: no field of `set` differs, the state does not hold `from`, or the new key is taken.
export function renameEntity<M extends Record<string, Row>>(ddl: DDL<M>, from: Row, set: Row): Delta | null {
	const changes: Row = {};
	for (const field of Object.keys(set)) if (!isEqual(from[field], set[field])) changes[field] = set[field];
	if (!Object.keys(changes).length) return null;
	const key = qualifiedKeyOf(ddl, from);
	const { status, data } = ddl.entities.update({ set: changes, where: key });
	return status === 'OK' && data.length ? { op: 'rename', key, set: changes } : null;
}
