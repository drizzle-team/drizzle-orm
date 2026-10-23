// Write-through Bind serialization prototypes — the "values[] -> wire bytes in one pass" design
// from the insert exploration. NOT wired into src/: this is the shape of what would replace
// codec.ts encodeParam + protocol.ts writeBind on the hot path.
//
// Today's chain per value:  value -> String() [A] -> Buffer.from [A+C] -> {format,bytes} [A] -> outbuf [C]
// Write-through:            value -> outbuf (length slot reserved, back-patched)         [0 allocs]

const PG_EPOCH_MS = 946684800000 // 2000-01-01T00:00:00Z

/** Superset of src/protocol.ts Writer: same growth/framing semantics + length-prefixed value
 *  primitives (i64/f8/ascii-int/back-patched strings) that Writer lacks. */
export class BindWriter {
  buf: Buffer
  private msgStart = 0
  off = 0
  constructor(cap = 1 << 16) { this.buf = Buffer.allocUnsafe(cap) }
  reset(): void { this.off = 0 }
  slice(): Buffer { return this.buf.subarray(0, this.off) }
  private ensure(n: number): void {
    const need = this.off + n
    if (need <= this.buf.length) return
    let cap = this.buf.length * 2
    while (cap < need) cap *= 2
    const nb = Buffer.allocUnsafe(cap)
    this.buf.copy(nb, 0, 0, this.off)
    this.buf = nb
  }
  u8(n: number): void { this.ensure(1); this.buf[this.off++] = n }
  i16(n: number): void { this.ensure(2); this.buf.writeUInt16BE(n, this.off); this.off += 2 }
  i32(n: number): void { this.ensure(4); this.buf.writeInt32BE(n, this.off); this.off += 4 }
  f8(n: number): void { this.ensure(8); this.buf.writeDoubleBE(n, this.off); this.off += 8 }
  cstr(s: string): void { const l = Buffer.byteLength(s, 'utf8'); this.ensure(l + 1); this.buf.write(s, this.off, 'utf8'); this.off += l; this.buf[this.off++] = 0 }
  start(type: string): void { this.u8(type.charCodeAt(0)); this.msgStart = this.off; this.ensure(4); this.off += 4 }
  end(): void { this.buf.writeInt32BE(this.off - this.msgStart, this.msgStart) }

  /** int32 length + utf8 bytes, length BACK-PATCHED after buf.write — one pass, no
   *  Buffer.byteLength pre-walk, no intermediate Buffer. */
  lpStr(s: string): void {
    this.ensure(4 + s.length * 3) // utf8 worst case: 3 bytes per UTF-16 code unit
    const n = this.buf.write(s, this.off + 4, 'utf8')
    this.buf.writeInt32BE(n, this.off)
    this.off += 4 + n
  }
  /** Safe-integer value as ASCII digits — matches String(v) output, zero string allocation. */
  lpAsciiInt(v: number): void {
    this.ensure(24)
    let n = v
    const neg = n < 0
    if (neg) n = -n
    let d = 1
    for (let t = n; t >= 10; t = Math.floor(t / 10)) d++
    const len = d + (neg ? 1 : 0)
    this.buf.writeInt32BE(len, this.off)
    let p = this.off + 4 + len - 1
    for (let i = 0; i < d; i++) { this.buf[p--] = 48 + (n % 10); n = Math.floor(n / 10) }
    if (neg) this.buf[p] = 45 // '-'
    this.off += 4 + len
  }
  /** Binary int8/timestamptz: int32 len=8 + big-endian int64, hi/lo halves for non-negative
   *  safe integers (no BigInt allocation on the hot path). */
  lpI64(v: number): void {
    this.ensure(12)
    this.buf.writeInt32BE(8, this.off)
    if (v >= 0) {
      this.buf.writeUInt32BE(Math.floor(v / 4294967296), this.off + 4)
      this.buf.writeUInt32BE(v >>> 0, this.off + 8) // ToUint32 == mod 2^32: the low half
    } else {
      this.buf.writeBigInt64BE(BigInt(v), this.off + 4) // rare path
    }
    this.off += 12
  }
}

export const STMT = 'i_pipe'

/** Text-format Bind, generic typeof dispatch — byte-identical output to
 *  encodeParam + writeBind (verified in bench startup). */
export function bindDirectText(w: BindWriter, stmt: string, values: readonly unknown[]): void {
  w.start('B'); w.cstr(''); w.cstr(stmt)
  w.i16(values.length)
  for (let i = 0; i < values.length; i++) w.i16(0)
  w.i16(values.length)
  for (const v of values) {
    if (v == null) w.i32(-1)
    else if (typeof v === 'number') { if (Number.isInteger(v)) w.lpAsciiInt(v); else w.lpStr(String(v)) }
    else if (typeof v === 'string') w.lpStr(v)
    else if (typeof v === 'boolean') { w.i32(1); w.u8(v ? 116 : 102) } // 't' / 'f'
    else if (v instanceof Date) w.lpStr(v.toISOString())
    else w.lpStr(JSON.stringify(v))
  }
  w.i16(1); w.i16(0) // one result-format code: text
  w.end()
}

/** Binary-format Bind via a per-column encoder PLAN (possible once ParameterDescription OIDs
 *  are cached on prepared reuse — the encode-side mirror of reuseBinaryOids/JIT mappers).
 *  Column order here: id int8, name text, qty int4, price float8, flag bool, created timestamptz. */
export type ColEnc = (w: BindWriter, v: never) => void
export const BIN_PLAN: ColEnc[] = [
  (w, v: number) => w.lpI64(v),                                       // int8
  (w, v: string) => w.lpStr(v),                                       // text (binary == utf8)
  (w, v: number) => { w.i32(4); w.i32(v) },                           // int4
  (w, v: number) => { w.i32(8); w.f8(v) },                            // float8
  (w, v: boolean) => { w.i32(1); w.u8(v ? 1 : 0) },                   // bool (binary: 1/0)
  (w, v: Date) => w.lpI64((v.getTime() - PG_EPOCH_MS) * 1000),        // timestamptz: micros since PG epoch
]

export function bindDirectBinary(w: BindWriter, stmt: string, values: readonly unknown[], plan: ColEnc[]): void {
  w.start('B'); w.cstr(''); w.cstr(stmt)
  w.i16(values.length)
  for (let i = 0; i < values.length; i++) w.i16(1)
  w.i16(values.length)
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null) w.i32(-1)
    else plan[i]!(w, v as never)
  }
  w.i16(1); w.i16(0)
  w.end()
}

export function writeExecSync(w: BindWriter): void {
  w.start('E'); w.cstr(''); w.i32(0); w.end()
  w.start('S'); w.end()
}
