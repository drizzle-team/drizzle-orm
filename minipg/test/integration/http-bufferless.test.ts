// R4 regression: minipg/http must work on runtimes with NO global Buffer — the polyfill's entire
// audience. The trap is module-EVAL-time Buffer touches (decode.ts feature probes, encode.ts
// COPY_SIG): bundlers reorder imports, so the polyfill may install AFTER those modules evaluate.
// The fix is guards, making import order irrelevant. This test deletes Buffer in a subprocess,
// imports the entry, and runs a full client decode over REAL captured backend frames.
import { test, expect, describe } from 'bun:test'
import { testConnect, TEST_TIMEOUT } from '../helpers/db.ts'

describe('minipg/http without a global Buffer', () => {
  test('entry imports, MiniBuffer installs, and a real pgwire body decodes end-to-end', async () => {
    const c = await testConnect()
    let body: Buffer
    try {
      const frames = await c.query(`select 9007199254740993::int8 as big, 'café 😀' as s, null::text as z`, [], { mode: 'wire' })
      body = Buffer.concat(frames.map((f) => Buffer.from(f)))
    } finally { c.end() }

    const script = `
      delete globalThis.Buffer // simulate Vercel Edge / browser: no Buffer before the entry loads
      const { client } = await import(${JSON.stringify(import.meta.dir + '/../../src/http.ts')})
      if (typeof globalThis.Buffer !== 'function') throw new Error('polyfill did not install')
      const bytes = Uint8Array.fromBase64(${JSON.stringify(body.toString('base64'))})
      const db = client({
        url: 'https://gw.example/query', token: 'k', int8: 'string', // JSON.stringify below would throw on the default BigInt
        fetch: async () => new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/vnd.minipg.pgwire' } }),
      })
      const r = await db.query('select …', [], { mode: 'object' })
      console.log(JSON.stringify(r.rows[0]))
    `
    const proc = Bun.spawnSync(['bun', '-e', script])
    const out = proc.stdout.toString().trim()
    const err = proc.stderr.toString()
    expect(err.includes('ReferenceError')).toBe(false)
    expect(proc.exitCode).toBe(0)
    expect(JSON.parse(out)).toEqual({ big: '9007199254740993', s: 'café 😀', z: null }) // int8:'string' -> JSON-safe
  }, TEST_TIMEOUT)
})
