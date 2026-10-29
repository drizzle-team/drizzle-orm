// Text-format value decoders for the parsed ('array'/'object') result modes, and
// the param encoder for Bind. Deliberately minimal and precision-safe: int8 and
// numeric default to STRING (the #1 silent-corruption footgun in pg & postgres.js),
// and timestamps stay strings (Date conversion is lossy). Everything is overridable.
import type { Decoder } from '../../src/types.ts'

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

export function buildDecoders(overrides?: Record<number, Decoder>): Map<number, Decoder> {
  if (!overrides) return defaultDecoders
  const m = new Map(defaultDecoders)
  for (const [oid, fn] of Object.entries(overrides)) m.set(Number(oid), fn)
  return m
}

export const decoderFor = (oid: number, map: Map<number, Decoder>): Decoder => map.get(oid) ?? asString

export interface EncodedParam {
  format: number // 0 = text, 1 = binary
  bytes: Buffer | null // null = SQL NULL
}

/** Encode a JS param value for a Bind message. */
export function encodeParam(v: unknown): EncodedParam {
  if (v == null) return { format: 0, bytes: null }
  if (Buffer.isBuffer(v)) return { format: 1, bytes: v }
  if (v instanceof Date) return { format: 0, bytes: Buffer.from(v.toISOString(), 'utf8') }
  if (typeof v === 'boolean') return { format: 0, bytes: Buffer.from(v ? 't' : 'f', 'utf8') }
  if (typeof v === 'object') return { format: 0, bytes: Buffer.from(JSON.stringify(v), 'utf8') }
  const s = String(v)
  if (s.indexOf('\0') !== -1) throw new Error('parameter contains NUL byte (0x00), which PostgreSQL text values cannot represent')
  return { format: 0, bytes: Buffer.from(s, 'utf8') }
}
