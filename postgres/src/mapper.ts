// The mapper SEAM: one place every driver asks for a row mapper, given the columns + result mode +
// decoder map. The ONLY difference between the two implementations is how the buffer→POJO mapping is
// assembled — the JIT path compiles a monomorphic per-shape function (new Function, needs eval), the
// interpreted path resolves a per-column CellDecoder[] and loops (no eval). Both call the SAME decode
// strategies (JIT inlines them; interpreted picks them from the catalog in ./decode.ts), so they
// produce identical rows. `decode:'auto'` uses JIT where eval is available, else interpreted.
import { addBrand } from './brand.ts';
import { type CodegenCol, compileRow } from './decode.ts';
import { pickDecoder } from './decode.ts';
import { parseRowDescription } from './protocol.ts';
import type { CustomTypeDef } from './registry.ts';
import type { Decoder, Field } from './types.ts';

/** Decodes one DataRow body. `start` is where the body begins in `body` (default 0): the wire transports
 *  pass the socket chunk and an offset, so no view is made per row. */
export type RowMapper = (body: Buffer, start?: number) => unknown;
export type RowMapperFactory = (cols: CodegenCol[], mode: 'array' | 'object', map: Map<number, Decoder>) => RowMapper;

// A definition has no id of its own. This copy of the module numbers the ones it sees, and the cache
// that uses the numbers lives in the same copy, so two copies of the driver never compare their ids.
const customIds = new WeakMap<CustomTypeDef, number>();
let lastCustomId = 0;
const customId = (def: CustomTypeDef | undefined): number | '' => {
	if (!def) return '';
	let id = customIds.get(def);
	if (id === undefined) customIds.set(def, id = ++lastCustomId);
	return id;
};

// The forCols key: everything about a resolved column that changes the compiled mapper. The mode is not in it
// (one map per mode), and array mode leaves names out: an array mapper never reads them. User-supplied
// strings (names, Collect path segments) are length-prefixed so no name can forge a column boundary.
// A defineType()/pgvector column has oid 0 and carries its definition, so the definition is in the key.
// NB: encode the whole json marker (its declared shape), not just "has json" — two shapes that differ
// only inside a Json()/JsonArray() must get different mappers, else the first one is wrongly reused.
function colsKey(cols: CodegenCol[], names: boolean): string {
	let key = '';
	for (const c of cols) {
		key += `${names ? c.name.length + ':' + c.name : ''}|${c.oid}|${c.format ?? 't'}|${c.js ?? ''}|${
			c.json ? JSON.stringify(c.json) : ''
		}|${c.array ? 'a' + c.array.elem + (c.array.js ?? '') + ':' + customId(c.array.custom) : ''}|${
			customId(c.custom)
		}|${c.path ? c.path.map((p) => p.length + ':' + p).join('') : ''}|${
			c.groupNullable ? c.groupNullable.map((x) => (x ? '1' : '0')).join('') : ''
		}|${c.nullable ? 'n' : ''}|${c.xformId ?? ''};`;
	}
	return key;
}

/** Can this runtime compile functions from strings? (false under strict CSP / Cloudflare Workers.) */
export function isEvalAvailable(): boolean {
	try {
		new Function('return 1')();
		return true;
	} catch {
		return false;
	}
}

const setKey = (obj: Record<string, unknown>, k: string, v: unknown) => { // __proto__ as an own property (no prototype pollution)
	if (k === '__proto__') {
		Object.defineProperty(obj, k, { value: v, writable: true, enumerable: true, configurable: true });
	} else obj[k] = v;
};
// Collect/Transform assembly tree (built once per mapper; the interpreted mirror of decode2.buildObjectLiteral).
type ONode = {
	leaves: Array<{ key: string; i: number; xform?: (v: unknown) => unknown; required: boolean }>;
	groups: Array<{ key: string; node: ONode }>;
	nullable: boolean;
};
function buildObjTree(cols: CodegenCol[]): ONode {
	const root: ONode = { leaves: [], groups: [], nullable: false };
	cols.forEach((c, i) => {
		let node = root;
		const gn = c.groupNullable ?? [];
		(c.path ?? []).forEach((seg, depth) => {
			let g = node.groups.find((x) => x.key === seg);
			if (!g) {
				g = { key: seg, node: { leaves: [], groups: [], nullable: gn[depth] ?? false } };
				node.groups.push(g);
			}
			node = g.node;
		});
		node.leaves.push({ key: c.name, i, xform: c.xform, required: !c.nullable });
	});
	return root;
}
function assembleObj(node: ONode, vals: unknown[]): Record<string, unknown> {
	const obj: Record<string, unknown> = {};
	for (const l of node.leaves) setKey(obj, l.key, l.xform && vals[l.i] !== null ? l.xform(vals[l.i]) : vals[l.i]); // xform SKIPPED for null (null stays null)
	for (const g of node.groups) setKey(obj, g.key, assembleGroup(g.node, vals));
	return obj;
}
function groupAllNull(node: ONode, vals: unknown[]): boolean {
	for (const l of node.leaves) if (vals[l.i] !== null) return false;
	for (const g of node.groups) if (!groupAllNull(g.node, vals)) return false;
	return true;
}
function assembleGroup(node: ONode, vals: unknown[]): Record<string, unknown> | null {
	if (node.nullable) { // CollectNullable: null the whole group on a LEFT-JOIN miss (plain Collect always returns an object)
		let anyRequired = false;
		for (const l of node.leaves) {
			if (l.required) {
				anyRequired = true;
				if (vals[l.i] === null) return null;
			}
		} // a required (non-Nullable) leaf is NULL
		if (!anyRequired && groupAllNull(node, vals)) return null; // all-Nullable group, every field null
	}
	return assembleObj(node, vals);
}

// ---- interpreted: resolve a CellDecoder per column once, decode each row in a loop ----
function interpretedMapper(cols: CodegenCol[], mode: 'array' | 'object', map: Map<number, Decoder>): RowMapper {
	const d = cols.map((c) => pickDecoder(c, map));
	const n = d.length;
	if (mode === 'object') {
		if (!cols.some((c) => c.path || c.xform)) { // fast flat path — no Collect / Transform
			const names = cols.map((c) => c.name);
			return (b, s) => {
				let o = (s! | 0) + 2; // skip the Int16 column count
				const row: Record<string, unknown> = {};
				for (let i = 0; i < n; i++) {
					const l = (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!;
					o += 4;
					let v: unknown = null;
					if (l !== -1) {
						v = d[i]!(b, o, l);
						o += l;
					}
					setKey(row, names[i]!, v);
				}
				return row;
			};
		}
		// Collect/Transform: decode into a flat vals[], then assemble the nested object (auto-null groups, xform per leaf)
		const tree = buildObjTree(cols);
		return (b, s) => {
			let o = (s! | 0) + 2;
			const vals = new Array<unknown>(n);
			for (let i = 0; i < n; i++) {
				const l = (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!;
				o += 4;
				if (l === -1) vals[i] = null;
				else {
					vals[i] = d[i]!(b, o, l);
					o += l;
				}
			}
			return assembleObj(tree, vals);
		};
	}
	return (b, s) => {
		let o = (s! | 0) + 2;
		const r = new Array(n);
		for (let i = 0; i < n; i++) {
			const l = (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!;
			o += 4;
			if (l === -1) r[i] = null;
			else {
				r[i] = d[i]!(b, o, l);
				o += l;
			}
		}
		return r;
	};
}

// ---- jit: compile a monomorphic per-shape builder (inlined decode) ----
function jitMapper(cols: CodegenCol[], mode: 'array' | 'object', map: Map<number, Decoder>): RowMapper {
	return compileRow(cols, mode, map);
}

/** Pick the mapper strategy for a `decode` setting (uncached: RowMappers caches). `'jit'` on a no-eval runtime throws (fail fast). */
export function buildMapperFactory(
	decode: 'auto' | 'jit' | 'interpreted' = 'auto',
	hasEval = isEvalAvailable(),
): RowMapperFactory {
	if (decode === 'interpreted') return interpretedMapper;
	if (decode === 'jit') {
		if (!hasEval) {
			throw new Error(
				"@drizzle/postgres: decode:'jit' needs eval (new Function), which this runtime disallows — use decode:'interpreted' or 'auto'",
			);
		}
		return jitMapper;
	}
	return hasEval ? jitMapper : interpretedMapper; // 'auto'
}

type Mode = 'array' | 'object';
type PerMode<T> = { object: T; array: T };

/** A declared shape (or queryTyped column list), resolved once: its columns, the result formats to
 *  request, and the mapper per mode. `deferred`: it has 'unknown' columns, so the mapper is built per
 *  query from the real OIDs. */
export interface ShapePlan {
	cols: CodegenCol[];
	resultFormat: number[];
	deferred: boolean;
	object?: RowMapper;
	array?: RowMapper;
}

// Bound on each map. Shapes are normally a small fixed set, but an inline Transform() mints a new id per
// call (so a new key), and dynamic column lists do too — without a cap those grow for the client's
// lifetime. Oldest-inserted is evicted first (Map keeps insertion order).
const MAX_MAPPERS = 1024;

function remember<V>(map: Map<string, V>, key: string, value: V): V {
	if (map.size >= MAX_MAPPERS) map.delete(map.keys().next().value!);
	map.set(key, value);
	return value;
}

// How many descriptions a SeenBytes keeps. A lookup compares against each in turn, so it stays small; a
// client with more distinct result layouts than this pays the string-key lookup for the extra ones.
const MAX_SEEN = 16;

/** Values remembered under the exact bytes that described them: a RowDescription body, or /neon-http's
 *  `fields` JSON. A lookup compares bytes in place, so a repeat costs no string, no hash and no parse.
 *  The bytes are copied on `add`, so the caller's buffer may be a view that is reused afterwards. */
export class SeenBytes<V> {
	private readonly list: { bytes: Buffer; value: V }[] = [];

	/** The entry whose bytes sit at `raw[at…]`. `end` is where they must stop. Pass -1 when the end is not
	 *  known yet: that is only right for bytes that delimit themselves (one whole JSON value), where a
	 *  match at `at` cannot be the start of a longer value. */
	find(raw: Buffer, at: number, end: number): { bytes: Buffer; value: V } | undefined {
		const list = this.list;
		for (let k = 0; k < list.length; k++) {
			const e = list[k]!;
			const n = e.bytes.length;
			if (end < 0 ? at + n > raw.length : end - at !== n) continue;
			if (raw.compare(e.bytes, 0, n, at, at + n) === 0) return e;
		}
		return undefined;
	}

	add(raw: Buffer, at: number, end: number, value: V): void {
		if (this.list.length < MAX_SEEN) this.list.push({ bytes: Buffer.from(raw.subarray(at, end)), value });
	}
}
addBrand(SeenBytes, 'SeenBytes');

// Builds one result's rows as synthetic wire DataRow bodies (int16 count + per-cell int32 length + bytes),
// written one after another into a few large chunks. A row is a view into its chunk, and a chunk is never
// written again once a row has been handed out, so a decoder may keep the bytes it was given. That is
// why this is not one scratch buffer reused per row. One instance per result. For the transports whose
// response is not the wire protocol (/neon-http, /aurora): the wire ones get these bytes from the server.
export class RowArena {
	private buf = Buffer.allocUnsafe(2048);
	private pos = 0;
	private start = 0;
	private nextSize = 8192;

	// Room for `n` more bytes of the current row. A full chunk is left to the rows already in it: the
	// row being built moves to the start of a new one.
	private ensure(n: number): void {
		if (this.pos + n <= this.buf.length) return;
		const used = this.pos - this.start;
		const nb = Buffer.allocUnsafe(Math.max(this.nextSize, used + n));
		if (this.nextSize < 262144) this.nextSize *= 2;
		this.buf.copy(nb, 0, this.start, this.pos);
		this.buf = nb;
		this.start = 0;
		this.pos = used;
	}
	begin(): void {
		this.start = this.pos;
		this.ensure(2);
		this.pos += 2;
	}
	push(s: string | null): void {
		if (s === null) {
			this.ensure(4);
			this.buf.writeInt32BE(-1, this.pos);
			this.pos += 4;
			return;
		}
		// a short string reserves its worst case (3 bytes per UTF-16 unit); a long one is measured
		this.ensure(4 + (s.length <= 256 ? s.length * 3 : Buffer.byteLength(s, 'utf8')));
		const n = this.buf.write(s, this.pos + 4, 'utf8');
		this.buf.writeInt32BE(n, this.pos);
		this.pos += 4 + n;
	}
	/** A cell whose bytes already are its PG text: `src[start…end)`. */
	pushSlice(src: Buffer, start: number, end: number): void {
		const n = end - start;
		this.ensure(4 + n);
		this.buf.writeInt32BE(n, this.pos);
		src.copy(this.buf, this.pos + 4, start, end);
		this.pos += 4 + n;
	}
	end(ncols: number): Buffer {
		this.buf.writeInt16BE(ncols, this.start);
		return this.buf.subarray(this.start, this.pos);
	}
}
addBrand(RowArena, 'RowArena');

/** Row mappers for one client: a standalone Connection, a Pool (shared by its connections), or an HTTP
 *  client. Never process-wide: two clients may point at different databases, where the same type (an
 *  extension type, enum, domain) has a different OID. Lookups, cheapest first:
 *    plan    — a declared shape object -> its plan (identity, no key)
 *    forDesc — a RowDescription's raw bytes -> mapper (one map per text/binary × mode)
 *    fieldsFor — a RowDescription's raw bytes -> its parsed fields
 *    forCols — resolved columns -> mapper (one map per mode); the only place mappers are compiled
 *  (Named statement re-executions skip all of these: their mappers sit in slots on the connection's
 *  prepared-statement entries.) */
export class RowMappers {
	readonly shapes = new WeakMap<object, ShapePlan>();
	private readonly build: RowMapperFactory;
	private readonly byCols: PerMode<Map<string, RowMapper>> = { object: new Map(), array: new Map() };
	private readonly byDesc: { text: PerMode<Map<string, RowMapper>>; binary: PerMode<Map<string, RowMapper>> } = {
		text: { object: new Map(), array: new Map() },
		binary: { object: new Map(), array: new Map() },
	};
	// in front of byDesc: the descriptions seen first, found by comparing bytes
	private readonly seenDesc: { text: PerMode<SeenBytes<RowMapper>>; binary: PerMode<SeenBytes<RowMapper>> } = {
		text: { object: new SeenBytes(), array: new SeenBytes() },
		binary: { object: new SeenBytes(), array: new SeenBytes() },
	};

	private readonly seenFields = new SeenBytes<Field[]>();

	constructor(
		decode: 'auto' | 'jit' | 'interpreted' | undefined,
		private readonly decoders: Map<number, Decoder>,
		hasEval = isEvalAvailable(),
	) {
		this.build = buildMapperFactory(decode, hasEval);
	}

	/** Mapper for resolved columns. */
	forCols(cols: CodegenCol[], mode: Mode): RowMapper {
		const map = this.byCols[mode];
		const key = colsKey(cols, mode === 'object');
		return map.get(key) ?? remember(map, key, this.build(cols, mode, this.decoders));
	}

	/** The parsed fields of a RowDescription body. A description seen before returns the array parsed
	 *  the first time, so every result with that layout shares one array. It is frozen for that reason. */
	fieldsFor(desc: Buffer): Field[] {
		const hit = this.seenFields.find(desc, 0, desc.length);
		if (hit) return hit.value;
		const fields = parseRowDescription(desc);
		for (let i = 0; i < fields.length; i++) Object.freeze(fields[i]);
		Object.freeze(fields);
		this.seenFields.add(desc, 0, desc.length, fields);
		return fields;
	}

	/** Mapper for a RowDescription body. `cols` resolves its columns, called only on a miss. */
	forDesc(desc: Buffer, binary: boolean, mode: Mode, cols: () => CodegenCol[]): RowMapper {
		const seen = this.seenDesc[binary ? 'binary' : 'text'][mode];
		const hit = seen.find(desc, 0, desc.length);
		if (hit) return hit.value;
		const mapper = this.forDescKey(desc.toString('latin1'), binary, mode, cols);
		seen.add(desc, 0, desc.length, mapper);
		return mapper;
	}

	/** The same, for a column description the caller already holds as a string (the RowDescription
	 *  bytes as latin1, or /neon-http's `fields` JSON). Any string works if it determines the columns
	 *  exactly; one client must use one kind of string. */
	forDescKey(key: string, binary: boolean, mode: Mode, cols: () => CodegenCol[]): RowMapper {
		const map = this.byDesc[binary ? 'binary' : 'text'][mode];
		return map.get(key) ?? remember(map, key, this.forCols(cols(), mode));
	}

	/** The plan for a declared shape. `resolve` turns it into columns, called only on a miss. */
	plan(shape: object, resolve: () => CodegenCol[]): ShapePlan {
		let p = this.shapes.get(shape);
		if (p === undefined) {
			const cols = resolve();
			p = {
				cols,
				resultFormat: cols.map((c) => (c.format === 'binary' ? 1 : 0)),
				deferred: cols.some((c) => c.oid === 0),
			};
			this.shapes.set(shape, p);
		}
		return p;
	}

	/** The mapper for a non-deferred plan in `mode`, compiled once per plan. */
	planMapper(p: ShapePlan, mode: Mode): RowMapper {
		return p[mode] ??= this.forCols(p.cols, mode);
	}
}

addBrand(RowMappers, 'RowMappers');
