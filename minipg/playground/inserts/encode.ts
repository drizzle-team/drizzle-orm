// Playground prototypes of the ENCODE side minipg doesn't have yet:
//   - Postgres text array literals (the unnest batch-insert path)
//   - COPY text-format rows
//   - COPY binary-format rows (per-field encoding identical to binary Bind params — the
//     encoder table that would eventually live next to src/codec.ts serves both)

export type Row = { id: number; name: string; qty: number; price: number; flag: boolean; created_at: Date }

// ---------- text array literals (for `unnest($n::type[])`) ----------

/** Unquoted elements: numbers/bools whose text form never needs escaping. */
export function arrLitPlain(rows: readonly Row[], pick: (r: Row) => number | boolean): string {
  const parts: string[] = new Array(rows.length)
  for (let i = 0; i < rows.length; i++) {
    const v = pick(rows[i]!)
    parts[i] = typeof v === 'boolean' ? (v ? 't' : 'f') : String(v)
  }
  return '{' + parts.join(',') + '}'
}

/** Quoted elements (text, timestamptz-as-ISO): `"…"` with \ and " backslash-escaped. */
export function arrLitQuoted(rows: readonly Row[], pick: (r: Row) => string): string {
  const parts: string[] = new Array(rows.length)
  for (let i = 0; i < rows.length; i++) {
    parts[i] = '"' + pick(rows[i]!).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  }
  return '{' + parts.join(',') + '}'
}

// ---------- COPY text format ----------

const escCopy = (s: string) => s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r')

/** Rows -> COPY text payload, split into ~chunkBytes CopyData payloads. */
export function copyTextChunks(rows: readonly Row[], chunkBytes = 1 << 18): Buffer[] {
  const out: Buffer[] = []
  let parts: string[] = []
  let size = 0
  for (const r of rows) {
    const line = `${r.id}\t${escCopy(r.name)}\t${r.qty}\t${r.price}\t${r.flag ? 't' : 'f'}\t${r.created_at.toISOString()}\n`
    parts.push(line)
    size += line.length
    if (size >= chunkBytes) { out.push(Buffer.from(parts.join(''), 'utf8')); parts = []; size = 0 }
  }
  if (parts.length) out.push(Buffer.from(parts.join(''), 'utf8'))
  return out
}

// ---------- COPY binary format ----------

const PG_EPOCH_MS = 946684800000 // 2000-01-01T00:00:00Z

class Sink {
  buf: Buffer
  off = 0
  constructor(cap: number) { this.buf = Buffer.allocUnsafe(cap) }
  private ensure(n: number): void {
    if (this.off + n <= this.buf.length) return
    let cap = this.buf.length * 2
    while (cap < this.off + n) cap *= 2
    const nb = Buffer.allocUnsafe(cap)
    this.buf.copy(nb, 0, 0, this.off)
    this.buf = nb
  }
  i16(n: number): void { this.ensure(2); this.buf.writeInt16BE(n, this.off); this.off += 2 }
  i32(n: number): void { this.ensure(4); this.buf.writeInt32BE(n, this.off); this.off += 4 }
  i64(n: bigint): void { this.ensure(8); this.buf.writeBigInt64BE(n, this.off); this.off += 8 }
  f8(n: number): void { this.ensure(8); this.buf.writeDoubleBE(n, this.off); this.off += 8 }
  byte(n: number): void { this.ensure(1); this.buf[this.off++] = n }
  raw(b: Buffer): void { this.ensure(b.length); b.copy(this.buf, this.off); this.off += b.length }
  take(): Buffer { return this.buf.subarray(0, this.off) }
}

/** Rows -> COPY BINARY payload (header + tuples + trailer), split into CopyData payloads.
 *  Per-field wire format (int32 length + big-endian value) is exactly binary Bind params. */
export function copyBinaryChunks(rows: readonly Row[], chunkBytes = 1 << 18): Buffer[] {
  const out: Buffer[] = []
  let s = new Sink(chunkBytes + 1024)
  // 11-byte signature, int32 flags, int32 header-extension length
  s.raw(Buffer.from('PGCOPY\n\xff\r\n\0', 'latin1'))
  s.i32(0); s.i32(0)
  for (const r of rows) {
    s.i16(6)                                            // field count
    s.i32(8); s.i64(BigInt(r.id))                       // int8
    const name = Buffer.from(r.name, 'utf8')            // text
    s.i32(name.length); s.raw(name)
    s.i32(4); s.i32(r.qty)                              // int4
    s.i32(8); s.f8(r.price)                             // float8
    s.i32(1); s.byte(r.flag ? 1 : 0)                    // bool
    s.i32(8); s.i64(BigInt(r.created_at.getTime() - PG_EPOCH_MS) * 1000n) // timestamptz: micros since PG epoch
    if (s.off >= chunkBytes) { out.push(s.take()); s = new Sink(chunkBytes + 1024) }
  }
  s.i16(-1) // trailer
  out.push(s.take())
  return out
}
