// Proves the multi-runtime transport seam: the driver runs over an injected WHATWG-Web-stream duplex
// (what minipg/deno and minipg/cf provide) — not just a native net.Socket. We simulate it in Node/Bun
// by taking a real TCP socket to the cluster, converting it to Web streams (Duplex.toWeb) and back
// (Duplex.from) so chunks arrive as Uint8Array, exercising the onData Buffer-view coercion + binary
// decode over a non-native transport. Requires the local cluster (`bun run test:setup`).
import { test, expect, describe, afterEach } from 'bun:test'
import net from 'node:net'
import { Duplex } from 'node:stream'
import { connect } from '../../src/index.ts'
import type { CodegenCol } from '../../src/decode.ts'

const CFG = { host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'testdb' }
let open: Array<Awaited<ReturnType<typeof connect>>> = []
afterEach(async () => { for (const c of open) await c.end().catch(() => {}); open = [] })

// a socket factory that yields a Web-stream-backed Duplex (Deno.Conn / CF Socket look like this)
const webTransport = () => async () => {
  const raw = net.connect({ host: CFG.host, port: CFG.port })
  await new Promise<void>((res, rej) => { raw.once('connect', () => res()); raw.once('error', rej) })
  const { readable, writable } = Duplex.toWeb(raw) // Web streams; readable yields Uint8Array
  return Duplex.from({ readable, writable } as never) as Duplex
}

describe('driver over an injected Web-stream transport', () => {
  test('connects, authenticates (SCRAM), and text-decodes', async () => {
    const c = await connect({ ...CFG, socket: webTransport() }); open.push(c)
    const r = await c.query('select g::int4 as n, (g * 1.5)::float8 as f from generate_series(1, 5) g', [], { mode: 'object' })
    expect(r.rows).toEqual([
      { n: 1, f: 1.5 }, { n: 2, f: 3 }, { n: 3, f: 4.5 }, { n: 4, f: 6 }, { n: 5, f: 7.5 },
    ])
  })

  test('binary decode works over the Web-stream transport (Uint8Array chunk path)', async () => {
    const c = await connect({ ...CFG, socket: webTransport() }); open.push(c)
    const cols: CodegenCol[] = [
      { name: 'f', oid: 701, format: 'binary' },
      { name: 'big', oid: 20, format: 'binary' },
      { name: 'ts', oid: 1184, format: 'binary', js: 'ms' },
    ]
    const r = await c.queryTyped(`select 3.141592653589793::float8, 9223372036854775807::int8, '2021-06-02 12:34:56.789+00'::timestamptz`, [], cols, { mode: 'object' })
    expect(r.rows[0] as unknown).toEqual({ f: 3.141592653589793, big: 9223372036854775807n, ts: Date.UTC(2021, 5, 2, 12, 34, 56, 789) })
  })

  test('metrics + a larger result stream correctly over the transport', async () => {
    const c = await connect({ ...CFG, socket: webTransport() }); open.push(c)
    const r = await c.query('select g from generate_series(1, 500) g', [], { metrics: true })
    expect(r.rows.length).toBe(500)
    expect(r.metrics!.bytesReceived).toBeGreaterThan(0)
    expect(r.metrics!.rowCount).toBe(500)
  })
})
