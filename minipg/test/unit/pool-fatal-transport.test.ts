// A transport error that no retry can fix must reject the pool at once, as a bad password does, instead of
// tripping the recovery breaker and holding every caller for the full acquireTimeout.
import { test, expect } from 'bun:test'
import { createPool } from '../../src/core.ts'
import { negotiateSslRequest } from '../../src/webstream.ts'

test("a server that answers 'N' to SSLRequest fails the pool fast", async () => {
  const pool = createPool({
    host: 'db.example', ssl: 'require',
    socket: async () => {
      const readable = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([0x4e])); c.close() } })
      await negotiateSslRequest(readable, new WritableStream<Uint8Array>())
      throw new Error('unreachable')
    },
  } as never)
  const started = Date.now()
  await expect(Promise.resolve(pool.query('select 1'))).rejects.toThrow(/server refused TLS \('N'/)
  expect(Date.now() - started).toBeLessThan(2000)
  await pool.end()
}, 40000)

test('the root entry on workerd fails the pool fast', async () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Cloudflare-Workers' }, configurable: true })
  try {
    const { createPool: createRootPool } = await import('../../src/index.ts')
    const pool = createRootPool({ host: 'db.example' })
    const started = Date.now()
    await expect(Promise.resolve(pool.query('select 1'))).rejects.toThrow(/cannot run on Cloudflare Workers/)
    expect(Date.now() - started).toBeLessThan(2000)
    await pool.end()
  } finally {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc)
    else delete (globalThis as Record<string, unknown>).navigator
  }
}, 40000)
