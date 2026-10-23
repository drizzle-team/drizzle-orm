// Minimal Buffer polyfill over Uint8Array, for runtimes that DON'T ship Buffer (Vercel Edge, browsers).
// It implements exactly the surface the driver uses. Installed as `globalThis.Buffer` only when Buffer
// is absent, so the core code is unchanged and buffer-aware runtimes (Node/Bun/Deno/CF-nodejs_compat)
// pay ZERO — this module is imported ONLY by the edge entry, never by minipg/node|deno|cf.
//
// MiniBuffer IS a Uint8Array (so it flows into Web WritableStream writes unchanged and gets index
// access / iteration for free); multi-byte reads/writes go through a lazily-cached DataView.

const enc = new TextEncoder()
const dec = new TextDecoder() // utf8
const HEX: string[] = []
for (let i = 0; i < 256; i++) HEX.push(i.toString(16).padStart(2, '0'))

// @ts-expect-error MiniBuffer intentionally overrides Uint8Array's static from() with the Buffer.from surface
export class MiniBuffer extends Uint8Array {
  private _dv?: DataView
  private dv(): DataView { return (this._dv ??= new DataView(this.buffer, this.byteOffset, this.byteLength)) }

  // ---- statics the driver / codegen use ----
  static override from(value: string | ArrayBuffer | ArrayLike<number> | Uint8Array, a?: number | string, b?: number): MiniBuffer {
    if (typeof value === 'string') {
      const encoding = (a as string) || 'utf8'
      if (encoding === 'hex') { const out = new MiniBuffer(value.length >> 1); for (let i = 0; i < out.length; i++) out[i] = parseInt(value.substr(i * 2, 2), 16); return out }
      if (encoding === 'latin1' || encoding === 'binary' || encoding === 'ascii') { const out = new MiniBuffer(value.length); for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff; return out }
      // TextEncoder always allocates a FRESH, non-shared ArrayBuffer, but `.buffer` is typed
      // ArrayBufferLike (ArrayBuffer | SharedArrayBuffer) and the two stopped being interchangeable
      // once ArrayBuffer gained resize/transfer — so narrow it here rather than widen the constructor.
      const u = enc.encode(value); return new MiniBuffer(u.buffer as ArrayBuffer, u.byteOffset, u.byteLength) // utf8
    }
    if (value instanceof ArrayBuffer) return new MiniBuffer(value, (a as number) || 0, b) // VIEW (no copy) — matches Buffer.from(ab, off, len)
    const src = value as Uint8Array; const out = new MiniBuffer(src.length); out.set(src); return out // copy
  }
  static alloc(size: number): MiniBuffer { return new MiniBuffer(size) } // Uint8Array zero-fills
  static allocUnsafe(size: number): MiniBuffer { return new MiniBuffer(size) }
  static concat(list: Uint8Array[], totalLength?: number): MiniBuffer {
    let len = totalLength; if (len === undefined) { len = 0; for (const b of list) len += b.length }
    const out = new MiniBuffer(len); let o = 0; for (const b of list) { if (o + b.length > len) { out.set(b.subarray(0, len - o), o); break } out.set(b, o); o += b.length }
    return out
  }
  static isBuffer(x: unknown): x is MiniBuffer { return x instanceof MiniBuffer }
  static compare(a: Uint8Array, b: Uint8Array): number {
    const len = Math.min(a.length, b.length)
    for (let i = 0; i < len; i++) { if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1 }
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1
  }
  static byteLength(str: string, encoding = 'utf8'): number {
    if (encoding === 'hex') return str.length >> 1
    if (encoding === 'latin1' || encoding === 'binary' || encoding === 'ascii') return str.length
    return enc.encode(str).length
  }

  // ---- big-endian reads ----
  readInt16BE(o = 0): number { return this.dv().getInt16(o, false) }
  readUInt16BE(o = 0): number { return this.dv().getUint16(o, false) }
  readInt32BE(o = 0): number { return this.dv().getInt32(o, false) }
  readUInt32BE(o = 0): number { return this.dv().getUint32(o, false) }
  readFloatBE(o = 0): number { return this.dv().getFloat32(o, false) }
  readDoubleBE(o = 0): number { return this.dv().getFloat64(o, false) }
  readBigInt64BE(o = 0): bigint { return this.dv().getBigInt64(o, false) }

  // ---- big-endian writes (return the offset just past the written bytes, like Buffer) ----
  writeUInt8(v: number, o = 0): number { this[o] = v & 0xff; return o + 1 }
  writeInt16BE(v: number, o = 0): number { this.dv().setInt16(o, v, false); return o + 2 }
  writeUInt16BE(v: number, o = 0): number { this.dv().setUint16(o, v, false); return o + 2 }
  writeInt32BE(v: number, o = 0): number { this.dv().setInt32(o, v, false); return o + 4 }
  writeUInt32BE(v: number, o = 0): number { this.dv().setUint32(o, v, false); return o + 4 }
  writeFloatBE(v: number, o = 0): number { this.dv().setFloat32(o, v, false); return o + 4 }
  writeDoubleBE(v: number, o = 0): number { this.dv().setFloat64(o, v, false); return o + 8 }
  writeBigInt64BE(v: bigint, o = 0): number { this.dv().setBigInt64(o, v, false); return o + 8 }

  // ---- misc ----
  copy(target: Uint8Array, targetStart = 0, sourceStart = 0, sourceEnd = this.length): number {
    const slice = this.subarray(sourceStart, sourceEnd); target.set(slice, targetStart); return slice.length
  }
  override subarray(begin?: number, end?: number): MiniBuffer { return super.subarray(begin, end) as MiniBuffer } // species keeps read methods
  // Buffer.prototype.toString(encoding?, start?, end?)
  override toString(encoding?: string, start = 0, end = this.length): string {
    const sub = this.subarray(start, end)
    if (encoding === 'hex') { let s = ''; for (let i = 0; i < sub.length; i++) s += HEX[sub[i]!]; return s }
    if (encoding === 'latin1' || encoding === 'binary' || encoding === 'ascii') { let s = ''; for (let i = 0; i < sub.length; i++) s += String.fromCharCode(sub[i]!); return s }
    return dec.decode(sub) // utf8 (default)
  }
}

// Install as the global Buffer ONLY if the runtime lacks one. Idempotent + guarded, so importing this
// on Node/Bun/Deno/CF (which have Buffer) is a harmless no-op — but those entries don't import it at all.
const g = globalThis as { Buffer?: unknown }
if (typeof g.Buffer === 'undefined') g.Buffer = MiniBuffer
