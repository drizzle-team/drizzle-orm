// Compact builders for PostgreSQL v3 wire RESULT buffers, so the row mapper (src/decode.ts and the
// codegen builders) can be tested + benchmarked in isolation — no socket, no protocol framing.
//
// These produce byte-identical framing to what a real server sends; you supply each value's TEXT
// exactly as PostgreSQL's text protocol emits it (bool 't'/'f', bytea '\xdead', arrays '{1,2}',
// json compact, timestamps 'YYYY-MM-DD HH:MM:SS', …). test/integration/mapper-golden.test.ts
// cross-checks these bytes against a live server (via minipg's raw mode) so the framing stays exact.

export interface WireCol {
  name: string
  oid: number
  typeSize?: number // pg_type.typlen (default -1 = variable)
  typmod?: number   // atttypmod (default -1)
}

/** A cell value on the wire: its text (utf8-encoded), pre-encoded raw bytes, or null (SQL NULL). */
export type Cell = string | Buffer | null

const i16 = (n: number) => { const b = Buffer.allocUnsafe(2); b.writeInt16BE(n, 0); return b }
const i32 = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeInt32BE(n, 0); return b }
const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])

/** RowDescription BODY (what parseRowDescription consumes): Int16 field count + per-field descriptor
 *  (name\0, tableOid, colAttr, typeOid, typeSize, typmod, format=0/text). */
export function rowDescription(cols: WireCol[]): Buffer {
  return Buffer.concat([
    i16(cols.length),
    ...cols.map((c) => Buffer.concat([
      cstr(c.name),
      i32(0),                 // table OID
      i16(0),                 // column attribute number
      i32(c.oid),             // type OID
      i16(c.typeSize ?? -1),  // type size (typlen)
      i32(c.typmod ?? -1),    // type modifier
      i16(0),                 // format code: 0 = text
    ])),
  ])
}

/** DataRow BODY — exactly what the mapper receives: Int16 column count, then per column an Int32
 *  length (-1 = NULL, no bytes follow) and the value bytes. Cells are text (utf8), raw Buffer, or null. */
export function dataRow(cells: Cell[]): Buffer {
  const parts: Buffer[] = [i16(cells.length)]
  for (const c of cells) {
    if (c === null) { parts.push(i32(-1)); continue }
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c, 'utf8')
    parts.push(i32(b.length), b)
  }
  return Buffer.concat(parts)
}

/** Many DataRow bodies from rows of cells (for batch/result-set mapping + benches). */
export const dataRows = (rows: Cell[][]): Buffer[] => rows.map(dataRow)

/** Full framed message (5-byte header: type char + Int32 length + body) — for feeding the Parser
 *  end-to-end. The mapper itself takes the BODY (dataRow/rowDescription above), not this. */
export function frame(type: string, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from(type, 'latin1'), i32(body.length + 4), body])
}

// Binary (format code 1) cell encoders — produce the exact bytes PostgreSQL sends for a value in
// BINARY result format, so binary-decode paths can be tested/benched with synthetic buffers. Pass the
// results as Buffer cells to dataRow(). (Only the fixed-width types decode2 supports in binary.)
const PG_EPOCH_MS = 946684800000 // 2000-01-01 UTC in unix ms
export const bin = {
  bool: (v: boolean) => Buffer.from([v ? 1 : 0]),
  int2: (v: number) => { const b = Buffer.allocUnsafe(2); b.writeInt16BE(v, 0); return b },
  int4: (v: number) => { const b = Buffer.allocUnsafe(4); b.writeInt32BE(v, 0); return b },
  oid: (v: number) => { const b = Buffer.allocUnsafe(4); b.writeUInt32BE(v, 0); return b },
  int8: (v: bigint | number) => { const b = Buffer.allocUnsafe(8); b.writeBigInt64BE(BigInt(v), 0); return b },
  float4: (v: number) => { const b = Buffer.allocUnsafe(4); b.writeFloatBE(v, 0); return b },
  float8: (v: number) => { const b = Buffer.allocUnsafe(8); b.writeDoubleBE(v, 0); return b },
  timestamp: (epochMs: number) => { const b = Buffer.allocUnsafe(8); b.writeBigInt64BE(BigInt(epochMs - PG_EPOCH_MS) * 1000n, 0); return b }, // µs since 2000
  date: (epochMs: number) => { const b = Buffer.allocUnsafe(4); b.writeInt32BE(Math.floor((epochMs - PG_EPOCH_MS) / 86400000), 0); return b }, // days since 2000
  uuid: (s: string) => Buffer.from(s.replace(/-/g, ''), 'hex'),
  bytea: (buf: Buffer) => buf,
  text: (s: string) => Buffer.from(s, 'utf8'),
  json: (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8'),
  jsonb: (o: unknown) => Buffer.concat([Buffer.from([1]), Buffer.from(JSON.stringify(o), 'utf8')]), // 1-byte version + utf8
}
