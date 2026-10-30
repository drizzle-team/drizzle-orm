// ENCODE — everything that turns JS values into wire bytes: write-through param encoding
// (text + binary plans from cached ParameterDescription OIDs), the JIT Bind encoder, COPY
// FROM row encoding (text + binary), and the PG array-literal writers. The decode direction
// lives in decode.ts; ELEM_OID (array OID -> element OID) is shared from there.
import { Writer, W, type ParamsEncoder } from './protocol.ts' // protocol.ts only type-imports from here -> no runtime cycle
import { ELEM_OID } from './decode.ts'

export interface EncodedParam {
  format: number // 0 = text, 1 = binary
  bytes: Buffer | null // null = SQL NULL
}

/** Encode a JS param value for a Bind message. Kept for compatibility (tests, W.bind); the hot
 *  path uses the zero-alloc write-through `encodeValueInto` below. */
export function encodeParam(v: unknown): EncodedParam {
  if (v == null) return { format: 0, bytes: null }
  if (Buffer.isBuffer(v)) return { format: 1, bytes: v }
  if (v instanceof Date) return { format: 0, bytes: Buffer.from(v.toISOString(), 'utf8') }
  if (typeof v === 'boolean') return { format: 0, bytes: Buffer.from(v ? 't' : 'f', 'utf8') }
  if (Array.isArray(v)) return { format: 0, bytes: Buffer.from(arrayLiteral(v), 'utf8') } // JS array -> PG '{…}' literal, not JSON
  if (typeof v === 'object') return { format: 0, bytes: Buffer.from(JSON.stringify(v), 'utf8') }
  const s = String(v)
  if (s.indexOf('\0') !== -1) throw new Error(NUL_MSG)
  return { format: 0, bytes: Buffer.from(s, 'utf8') }
}

const NUL_MSG = 'parameter contains NUL byte (0x00), which PostgreSQL text values cannot represent'

/** Write-through param encoding: ONE value straight into the Bind message being built in `w`
 *  (int32 length + payload), TEXT format, byte-identical to encodeParam — but with zero
 *  intermediate allocations (no String() for safe integers, no Buffer.from, no wrapper object).
 *  Returns the format code used: 0, or 1 for the Buffer (bytea) passthrough. */
export function encodeValueInto(w: Writer, v: unknown): number {
  if (v == null) { w.int32(-1); return 0 }
  if (Buffer.isBuffer(v)) { w.lpBytes(v); return 1 }
  switch (typeof v) {
    case 'number':
      if (Number.isSafeInteger(v)) w.lpAsciiInt(v)
      else w.lpAsc(String(v)) // fraction/exponent/NaN/Infinity: ASCII digits, no NUL — latin1
      return 0
    case 'string':
      if (v.indexOf('\0') !== -1) throw new Error(NUL_MSG)
      w.lpStr(v)
      return 0
    case 'boolean':
      w.int32(1); w.byte(v ? 0x74 : 0x66) // 't' / 'f'
      return 0
    case 'object':
      if (v instanceof Date) { const lp = w.mark(); w.int32(0); const s = w.mark(); writeIso(w, v); w.patch32(lp, w.mark() - s) } // write-through ISO-8601, no toISOString() string
      else if (Array.isArray(v)) arrayLiteralInto(w, v) // write-through PG '{…}' literal (NOT JSON); server uses the declared array OID or infers the element type
      else w.lpStr(JSON.stringify(v)) // plain object -> json/jsonb text; stringify escapes control chars — no raw NUL possible
      return 0
    default: { // bigint (digits), symbol/function (String() nonsense — same as encodeParam)
      const s = String(v)
      if (s.indexOf('\0') !== -1) throw new Error(NUL_MSG)
      if (typeof v === 'bigint') w.lpAsc(s); else w.lpStr(s) // bigint digits are ASCII (latin1); symbol/function may be unicode
      return 0
    }
  }
}

// ---- binary param plans (prepared-statement reuse) ----------------------------------------
// Once a named statement's ParameterDescription OIDs are cached (first round trip), params of
// the bench-fast types can go out BINARY: no text formatting, fewer bytes, no server-side text
// parse. Every encoder GUARDS on the JS value's type/range and falls back to text for that one
// value when it doesn't fit — so semantics (incl. server range errors) are unchanged. This is
// the encode-side mirror of reuseBinaryOids: first execution text, reuse upgrades.

const PG_EPOCH_MS = 946684800000 // 2000-01-01T00:00:00Z
const MS_SAFE = 9007199254740    // |ms since PG epoch| below this, ms*1000 stays a safe integer
const I64_MIN = -9223372036854775808n
const I64_MAX = 9223372036854775807n

type BinEnc = (w: Writer, v: unknown) => number

function binEncoderFor(oid: number): BinEnc | null {
  switch (oid) {
    case 16: return (w, v) => { if (typeof v !== 'boolean') return encodeValueInto(w, v); w.int32(1); w.byte(v ? 1 : 0); return 1 }
    case 21: return (w, v) => { if (typeof v !== 'number' || !Number.isInteger(v) || v < -32768 || v > 32767) return encodeValueInto(w, v); w.int32(2); w.int16(v & 0xffff); return 1 }
    case 23: return (w, v) => { if (typeof v !== 'number' || !Number.isInteger(v) || v < -2147483648 || v > 2147483647) return encodeValueInto(w, v); w.int32(4); w.int32(v); return 1 }
    case 20: return (w, v) => {
      if (typeof v === 'number' && Number.isSafeInteger(v)) { w.lpI64(v); return 1 }
      if (typeof v === 'bigint' && v >= I64_MIN && v <= I64_MAX) { w.lpI64Big(v); return 1 }
      return encodeValueInto(w, v) // out-of-range/strings fall back: the server raises the proper 22003
    }
    case 701: return (w, v) => { if (typeof v !== 'number') return encodeValueInto(w, v); w.lpF8(v); return 1 }
    // timestamp + timestamptz: micros since 2000-01-01 UTC. Matches the text path's toISOString
    // semantics for both (timestamp ignores the zone suffix; getTime IS the UTC reading).
    case 1114: case 1184: return (w, v) => {
      if (!(v instanceof Date)) return encodeValueInto(w, v)
      const ms = v.getTime() - PG_EPOCH_MS
      if (Number.isNaN(ms)) return encodeValueInto(w, v) // Invalid Date -> toISOString throws, same as text
      if (ms >= -MS_SAFE && ms <= MS_SAFE) w.lpI64(ms * 1000)
      else w.lpI64Big(BigInt(ms) * 1000n) // >±285yr from 2000: exact via BigInt
      return 1
    }
    // json/jsonb: a DECLARED json type wins over the value's shape — always JSON text, even for a JS array
    // (which encodeValueInto would otherwise arrayLiteral). A string passes through (pre-serialized json).
    case 114: case 3802: return (w, v) => { w.lpStr(typeof v === 'string' ? v : JSON.stringify(v)); return 0 }
    // ---- array types: route EVERY declared array OID through arrayEnc via the element-OID map. It BINARY-
    // encodes the fast element types (bool/int2/int4/int8/float8/text/varchar/timestamp(tz)[]); for any
    // other element type (numeric/uuid/date/time/interval/bytea/json/jsonb/oid/float4/money/bpchar/char/
    // name[]) the element encoder throws MISMATCH, so arrayEnc rewinds to a correct '{…}' arrayLiteral()
    // TEXT literal. A scalar OID without a binary encoder isn't in ELEM_OID -> null -> encodeValueInto text.
    default: { const elem = ELEM_OID[oid]; return elem !== undefined ? arrayEnc(elem) : null }
  }
}

// ---- binary arrays ------------------------------------------------------------------------
// Wire format: int32 ndim (0 for empty), int32 hasnull, int32 elemOid, then per dim int32 length +
// int32 lower-bound(1), then per element int32 len + payload (-1 = NULL). Element payloads are the
// SAME encodings as scalar binary params. An element whose JS type doesn't fit bails the WHOLE value
// out to a text array literal (rewind + rewrite) — the server then parses/validates as usual.

class ElemMismatch extends TypeError { constructor() { super('array element does not fit the declared element type') } }
const MISMATCH = new ElemMismatch() // singleton: thrown/caught on the fallback path only, no stack use

type ElemEnc = (w: Writer, v: unknown) => void // writes int32 len + payload; throws MISMATCH if v doesn't fit
function elemEncoderFor(elemOid: number): ElemEnc {
  switch (elemOid) {
    case 16: return (w, v) => { if (typeof v !== 'boolean') throw MISMATCH; w.int32(1); w.byte(v ? 1 : 0) }
    case 21: return (w, v) => { if (typeof v !== 'number' || !Number.isInteger(v) || v < -32768 || v > 32767) throw MISMATCH; w.int32(2); w.int16(v & 0xffff) }
    case 23: return (w, v) => { if (typeof v !== 'number' || !Number.isInteger(v) || v < -2147483648 || v > 2147483647) throw MISMATCH; w.int32(4); w.int32(v) }
    case 20: return (w, v) => {
      if (typeof v === 'number' && Number.isSafeInteger(v)) return w.lpI64(v)
      if (typeof v === 'bigint' && v >= I64_MIN && v <= I64_MAX) return w.lpI64Big(v)
      throw MISMATCH
    }
    case 701: return (w, v) => { if (typeof v !== 'number') throw MISMATCH; w.lpF8(v) }
    case 25: case 1043: return (w, v) => { if (typeof v !== 'string' || v.indexOf('\0') !== -1) throw MISMATCH; w.lpStr(v) } // NUL -> literal path -> proper error
    case 1114: case 1184: return (w, v) => {
      if (!(v instanceof Date)) throw MISMATCH
      const ms = v.getTime() - PG_EPOCH_MS
      if (Number.isNaN(ms)) throw MISMATCH
      if (ms >= -MS_SAFE && ms <= MS_SAFE) w.lpI64(ms * 1000)
      else w.lpI64Big(BigInt(ms) * 1000n)
    }
    default: return () => { throw MISMATCH }
  }
}

function arrayEnc(elemOid: number): BinEnc {
  const elem = elemEncoderFor(elemOid)
  return (w, v) => {
    if (!Array.isArray(v)) return encodeValueInto(w, v) // e.g. a caller-built '{…}' literal string passes through as text
    const mark = w.mark()
    try {
      const lenPos = w.mark()
      w.int32(0) // total length, back-patched
      if (v.length === 0) { w.int32(0); w.int32(0); w.int32(elemOid) } // ndim 0 = empty array
      else {
        let hasNull = 0
        for (let i = 0; i < v.length; i++) if (v[i] == null) { hasNull = 1; break }
        w.int32(1); w.int32(hasNull); w.int32(elemOid)
        w.int32(v.length); w.int32(1) // one dimension, lower bound 1
        for (let i = 0; i < v.length; i++) { const e = v[i]; if (e == null) w.int32(-1); else elem(w, e) }
      }
      w.patch32(lenPos, w.mark() - lenPos - 4)
      return 1
    } catch (e) {
      if (e !== MISMATCH) throw e
      w.rewind(mark)
      arrayLiteralInto(w, v); return 0 // text literal (write-through): the server parses + raises the proper error if truly invalid
    }
  }
}

// ---- COPY FROM STDIN row encoding ----------------------------------------------------------
// A COPY BINARY field is the SAME wire bytes as a binary Bind param (int32 len + payload), so
// the element encoders above serve both. Rows stream out as ~chunkBytes Buffers.

/** True when every column of this OID list can be COPY-BINARY encoded (else use text format). */
export const copyBinarySupported = (oids: readonly number[]): boolean =>
  oids.every((o) => [16, 21, 23, 20, 701, 25, 1043, 1114, 1184].includes(o))

let _copySig: Buffer | undefined // lazy: module-eval Buffer.from would break Buffer-less runtimes before the polyfill installs
const COPY_SIG = (): Buffer => (_copySig ??= Buffer.from([0x50, 0x47, 0x43, 0x4f, 0x50, 0x59, 0x0a, 0xff, 0x0d, 0x0a, 0x00])) // "PGCOPY\n\xff\r\n\0"
type CopyRow = readonly unknown[] | Readonly<Record<string, unknown>>
const cell = (row: CopyRow, names: readonly string[], c: number): unknown =>
  Array.isArray(row) ? row[c] : (row as Record<string, unknown>)[names[c]!]

/** Rows -> COPY BINARY payload chunks (header + tuples + trailer). Strict per-column typing:
 *  a value that doesn't fit its declared type rejects with the row/column named. */
export function* copyRowsBinary(oids: readonly number[], names: readonly string[], rows: readonly CopyRow[], chunkBytes = 1 << 18): Generator<Buffer> {
  const encs = oids.map(elemEncoderFor)
  const w = new Writer(chunkBytes + 4096)
  w.bytes(COPY_SIG()); w.int32(0); w.int32(0) // flags, header-extension length
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!
    w.int16(oids.length)
    for (let c = 0; c < oids.length; c++) {
      const v = cell(row, names, c)
      if (v == null) w.int32(-1)
      else {
        try { encs[c]!(w, v) } catch (e) {
          if (e !== MISMATCH) throw e
          throw new TypeError(`copy: row ${r}, column "${names[c]}" — value is incompatible with its declared type`)
        }
      }
    }
    if (w.mark() >= chunkBytes) { yield Buffer.from(w.slice()); w.reset() }
  }
  w.int16(0xffff) // trailer: int16 -1
  yield Buffer.from(w.slice())
}

/** Write s COPY-text-escaped ('\'->'\\', TAB->'\t', LF->'\n', CR->'\r') straight into w (user text is
 *  utf8) — no intermediate .replace() strings. Only the 4 special chars break the fast utf8 run. */
function writeEscCopy(w: Writer, s: string): void {
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    const e = c === 0x5c ? 0x5c : c === 0x09 ? 0x74 : c === 0x0a ? 0x6e : c === 0x0d ? 0x72 : 0 // '\','t','n','r'
    if (e) { if (i > start) w.str(s.slice(start, i)); w.byte(0x5c); w.byte(e); start = i + 1 }
  }
  if (start < s.length) w.str(s.slice(start))
}
function copyTextCellInto(w: Writer, v: unknown): void {
  if (typeof v === 'string') { writeEscCopy(w, v); return }
  if (typeof v === 'number' || typeof v === 'bigint') { w.asc(String(v)); return } // ASCII digits -> latin1
  if (typeof v === 'boolean') { w.byte(v ? 0x74 : 0x66); return } // 't'/'f'
  if (v instanceof Date) { writeIso(w, v); return }
  if (Buffer.isBuffer(v)) { w.asc('\\\\x'); w.asc(v.toString('hex')); return } // literal '\\x' + hex (already COPY-escaped)
  writeEscCopy(w, typeof v === 'object' ? JSON.stringify(v) : String(v))
}

/** Rows -> COPY text-format payload chunks (tab-separated, \N for NULL). Write-through into ONE reused
 *  Writer — no per-line string, no parts.join(''), no per-cell .replace(). Universal: the server parses
 *  each field with the column type's input function. */
export function* copyRowsText(names: readonly string[], rows: readonly CopyRow[], chunkBytes = 1 << 18): Generator<Buffer> {
  const w = new Writer(chunkBytes + 1024)
  for (const row of rows) {
    for (let c = 0; c < names.length; c++) {
      if (c) w.byte(0x09) // '\t'
      const v = cell(row, names, c)
      if (v == null) w.asc('\\N'); else copyTextCellInto(w, v)
    }
    w.byte(0x0a) // '\n'
    if (w.mark() >= chunkBytes) { yield Buffer.from(w.slice()); w.reset() }
  }
  if (w.mark() > 0) yield Buffer.from(w.slice())
}

/** JS array -> PG text array literal ('{…}'), the fallback when an element can't go binary.
 *  Handles nesting (multidimensional), NULLs, and quoted-element escaping. */
export function arrayLiteral(arr: readonly unknown[]): string {
  let s = '{'
  for (let i = 0; i < arr.length; i++) {
    if (i) s += ','
    const v = arr[i]
    if (v == null) { s += 'NULL'; continue }
    if (Array.isArray(v)) { s += arrayLiteral(v); continue }
    if (typeof v === 'number' || typeof v === 'bigint') { s += String(v); continue }
    if (typeof v === 'boolean') { s += v ? 't' : 'f'; continue }
    const str = v instanceof Date ? v.toISOString() : Buffer.isBuffer(v) ? '\\x' + v.toString('hex') : typeof v === 'object' ? JSON.stringify(v) : String(v) // object element (json[]/jsonb[]) -> its JSON text
    s += '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  }
  return s + '}'
}

// ---- write-through text encoders: bytes straight into the buffer, no intermediate JS string ----
function p2(w: Writer, n: number): void { w.byte(48 + ((n / 10) | 0)); w.byte(48 + (n % 10)) } // 2-digit zero-padded
/** ISO-8601 UTC bytes, byte-identical to Date.toISOString() for years 0000-9999. Extended years (±YYYYYY)
 *  and Invalid Date fall back to toISOString — which throws on Invalid Date, exactly as the old text path. */
function writeIso(w: Writer, d: Date): void {
  const y = d.getUTCFullYear()
  if (!(y >= 0 && y <= 9999)) { w.asc(d.toISOString()); return }
  w.byte(48 + (((y / 1000) | 0) % 10)); w.byte(48 + (((y / 100) | 0) % 10)); w.byte(48 + (((y / 10) | 0) % 10)); w.byte(48 + (y % 10)) // YYYY
  w.byte(45); p2(w, d.getUTCMonth() + 1); w.byte(45); p2(w, d.getUTCDate()) // -MM-DD
  w.byte(84); p2(w, d.getUTCHours()); w.byte(58); p2(w, d.getUTCMinutes()); w.byte(58); p2(w, d.getUTCSeconds()) // THH:mm:ss
  const ms = d.getUTCMilliseconds()
  w.byte(46); w.byte(48 + ((ms / 100) | 0)); w.byte(48 + (((ms / 10) | 0) % 10)); w.byte(48 + (ms % 10)); w.byte(90) // .sssZ
}
/** Write s with '"' and '\' backslash-escaped (no surrounding quotes); user text stays utf8. */
function writeEscQuoted(w: Writer, s: string): void {
  let start = 0
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c === 0x22 || c === 0x5c) { if (i > start) w.str(s.slice(start, i)); w.byte(0x5c); start = i } }
  if (start < s.length) w.str(s.slice(start))
}
function writeArrayBody(w: Writer, arr: readonly unknown[]): void {
  w.byte(0x7b) // '{'
  for (let i = 0; i < arr.length; i++) {
    if (i) w.byte(0x2c) // ','
    const v = arr[i]
    if (v == null) { w.asc('NULL'); continue }
    if (Array.isArray(v)) { writeArrayBody(w, v); continue }
    if (typeof v === 'number' || typeof v === 'bigint') { w.asc(String(v)); continue }
    if (typeof v === 'boolean') { w.byte(v ? 0x74 : 0x66); continue } // 't'/'f'
    w.byte(0x22) // '"'
    if (v instanceof Date) writeIso(w, v) // ISO-8601 has no '"'/'\' -> no escaping
    else writeEscQuoted(w, Buffer.isBuffer(v) ? '\\x' + v.toString('hex') : typeof v === 'object' ? JSON.stringify(v) : String(v))
    w.byte(0x22) // '"'
  }
  w.byte(0x7d) // '}'
}
/** Write-through equivalent of w.lpStr(arrayLiteral(arr)): int32 length + '{…}' bytes, no JS string. */
export function arrayLiteralInto(w: Writer, arr: readonly unknown[]): void {
  const lp = w.mark(); w.int32(0); const s = w.mark()
  writeArrayBody(w, arr)
  w.patch32(lp, w.mark() - s)
}

/** Compile the per-statement param plan from cached ParameterDescription OIDs. Returns null when
 *  no param has a binary encoder (pure-text statement — callers keep the plain path). */
export function compileParamPlan(oids: readonly number[]): ParamsEncoder | null {
  let any = false
  const encs = oids.map((o) => { const e = binEncoderFor(o); if (e) any = true; return e })
  if (!any) return null
  return (w, v, i) => { const e = i < encs.length ? encs[i] : null; return e ? e(w, v) : encodeValueInto(w, v) }
}

// ---- JIT param encoder ('jit' tier, needs eval) -------------------------------------------
// When the param shape is known upfront (declared `params`, or cached ParameterDescription OIDs on
// prepared reuse), a per-statement codegen'd encoder collapses the entire Bind+Execute+Sync into two
// constant memcpys (the framing — portal/statement/format-codes/counts/result-format never change) and
// inlines the FAST scalar columns straight-line (no per-value closure dispatch, no loop). It is
// BYTE-IDENTICAL to writeBindWith(w,'',name,params,compileParamPlan(oids),rf)+writeExecute(w,'',0)+
// writeSync(w): the fast inlines exactly mirror binEncoderFor (incl. the text fallback, which patches the
// baked binary format code back to what encodeValueInto returns), and every non-fast/array/json column
// runs the SAME per-column closure the generic plan would. Arrays gain nothing from inlining (memory-bound
// element loop) so they stay on the closure; the win is the constant framing + inlined scalar rows.
export type BindEncoder = (w: Writer, params: readonly unknown[]) => void
const JIT_FAST = new Set([16, 21, 23, 20, 701, 1114, 1184]) // OIDs inlined straight-line (exact binEncoderFor replicas)
const JIT_MAX_PERIOD = 64 // cap on the ROW WIDTH (repeating period), not total params — an N-row VALUES chunk still qualifies
let bindSeq = 0 // numbers the //# sourceURL virtual filenames of compiled bind encoders

// Smallest p | n with oids[i] === oids[i-p] for all i>=p — the row width of a repeating plan. So ONE compiled
// row body serves a 1-row insert AND an N-row VALUES chunk of the same columns (looped n/p times), instead of
// a giant unrolled function. = n when the OIDs don't repeat (irregular statement).
function paramPeriod(oids: readonly number[]): number {
  const n = oids.length
  for (let p = 1; p < n; p++) {
    if (n % p !== 0) continue
    let ok = true
    for (let i = p; i < n; i++) if (oids[i] !== oids[i - p]) { ok = false; break }
    if (ok) return p
  }
  return n
}

/** Returns null (=> caller uses the generic write-through plan) when the row width exceeds JIT_MAX_PERIOD. */
export function compileBindEncoder(name: string, oids: readonly number[], resultFormat: number | number[]): BindEncoder | null {
  const n = oids.length
  const p = n === 0 ? 0 : paramPeriod(oids) // row width; the compiled body encodes p columns, looped rowCount times
  if (p > JIT_MAX_PERIOD) return null // irregular-wide statement: not worth a giant unrolled body
  const rowCount = p === 0 ? 0 : n / p
  const i16 = (x: number) => { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(x); return b }
  const nameBuf = Buffer.from(name, 'utf8')
  const fmtSection = Buffer.allocUnsafe(n * 2)
  for (let i = 0; i < n; i++) fmtSection.writeUInt16BE(JIT_FAST.has(oids[i % p]!) ? 1 : 0, i * 2) // baked intended formats (row pattern repeated)
  const PREFIX = Buffer.concat([Buffer.from([0]), nameBuf, Buffer.from([0]), i16(n), fmtSection, i16(n)]) // portal '' + stmt + count + formats + count
  const FMT0 = 1 + nameBuf.length + 1 + 2 // offset of format slot 0 within PREFIX
  const RESULTFMT = Array.isArray(resultFormat) ? Buffer.concat([i16(resultFormat.length), ...resultFormat.map(i16)]) : Buffer.concat([i16(1), i16(resultFormat)])
  const EXECSYNC = Buffer.concat([W.execute('', 0), W.sync()])
  const C: (BinEnc | null)[] = [] // per-row-column closures (non-fast columns)
  for (let c = 0; c < p; c++) C.push(JIT_FAST.has(oids[c]!) ? null : (binEncoderFor(oids[c]!) ?? encodeValueInto))
  const cols: string[] = []
  for (let c = 0; c < p; c++) {
    const off = `fb + ${c * 2}` // format slot for this row's column c (fb = base + FMT0 + r*p*2)
    const fb = `{ const f = enc(w, x); if (f !== 1) w.patch16(${off}, f) }` // fast-column fallback (baked 1)
    let s: string
    switch (oids[c]) {
      case 16: s = `if (typeof x !== 'boolean') ${fb} else { w.int32(1); w.byte(x ? 1 : 0) }`; break
      case 21: s = `if (typeof x !== 'number' || !Number.isInteger(x) || x < -32768 || x > 32767) ${fb} else { w.int32(2); w.int16(x & 0xffff) }`; break
      case 23: s = `if (typeof x !== 'number' || !Number.isInteger(x) || x < -2147483648 || x > 2147483647) ${fb} else { w.int32(4); w.int32(x) }`; break
      case 20: s = `if (typeof x === 'number' && Number.isSafeInteger(x)) w.lpI64(x); else if (typeof x === 'bigint' && x >= I64_MIN && x <= I64_MAX) w.lpI64Big(x); else ${fb}`; break
      case 701: s = `if (typeof x !== 'number') ${fb} else w.lpF8(x)`; break
      case 1114: case 1184: s = `if (!(x instanceof Date)) ${fb} else { const ms = x.getTime() - PG_EPOCH_MS; if (Number.isNaN(ms)) ${fb} else if (ms >= -MS_SAFE && ms <= MS_SAFE) w.lpI64(ms * 1000); else w.lpI64Big(BigInt(ms) * 1000n) }`; break
      // text/varchar are TEXT-format (baked 0): inline encodeValueInto's string fast-path (lpStr + NUL guard);
      // a non-string value falls to the full encodeValueInto (number->digits etc.), patching format if != 0.
      case 25: case 1043: s = `if (typeof x === 'string') { if (x.indexOf('\\u0000') !== -1) throw new Error(NUL_MSG); w.lpStr(x) } else { const f = enc(w, x); if (f !== 0) w.patch16(${off}, f) }`; break
      default: s = `const f = C[${c}](w, x); if (f !== 0) w.patch16(${off}, f)` // non-fast (baked 0): exact writeBindWith semantics
    }
    cols.push(`{ const x = v[vb + ${c}]; ${s} }`)
  }
  const body = cols.join('\n')
  const loop = rowCount > 1
    ? `for (let r = 0; r < ${rowCount}; r++) { const vb = r * ${p}, fb = base + ${FMT0} + r * ${p * 2}; ${body} }`
    : `{ const vb = 0, fb = base + ${FMT0}; ${body} }` // single row (or zero): no loop overhead
  const src = `w.start("B"); const base = w.mark(); w.bytes(PREFIX); ${loop} w.bytes(RESULTFMT); w.end(); w.bytes(EXECSYNC);`
  // sourceURL names this encoder in stack traces (see mapperSrcName in decode.ts for the pattern)
  const srcName = `minipg-bind-${++bindSeq}.${name.replace(/[^\w-]+/g, '').slice(0, 40) || 'unnamed'}.p${p}.js`
  return new Function('PREFIX', 'RESULTFMT', 'EXECSYNC', 'enc', 'C', 'PG_EPOCH_MS', 'MS_SAFE', 'I64_MIN', 'I64_MAX', 'NUL_MSG',
    `return (w, v) => { ${src} }\n//# sourceURL=${srcName}`)(PREFIX, RESULTFMT, EXECSYNC, encodeValueInto, C, PG_EPOCH_MS, MS_SAFE, I64_MIN, I64_MAX, NUL_MSG) as BindEncoder
}

// ---- rawParams(): pre-encoded Bind parameters (the request-side mirror of mode:'wire') --------
/** Parameter bytes already in Bind form. The driver writes formats + values VERBATIM — it encodes
 *  nothing, so bytes produced remotely (e.g. by another minipg's encodeValueInto) cross unchanged. */
export interface RawParams {
  readonly __rawParams: true
  /** Bind format codes: [] = all text, one entry = applies to every parameter, else one per parameter. */
  readonly formats: readonly number[]
  /** The exact Bind value bytes; null = SQL NULL. */
  readonly values: readonly (Uint8Array | null)[]
}
/** Wrap pre-encoded parameter bytes for query(sql, rawParams({...}), opts). Combine with
 *  `params: ['text','int8']` to pin the OIDs in Parse, and mode:'wire' for a no-conversion
 *  gateway path. Only the formats/values length relationship is validated — the caller owns
 *  the bytes' correctness, exactly as with 'wire' on the way back. */
export function rawParams(spec: { formats?: readonly number[]; values: readonly (Uint8Array | null)[] }): RawParams {
  const f = spec.formats ?? []
  if (f.length !== 0 && f.length !== 1 && f.length !== spec.values.length) {
    throw new Error(`minipg: rawParams formats must have 0, 1, or values.length (${spec.values.length}) entries — got ${f.length}`)
  }
  return { __rawParams: true, formats: f, values: spec.values }
}
export const isRawParams = (x: unknown): x is RawParams =>
  typeof x === 'object' && x !== null && (x as { __rawParams?: unknown }).__rawParams === true

/** JS value -> JSON-transportable text parameter (the HTTP protocols' request encoding — mirrors the
 *  wire driver's semantics: bytea as \x hex, Date ISO, BigInt decimal string, ARRAYS as a PG '{…}'
 *  literal (encodeParam/encodeValueInto do the same — NOT JSON), other objects as JSON text).
 *  Shared by minipg/neon-http and minipg/http.
 *
 *  `declaredOid` is the param's DECLARED type when the caller pinned one (`types: [...]`): a declared
 *  json/jsonb wins over the value's shape, so a JS array bound to a json param goes out as JSON text —
 *  exactly what the wire path's binEncoderFor(114/3802) does. */
export function encodeJsonParam(v: unknown, declaredOid?: number): unknown {
  if (v == null) return null
  if (declaredOid === 114 || declaredOid === 3802) return typeof v === 'string' ? v : JSON.stringify(v) // declared json/jsonb: a string is already-serialized json
  if (v instanceof Uint8Array) return '\\x' + (Buffer.isBuffer(v) ? v : Buffer.from(v.buffer, v.byteOffset, v.byteLength)).toString('hex') // bytea as hex text
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'bigint') return v.toString()
  if (Array.isArray(v)) return arrayLiteral(v) // PG array literal '{a,b}'; JSON.stringify here yields 22P02 "malformed array literal"
  if (typeof v === 'object') return JSON.stringify(v) // plain object -> json/jsonb text
  if (typeof v === 'string' && v.indexOf('\0') !== -1) throw new Error('parameter contains NUL byte (0x00), which PostgreSQL text values cannot represent')
  return v // number | string | boolean
}

/** encodeJsonParam over a whole param list. Use this instead of `params.map(encodeJsonParam)` — map
 *  would pass the INDEX as `declaredOid`. `oids` (from resolveParamTypes) is optional and positional. */
export const encodeJsonParams = (params: readonly unknown[], oids?: readonly number[]): unknown[] =>
  params.map((v, i) => encodeJsonParam(v, oids?.[i]))
