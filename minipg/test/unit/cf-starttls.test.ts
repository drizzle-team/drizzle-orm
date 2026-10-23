// src/webstream.ts — the Web-streams plumbing minipg/cf and minipg/deno share, unit-tested over plain
// Web streams (no workerd, no Deno needed):
//   - the Postgres STARTTLS exchange minipg/cf performs before startTls(): SSLRequest bytes out, one-byte
//     reply in, fail closed on everything that isn't a bare 'S';
//   - duplexFromWeb, the Web-streams -> Node-Duplex bridge both entries hand the core as their transport.
// The workerd side (real cloudflare:sockets) is covered in test/cf; the Deno side in test/deno.
import { test, expect, describe } from 'bun:test'
import { negotiateSslRequest, duplexFromWeb } from '../../src/webstream.ts'

function fakeSocket(...replies: Uint8Array[]) {
  const written: Uint8Array[] = []
  const readable = new ReadableStream<Uint8Array>({ start(c) { for (const r of replies) c.enqueue(r); c.close() } })
  const writable = new WritableStream<Uint8Array>({ write(chunk) { written.push(chunk) } })
  return { readable, writable, written }
}

describe('minipg/cf STARTTLS negotiation', () => {
  test("sends the exact 8-byte SSLRequest and accepts a bare 'S'", async () => {
    const s = fakeSocket(new Uint8Array([0x53]))
    await negotiateSslRequest(s.readable, s.writable)
    expect(s.written.length).toBe(1)
    const req = Buffer.from(s.written[0]!)
    expect(req.length).toBe(8)
    expect(req.readInt32BE(0)).toBe(8)          // length
    expect(req.readInt32BE(4)).toBe(80877103)   // SSLRequest code
    // both locks released: the streams are lockable again (startTls precondition)
    ;(s.readable as ReadableStream).getReader().releaseLock()
    ;(s.writable as WritableStream).getWriter().releaseLock()
  })

  test("'N' refusal, non-Postgres replies, trailing bytes, and EOF all fail closed", async () => {
    const attempt = (...replies: Uint8Array[]) => { const s = fakeSocket(...replies); return negotiateSslRequest(s.readable, s.writable) }
    await expect(attempt(new Uint8Array([0x4e]))).rejects.toThrow(/server refused TLS \('N'/)
    await expect(attempt(new Uint8Array([0x58]))).rejects.toThrow(/unexpected SSLRequest reply 0x58/)
    await expect(attempt(new Uint8Array([0x53, 0x16]))).rejects.toThrow(/unexpected data after the SSLRequest reply/) // nothing may ride behind 'S'
    await expect(attempt()).rejects.toThrow(/closed during the SSLRequest exchange/)
  })
})

test('the node transport refuses to run on workerd with a pointed error (root-entry-in-Worker trap)', async () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Cloudflare-Workers' }, configurable: true })
  try {
    const { nodeTransport } = await import('../../src/transport-node.ts')
    await expect(nodeTransport({} as never, new AbortController().signal)).rejects.toThrow(/cannot run on Cloudflare Workers — import from 'minipg\/cf'/)
  } finally {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc)
    else delete (globalThis as Record<string, unknown>).navigator
  }
})

// A controllable peer: what it sends, and what it received.
function fakePeer() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const written: Uint8Array[] = []
  let aborted: unknown, cancelled: unknown, closed = false
  const readable = new ReadableStream<Uint8Array>({ start(c) { ctrl = c }, cancel(r) { cancelled = r ?? 'cancelled' } })
  const writable = new WritableStream<Uint8Array>({
    write(chunk) { written.push(chunk) },
    close() { closed = true },
    abort(r) { aborted = r ?? 'aborted' },
  })
  return {
    readable, writable, written,
    send: (b: Uint8Array | string) => ctrl.enqueue(typeof b === 'string' ? new TextEncoder().encode(b) : b),
    eof: () => ctrl.close(),
    fail: (e: Error) => ctrl.error(e),
    get aborted() { return aborted }, get cancelled() { return cancelled }, get closed() { return closed },
  }
}
const next = <T>(emitter: { once(ev: string, cb: (v: T) => void): unknown }, ev: string) =>
  new Promise<T>((r) => emitter.once(ev, r))
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

describe('duplexFromWeb', () => {
  test('inbound chunks arrive as Buffers, in order, across arbitrary boundaries', async () => {
    const peer = fakePeer()
    const d = duplexFromWeb(peer.readable, peer.writable)
    const got: Buffer[] = []
    d.on('data', (c: Buffer) => { expect(Buffer.isBuffer(c)).toBe(true); got.push(c) })
    peer.send('hel'); peer.send('lo'); peer.send(' world')
    await tick()
    expect(Buffer.concat(got).toString()).toBe('hello world')
    d.destroy()
  })

  test('an inbound chunk is a VIEW on the peer buffer, not a copy', async () => {
    const peer = fakePeer()
    const d = duplexFromWeb(peer.readable, peer.writable)
    const src = new Uint8Array([1, 2, 3, 4])
    const seen = next<Buffer>(d, 'data')
    d.resume(); peer.send(src)
    const chunk = await seen
    expect(chunk.buffer).toBe(src.buffer) // no copy on the hot receive path
    expect([...chunk]).toEqual([1, 2, 3, 4])
    d.destroy()
  })

  test('writes reach the peer, and empty inbound chunks are skipped (never a premature EOF)', async () => {
    const peer = fakePeer()
    const d = duplexFromWeb(peer.readable, peer.writable)
    d.resume()
    d.write(Buffer.from('ping'))
    await tick()
    expect(Buffer.concat(peer.written.map((w) => Buffer.from(w))).toString()).toBe('ping')

    let ended = false
    d.on('end', () => { ended = true })
    peer.send(new Uint8Array(0)) // a zero-length frame must not look like EOF
    await tick()
    expect(ended).toBe(false)
    d.destroy()
  })

  test("peer EOF ends the readable AND closes the duplex (allowHalfOpen:false — the core's drop signal)", async () => {
    const peer = fakePeer()
    const d = duplexFromWeb(peer.readable, peer.writable)
    d.resume()
    const closed = next(d, 'close')
    peer.send('x'); peer.eof()
    await closed
    expect(d.destroyed).toBe(true)
  })

  test('a peer stream error surfaces as a duplex error, not an unhandled rejection', async () => {
    const peer = fakePeer()
    const d = duplexFromWeb(peer.readable, peer.writable)
    d.resume()
    const err = next<Error>(d, 'error')
    peer.fail(new Error('connection reset by peer'))
    expect((await err).message).toContain('connection reset by peer')
  })

  test('backpressure: the pump pauses when push() says stop, and resumes on read()', async () => {
    const peer = fakePeer()
    const d = duplexFromWeb(peer.readable, peer.writable) // paused: nothing consuming yet
    for (let i = 0; i < 200; i++) peer.send('x'.repeat(1024)) // ~200 KiB, far past the default highWaterMark
    peer.eof()
    await tick(20)
    let total = 0
    d.on('data', (c: Buffer) => { total += c.length })
    await next(d, 'close') // resuming must drain everything the peer sent
    expect(total).toBe(200 * 1024)
  })

  test('end() closes the peer writable; destroy() cancels the reader and aborts the writer', async () => {
    const graceful = fakePeer()
    const g = duplexFromWeb(graceful.readable, graceful.writable)
    g.resume(); g.end()
    await tick()
    expect(graceful.closed).toBe(true)

    const abrupt = fakePeer()
    const a = duplexFromWeb(abrupt.readable, abrupt.writable)
    a.resume(); a.destroy()
    await tick()
    expect(abrupt.cancelled).toBeDefined() // the socket is released, not leaked
    expect(abrupt.aborted).toBeDefined()
  })
})
