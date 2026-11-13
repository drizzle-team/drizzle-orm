export type Row = Record<string, any>;

// One change to a state, as a snapshot stores it. `key` names one entity: the entity type, `\0` and the
// identity of the entity. Only a `rename` changes that key, and it comes from a rename that the user confirms.
export type Delta =
	| { op: 'create'; row: Row }
	| { op: 'drop'; key: string }
	| { op: 'alter'; key: string; set: Row }
	| { op: 'rename'; key: string; set: Row };

export const parseEntityKey = (k: string): [string, string] => {
	const i = k.indexOf('\0'); // the identity is JSON and never contains \0, which qualifiedKey relies on
	return [k.slice(0, i), k.slice(i + 1)];
};

type EnumField = readonly (string | null)[];
type ObjectField = { [field: string]: Field };
type ObjectArrayField = readonly [ObjectField];

export type Field =
	| 'string'
	| 'number'
	| 'boolean'
	| 'string[]'
	| 'string?'
	| 'number?'
	| 'boolean?'
	| EnumField
	| ObjectField
	| ObjectArrayField;
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

type EntityType = string;
type Identity = string;
export type Store = Map<EntityType, Map<Identity, Row>>;

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
	// A string `where` lets `update` and `delete` apply a delta: it is the key that the delta holds, and the
	// entity is found by that key without a search.
	update: (cfg: { set: SetOps<T>; where?: Where<T> | string }) => { status: 'OK' | 'CONFLICT'; data: T[] };
	delete: (where?: Where<T> | string) => T[];
	drop: (where?: Where<T>) => T[];
	validate: (row: unknown) => row is T;
	hasDiff: (alter: Row) => boolean;
};

export type DDL<TMap extends Record<string, Row> = Record<string, Row>> =
	& { [K in keyof TMap]: Processors<TMap[K]> }
	& {
		entities: Processors<TMap[keyof TMap]>;
		key: (type: string, row: Row) => string;
		// Renames the entity `from` and returns the delta of that change. The result is null when the state does
		// not change: no field of `set` differs, the state does not hold `from`, or the new key is taken.
		rename: (from: Row, set: Row) => Delta | null;
		clone: () => DDL<TMap>;
		_: Internals;
		$entities?: TMap;
	};

export type AnyDDL = {
	entities: { list: (where?: Row) => Row[] };
	key: (type: string, row: Row) => string;
};

const qualifiedKey = (t: string, k: string) => t + '\0' + k;

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
		const f = Object.hasOwn(def, k) ? def[k] : undefined;
		if (!f) return false;
		if (f === 'string[]') {
			if (!Array.isArray(data[k]) || !data[k].every((e: any) => typeof e === 'string')) return false;
		} else if (typeof f === 'string') {
			const nullable = f.endsWith('?');
			if (data[k] === undefined) {
				if (!nullable) return false;
			} else if (data[k] === null) {
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

// Builds the functions that follow one edge spec. An edge spec says which fields of a row hold the name of
// another entity. `update` uses `relocate` to change those fields when that entity gets a new key, and `drop`
// uses `resolve` to find the rows that depend on a dropped entity.
function compileEdge(spec: EdgeSpec, identityOf: IdFn): Edge {
	type ListEdge = { targetField: string; list: string; pick?: string; skipWhen?: string };
	const scalars: [targetField: string, sourceField: string][] = [];
	let listEdge: ListEdge | null = null;
	for (const [targetField, source] of Object.entries(spec.map)) {
		if (typeof source === 'string') scalars.push([targetField, source]);
		else listEdge = { targetField, ...source };
	}

	return {
		to: spec.to,
		cascade: spec.cascade ?? true,
		resolve: (row) => {
			if (spec.when && !spec.when(row)) return [];
			const target: Row = {};
			for (const [targetField, sourceField] of scalars) target[targetField] = row[sourceField];
			if (!listEdge) return [identityOf(target)];
			const elements = row[listEdge.list];
			if (!Array.isArray(elements)) return [];
			const identities: string[] = [];
			for (const element of elements) {
				if (listEdge.skipWhen && element?.[listEdge.skipWhen]) continue;
				const name = listEdge.pick ? element?.[listEdge.pick] : element;
				if (typeof name === 'string') identities.push(identityOf({ ...target, [listEdge.targetField]: name }));
			}
			return identities;
		},
		relocate: (row, from, to) => {
			if (spec.when && !spec.when(row)) return null;
			// An earlier patch in the same `update` call can move `row` off `from`. Then a scalar field no longer
			// holds the matching field of `from`, and `row` gets no patch.
			for (const [targetField, sourceField] of scalars) {
				if (!isEqual(row[sourceField], from[targetField])) return null;
			}
			if (!listEdge) {
				const patch: Row = {};
				for (const [targetField, sourceField] of scalars) patch[sourceField] = to[targetField];
				return patch;
			}
			// The patch changes only the elements that point at `from`. It also sets the scalar fields, because
			// they hold the part of the key that all elements share, for example the table of the index columns.
			const elements = row[listEdge.list];
			if (!Array.isArray(elements)) return null;
			let hasChanged = false;
			const nextElements = elements.map((element) => {
				if (listEdge.skipWhen && element?.[listEdge.skipWhen]) return element;
				const name = listEdge.pick ? element?.[listEdge.pick] : element;
				if (!isEqual(name, from[listEdge.targetField])) return element;
				hasChanged = true;
				return listEdge.pick ? { ...element, [listEdge.pick]: to[listEdge.targetField] } : to[listEdge.targetField];
			});
			if (!hasChanged) return null;
			const patch: Row = { [listEdge.list]: nextElements };
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

		// `snap` keeps a copy of every entity, so that a key conflict can put the store back. The copy is needed
		// only when a key changes, and it must be taken before the rows below change in place.
		const snap: [string, Row][] = [];
		if (planned.some(({ row, next }) => keyOf(next) !== keyOf(row))) {
			for (const b of store.values()) for (const r of b.values()) snap.push([r.entityType, { ...r }]);
		}

		type Seed = { type: string; oldKey: string; oldRow: Row; newRow: Row };
		const seeds: Seed[] = [];
		for (const { row, next } of planned) {
			const oldRow = { ...row };
			const oldKey = keyOf(oldRow);
			Object.assign(row, next);
			if (keyOf(row) !== oldKey) seeds.push({ type: row.entityType, oldKey, oldRow, newRow: row });
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
				for (const b of store.values()) b.clear();
				for (const [t, r] of snap) bucketOf(t).set(keyOf(r), r);
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

	const validate: Processors['validate'] = (row): row is Row => {
		if (typeof row !== 'object' || row === null) return false;
		const entityType = type ?? (row as any).entityType;
		return typeof entityType === 'string' && Object.hasOwn(defs, entityType) && validateRow(row, defs[entityType]);
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
		if (['entities', '_', 'key', 'rename', 'clone'].includes(t)) throw new Error(`Illegal entity type name: "${t}"`);
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

// Builds the DDL object for `create` and for `clone`, which passes a copy of the store.
function build<M extends Record<string, Row>>(internals: Internals): DDL<M> {
	const ddl: any = { _: internals, key: (t: string, row: Row) => internals.identity[t](row) };
	ddl.entities = makeProcessors(internals); // aggregate view
	for (const t of Object.keys(internals.defs)) ddl[t] = makeProcessors(internals, t);
	ddl.rename = (from: Row, set: Row): Delta | null => {
		const changes: Row = {};
		for (const field of Object.keys(set)) if (!isEqual(from[field], set[field])) changes[field] = set[field];
		if (!Object.keys(changes).length) return null;
		const key = qualifiedKeyOf(ddl, from);
		const { status, data } = ddl.entities.update({ set: changes, where: key });
		return status === 'OK' && data.length ? { op: 'rename', key, set: changes } : null;
	};
	ddl.clone = (): DDL<M> => {
		const store: Store = new Map();
		for (const entityType of Object.keys(internals.defs)) store.set(entityType, new Map());
		for (const [entityType, bucket] of internals.store) {
			const copy = store.get(entityType)!;
			for (const [identity, row] of bucket) copy.set(identity, structuredClone(row));
		}
		return build<M>({ ...internals, store });
	};
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
	const [entityType, identity] = parseEntityKey(key);
	return ddl._.store.get(entityType)?.get(identity);
};
// Gives a `create` delta a plain entity row. The three names must match the meta fields that `_diff` adds.
const stripMeta = (r: Row): Row => {
	const { $diffType: _1, $left: _2, $right: _3, ...rest } = r as any;
	return rest;
};
const isChangePair = (v: any): v is { from: any; to: any } => !!v && typeof v === 'object' && 'from' in v && 'to' in v;

// Builds the deltas that turn state `a` into state `b`. With `rows`, a caller that already ran
// `diff.all(a, b)` skips a second diff. They must be the rows of that exact call, because the drop keys come
// from `a` and the alter keys from `b`.
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
			// The key comes from `$right`, because the alter row holds only the changed fields. A nameless entity,
			// such as a privilege, needs the whole row to build its key.
			out.push({ op: 'alter', key: qualifiedKeyOf(b, (r as any).$right as Row), set });
		}
	}
	return out;
}
