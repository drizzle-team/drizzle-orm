// Real-workerd tests for the serverless driver entries (minipg/neon-ws, /neon-http, /aurora). Confirms
// they actually run on the Cloudflare Workers runtime — global WebSocket / fetch / crypto.subtle,
// nodejs_compat (Buffer / node:stream), and the interpreted decode fallback (workerd has no eval, so the
// 'auto' mapper must pick the interpreted path). Neon URLs are injected as bindings by vitest.config.ts.
import { it, expect, describe } from 'vitest'
import { env } from 'cloudflare:test'
import { connect as connectWs } from '../../src/neon-ws.ts'
import { connect as connectHttp } from '../../src/neon-http.ts'
import { signV4 } from '../../src/sigv4.ts'
import { bind, toParameters } from '../../src/aurora.ts'

const E = env as Record<string, string | undefined>
const WS_URL = E.NEON_WS_URL || undefined
const HTTP_URL = E.NEON_HTTP_URL || undefined

describe('minipg/neon-ws on workerd', () => {
  it.runIf(!!WS_URL)('connects over WebSocket, queries, decodes (interpreted)', async () => {
    const db = await connectWs(WS_URL!)
    try {
      const r = await db.query('select 1 as n, $1::text as t, 42::int8 as big', ['hi'], { mode: 'object' })
      expect(r.rows[0]).toEqual({ n: 1, t: 'hi', big: 42n })
    } finally { await db.end() }
  })
})

describe('minipg/neon-http on workerd', () => {
  it.runIf(!!HTTP_URL)('fetches + decodes (int8->BigInt, numeric->string) via interpreted mapper', async () => {
    const db = await connectHttp(HTTP_URL!)
    const r = await db.query('select 1 as n, $1::int8 as big, $2::numeric as num', ['9223372036854775807', '10.50'], { mode: 'object' })
    expect(r.rows[0]).toEqual({ n: 1, big: 9223372036854775807n, num: '10.50' })
    await db.end()
  })
})

describe('minipg/aurora on workerd (no live endpoint needed)', () => {
  it('SigV4 via crypto.subtle matches the AWS vector', async () => {
    const r = await signV4({
      method: 'GET', path: '/', query: 'Action=ListUsers&Version=2010-05-08',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Host: 'iam.amazonaws.com', 'X-Amz-Date': '20150830T123600Z' },
      body: '', service: 'iam', region: 'us-east-1', amzDate: '20150830T123600Z',
      credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
    })
    expect(r.signature).toBe('33f5dad2191de0cb4b7ab912f876876c2c4f72e2991a458f9499233c7b992438')
  })
  it('bind() encodes params (Buffer/base64 path)', () => {
    const p = toParameters([bind.bigint(10), bind.uuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'id'), Buffer.from('deadbeef', 'hex')])
    expect(p[0]).toEqual({ name: 'p1', value: { longValue: 10 } })
    expect(p[1]).toEqual({ name: 'id', typeHint: 'UUID', value: { stringValue: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' } })
    expect(p[2]!.value).toEqual({ blobValue: Buffer.from('deadbeef', 'hex').toString('base64') })
  })
})
