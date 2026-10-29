// Resolve a declarative row shape (column name -> PG type alias, optionally with a `:number`/`:string`
// JS-target override, or a Json()/Jsonb() marker) into the driver's column plan (CodegenCol[]). Kept
// separate from shape.ts so the connection can resolve a `{ shape }` query option WITHOUT pulling in the
// whole-result-set codegen used by the standalone Shape() helper. No node deps (imports only json/types).
import { BINARY_FAST, type CodegenCol } from './decode.ts';
import { EXT_HALFVEC, EXT_SPARSEVEC, EXT_VECTOR } from './geo.ts';
import {
	type CollectMarker,
	isCollectMarker,
	isJsonMarker,
	isNullableMarker,
	isTransformMarker,
	type JsonMarker,
	type NullableMarker,
	type SpecEntries,
	specEntries,
	splitType,
	type TransformMarker,
	validateJsonSpec,
} from './json.ts';
import { type CustomMarker, isCustomMarker } from './registry.ts';

// PG type alias -> OID. `satisfies` (not a `: Record<…>` annotation) keeps the literal keys so PgType can
// derive the alias union straight from this map — the type list and the runtime map can never drift apart.
const TYPE_OID = {
	int2: 21,
	smallint: 21,
	int4: 23,
	int: 23,
	integer: 23,
	serial: 23,
	oid: 26,
	int8: 20,
	bigint: 20,
	float4: 700,
	real: 700,
	float8: 701,
	'double precision': 701,
	numeric: 1700,
	decimal: 1700,
	money: 790,
	bool: 16,
	boolean: 16,
	text: 25,
	varchar: 1043,
	bpchar: 1042,
	char: 18,
	name: 19,
	json: 114,
	jsonb: 3802,
	bytea: 17,
	uuid: 2950,
	date: 1082,
	time: 1083,
	timestamp: 1114,
	timestamptz: 1184,
	interval: 1186,
	point: 600,
	line: 628,
	box: 603,
} satisfies Record<string, number>;

/** A known PG type alias (e.g. 'int4', 'bigint', 'timestamptz'). */
export type PgType = keyof typeof TYPE_OID;

// scalar OID -> its array-type OID (pg_type.typarray), for `params: ['int8[]']` & bulkInsert casts
export const ARRAY_OID: Record<number, number> = {
	16: 1000,
	21: 1005,
	23: 1007,
	26: 1028,
	20: 1016,
	700: 1021,
	701: 1022,
	1700: 1231,
	790: 791,
	25: 1009,
	1043: 1015,
	1042: 1014,
	18: 1002,
	19: 1003,
	114: 199,
	3802: 3807,
	17: 1001,
	2950: 2951,
	1082: 1182,
	1083: 1183,
	1114: 1115,
	1184: 1185,
	1186: 1187,
	628: 629,
	600: 1017,
	603: 1020,
};

/** A declared param type: a PG alias, its array form, or a raw OID. */
export type ParamType = number | PgType | `${PgType}[]`;

/** Resolve ONE declared param type ('int8', 'text[]', or a raw OID) to its wire OID. */
export function paramTypeOid(t: number | string): number {
	if (typeof t === 'number') return t;
	const arr = t.endsWith('[]');
	const base = (TYPE_OID as Record<string, number | undefined>)[(arr ? t.slice(0, -2) : t).toLowerCase()];
	if (base === undefined) {
		throw new Error(
			`@drizzle-team/postgres: unknown param type ${JSON.stringify(t)} (known: ${
				Object.keys(TYPE_OID).join(', ')
			}, each also with [])`,
		);
	}
	if (!arr) return base;
	const a = ARRAY_OID[base];
	if (a === undefined) throw new Error(`@drizzle-team/postgres: no array type known for ${JSON.stringify(t)}`);
	return a;
}

// declared-params arrays are meant to be module-scope constants — cache resolution by identity
const resolvedParams = new WeakMap<readonly (number | string)[], number[]>();
export function resolveParamTypes(ts: readonly (number | string)[]): readonly number[] {
	let r = resolvedParams.get(ts);
	if (!r) {
		r = ts.map(paramTypeOid);
		resolvedParams.set(ts, r);
	}
	return r;
}

// Per-type JS-target overrides (mirrors the runtime groups in json.ts). Every type also accepts `:string`
// (its exact PG text). Temporal adds `:date` (default) / `:ms` (epoch number); precision adds `:number`;
// text adds `:latin1`. So e.g. `timestamptz` offers date/ms/string — NOT :number/:latin1.
type TemporalType = 'date' | 'timestamp' | 'timestamptz';
type IntType = 'int8' | 'bigint'; // default BigInt; :number (lossy) / :string
type NumericType = 'numeric' | 'decimal' | 'money'; // default exact string; :number (lossy)
type BigNumericType = 'numeric' | 'decimal'; // :bigint = declared INTEGER-only numeric (uint256 pattern); fractional values THROW (BigInt(text) is loud). money excluded (locale text)
type Float4Type = 'float4' | 'real'; // default/:pretty -> canonical shortest; :precise -> exact f32
type TextType = 'text' | 'varchar' | 'bpchar' | 'char' | 'name';
/** A column's type in a shape: a PG alias, plus the JS-target overrides valid for it (autocompletes to the
 *  known list). e.g. `'bigint'` -> BigInt, `'bigint:number'` -> JS number, `'timestamptz:ms'` -> epoch ms,
 *  `'float4:precise'` -> exact stored f32, `'float4:pretty'` -> PG's canonical shortest decimal. */
export type TypeSpec =
	| 'unknown' // resolve from the actual result (RowDescription) at runtime — for columns not known upfront
	| `point${'' | '[]'}${'' | ':xy' | ':tuple' | ':string'}` // built-in point: raw '(x,y)' text (default/:string); {x,y} (:xy), [x,y] (:tuple); element targets ride after []
	| `line${'' | '[]'}${'' | ':abc' | ':tuple' | ':string'}` // built-in line '{A,B,C}': raw text (default/:string); {a,b,c} (:abc), [a,b,c] (:tuple); element targets ride after []
	| `vector${'' | '[]'}${'' | ':array' | ':f32' | ':string'}` // pgvector: raw '[…]' text (default/:string); number[] (:array), Float32Array (:f32); [] = array column
	| `halfvec${'' | '[]'}${'' | ':array' | ':f32' | ':string'}` // pgvector halfvec: raw text (default); number[] (:array), Float32Array (:f32)
	| `sparsevec${'' | '[]'}${'' | ':sparse' | ':array' | ':string'}` // pgvector sparsevec: raw '{i:v,…}/dim' text (default); {dim,indices,values} (:sparse), dense number[] (:array)
	| PgType
	| `${PgType}:string`
	| `${TemporalType}:${'date' | 'ms'}`
	| `${IntType}:${'number' | 'bigint'}`
	| `${NumericType}:number`
	| `${BigNumericType}${'' | '[]'}:bigint`
	| `${Float4Type}:${'precise' | 'pretty'}`
	| `${TextType}:latin1`
	// array forms — decode a '{…}' result column to a JS array; the element :target binds AFTER the []
	// (e.g. 'text[]', 'numeric[]' keeps exact strings, 'int8[]:number', 'timestamptz[]:string').
	| `${PgType}[]`
	| `${PgType}[]:string`
	| `${TemporalType}[]:${'date' | 'ms'}`
	| `${IntType}[]:${'number' | 'bigint'}`
	| `${NumericType}[]:number`
	| `${TextType}[]:latin1`;
/** A shape column's value: TypeSpec, a Json()/Jsonb() marker (one json cell), a Collect() group (several
 *  result columns -> nested object), a Transform() (per-column decode-time fn), or a Nullable() wrapper. */
export type ShapeValue = TypeSpec | JsonMarker | CollectMarker | TransformMarker | NullableMarker | CustomMarker;
/** The ordered entries form of a row shape: [column name, value] tuples. Order-safe for ANY key —
 *  the escape hatch for integer-string column names the object form must reject (see specEntries). */
export type ShapeEntries = SpecEntries<ShapeValue>;
/** A row shape: column name -> value, as an object literal or ordered [name, value] entries. */
export type ShapeSpec = Record<string, ShapeValue> | ShapeEntries;
/** The same value type as ShapeSpec, but over KNOWN keys `K`. The public shape-taking functions use this
 *  generic form (`fn<K extends string>(spec: ShapeOf<K>)`) so editors offer value autocomplete — TypeScript
 *  does NOT surface value completions through a `Record<string, …>` index signature, but does through a
 *  mapped type over inferred keys. Same constraint either way; only the completion UX differs. */
export type ShapeOf<K extends string> = {
	[P in K]: TypeSpec | JsonMarker | CollectMarker | TransformMarker | NullableMarker | CustomMarker;
};

/** Resolve a ShapeSpec into columns (name + wire OID + optional JS target / JSON marker / array / nesting path
 *  / transform). Collect() flattens into several path-tagged columns; Transform() attaches an xform closure;
 *  Nullable() marks a Collect field non-required. Emitted in DFS pre-order = the SELECT's wire column order. */
export function shapeCols(spec: ShapeSpec): CodegenCol[] {
	const out: CodegenCol[] = [];
	// gn[k] = is the k-th path group a CollectNullable (auto-null on a LEFT-JOIN miss) vs a plain Collect (always an object)?
	const walk = (s: ShapeSpec, path: readonly string[], gn: readonly boolean[]): void => {
		for (const [name, t] of specEntries(s)) {
			if (isCollectMarker(t)) {
				walk(t.spec, [...path, name], [...gn, t.nullable]);
				continue;
			} // group -> recurse, extend path + group-null flags
			let m: TypeSpec | JsonMarker | TransformMarker | NullableMarker | CustomMarker = t;
			let nullable = false;
			if (isNullableMarker(m)) {
				nullable = true;
				m = m.inner;
			} // unwrap Nullable(...)
			let xform: ((v: unknown) => unknown) | undefined, xformId: number | undefined;
			if (isTransformMarker(m)) {
				xform = m.fn as (v: unknown) => unknown;
				xformId = m.id;
				m = m.type;
			} // unwrap Transform(type, fn)
			const col = resolveLeaf(name, m as TypeSpec | JsonMarker | CustomMarker); // plain type, Json marker, or defineType marker
			if (path.length) {
				col.path = [...path];
				col.groupNullable = [...gn];
			}
			if (nullable) col.nullable = true;
			if (xform) {
				col.xform = xform;
				col.xformId = xformId;
			}
			out.push(col);
		}
	};
	walk(spec, [], []);
	return out;
}

/** Resolve a single non-nesting leaf (a scalar/array TypeSpec, a Json marker, or a defineType
 *  marker) to a CodegenCol. */
function resolveLeaf(name: string, t: TypeSpec | JsonMarker | CustomMarker): CodegenCol {
	if (isCustomMarker(t)) { // defineType(): the def's sentinel oid is the identity, the target rides in js
		return t.isArray
			? { name, oid: t.__customType.oid, array: { elem: t.__customType.oid, js: t.target as CodegenCol['js'] } }
			: { name, oid: t.__customType.oid, js: t.target as CodegenCol['js'] };
	}
	if (isJsonMarker(t)) {
		validateJsonSpec(t.spec);
		return { name, oid: t.type === 'jsonb' ? 3802 : 114, json: t };
	}
	// 'unknown': type not known upfront — oid 0 is the DEFER sentinel; the real OID comes from
	// RowDescription (or the cached fields on prepared reuse) and the column decodes like a
	// plain query column (default decoder catalog, TEXT wire format).
	if (t === 'unknown') return { name, oid: 0 };
	// pgvector / PostGIS: extension types have DYNAMIC OIDs — sentinel OIDs select the decoder
	// by DECLARED name (see geo.ts); the runtime OID is irrelevant (text format, name-driven).
	{
		const { pg, js } = splitType(t as string);
		const base = pg.toLowerCase();
		if (base === 'vector') return { name, oid: EXT_VECTOR, js };
		if (base === 'halfvec') return { name, oid: EXT_HALFVEC, js };
		if (base === 'sparsevec') return { name, oid: EXT_SPARSEVEC, js };
	}
	const { pg, js } = splitType(t);
	if (pg.endsWith('[]')) { // array column: decode '{…}' text -> JS array (always TEXT format; no binary array decoder)
		const elemName = pg.slice(0, -2).toLowerCase();
		// extension elements (dynamic OIDs): the SENTINEL is both the col oid (cache key) and the
		// array element — decode is driven entirely by the declared name, like the scalar forms
		const extElem = elemName === 'vector' ? EXT_VECTOR : elemName === 'halfvec'
			? EXT_HALFVEC
			: elemName === 'sparsevec'
			? EXT_SPARSEVEC
			: undefined;
		if (extElem !== undefined) return { name, oid: extElem, array: { elem: extElem, js } };
		const elem = (TYPE_OID as Record<string, number | undefined>)[elemName];
		if (elem === undefined) {
			throw new Error(
				`@drizzle-team/postgres: unknown array element type ${
					JSON.stringify(elemName)
				} for column "${name}" in shape (known: ${Object.keys(TYPE_OID).join(', ')})`,
			);
		}
		const arrayOid = ARRAY_OID[elem];
		if (arrayOid === undefined) {
			throw new Error(`@drizzle-team/postgres: no array type known for ${JSON.stringify(pg)}`);
		}
		return { name, oid: arrayOid, array: { elem, js } }; // element :target rides on array.js
	}
	const oid = (TYPE_OID as Record<string, number | undefined>)[pg.toLowerCase()]; // pg is user text -> string index
	if (oid === undefined) {
		throw new Error(
			`@drizzle-team/postgres: unknown type ${JSON.stringify(pg)} for column "${name}" in shape (known: ${
				Object.keys(TYPE_OID).join(', ')
			})`,
		);
	}
	// Auto-request BINARY wire format for bench-proven-faster types (see BINARY_FAST). :string on a non-int8 type
	// is unsafe (binary yields the decoded value, never PG text); int8:number/float4:precise handled below.
	const binaryUnsafe = js === 'string' && oid !== 20;
	let binary = BINARY_FAST.has(oid) && !binaryUnsafe;
	if (oid === 700) binary = js === 'precise'; // float4: only :precise (exact f32) goes binary; bare/:pretty/:string stay text
	return binary ? { name, oid, js, format: 'binary' } : { name, oid, js };
}

/** Fill 'unknown' (oid 0) shape columns with the REAL type OIDs the server reported, positionally.
 *  `'unknown'` is the shape contract for "you tell me: use the OID from the result", so EVERY transport
 *  must run this before planning decoders — otherwise the column decodes as raw text (count(*) as "2",
 *  `jsonb -> 'k'` as "\"v\"", …). The field shape differs per transport (wire/http: `dataTypeOid`,
 *  neon-http: `dataTypeID`), so the OID is read through `oidOf`. Allocation-free when nothing defers. */
export function mergeUnknownCols<F>(cols: CodegenCol[], fields: readonly F[], oidOf: (f: F) => number): CodegenCol[] {
	for (let i = 0; i < cols.length; i++) {
		if (cols[i]!.oid !== 0) continue;
		return cols.map((c, j) => { // one deferred column -> resolve them all in a single pass
			if (c.oid !== 0) return c;
			const f = fields[j];
			return { ...c, oid: f === undefined ? 0 : oidOf(f) };
		});
	}
	return cols;
}
