export type Row = Record<string, any>;

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
	update: (cfg: { set: SetOps<T>; where?: Where<T> }) => { status: 'OK' | 'CONFLICT'; data: T[] };
	delete: (where?: Where<T>) => T[];
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

const qual = (t: string, k: string) => t + '\0' + k; // the two families are unique only WITHIN a bucket

const COMMON_FIELDS = ['schema', 'table', 'name'] as const;

function isEqual(a: any, b: any): boolean {
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

const unq = (s: string) => (s.endsWith('?') ? s.slice(0, -1) : s);

function validateRow(data: any, def: Def, deep = false): boolean {
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
			} else if (typeof data[k] !== unq(f)) return false;
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
	type LE = { tf: string; list: string; pick?: string; skipWhen?: string };
	const scalars: [string, string][] = []; // [targetField, sourceField]
	let listE: LE | null = null;
	for (const [tf, src] of Object.entries(spec.map)) {
		if (typeof src === 'string') scalars.push([tf, src]);
		else listE = { tf, ...src };
	}
	const readList = (row: Row): string[] => {
		const arr = row[listE!.list];
		if (!Array.isArray(arr)) return [];
		const out: string[] = [];
		for (const it of arr) {
			if (listE!.skipWhen && it?.[listE!.skipWhen]) continue;
			const v = listE!.pick ? it?.[listE!.pick] : it;
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
			for (const [tf, sf] of scalars) base[tf] = row[sf];
			if (!listE) return [idOf(base)];
			return readList(row).map((v) => idOf({ ...base, [listE!.tf]: v }));
		},
		// null unless the row's mapped fields currently equal `from`'s identity
		// components (self-guard); else the patch re-pointing them at `to`.
		relocate: (row, from, to) => {
			if (spec.when && !spec.when(row)) return null;
			for (const [tf, sf] of scalars) {
				if (!isEqual(row[sf], from[tf])) return null; // this row doesn't point at `from`
			}
			if (!listE) {
				const patch: Row = {};
				for (const [tf, sf] of scalars) patch[sf] = to[tf]; // scalar edge: rewrite the mapped source fields
				return patch;
			}
			// list edge: rewrite only the matching element, plus the shared prefix.
			const arr = row[listE.list];
			if (!Array.isArray(arr)) return null;
			let changed = false;
			const next = arr.map((it) => {
				if (listE!.skipWhen && it?.[listE!.skipWhen]) return it;
				const v = listE!.pick ? it?.[listE!.pick] : it;
				if (!isEqual(v, from[listE!.tf])) return it;
				changed = true;
				return listE!.pick ? { ...it, [listE!.pick]: to[listE!.tf] } : to[listE!.tf];
			});
			if (!changed) return null;
			const patch: Row = { [listE.list]: next };
			for (const [tf, sf] of scalars) patch[sf] = to[tf];
			return patch;
		},
	};
}

function reverseIndex(store: Store, edges: Record<string, Edge[]>): Map<string, Dep[]> {
	const idx = new Map<string, Dep[]>();
	for (const [type, bucket] of store) {
		const es = edges[type];
		if (!es || !es.length) continue;
		for (const row of bucket.values()) {
			for (const edge of es) {
				for (const tk of edge.resolve(row)) {
					const q = qual(edge.to, tk);
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
		const et = type ?? input.entityType;
		const out: Row = { ...nulls[et] };
		for (const k in input) if (input[k] !== undefined && k in out) out[k] = input[k];
		out.entityType = et;
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
		for (const [t, b] of store) for (const key of b.keys()) seen.add(qual(t, key));
		const prepared: Row[] = [];
		for (const it of items) {
			const row = prepare(it);
			const q = qual(row.entityType, keyOf(row));
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

	const update: Processors['update'] = ({ set, where }) => {
		const targets = list(where);
		const planned = targets.map((row) => ({ row, next: applySet(row, set) }));

		const snap: [string, Row][] = [];
		for (const b of store.values()) for (const r of b.values()) snap.push([r.entityType, { ...r }]);

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
			const visited = new Set(seeds.map((s) => qual(s.type, s.oldKey)));
			const queue = [...seeds];
			for (let i = 0; i < queue.length; i++) {
				const s = queue[i];
				for (const dep of idx.get(qual(s.type, s.oldKey)) ?? []) {
					const patch = dep.edge.relocate(dep.row, s.oldRow, s.newRow);
					if (!patch) continue;
					const depOld = { ...dep.row };
					const depOldKey = keyOf(depOld);
					Object.assign(dep.row, patch);
					const depNewKey = keyOf(dep.row);
					if (depNewKey !== depOldKey) {
						const q = qual(dep.type, depOldKey);
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
					const q = qual(r.entityType, keyOf(r));
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
		const targets = list(where);
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
			const q = qual(row.entityType, keyOf(row));
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
			for (const dep of idx.get(qual(row.entityType, keyOf(row))) ?? []) {
				if (dep.edge.cascade) seed(dep.row);
			}
		}
		return deleted;
	};

	const validate: Processors['validate'] = (row) => {
		if (typeof row !== 'object' || row === null) return false;
		const et = type ?? (row as any).entityType;
		const d = defs[et];
		return d ? validateRow(row, d) : false;
	};

	const hasDiff: Processors['hasDiff'] = (alter) => {
		for (const [k, v] of Object.entries(alter)) {
			if (k === '$left' || k === '$right' || k === '$diffType' || k === 'entityType') continue;
			if (v && typeof v === 'object' && 'from' in v && 'to' in v) return true;
		}
		return false;
	};

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
	const ddl: any = { _: internals, key: (t: string, row: Row) => identity[t](row) };
	ddl.entities = makeProcessors(internals); // aggregate view
	for (const t of Object.keys(defs)) ddl[t] = makeProcessors(internals, t);
	return ddl as DDL<InferEntities<D>>;
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
		for (const r of rows) m[qual(r.entityType, ddl.key(r.entityType, r))] = r;
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
