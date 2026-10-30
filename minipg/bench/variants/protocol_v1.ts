// PostgreSQL frontend/backend wire protocol v3 — message framing only.
// No I/O here: writers return Buffers; Parser turns socket bytes into messages.
import type { Field } from '../../src/types.ts'
import type { EncodedParam } from '../../src/encode.ts'

const PROTOCOL_VERSION = 196608 // 3 << 16

const i16 = (n: number) => { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(n); return b } // protocol int16 counts are non-negative
const i32 = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeInt32BE(n); return b }
const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])
const guardNul = (s: string, what: string) => { if (s.indexOf('\0') !== -1) throw new Error(`${what} contains NUL byte (0x00)`) }

// type byte + int32 length (length covers itself + payload) + payload
const msg = (type: string, payload: Buffer = Buffer.alloc(0)) =>
  Buffer.concat([Buffer.from(type, 'latin1'), i32(payload.length + 4), payload])

export const W = {
  startup(params: Record<string, string | undefined>): Buffer {
    const parts: Buffer[] = [i32(PROTOCOL_VERSION)]
    for (const [k, v] of Object.entries(params)) { if (v == null) continue; parts.push(cstr(k), cstr(v)) }
    parts.push(Buffer.from([0]))
    const payload = Buffer.concat(parts)
    return Buffer.concat([i32(payload.length + 4), payload]) // startup has no type byte
  },
  password: (s: string) => msg('p', cstr(s)),
  saslInitial(mechanism: string, clientFirst: string): Buffer {
    const cf = Buffer.from(clientFirst, 'utf8')
    return msg('p', Buffer.concat([cstr(mechanism), i32(cf.length), cf]))
  },
  saslResponse: (clientFinal: string) => msg('p', Buffer.from(clientFinal, 'utf8')),

  parse(name: string, sql: string): Buffer {
    guardNul(sql, 'query text')
    return msg('P', Buffer.concat([cstr(name), cstr(sql), i16(0)])) // 0 param-type oids => server infers
  },
  bind(portal: string, statement: string, params: EncodedParam[], resultFormat = 0): Buffer {
    if (params.length > 65535) throw new Error(`too many bind parameters: ${params.length} (max 65535)`)
    const parts: Buffer[] = [cstr(portal), cstr(statement), i16(params.length)]
    for (const p of params) parts.push(i16(p.format))
    parts.push(i16(params.length))
    for (const p of params) {
      if (p.bytes == null) parts.push(i32(-1))
      else parts.push(i32(p.bytes.length), p.bytes)
    }
    parts.push(i16(1), i16(resultFormat)) // one result-format code applied to all columns
    return msg('B', Buffer.concat(parts))
  },
  describe: (kind: 'S' | 'P', name: string) => msg('D', Buffer.concat([Buffer.from(kind, 'latin1'), cstr(name)])),
  execute: (portal: string, maxRows = 0) => msg('E', Buffer.concat([cstr(portal), i32(maxRows)])),
  close: (kind: 'S' | 'P', name: string) => msg('C', Buffer.concat([Buffer.from(kind, 'latin1'), cstr(name)])),
  sync: () => msg('S'),
  flush: () => msg('H'),
  terminate: () => msg('X'),
  copyFail: (reason: string) => msg('f', cstr(reason)),
  sslRequest: () => Buffer.concat([i32(8), i32(80877103)]),
  // Sent on a SEPARATE connection to cancel an in-flight query on the backend
  // identified by (pid, secretKey) from BackendKeyData. No reply; server closes it.
  cancelRequest: (pid: number, secret: number) => Buffer.concat([i32(16), i32(80877102), i32(pid), i32(secret)]),
}

export interface RawMessage { type: string; body: Buffer }

/** Incremental parser: feed socket chunks, get back complete messages. */
export class Parser {
  private buf: Buffer = Buffer.alloc(0)
  push(chunk: Buffer): RawMessage[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk
    const out: RawMessage[] = []
    let off = 0
    while (this.buf.length - off >= 5) {
      const len = this.buf.readInt32BE(off + 1)
      if (len < 4) throw new Error(`invalid backend message length: ${len}`) // guard: avoid non-advancing offset / infinite loop
      const total = len + 1
      if (this.buf.length - off < total) break
      out.push({ type: String.fromCharCode(this.buf[off]!), body: this.buf.subarray(off + 5, off + total) })
      off += total
    }
    this.buf = off === this.buf.length ? Buffer.alloc(0) : this.buf.subarray(off)
    return out
  }
}

/** Decode a RowDescription ('T') body into field descriptors. */
export function parseRowDescription(body: Buffer): Field[] {
  const n = body.readInt16BE(0)
  const fields: Field[] = []
  let off = 2
  for (let i = 0; i < n; i++) {
    let end = off
    while (body[end] !== 0) end += 1
    const name = body.toString('utf8', off, end)
    off = end + 1
    fields.push({
      name,
      tableOid: body.readInt32BE(off),
      columnId: body.readInt16BE(off + 4),
      dataTypeOid: body.readInt32BE(off + 6),
      dataTypeSize: body.readInt16BE(off + 10),
      typeModifier: body.readInt32BE(off + 12),
      format: body.readInt16BE(off + 16),
    })
    off += 18
  }
  return fields
}

/** Decode a DataRow ('D') body into raw (Buffer|null) field values. */
export function parseDataRow(body: Buffer): (Buffer | null)[] {
  const n = body.readInt16BE(0)
  const cells: (Buffer | null)[] = new Array(n)
  let off = 2
  for (let i = 0; i < n; i++) {
    const len = body.readInt32BE(off); off += 4
    if (len === -1) cells[i] = null
    else { cells[i] = body.subarray(off, off + len); off += len }
  }
  return cells
}
