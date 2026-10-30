// DECODE — everything that turns wire bytes into JS values, in four sections:
//   1. the default decoder catalog (config.types / jsonBigints land here) + PG array-literal parsing
//   2. the JIT engine: monomorphic new Function row/result-set mappers (compileRow/compileResultSet)
//   3. the interpreted engine: the same strategies as CellDecoder functions (pickDecoder) — kept
//      in exact parity with the JIT engine by the dual-variant suite
//   4. logical-replication binary-tuple decoders (start({ binary }))
// The encode direction lives in encode.ts.
//
// OPT #1 — latin1 for ASCII-guaranteed types: PostgreSQL's TEXT representation of int8, numeric,
// float, all temporal types, uuid and bytea(hex) is always ASCII (a subset of latin1). Decoding
// those via latin1Slice / toString('latin1') skips the UTF-8 multibyte scan that utf8Slice does, so
// it's faster while producing an identical string (ASCII bytes map 1:1 under both encodings).
// Types that can carry non-ASCII (text/varchar/bpchar/name/money/xml/json/jsonb, and anything routed
// to the helper closure) stay UTF-8 so unicode is preserved.
import type { Decoder } from './types.ts'
import { parseJsonBuffer } from './jsonparse.ts'
import { genJsonParsers, specNeedsWalk, buildJsonWalk, type JsonMarker, type JsonPlan, type JsTarget } from './json.ts'
import { extAt, extLeafFor, parseLineAbc, parseLineTuple } from './geo.ts'
import { customAt, customDelimFor, customLeafFor } from './registry.ts'

// ---------------------------------------------------------------------------------------------
// Section 1a: the DEFAULT DECODER CATALOG — plain (Buffer) => value decoders keyed by OID. This is
// the public override surface (config.types) and the fallback both engines consult for uncommon
// types. Deliberately minimal; the engines below carry the per-column fast paths.
// ---------------------------------------------------------------------------------------------
const asString: Decoder = (b) => b.toString('utf8')
const asNumber: Decoder = (b) => Number(b.toString('utf8'))
const asBool: Decoder = (b) => b[0] === 0x74 // 't'
const asJson: Decoder = (b) => JSON.parse(b.toString('utf8'))
const asBytea: Decoder = (b) => {
  const s = b.toString('utf8')
  return s.startsWith('\\x') ? Buffer.from(s.slice(2), 'hex') : Buffer.from(s, 'utf8')
}

/** OID -> decoder. Anything not listed (int8=20, numeric=1700, timestamps, arrays,
 *  uuid, ...) falls back to a UTF-8 string. */
export const defaultDecoders = new Map<number, Decoder>([
  [16, asBool],    // bool
  [17, asBytea],   // bytea
  [21, asNumber],  // int2
  [23, asNumber],  // int4
  [26, asNumber],  // oid
  [700, asNumber], // float4
  [701, asNumber], // float8
  [114, asJson],   // json
  [3802, asJson],  // jsonb
])

export type JsonBigints = 'number' | 'string' | 'bigint'

// Native JSON source-text reviver (ctx.source): recent V8 (Node 21+) and Bun. Preserves
// oversized integers by value (order-independent, so it works for jsonb too).
export const jsonSourceSupported: boolean = (() => {
  try { let ok = false; JSON.parse('{"x":1}', function (_k: string, v: unknown, ctx?: { source?: string }) { if (ctx && typeof ctx.source === 'string') ok = true; return v } as never); return ok } catch { return false }
})()
function bigintReviver(as: 'string' | 'bigint') {
  return (_k: string, v: unknown, ctx?: { source?: string }) =>
    typeof v === 'number' && Number.isInteger(v) && !Number.isSafeInteger(v) && ctx && typeof ctx.source === 'string' && /^-?\d+$/.test(ctx.source)
      ? (as === 'bigint' ? BigInt(ctx.source) : ctx.source) : v
}

// A JSON integer token of 16+ digits (one JSON.parse may round), checked with a native regex on the string
// built for JSON.parse anyway. The lookarounds skip fraction and exponent digits — a full-precision float
// like 0.30000000000000004 has a 16-digit run, and would otherwise send every float-heavy value down the
// slow path. Never a false negative: an integer token is never preceded by a digit, '.', 'e' or a sign
// other than its own '-'. A digit run inside a string can still match; that only costs the slow path.
const BIG_INT = /(?<![\d.eE+-])-?\d{16}(?!\d*[.eE])/ // no /g — stateless .test, safe to reuse

/** JSON text -> value with integers past 2^53 kept exact (as digit strings or BigInts, per `mode`). The
 *  common case (no big integer) is native JSON.parse; only flagged values pay the exact path: the
 *  source-text reviver, or the pure-JS buffer parser when ctx.source is unavailable. `b` is the same text
 *  as bytes when the caller already has them. */
function bigintJsonParser(mode: 'string' | 'bigint'): (s: string, b?: Buffer) => unknown {
  if (jsonSourceSupported) {
    const rev = bigintReviver(mode)
    return (s) => (BIG_INT.test(s) ? JSON.parse(s, rev as never) : JSON.parse(s))
  }
  return (s, b) => {
    if (!BIG_INT.test(s)) return JSON.parse(s)
    const buf = b ?? Buffer.from(s, 'utf8')
    return parseJsonBuffer(buf, 0, buf.length, mode)
  }
}

/** The json/jsonb decoder for a given jsonBigints mode. 'number' = plain native JSON.parse.
 *  'string'/'bigint' keep integers past 2^53 exact (see bigintJsonParser). Order-independent (covers
 *  jsonb). Only whole integers are preserved; high-precision *decimals* still need a declared
 *  Json({x:'numeric'}). */
export function jsonDecoder(mode: JsonBigints): Decoder {
  if (mode === 'number') return asJson
  const parse = bigintJsonParser(mode)
  return (b) => parse(b.toString('utf8'), b)
}

export function buildDecoders(overrides?: Record<number, Decoder>, jsonBigints: JsonBigints = 'number'): Map<number, Decoder> {
  if (!overrides && jsonBigints === 'number') return defaultDecoders
  const m = new Map(defaultDecoders)
  if (jsonBigints !== 'number') {
    const d = jsonDecoder(jsonBigints); m.set(114, d); m.set(3802, d)
    // json[]/jsonb[] elements too: the generic array path parses them with plain JSON.parse. A map entry
    // for an array OID takes precedence over that path in both mappers.
    const arr = parseArrayLiteral(bigintJsonParser(jsonBigints))
    const ad: Decoder = (b) => arr(b.toString('utf8')); m.set(199, ad); m.set(3807, ad)
  }
  if (overrides) for (const [oid, fn] of Object.entries(overrides)) m.set(Number(oid), fn)
  return m
}

export const decoderFor = (oid: number, map: Map<number, Decoder>): Decoder => map.get(oid) ?? asString

// Array type OID -> element type OID (pg_type.typelem; stable built-in OIDs). Shared with encode.ts.
export const ELEM_OID: Record<number, number> = {
  1000: 16, 1005: 21, 1007: 23, 1028: 26, 1016: 20, 1021: 700, 1022: 701, 1231: 1700, 791: 790,
  1009: 25, 1015: 1043, 1014: 1042, 1002: 18, 1003: 19, 199: 114, 3807: 3802, 1001: 17, 2951: 2950,
  1182: 1082, 1183: 1083, 1115: 1114, 1185: 1184, 1187: 1186, 629: 628, 1017: 600,
}

// ---------------------------------------------------------------------------------------------
// Section 1b: OUTPUT array decode — parse a PG '{…}' text literal into a JS array (shape-gated).
// ---------------------------------------------------------------------------------------------
// The inverse of encode.ts's arrayLiteral. Element leaves reproduce the SCALAR text-decode DEFAULTS
// (int8->BigInt, numeric->exact string, temporal->Date, bytea->Buffer) — NOT decoderFor(elemOid),
// which is asString for those.
type Leaf = (s: string) => unknown
const strLeaf: Leaf = (s) => s
const numLeaf: Leaf = (s) => Number(s)
const bigIntLeaf: Leaf = (s) => BigInt(s)
const boolLeaf: Leaf = (s) => s === 't'
const jsonLeaf: Leaf = (s) => JSON.parse(s)
const byteaLeaf: Leaf = (s) => (s.charCodeAt(0) === 92 && s.charCodeAt(1) === 120 ? Buffer.from(s.slice(2), 'hex') : Buffer.from(s, 'utf8')) // '\x' hex

/** ms-since-epoch from a PG temporal text element — a STRING port of the interpreted tsParse (same field parse,
 *  bare +00 offset, year<=99 fixup) so array Date values are bit-identical to the scalar timestamp path. */
function parseInstantMs(s: string): number {
  if (s === 'infinity' || s === '-infinity') return NaN // PG ±infinity has no JS Date -> Invalid Date (matches the binary scalar)
  let e = s.length, bc = false
  if (e >= 3 && s.charCodeAt(e - 1) === 67 && s.charCodeAt(e - 2) === 66 && s.charCodeAt(e - 3) === 32) { bc = true; e -= 3 } // strip a trailing ' BC'
  let p = 0
  let Y = 0; for (; p < e; p++) { const c = s.charCodeAt(p); if (c < 48 || c > 57) break; Y = Y * 10 + (c - 48) } p++
  const Mo = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48); p += 3
  const D = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48); p += 2
  let H = 0, Mi = 0, S = 0, ms = 0, off = 0
  if (p < e && s.charCodeAt(p) === 32) {
    p++
    H = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48); p += 3
    Mi = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48); p += 3
    S = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48); p += 2
    if (p < e && s.charCodeAt(p) === 46) { p++; let f = 0, k = 0; for (; p < e && k < 3; p++) { const c = s.charCodeAt(p); if (c < 48 || c > 57) break; f = f * 10 + (c - 48); k++ } while (k < 3) { f *= 10; k++ } ms = f; while (p < e) { const c = s.charCodeAt(p); if (c < 48 || c > 57) break; p++ } }
    if (p < e && (s.charCodeAt(p) === 43 || s.charCodeAt(p) === 45)) { const sg = s.charCodeAt(p) === 45 ? -1 : 1; p++; const th = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48); p += 2; let tm = 0, tsc = 0; if (p < e && s.charCodeAt(p) === 58) { p++; tm = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48); p += 2; if (p < e && s.charCodeAt(p) === 58) { p++; tsc = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48); p += 2 } } off = sg * ((th * 60 + tm) * 60 + tsc) * 1000 } // LMT offsets carry SECONDS (named tz, pre-standard/BC dates)
  }
  const year = bc ? 1 - Y : Y // PG 'N BC' -> proleptic/astronomical year 1-N (44 BC -> -43, 1 BC -> 0)
  let ems = Date.UTC(year, Mo - 1, D, H, Mi, S, ms)
  if (year >= 0 && year <= 99) { const d = new Date(ems); d.setUTCFullYear(year); ems = d.getTime() } // Date.UTC remaps 0-99 to 1900+
  return ems - off
}

/** Element OID (+ optional element :target) -> leaf decoder, mirroring the scalar pickText/defaultJs defaults. */
function elemLeafFor(elemOid: number, js?: string): Leaf {
  const cus = customLeafFor(elemOid, js) // defineType() element (sentinel oid; bare -> raw text)
  if (cus) return cus
  const ext = extLeafFor(elemOid, js) // point/line/vector element targets; bare -> raw text below
  if (ext) return ext
  switch (elemOid) {
    case 16: return boolLeaf                                          // bool -> boolean
    case 17: return byteaLeaf                                         // bytea -> Buffer
    case 20: return js === 'number' ? numLeaf : js === 'string' ? strLeaf : bigIntLeaf // int8 -> BigInt (default)
    case 21: case 23: case 26: case 700: case 701: return numLeaf     // int2/int4/oid/float4/float8 -> Number
    case 1700: return js === 'number' ? numLeaf : js === 'bigint' ? bigIntLeaf : strLeaf // numeric -> exact STRING (default); :bigint = integer-only contract (fractional throws)
    case 790: return js === 'number' ? numLeaf : strLeaf              // money -> exact STRING (default)
    case 114: case 3802: return jsonLeaf                             // json/jsonb -> JSON.parse
    case 1082: case 1114: case 1184: return js === 'ms' ? parseInstantMs : js === 'string' ? strLeaf : (s: string) => new Date(parseInstantMs(s)) // date/timestamp(tz) -> Date (default)
    default: return strLeaf                                           // text/varchar/bpchar/char/name/uuid/time/interval
  }
}

/** Parse a PG array text literal ('{…}') into a nested JS array (inverse of arrayLiteral). Honors nesting,
 *  empty {}, unquoted bare NULL -> null, quoted backslash-escaped elements, and a leading [lb:ub]= prefix.
 *  `delim` is the element type's typdelim — ',' for almost everything, but ':' for PostGIS
 *  geometry/geography and ';' for box, which emit '{a:b}' / '{a;b}'. */
export function parseArrayLiteral(decodeLeaf: Leaf, delim = ','): (text: string) => unknown[] {
  return (text) => {
    let i = 0
    if (text[0] === '[') { const eq = text.indexOf('='); if (eq >= 0) i = eq + 1 } // skip [lb:ub]= dimension prefix
    function arr(): unknown[] {
      const out: unknown[] = []
      i++ // consume '{'
      while (i < text.length) {
        const c = text[i]
        if (c === '}') { i++; break }
        if (c === delim) { i++; continue }
        if (c === '{') { out.push(arr()); continue } // nesting
        if (c === '"') { // quoted, backslash-escaped element
          i++; let s = ''
          while (i < text.length) { const ch = text[i]!; if (ch === '\\') { s += text[i + 1]; i += 2; continue } if (ch === '"') { i++; break } s += ch; i++ }
          out.push(decodeLeaf(s)); continue // a quoted "NULL" is the literal string
        }
        let j = i // unquoted -> read to the delimiter or '}'; a bare NULL is SQL null
        while (j < text.length && text[j] !== delim && text[j] !== '}') j++
        const raw = text.slice(i, j); i = j
        out.push(raw === 'NULL' ? null : decodeLeaf(raw))
      }
      return out
    }
    return arr()
  }
}

/** Whole-value Decoder for an array column, by ELEMENT type (works for extension elements whose
 *  array OID is per-database — the shape's declared element drives the decode). */
export function arrayDecoderForElem(elem: number | undefined, js?: string): Decoder {
  // Resolved here, not at the call sites, so every array path (shape/helper/interpreted) agrees.
  // Built-in box (603) is the only non-',' type in PG: box_out writes commas, so its arrays use ';'.
  const parse = elem === undefined
    ? parseArrayLiteral(strLeaf)
    : parseArrayLiteral(elemLeafFor(elem, js), elem === 603 ? ';' : customDelimFor(elem) ?? ',')
  return (b) => parse(b.toString('utf8'))
}
/** Same, keyed by a STATIC array OID (built-in types). */
export function arrayDecoderFor(arrayOid: number, js?: string): Decoder {
  return arrayDecoderForElem(ELEM_OID[arrayOid], js)
}

/**
 * Bind array parser to known array OIDs
 */
export function tagArrayCol(col: CodegenCol): CodegenCol {
  if (col.array || col.json) return col
  const elem = ELEM_OID[col.oid]
  return elem === undefined ? col : { ...col, array: { elem } }
}

// decode2 extends the JS-target set with temporal INSTANT targets: 'date' -> JS Date, 'ms' -> ms number.
export type Target = JsTarget | 'date' | 'ms'
/** A column to decode: name + wire OID, optional JS-target override, shaped-JSON marker, and the WIRE
 *  format the value arrives in ('text' default, or 'binary' when the query requested binary for it). */
export interface CodegenCol {
  name: string; oid: number; js?: Target; json?: JsonMarker; format?: 'text' | 'binary'; array?: { elem: number; js?: Target }
  path?: readonly string[]        // Collect() nesting path (ancestor group keys); absent/[] = top level
  groupNullable?: readonly boolean[] // per path segment: is that group a CollectNullable (auto-null) vs Collect (always object)?
  xform?: (v: unknown) => unknown  // Transform() decode-time fn (captured closure; runs on null too)
  xformId?: number                 // TransformMarker.id — for the mapper cache key only
  nullable?: boolean               // Nullable() inside a CollectNullable: excluded from the group's required-presence check
}

type AtDecoder = (b: Buffer, o: number, l: number) => unknown
const byteaAt: AtDecoder = (b, o, l) => { const s = b.toString('utf8', o, o + l); return s.startsWith('\\x') ? Buffer.from(s.slice(2), 'hex') : Buffer.from(s, 'utf8') }

const DEBUG = !!process.env.DRIZZLE_POSTGRES_CODEGEN_DEBUG

// utf8: the general slice (unicode-safe). latin1: faster, ONLY valid for ASCII-guaranteed bytes.
const HAS_UTF8_SLICE = typeof Buffer !== 'undefined' && typeof (Buffer.prototype as { utf8Slice?: unknown }).utf8Slice === 'function'
const HAS_LATIN1_SLICE = typeof Buffer !== 'undefined' && typeof (Buffer.prototype as { latin1Slice?: unknown }).latin1Slice === 'function'
const str = (from: string, to: string) => (HAS_UTF8_SLICE ? `b.utf8Slice(${from}, ${to})` : `b.toString('utf8', ${from}, ${to})`)
const lat = (from: string, to: string) => (HAS_LATIN1_SLICE ? `b.latin1Slice(${from}, ${to})` : `b.toString('latin1', ${from}, ${to})`)

// Wire OIDs whose text is guaranteed ASCII -> decode via latin1 (see OPT #1). Float is handled in the
// 'number' case (always ASCII). NOT money (locale currency), text/varchar/char/name (unicode), json.
// Common ASCII types — already inlined as 'string' by defaultJs: int8, numeric, all temporal, uuid.
const ASCII_COMMON = [20, 1700, 1082, 1083, 1114, 1184, 1186, 2950]
// Less-common ASCII types that v1 routes to the UTF-8 helper closure — v2 INLINES them as latin1
// (removes the per-cell subarray + closure call too): network, pg_lsn, timetz, bit, geometric, ranges.
const ASCII_EXTRA = [
  774, 829, 650, 869,                 // macaddr8, macaddr, cidr, inet
  1266, 1560, 1562, 3220,             // timetz, bit, varbit, pg_lsn
  600, 601, 602, 603, 604, 628, 718,  // point, lseg, path, box, polygon, line, circle
  3904, 3906, 3908, 3910, 3912, 3926, // ranges: int4, num, ts, tstz, date, int8
  4451, 4532, 4533, 4534, 4535, 4536, // multiranges: int4, num, ts, tstz, date, int8
]
export const ASCII_SAFE = new Set([...ASCII_COMMON, ...ASCII_EXTRA])

// OIDs whose BINARY result-format decode is materially faster than text (bench/per-type-decode.bench.ts):
// int2/int4/oid 1.6-1.8x, int8 4x, float8 4.6x, date/timestamp(tz) 6-10x, bytea 3.7x. A declared shape
// upgrades these columns to binary automatically. NOTE — for the int8:number target binary returns the exact
// stored value while text does a digit-parse, so a shaped query can differ from a plain one beyond 2^53;
// intentional (already-lossy). float4 is NOT here — it's conditional on the target (float4:precise -> binary
// exact f32; bare/:pretty -> text canonical), handled in shapeCols(). EXCLUDED: bool (tie), uuid (text 3.5x
// FASTER), text/varchar/char/name (tie), numeric/money (no binary decoder), json/jsonb (scanner parses text).
export const BINARY_FAST = new Set([21, 23, 26, 20, 701, 1082, 1114, 1184, 17])

// Read the int32 length prefix as a signed big-endian int straight from the four bytes.
const readLen = 'l = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4;'

// digit-parse straight from ASCII bytes -> JS number (no toString), for integer OIDs. int8 beyond
// 2^53 loses precision (accumulated in f64) — that's the accepted cost of `bigint:number` (ORM mode).
// >16 chars can exceed 15 significant digits, where per-step double rounding DRIFTS (int8 max came
// out 2000 off vs Number()'s single correct rounding) -> long values take the Number(text) path.
const intFromBytes = (v: string) => `{ if (l > 16) { ${v} = Number(${lat('o', 'o + l')}) } else { let p = o, s = false, x = 0; const e = o + l; if (b[p] === 45) { s = true; p++ } for (; p < e; p++) x = x * 10 + (b[p] - 48); ${v} = s ? -x : x } }`

// Exact powers of 10 (1e0..1e22) — all exactly representable in f64. Closed over by the compiled
// builder as `P` for the correctly-rounded fast path below.
const POW10 = [1, 10, 100, 1000, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22]

// OPT #2 — fast AND COMPLETELY PRECISE ASCII -> f64 (Clinger fast path). Parse the digits into an
// INTEGER significand (exact while ≤ 2^53, i.e. ≤ 15 significant digits) and apply a SINGLE multiply/
// divide by an EXACT power of 10 (|exp| ≤ 22): IEEE-754 guarantees that one operation is correctly
// rounded, so the result is bit-identical to Number(). Values outside the fast domain (>15 significant
// digits or |exp| > 22) fall back to Number(latin1) — also exact. No string allocation on the fast
// path. Used for float4/float8 and the numeric:number target (numeric's only loss is the inherent
// f64 rounding, which this reproduces exactly). NaN/±Infinity handled up front.
const f64FromBytes = (v: string) => `{ let p = o; const e = o + l; const c0 = b[p]; let neg = false;
    if (c0 === 45) { neg = true; p++ } else if (c0 === 43) { p++ }
    if (b[p] === 78 || b[p] === 110) { ${v} = NaN }
    else if (b[p] === 73 || b[p] === 105) { ${v} = neg ? -Infinity : Infinity }
    else {
      let sig = 0, nd = 0, fd = 0, dot = false, hard = false;
      for (; p < e; p++) { const c = b[p];
        if (c === 46) { dot = true; continue }
        if (c < 48 || c > 57) break;
        if (sig === 0 && c === 48) { if (dot) fd++; continue }
        if (nd < 15) { sig = sig * 10 + (c - 48); nd++; if (dot) fd++ } else { hard = true }
      }
      let exp = 0, es = 1;
      if (b[p] === 101 || b[p] === 69) { p++; if (b[p] === 45) { es = -1; p++ } else if (b[p] === 43) { p++ } for (; p < e; p++) { const c = b[p]; if (c < 48 || c > 57) break; exp = exp * 10 + (c - 48) } }
      const eff = es * exp - fd;
      if (hard || eff > 22 || eff < -22) { ${v} = Number(${lat('o', 'o + l')}) }
      else { const r = eff >= 0 ? sig * P[eff] : sig / P[-eff]; ${v} = neg ? -r : r }
    } }`

// OPT #3 — temporal INSTANT targets (opt-in via js 'date'/'ms'). Default stays the exact string
// (fastest + lossless). date/timestamp/timestamptz can map to a JS Date or epoch-ms number; naive
// (no-offset) values are treated as UTC, timestamptz applies its offset. Direct field parse from
// bytes -> Date.UTC (2-4x faster than new Date(text) AND correct — new Date parses no-tz as LOCAL).
// ms = first 3 fractional digits (micros truncated; Date is ms-only). Years < 100 / BC: use string.
export const INSTANT_OIDS = new Set([1082, 1114, 1184]) // date, timestamp, timestamptz
const tsFromBytes = (v: string, kind: 'date' | 'ms') => `{ let p = o, e = o + l;
      if (b[p] === 105 || (b[p] === 45 && b[p + 1] === 105)) { ${kind === 'date' ? `${v} = new Date(NaN)` : `${v} = NaN`} } else {
      let bc = false; if (l >= 3 && b[e - 1] === 67 && b[e - 2] === 66 && b[e - 3] === 32) { bc = true; e -= 3 }
      let Y = 0; for (; p < e; p++) { const c = b[p]; if (c < 48 || c > 57) break; Y = Y * 10 + (c - 48) } p++;
      const Mo = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 3;
      const D = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 2;
      let H = 0, Mi = 0, S = 0, ms = 0, off = 0;
      if (p < e && b[p] === 32) { p++;
        H = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 3;
        Mi = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 3;
        S = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 2;
        if (p < e && b[p] === 46) { p++; let f = 0, k = 0; for (; p < e && k < 3; p++) { const c = b[p]; if (c < 48 || c > 57) break; f = f * 10 + (c - 48); k++ } while (k < 3) { f *= 10; k++ } ms = f; while (p < e) { const c = b[p]; if (c < 48 || c > 57) break; p++ } }
        if (p < e && (b[p] === 43 || b[p] === 45)) { const sg = b[p] === 45 ? -1 : 1; p++; const th = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 2; let tm = 0, tsc = 0; if (p < e && b[p] === 58) { p++; tm = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 2; if (p < e && b[p] === 58) { p++; tsc = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 2 } } off = sg * ((th * 60 + tm) * 60 + tsc) * 1000 }
      }
      const yy = bc ? 1 - Y : Y;
      let ems = Date.UTC(yy, Mo - 1, D, H, Mi, S, ms); if (yy >= 0 && yy <= 99) { const dd = new Date(ems); dd.setUTCFullYear(yy); ems = dd.getTime() } ems -= off; ${kind === 'date' ? `${v} = new Date(ems)` : `${v} = ems`} } }`

// The natural JS target for a wire OID (before any per-column override).
export function defaultJs(oid: number): 'number' | 'string' | 'bool' | 'json' | 'bytea' | 'helper' {
  switch (oid) {
    case 16: return 'bool'
    case 17: return 'bytea'
    case 114: case 3802: return 'json'
    case 21: case 23: case 26: case 700: case 701: return 'number'   // int2/int4/oid + float4/float8 fit a JS number
    case 20: case 1700: case 790: return 'string'                    // int8/numeric/money -> exact string (avoid f64 loss)
    case 18: case 19: case 25: case 1042: case 1043: case 1082: case 1083: case 1114: case 1184: case 1186: case 2950: return 'string'
    // ASCII_EXTRA types (network/pg_lsn/timetz/bit/geometric/ranges) inline as latin1 strings instead
    // of routing to the UTF-8 helper; anything else (real arrays / unknown / custom) stays a helper.
    default: return ASCII_SAFE.has(oid) ? 'string' : 'helper'
  }
}
export const INT_OIDS = new Set([20, 21, 23, 26]) // int8/int2/int4/oid — digit-parseable straight to a number

// Inline decode expression for a column. ASCII-safe types use latin1; unicode-capable ones utf8.
// float4/float8 (and the numeric:number target) decode via the exact Clinger fast path (f64FromBytes).
function inlineSnippet(oid: number, v: string, js?: Target): [string, string] | null {
  if (!js && INSTANT_OIDS.has(oid)) js = 'date' // date/timestamp/timestamptz default to a JS Date (:string/:ms override)
  if (js === 'date' || js === 'ms') {
    if (INSTANT_OIDS.has(oid)) return [tsFromBytes(v, js), `temporal :${js}`]
    js = 'string' // :date/:ms on a non-instant type -> fall back to the exact string
  }
  if (js === 'bigint' || (!js && oid === 20)) return [`${v} = BigInt(${lat('o', 'o + l')})`, 'int8 bigint'] // int8/bigint -> BigInt
  if (oid === 700 && js !== 'string') { // float4: bare/:pretty -> canonical Number(text); :precise -> exact f32 (fround)
    const base = f64FromBytes(v)
    return js === 'precise' ? [`${base} ${v} = Math.fround(${v})`, 'float4 :precise'] : [base, 'float4 :pretty']
  }
  const eff = js ?? defaultJs(oid)
  switch (eff) {
    case 'number':
      if (INT_OIDS.has(oid)) return [intFromBytes(v), js ? 'int<-bytes :number' : 'int<-bytes'] // int digit-parse
      return [f64FromBytes(v), js ? 'f64<-bytes :number' : 'float<-bytes']                       // exact fast f64 parse
    case 'string': {
      const ascii = ASCII_SAFE.has(oid)
      return [`${v} = ${(ascii ? lat : str)('o', 'o + l')}`, (js ? 'string :string' : 'string') + (ascii ? ' (latin1)' : '')]
    }
    case 'latin1': return [`${v} = ${lat('o', 'o + l')}`, 'string :latin1'] // caller asserts ASCII/latin1 (e.g. email)
    case 'bool': return [`${v} = b[o] === 116`, 'bool']
    case 'json': return [`${v} = JSON.parse(${str('o', 'o + l')})`, 'json'] // JSON text may contain unicode -> utf8
    case 'bytea': return [`{ const s = ${lat('o', 'o + l')}; ${v} = s.charCodeAt(0) === 92 && s.charCodeAt(1) === 120 ? Buffer.from(s.slice(2), 'hex') : Buffer.from(s, 'utf8') }`, 'bytea (latin1)'] // hex text is ASCII
    default: return null // helper closure (the `d` array)
  }
}

// OPT #4 — BINARY wire format (opt-in per column, for ORM flows that know columns upfront and request
// format code 1). PostgreSQL sends the raw fixed-width representation, so decode is a direct read (no
// text parsing) AND the server skips string formatting. Big win for float8 (readDoubleBE = exact),
// int8, timestamp (int64 µs since 2000 -> the integer directly), bytea. numeric/arrays/json/jsonb are
// NOT supported in binary (complex format, or no benefit) — request text. uuid works but text is faster
// (PG ships it pre-formatted), so prefer text there too. `js` still picks date/epoch/number.
const PG_EPOCH_MS = 946684800000 // 2000-01-01 UTC in unix ms
// int64 read, NO BigInt: signed hi from a manual shift, unsigned lo (>>> 0), value = hi*2^32 + lo.
// Exact for |value| < 2^53 (int8 magnitudes below that, timestamp µs until ~year 2255).
const RD64 = 'const hi = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3], lo = ((b[o + 4] << 24) | (b[o + 5] << 16) | (b[o + 6] << 8) | b[o + 7]) >>> 0'
function binarySnippet(oid: number, v: string, js?: Target): [string, string] | null {
  switch (oid) {
    case 16: return [`${v} = b[o] === 1`, 'bool bin']
    case 21: return [`${v} = b.readInt16BE(o)`, 'int2 bin']
    case 23: return [`${v} = b.readInt32BE(o)`, 'int4 bin']
    case 26: return [`${v} = b.readUInt32BE(o)`, 'oid bin']
    case 20: return js === 'number'
      ? [`{ ${RD64}; ${v} = hi * 4294967296 + lo }`, 'int8 bin :number']
      : js === 'string'
      // exact decimal string with NO BigInt for the common case (|v| < 2^53); BigInt only for the rest
      ? [`{ ${RD64}; const n = hi * 4294967296 + lo; ${v} = (n >= -9007199254740991 && n <= 9007199254740991) ? '' + n : b.readBigInt64BE(o).toString() }`, 'int8 bin string']
      : [`${v} = b.readBigInt64BE(o)`, 'int8 bin bigint'] // default -> BigInt
    case 700: return [`${v} = b.readFloatBE(o)`, 'float4 bin']
    case 701: return [`${v} = b.readDoubleBE(o)`, 'float8 bin (exact)']
    case 1114: case 1184: { // timestamp/timestamptz: int64 µs since 2000-01-01 (no BigInt). Default -> Date.
      const ms = `Math.floor((hi * 4294967296 + lo) / 1000) + ${PG_EPOCH_MS}`
      return js === 'ms' ? [`{ ${RD64}; ${v} = ${ms} }`, 'timestamp bin :ms'] : [`{ ${RD64}; ${v} = new Date(${ms}) }`, 'timestamp bin :date']
    }
    case 1082: { // date: int32 days since 2000-01-01. Default -> Date.
      const ms = `b.readInt32BE(o) * 86400000 + ${PG_EPOCH_MS}`
      return js === 'ms' ? [`${v} = ${ms}`, 'date bin :ms'] : [`${v} = new Date(${ms})`, 'date bin :date']
    }
    // NOTE: binary uuid must BUILD the 36-char string from 16 bytes, whereas TEXT ships it pre-formatted
    // (one slice) — so text uuid is ~3x (JSC) / ~7x (V8) faster. Request text for uuid strings; use binary
    // only if you want the raw 16 bytes. (A hex-LUT build measured slower than toString('hex') here.)
    case 2950: return [`{ const h = b.toString('hex', o, o + 16); ${v} = h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32) }`, 'uuid bin']
    case 17: return [`{ const c = Buffer.allocUnsafe(l); b.copy(c, 0, o, o + l); ${v} = c }`, 'bytea bin']  // raw bytes, no hex decode
    case 18: case 19: case 25: case 1042: case 1043: return [`${v} = ${str('o', 'o + l')}`, 'text bin'] // binary text == utf8 bytes
    // json/jsonb deliberately NOT supported in binary: `json` is stored as text and `jsonb` re-serializes
    // to text on send (binary just adds a version byte) — binary saves nothing on either side. Use text.
    default: return null // no inline binary decoder (numeric, arrays, json/jsonb) — request text format
  }
}

function helperFor(oid: number, map: Map<number, Decoder>): AtDecoder {
  if (oid === 17 && map.get(17) === defaultDecoders.get(17)) return byteaAt
  const dec = decoderFor(oid, map)
  return (b, o, l) => dec(b.subarray(o, o + l))
}
/** Helper decoder for a column: an array column ('{…}' text) decodes via arrayDecoderFor with its element
 *  target — UNLESS the user overrode that array OID via config.types (map.has), which wins in both mappers
 *  (interpreted checks the override first). Every scalar column keeps the OID-keyed helperFor path. */
function helperForCol(col: CodegenCol, map: Map<number, Decoder>): AtDecoder {
  if (col.array && !map.has(col.oid)) { const dec = arrayDecoderForElem(col.array.elem, col.array.js); return (b, o, l) => dec(b.subarray(o, o + l)) }
  if (!map.has(col.oid)) { const cus = customAt(col); if (cus) return cus } // defineType() columns (config.types override wins)
  if (!map.has(col.oid)) { const ext = extAt(col); if (ext) return ext } // point / pgvector shape columns
  return helperFor(col.oid, map)
}

const NO_CUSTOM = new Set<number>()
function customOidsOf(map: Map<number, Decoder>): Set<number> {
  if (map === defaultDecoders) return NO_CUSTOM
  const s = new Set<number>()
  for (const [oid, fn] of map) if (fn !== defaultDecoders.get(oid)) s.add(oid)
  return s
}

function jsonPrep(cols: CodegenCol[]): { header: string; plan: Map<JsonMarker, JsonPlan> } {
  const markers = cols.filter((c) => c.json).map((c) => c.json!)
  if (!markers.length) return { header: '', plan: new Map() }
  const { plan } = genJsonParsers(markers)
  // the cursor (jb/jp/je) is declared block-locally at each column site (below), not once at function
  // scope — block locals are register-allocated better by V8, worth it in the hot per-field loop.
  return { header: '', plan }
}

function columnLines(out: string[], col: CodegenCol, i: number, ind: string, helperCols: CodegenCol[], plan: Map<JsonMarker, JsonPlan>, custom: Set<number>, xforms: Array<(v: unknown) => unknown>): void {
  const v = `v${i}`
  if (col.format === 'binary') { // BINARY wire: direct fixed-width read (still length-prefixed; -1 = NULL)
    const bin = binarySnippet(col.oid, v, col.js)
    if (!bin) throw new Error(`decode2: no binary decoder for oid ${col.oid} (request text format for this column)`)
    if (DEBUG) out.push(`${ind}// ${JSON.stringify(col.name)} oid=${col.oid} binary (${bin[1]})`)
    out.push(`${ind}${readLen} let ${v} = null;`)
    out.push(`${ind}if (l !== -1) { ${bin[0]}; o += l }`)
    return
  }
  if (col.json) {
    const pl = plan.get(col.json)!
    if (DEBUG) out.push(`${ind}// ${JSON.stringify(col.name)} (${pl.fast ? 'json fast: JSON.parse' : `json shaped: positional ${col.json.type}`})`)
    out.push(`${ind}${readLen} let ${v} = null;`)
    out.push(pl.fast
      ? `${ind}if (l !== -1) { ${v} = JSON.parse(${str('o', 'o + l')}); o += l }`
      : `${ind}if (l !== -1) { let jb = b, jp = o, je = o + l; ${pl.inline(v)} o += l }`)
    if (pl.transformWalk) { const k = xforms.length; xforms.push(pl.transformWalk); out.push(`${ind}${v} = X[${k}](${v});`) } // json-field Transform: visit the decoded value
    return
  }
  const inl = (col.array || custom.has(col.oid)) ? null : inlineSnippet(col.oid, v, col.js) // array cols always route to the helper
  const kind = inl ? inl[1] : col.array ? `${col.oid} array[]` : 'helper'
  if (DEBUG) out.push(`${ind}// ${JSON.stringify(col.name)} oid=${col.oid}${col.js ? ' :' + col.js : ''} (${kind})`)
  out.push(`${ind}${readLen} let ${v} = null;`)
  if (inl) out.push(`${ind}if (l !== -1) { ${inl[0]}; o += l }`)
  else { const hi = helperCols.length; helperCols.push(col); out.push(`${ind}if (l !== -1) { ${v} = d[${hi}](b, o, l); o += l }`) }
}

const litKey = (k: string) => (k === '__proto__' ? '["__proto__"]' : JSON.stringify(k)) // __proto__ as a computed key (no prototype pollution)

/** Value expr for column i: `X[k](v_i)` when it has a Transform (SKIPPED for NULL cells — null stays null), else the raw temp `v_i`. */
function colVal(col: CodegenCol, i: number, xforms: Array<(v: unknown) => unknown>): string {
  if (!col.xform) return `v${i}`
  const k = xforms.length; xforms.push(col.xform); return `(v${i} === null ? null : X[${k}](v${i}))`
}

/** Build a (possibly nested) object literal from ordered cols with `path` nesting (Collect groups). A group
 *  auto-nulls when any REQUIRED (non-nullable) leaf's RAW temp is null, or (all-Nullable groups) when EVERY field is null. The root never nulls. */
function buildObjectLiteral(cols: CodegenCol[], xforms: Array<(v: unknown) => unknown>): string {
  type Node = { leaves: Array<{ key: string; i: number; col: CodegenCol }>; groups: Array<{ key: string; node: Node }>; nullable: boolean }
  const root: Node = { leaves: [], groups: [], nullable: false }
  cols.forEach((c, i) => {
    let node = root
    const gn = c.groupNullable ?? []
    ;(c.path ?? []).forEach((seg, depth) => { let g = node.groups.find((x) => x.key === seg); if (!g) { g = { key: seg, node: { leaves: [], groups: [], nullable: gn[depth] ?? false } }; node.groups.push(g) } node = g.node })
    node.leaves.push({ key: c.name, i, col: c })
  })
  function body(node: Node): string {
    const parts = node.leaves.map((l) => `${litKey(l.key)}: ${colVal(l.col, l.i, xforms)}`)
    for (const g of node.groups) parts.push(`${litKey(g.key)}: ${group(g.node)}`)
    return `{ ${parts.join(', ')} }`
  }
  function allIdx(node: Node): number[] { // every descendant column index of a group
    const out = node.leaves.map((l) => l.i)
    for (const g of node.groups) out.push(...allIdx(g.node))
    return out
  }
  function group(node: Node): string {
    const b = body(node)
    if (!node.nullable) return b // Collect: ALWAYS an object (a LEFT-JOIN miss yields null fields, not a null group)
    // CollectNullable: null the whole group on a miss — any required leaf null, or (all-Nullable) every field null
    const req = node.leaves.filter((l) => !l.col.nullable)
    if (req.length) return `(${req.map((l) => `v${l.i} === null`).join(' || ')}) ? null : ${b}`
    const all = allIdx(node)
    return all.length ? `(${all.map((i) => `v${i} === null`).join(' && ')}) ? null : ${b}` : b
  }
  return body(root)
}
const buildArrayLiteral = (cols: CodegenCol[], xforms: Array<(v: unknown) => unknown>): string =>
  '[' + cols.map((c, i) => colVal(c, i, xforms)).join(', ') + ']'

/** The row's return literal for the mode. Collect nesting requires object mode. */
function rowLiteral(cols: CodegenCol[], mode: 'array' | 'object', xforms: Array<(v: unknown) => unknown>): string {
  if (mode === 'array') {
    if (cols.some((c) => c.path)) throw new Error('@drizzle-team/postgres: Collect() produces a nested object — use object mode (mode:"array" cannot nest)')
    return buildArrayLiteral(cols, xforms)
  }
  return buildObjectLiteral(cols, xforms)
}

export type RowBuilder = ((body: Buffer) => unknown) & { source: string }

export function rowBuilderSource(cols: CodegenCol[], mode: 'array' | 'object', custom: Set<number> = NO_CUSTOM): { source: string; helperCols: CodegenCol[]; xforms: Array<(v: unknown) => unknown> } {
  const helperCols: CodegenCol[] = []
  const xforms: Array<(v: unknown) => unknown> = []
  const { header, plan } = jsonPrep(cols)
  const lines = ['  let o = 2, l;']
  for (let i = 0; i < cols.length; i++) columnLines(lines, cols[i]!, i, '  ', helperCols, plan, custom, xforms)
  const ret = '  return ' + rowLiteral(cols, mode, xforms) + ';'
  return { source: `function row(b) {\n  "use strict";${header}\n${lines.join('\n')}\n${ret}\n}`, helperCols, xforms }
}

export function resultSetSource(cols: CodegenCol[], mode: 'array' | 'object', custom: Set<number> = NO_CUSTOM): { source: string; helperCols: CodegenCol[]; xforms: Array<(v: unknown) => unknown> } {
  const helperCols: CodegenCol[] = []
  const xforms: Array<(v: unknown) => unknown> = []
  const { header, plan } = jsonPrep(cols)
  const decode: string[] = []
  for (let i = 0; i < cols.length; i++) columnLines(decode, cols[i]!, i, '    ', helperCols, plan, custom, xforms)
  const assign = '    res[i] = ' + rowLiteral(cols, mode, xforms) + ';'
  const source = [
    'function rows(arr) {',
    '  "use strict";',
    '  const n = arr.length, res = new Array(n);',
    header,
    '  for (let i = 0; i < n; i++) {',
    '    const b = arr[i]; let o = 2, l;',
    ...decode,
    assign,
    '  }',
    '  return res;',
    '}',
  ].filter((x) => x !== '').join('\n')
  return { source, helperCols, xforms }
}

// Virtual filename for each compiled mapper: with `//# sourceURL=` appended to the evaluated
// text, runtime stack traces name THIS mapper (postgres-mapper-3.object.id_name.js:7:120) instead
// of the opaque new Function eval site. The generated code itself is on fn.source /
// result.debug.mapperSource / DRIZZLE_POSTGRES_CODEGEN_DEBUG=1 (virtual line = source line + 3: the
// Function constructor prepends its 2-line wrapper plus the `return (` line).
let mapperSeq = 0
function mapperSrcName(cols: CodegenCol[], mode: string): string {
  const names = cols.map((c) => c.name).join('_').replace(/[^\w-]+/g, '').slice(0, 40) || 'cols'
  return `postgres-mapper-${++mapperSeq}.${mode}.${names}.js`
}

/** Compile a cached, monomorphic single-row builder (v2). */
export function compileRow(cols: CodegenCol[], mode: 'array' | 'object', map: Map<number, Decoder>): RowBuilder {
  const { source, helperCols, xforms } = rowBuilderSource(cols, mode, customOidsOf(map))
  const helpers = helperCols.map((col) => helperForCol(col, map))
  const srcName = mapperSrcName(cols, mode)
  if (DEBUG) console.error(`\n[Drizzle Postgres decode2] ${mode} builder ${srcName} for (${cols.map((c) => c.name).join(', ')}):\n${source}\n`)
  const fn = new Function('d', 'P', 'X', `return (${source})\n//# sourceURL=${srcName}`)(helpers, POW10, xforms) as RowBuilder
  Object.defineProperty(fn, 'source', { value: source, enumerable: false })
  Object.defineProperty(fn, 'sourceName', { value: srcName, enumerable: false })
  return fn
}

export type ResultSetMapper = ((rows: Buffer[]) => unknown[]) & { source: string }

/** Compile a cached, monomorphic WHOLE-RESULT-SET mapper (v2). */
export function compileResultSet(cols: CodegenCol[], mode: 'array' | 'object', map: Map<number, Decoder>): ResultSetMapper {
  const { source, helperCols, xforms } = resultSetSource(cols, mode, customOidsOf(map))
  const helpers = helperCols.map((col) => helperForCol(col, map))
  const srcName = mapperSrcName(cols, mode)
  if (DEBUG) console.error(`\n[Drizzle Postgres decode2] ${mode} result-set mapper ${srcName} for (${cols.map((c) => c.name).join(', ')}):\n${source}\n`)
  const fn = new Function('d', 'P', 'X', `return (${source})\n//# sourceURL=${srcName}`)(helpers, POW10, xforms) as ResultSetMapper
  Object.defineProperty(fn, 'source', { value: source, enumerable: false })
  Object.defineProperty(fn, 'sourceName', { value: srcName, enumerable: false })
  return fn
}

// ---------------------------------------------------------------------------------------------
// Section 3: the INTERPRETED engine — the function-form of every strategy the JIT emits as inlined
// code, as pre-selected per-column CellDecoders driven by a per-row loop. pickDecoder() mirrors the
// JIT dispatch exactly (validated by the dual-variant suite against real Postgres).
// ---------------------------------------------------------------------------------------------
/** Decode a cell in place from (buffer, offset, length) — no per-cell subarray. */
export type CellDecoder = (b: Buffer, o: number, l: number) => unknown

type Sliceable = Buffer & { utf8Slice(s: number, e: number): string; latin1Slice(s: number, e: number): string }
const HAS_UTF8 = typeof Buffer !== 'undefined' && typeof (Buffer.prototype as Partial<Sliceable>).utf8Slice === 'function'
const HAS_LAT1 = typeof Buffer !== 'undefined' && typeof (Buffer.prototype as Partial<Sliceable>).latin1Slice === 'function'
const utf8 = HAS_UTF8 ? (b: Buffer, o: number, l: number) => (b as Sliceable).utf8Slice(o, o + l) : (b: Buffer, o: number, l: number) => b.toString('utf8', o, o + l)
const lat1 = HAS_LAT1 ? (b: Buffer, o: number, l: number) => (b as Sliceable).latin1Slice(o, o + l) : (b: Buffer, o: number, l: number) => b.toString('latin1', o, o + l)

// ---- TEXT strategies (mirror decode2 inlineSnippet) ----
const txtUtf8: CellDecoder = (b, o, l) => utf8(b, o, l)
const txtLatin1: CellDecoder = (b, o, l) => lat1(b, o, l)
const txtBool: CellDecoder = (b, o) => b[o] === 116
const txtJson: CellDecoder = (b, o, l) => JSON.parse(utf8(b, o, l))
const txtBytea: CellDecoder = (b, o, l) => { const s = lat1(b, o, l); return s.charCodeAt(0) === 92 && s.charCodeAt(1) === 120 ? Buffer.from(s.slice(2), 'hex') : Buffer.from(s, 'utf8') }
// digit-parse straight from ASCII bytes -> JS number (int2/int4/oid, and int8/bigint:number)
// long values (>16 chars, can exceed 15 significant digits) go through Number(): per-step double
// rounding in the digit loop DRIFTS on 19-digit int8s, Number rounds once, correctly
const txtInt: CellDecoder = (b, o, l) => { if (l > 16) return Number(lat1(b, o, l)); let p = o, s = false, x = 0; const e = o + l; if (b[o] === 45) { s = true; p++ } for (; p < e; p++) x = x * 10 + (b[p]! - 48); return s ? -x : x }
const txtBigInt: CellDecoder = (b, o, l) => BigInt(lat1(b, o, l)) // int8/bigint -> exact JS BigInt

// (POW10 shared with the JIT section above)
const txtF64: CellDecoder = (b, o, l) => {
  let p = o; const e = o + l; const c0 = b[p]!; let neg = false
  if (c0 === 45) { neg = true; p++ } else if (c0 === 43) p++
  if (b[p] === 78 || b[p] === 110) return NaN
  if (b[p] === 73 || b[p] === 105) return neg ? -Infinity : Infinity
  let sig = 0, nd = 0, fd = 0, dot = false, hard = false
  for (; p < e; p++) { const c = b[p]!; if (c === 46) { dot = true; continue } if (c < 48 || c > 57) break; if (sig === 0 && c === 48) { if (dot) fd++; continue } if (nd < 15) { sig = sig * 10 + (c - 48); nd++; if (dot) fd++ } else hard = true }
  let exp = 0, es = 1
  if (b[p] === 101 || b[p] === 69) { p++; if (b[p] === 45) { es = -1; p++ } else if (b[p] === 43) p++; for (; p < e; p++) { const c = b[p]!; if (c < 48 || c > 57) break; exp = exp * 10 + (c - 48) } }
  const eff = es * exp - fd
  if (hard || eff > 22 || eff < -22) return Number(lat1(b, o, l))
  const r = eff >= 0 ? sig * POW10[eff]! : sig / POW10[-eff]!
  return neg ? -r : r
}
const txtF4Precise: CellDecoder = (b, o, l) => Math.fround(txtF64(b, o, l) as number) // float4:precise -> exact stored f32

// temporal :date/:ms (direct field parse -> Date.UTC; naive = UTC, tz applies offset; micros -> ms).
// Mirrors parseInstantMs exactly: ±infinity -> NaN, trailing ' BC' -> astronomical year 1-N.
function tsParse(b: Buffer, o: number, l: number): number {
  if (b[o] === 105 || (b[o] === 45 && b[o + 1] === 105)) return NaN // 'infinity' / '-infinity'
  let p = o; let e = o + l
  let bc = false
  if (l >= 3 && b[e - 1] === 67 && b[e - 2] === 66 && b[e - 3] === 32) { bc = true; e -= 3 } // strip ' BC'
  let Y = 0; for (; p < e; p++) { const c = b[p]!; if (c < 48 || c > 57) break; Y = Y * 10 + (c - 48) } p++
  const Mo = (b[p]! - 48) * 10 + (b[p + 1]! - 48); p += 3
  const D = (b[p]! - 48) * 10 + (b[p + 1]! - 48); p += 2
  let H = 0, Mi = 0, S = 0, ms = 0, off = 0
  if (p < e && b[p] === 32) {
    p++
    H = (b[p]! - 48) * 10 + (b[p + 1]! - 48); p += 3
    Mi = (b[p]! - 48) * 10 + (b[p + 1]! - 48); p += 3
    S = (b[p]! - 48) * 10 + (b[p + 1]! - 48); p += 2
    if (p < e && b[p] === 46) { p++; let f = 0, k = 0; for (; p < e && k < 3; p++) { const c = b[p]!; if (c < 48 || c > 57) break; f = f * 10 + (c - 48); k++ } while (k < 3) { f *= 10; k++ } ms = f; while (p < e) { const c = b[p]!; if (c < 48 || c > 57) break; p++ } }
    if (p < e && (b[p] === 43 || b[p] === 45)) { const sg = b[p] === 45 ? -1 : 1; p++; const th = (b[p]! - 48) * 10 + (b[p + 1]! - 48); p += 2; let tm = 0, tsc = 0; if (p < e && b[p] === 58) { p++; tm = (b[p]! - 48) * 10 + (b[p + 1]! - 48); p += 2; if (p < e && b[p] === 58) { p++; tsc = (b[p]! - 48) * 10 + (b[p + 1]! - 48); p += 2 } } off = sg * ((th * 60 + tm) * 60 + tsc) * 1000 }
  }
  const year = bc ? 1 - Y : Y // PG 'N BC' -> astronomical year 1-N (44 BC -> -43, 1 BC -> 0)
  let ems = Date.UTC(year, Mo - 1, D, H, Mi, S, ms)
  if (year >= 0 && year <= 99) { const d = new Date(ems); d.setUTCFullYear(year); ems = d.getTime() } // Date.UTC remaps years 0-99 to 1900+Y; undo it BEFORE applying the tz offset
  return ems - off
}
const tsDate: CellDecoder = (b, o, l) => new Date(tsParse(b, o, l))
const tsEpoch: CellDecoder = (b, o, l) => tsParse(b, o, l)

// ---- BINARY strategies (mirror the JIT binarySnippet; PG_EPOCH_MS shared above) ----
const rd64 = (b: Buffer, o: number) => { const hi = (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!, lo = ((b[o + 4]! << 24) | (b[o + 5]! << 16) | (b[o + 6]! << 8) | b[o + 7]!) >>> 0; return hi * 4294967296 + lo }
const binBool: CellDecoder = (b, o) => b[o] === 1
const binInt2: CellDecoder = (b, o) => b.readInt16BE(o)
const binInt4: CellDecoder = (b, o) => b.readInt32BE(o)
const binOid: CellDecoder = (b, o) => b.readUInt32BE(o)
const binFloat4: CellDecoder = (b, o) => b.readFloatBE(o)
const binFloat8: CellDecoder = (b, o) => b.readDoubleBE(o)
const binInt8Num: CellDecoder = (b, o) => rd64(b, o)
const binInt8Str: CellDecoder = (b, o) => { const n = rd64(b, o); return n >= -9007199254740991 && n <= 9007199254740991 ? '' + n : b.readBigInt64BE(o).toString() }
const binInt8BigInt: CellDecoder = (b, o) => b.readBigInt64BE(o)
const binTsEpoch: CellDecoder = (b, o) => Math.floor(rd64(b, o) / 1000) + PG_EPOCH_MS
const binTsDate: CellDecoder = (b, o) => new Date(Math.floor(rd64(b, o) / 1000) + PG_EPOCH_MS)
const binDateEpoch: CellDecoder = (b, o) => b.readInt32BE(o) * 86400000 + PG_EPOCH_MS
const binDateDate: CellDecoder = (b, o) => new Date(b.readInt32BE(o) * 86400000 + PG_EPOCH_MS)
const binBytea: CellDecoder = (b, o, l) => { const c = Buffer.allocUnsafe(l); b.copy(c, 0, o, o + l); return c }
const binUuid: CellDecoder = (b, o) => { const h = b.toString('hex', o, o + 16); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32) }
const binText: CellDecoder = (b, o, l) => utf8(b, o, l)

const wrap = (d: Decoder): CellDecoder => (b, o, l) => d(b.subarray(o, o + l)) // public (buf)=>value override -> offset form

function pickBinary(oid: number, js?: Target): CellDecoder {
  switch (oid) {
    case 16: return binBool
    case 21: return binInt2
    case 23: return binInt4
    case 26: return binOid
    case 20: return js === 'number' ? binInt8Num : js === 'string' ? binInt8Str : binInt8BigInt // default -> BigInt
    case 700: return binFloat4
    case 701: return binFloat8
    case 1114: case 1184: return js === 'ms' ? binTsEpoch : binTsDate // default -> Date
    case 1082: return js === 'ms' ? binDateEpoch : binDateDate
    case 2950: return binUuid
    case 17: return binBytea
    case 18: case 19: case 25: case 1042: case 1043: return binText
    default: throw new Error(`@drizzle-team/postgres: no binary decoder for oid ${oid} (request text format for this column)`)
  }
}

// text strategy for an oid+target; null = "use the helper/map decoder" (uncommon/unknown types)
function pickText(oid: number, js?: Target): CellDecoder | null {
  if (!js && INSTANT_OIDS.has(oid)) js = 'date' // date/timestamp/timestamptz default to a JS Date (:string/:ms override)
  if (js === 'date' || js === 'ms') { if (INSTANT_OIDS.has(oid)) return js === 'date' ? tsDate : tsEpoch; js = 'string' }
  if (js === 'bigint' || (!js && oid === 20)) return txtBigInt // int8/bigint default to a JS BigInt (:number/:string override)
  if (oid === 700 && js !== 'string') { if (js === 'precise') return txtF4Precise; js = undefined } // float4: :precise -> fround; bare/:pretty -> Number (canonical)
  const eff = js ?? defaultJs(oid)
  switch (eff) {
    case 'number': return INT_OIDS.has(oid) ? txtInt : txtF64
    case 'string': return ASCII_SAFE.has(oid) ? txtLatin1 : txtUtf8
    case 'latin1': return txtLatin1 // caller asserts ASCII/latin1 (e.g. email) -> skip the utf8 scan
    case 'bool': return txtBool
    case 'json': return txtJson
    case 'bytea': return txtBytea
    default: return null // helper closure
  }
}

/** Resolve the CellDecoder for a column, mirroring decode2's dispatch exactly. */
export function pickDecoder(col: CodegenCol, map: Map<number, Decoder>): CellDecoder {
  if (col.format === 'binary') return pickBinary(col.oid, col.js)
  if (col.json) {
    // shaped json in the no-eval path: JSON.parse (respects jsonBigints via the map's json decoder), then
    // a temporal post-parse walk to match the jit scanner's :ms/:date output. Exact bigint/numeric
    // precision beyond JSON.parse stays a jit-only / jsonBigints concern (documented).
    const base = wrap(decoderFor(col.oid, map))
    if (!specNeedsWalk(col.json.spec)) return base
    const walk = buildJsonWalk(col.json)
    return (b, o, l) => walk(base(b, o, l))
  }
  // a custom (config.types) override always wins — decode2 routes these to its helper too
  if (map !== defaultDecoders) { const d = map.get(col.oid); if (d && d !== defaultDecoders.get(col.oid)) return wrap(d) }
  if (col.array) { const dec = arrayDecoderForElem(col.array.elem, col.array.js); return (b, o, l) => dec(b.subarray(o, o + l)) } // '{…}' text -> JS array (BEFORE customAt/extAt: array cols carry the element's sentinel as col.oid)
  const cus = customAt(col); if (cus) return cus // defineType() columns (config.types override handled above)
  const ext = extAt(col); if (ext) return ext // point / pgvector shape columns
  return pickText(col.oid, col.js) ?? wrap(decoderFor(col.oid, map))
}

// ---- Logical-replication BINARY tuples (`repl.start({ binary: true })`) --------------------------------
// With pgoutput's `binary 'true'` the publisher sends every column whose type has a send function in
// BINARY — the driver must decode it or fail loudly (there's no per-column opt-out). Coverage below =
// pickBinary's set + numeric (exact string), json/jsonb (the map's json decoder, so jsonBigints applies;
// jsonb strips its 1-byte version), and arrays (array_recv wire format -> a real JS array — richer than
// text mode's raw '{…}' string, documented on the option). Unsupported oid -> null; the caller errors
// with table.column when a binary value actually arrives for it.

// numeric binary: u16 ndigits, i16 weight (base-10000 exponent of digits[0]), u16 sign, u16 dscale,
// then ndigits × u16 base-10000 groups. Rendered to the EXACT text PG would emit (same digits, dscale).
const binNumericStr: CellDecoder = (b, o) => {
  const nd = b.readUInt16BE(o), weight = b.readInt16BE(o + 2), sign = b.readUInt16BE(o + 4), dscale = b.readUInt16BE(o + 6)
  if (sign === 0xc000) return 'NaN'
  if (sign === 0xd000) return 'Infinity'
  if (sign === 0xf000) return '-Infinity'
  let s = sign === 0x4000 ? '-' : ''
  if (weight < 0 || nd === 0) s += '0'
  else for (let i = 0; i <= weight; i++) { const d = i < nd ? b.readUInt16BE(o + 8 + i * 2) : 0; s += i === 0 ? String(d) : String(d).padStart(4, '0') }
  if (dscale > 0) {
    let frac = ''
    for (let g = 0; frac.length < dscale; g++) {
      const i = weight + 1 + g
      frac += i >= 0 && i < nd ? String(b.readUInt16BE(o + 8 + i * 2)).padStart(4, '0') : '0000'
    }
    s += '.' + frac.slice(0, dscale)
  }
  return s
}

// array_recv: i32 ndim, i32 hasnull, i32 elemOid, ndim × (i32 len, i32 lbound), then row-major cells
// (i32 len | -1 null, bytes). Nested per dims.
const binArrayWith = (elem: CellDecoder): CellDecoder => (b, o) => {
  const ndim = b.readInt32BE(o)
  if (ndim === 0) return []
  let p = o + 12
  const dims: number[] = new Array(ndim)
  for (let d = 0; d < ndim; d++) { dims[d] = b.readInt32BE(p); p += 8 }
  const read = (dim: number): unknown[] => {
    const n = dims[dim]!, out: unknown[] = new Array(n)
    for (let i = 0; i < n; i++) {
      if (dim + 1 < ndim) { out[i] = read(dim + 1); continue }
      const len = b.readInt32BE(p); p += 4
      if (len === -1) out[i] = null
      else { out[i] = elem(b, p, len); p += len }
    }
    return out
  }
  return read(0)
}

/** Binary-tuple decoder for a replication column, or null when the type has no binary read
 *  (or a config.types text override claims the oid — binary bytes can't honor it). */
export function replBinaryFor(oid: number, map: Map<number, Decoder>): CellDecoder | null {
  if (map !== defaultDecoders) { const d = map.get(oid); if (d && d !== defaultDecoders.get(oid)) return null }
  if (oid === 1700) return binNumericStr
  if (oid === 114) { const d = decoderFor(oid, map); return (b, o, l) => d(b.subarray(o, o + l)) }
  if (oid === 3802) { const d = decoderFor(oid, map); return (b, o, l) => d(b.subarray(o + 1, o + l)) } // jsonb: version byte
  const elemOid = ELEM_OID[oid]
  if (elemOid !== undefined) { const elem = replBinaryFor(elemOid, map); return elem ? binArrayWith(elem) : null }
  try { return pickBinary(oid) } catch { return null }
}

// ---- Binary tuples for SHAPED replication columns (`start({ shapes })`) ------------------------
// Same contract as replBinaryFor, but honoring the column's DECLARED js target: null whenever
// binary bytes cannot produce the value the declaration promises (e.g. 'timestamptz:string' is
// PG's exact text — binary carries µs since 2000, not that text). Null -> the loud lazy error
// naming table.column when a binary value actually arrives.

// oids whose binary decode reproduces the EXACT text-mode string for a :string target
const BIN_TEXT_EXACT = new Set([20, 18, 19, 25, 1042, 1043, 2950])

function replShapedLeaf(oid: number, map: Map<number, Decoder>, js?: Target): CellDecoder | null {
  if (oid <= 0) return null // defineType()/extension sentinels: their targets take TEXT (hex/literals), binary bytes can't honor them
  if (map !== defaultDecoders) { const d = map.get(oid); if (d && d !== defaultDecoders.get(oid)) return null }
  if (oid === 1700) {
    if (js === 'bigint') return (b, o, l) => BigInt(binNumericStr(b, o, l) as string) // integer-only contract: fractional throws, same as text
    if (js === 'number') return (b, o, l) => Number(binNumericStr(b, o, l) as string)
    return binNumericStr // default & :string = the exact PG text
  }
  if (oid === 114 || oid === 3802) { // binary json payload IS the json text (jsonb prepends a version byte)
    const skip = oid === 3802 ? 1 : 0
    if (js === 'string' || js === 'latin1') return (b, o, l) => utf8(b, o + skip, l - skip)
    const d = decoderFor(oid, map)
    return (b, o, l) => d(b.subarray(o + skip, o + l))
  }
  const elemOid = ELEM_OID[oid]
  if (elemOid !== undefined) { const elem = replShapedLeaf(elemOid, map, js); return elem ? binArrayWith(elem) : null } // element target rides through array_recv
  if (js === 'string' || js === 'latin1') {
    if (oid === 21 || oid === 23 || oid === 26) { const d = pickBinary(oid); return (b, o, l) => '' + (d(b, o, l) as number) }
    if (!BIN_TEXT_EXACT.has(oid)) return null
    js = 'string'
  }
  if (oid === 700 && js !== 'precise') return null // bare/:pretty float4 promise the canonical-text number; binary is the exact f32
  try { return pickBinary(oid, js) } catch { return null }
}

/** Binary-tuple decoder for a shaped replication column, or null when binary can't honor the
 *  declaration. Json() markers reuse the text decode path (the payload is the json text). */
export function replBinaryForCol(col: CodegenCol, map: Map<number, Decoder>): CellDecoder | null {
  if (col.json) { const d = pickDecoder(col, map); return col.oid === 3802 ? (b, o, l) => d(b, o + 1, l - 1) : d }
  if (col.array) { const elem = replShapedLeaf(col.array.elem, map, col.array.js); return elem ? binArrayWith(elem) : null }
  return replShapedLeaf(col.oid, map, col.js)
}
