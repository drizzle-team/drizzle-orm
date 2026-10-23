// rawParams(): pre-encoded Bind parameters — the request-side mirror of mode:'wire'. The driver
// writes the caller's format codes + value bytes VERBATIM into Bind: no encodeValueInto, no binary
// param plan, no coercion. Built for the httpostgres gateway (binary request envelope): a remote
// client encodes with the driver's own encoder and the bytes cross unchanged.
import { test, expect, describe } from 'bun:test'
import { rawParams } from '../../src/index.ts'
import { Parser } from '../../src/protocol.ts'
import { testConnect, caught, TEST_TIMEOUT } from '../helpers/db.ts'

const t = (s: string) => Buffer.from(s, 'utf8')

describe('rawParams()', () => {
  test('text values pass through verbatim (equal to normal encoding), null = SQL NULL', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select $1::int8 as v, $2::text as s, $3::text as n', rawParams({ values: [t('9007199254740993'), t('café 😀'), null] }), { mode: 'object' })
      expect(r.rows[0]).toEqual({ v: 9007199254740993n, s: 'café 😀', n: null })
      const normal = await c.query('select $1::int8 as v, $2::text as s, $3::text as n', [9007199254740993n, 'café 😀', null], { mode: 'object' })
      expect(r.rows[0]).toEqual(normal.rows[0])
    } finally { c.end() }
  }, TEST_TIMEOUT)

  test('binary + mixed formats: caller-chosen per-parameter format codes reach Bind untouched', async () => {
    const c = await testConnect()
    try {
      const i8 = Buffer.allocUnsafe(8); i8.writeBigInt64BE(300n)
      const i4 = Buffer.allocUnsafe(4); i4.writeInt32BE(-7)
      // [binary int8, text int4] — formats per parameter; declared types pin the OIDs in Parse
      const r = await c.query('select $1 as a, $2 as b', rawParams({ formats: [1, 0], values: [i8, t('-7')] }), { params: ['int8', 'int4'], mode: 'object' })
      expect(r.rows[0]).toEqual({ a: 300n, b: -7 })
      // one format code applies to ALL parameters
      const all = await c.query('select $1 as a, $2 as b', rawParams({ formats: [1], values: [i8, i4] }), { params: ['int8', 'int4'], mode: 'object' })
      expect(all.rows[0]).toEqual({ a: 300n, b: -7 })
    } finally { c.end() }
  }, TEST_TIMEOUT)

  test("composes with mode:'wire': bytes in, frames out, driver converts nothing", async () => {
    const c = await testConnect()
    try {
      const frames = await c.query('select $1::text as v', rawParams({ values: [t('gateway-bytes')] }), { mode: 'wire' })
      const stream = Buffer.concat(frames.map((f) => Buffer.from(f)))
      expect(new Parser().push(stream).map((m) => m.type)).toEqual(['T', 'D', 'C'])
      expect(stream.toString('latin1')).toContain('gateway-bytes')
    } finally { c.end() }
  }, TEST_TIMEOUT)

  test('framing validation only: bad formats length throws locally; declared-types count mismatch errors', async () => {
    expect(() => rawParams({ formats: [0, 1], values: [t('x')] })).toThrow(/formats must have 0, 1, or values\.length/)
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select $1::int4', rawParams({ values: [t('1'), t('2')] }), { params: ['int4'] }))
      expect((err as Error).message).toMatch(/2 param value\(s\) but 1 type\(s\) declared/)
      // the caller owns byte correctness: garbage binary bytes surface as the SERVER's error, not silence
      const bad = await caught(() => c.query('select $1::int8', rawParams({ formats: [1], values: [t('xx')] }), { params: ['int8'] }))
      expect((bad as Error).message).toMatch(/binary|format|insufficient/i)
    } finally { c.end() }
  }, TEST_TIMEOUT)
})
