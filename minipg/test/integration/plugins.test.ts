// Telemetry plugin system: verifies the driver fires lifecycle hooks with populated metrics against a
// live server, and that the shipped otel()/sentry() plugins produce the right spans (checked with mock
// SDKs — no real @opentelemetry/@sentry deps needed). Requires the local cluster (`bun run test:setup`).
import { test, expect, describe, afterEach } from 'bun:test'
import { connect } from '../../src/index.ts'
import { otel, sentry, collector } from '../../src/telemetry.ts'
import type { Plugin } from '../../src/plugin.ts'

const CFG = { host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'testdb' }
let open: Array<Awaited<ReturnType<typeof connect>>> = []
afterEach(async () => { for (const c of open) await c.end().catch(() => {}); open = [] })
const withPlugins = async (plugins: Plugin[]) => { const c = await connect({ ...CFG, plugins }); open.push(c); return c }

describe('plugin metrics', () => {
  test('collector receives populated metrics for a successful query', async () => {
    const events: any[] = []
    const c = await withPlugins([collector((e) => events.push(e))])
    await c.query('select g from generate_series(1, 50) g')
    expect(events.length).toBe(1)
    const { info, metrics, error } = events[0]
    expect(error).toBeUndefined()
    expect(info.database).toBe('testdb')
    expect(metrics.command).toBe('SELECT')
    expect(metrics.rowCount).toBe(50)
    expect(metrics.columnCount).toBe(1)
    expect(metrics.total).toBeGreaterThan(0)
    expect(metrics.bytesSent).toBeGreaterThan(0)
    expect(metrics.bytesReceived).toBeGreaterThan(0)
    expect(metrics.queueWait).toBeGreaterThanOrEqual(0)
    expect(metrics.ttfb).toBeGreaterThanOrEqual(0)
    expect(metrics.decode).toBeGreaterThanOrEqual(0)
  })

  test('collector receives an error event on a failing query', async () => {
    const events: any[] = []
    const c = await withPlugins([collector((e) => events.push(e))])
    await c.query('select * from a_table_that_does_not_exist_xyz').catch(() => {})
    expect(events.length).toBe(1)
    expect(events[0].error).toBeInstanceOf(Error)
    expect((events[0].error as { code?: string }).code).toBe('42P01') // undefined_table
    expect(events[0].metrics.error).toBeInstanceOf(Error)
  })

  test('{ metrics: true } attaches result.metrics without any plugin', async () => {
    const c = await connect(CFG); open.push(c)
    const r = await c.query('select 1 as n, 2 as m', [], { metrics: true })
    expect(r.metrics).toBeDefined()
    expect(r.metrics!.rowCount).toBe(1)
    expect(r.metrics!.columnCount).toBe(2)
    expect(r.metrics!.unit).toBe('ms')
    expect(r.metrics!.total).toBeGreaterThan(0)
    const plain = await c.query('select 1') // no metrics option -> undefined
    expect(plain.metrics).toBeUndefined()
  })

  test("metrics: 'ms' | 'us' report integer durations in the chosen unit", async () => {
    const c = await connect(CFG); open.push(c)
    const sql = 'select * from generate_series(1,200) g'
    const durations = (m: NonNullable<Awaited<ReturnType<typeof c.query>>['metrics']>) => [m.queueWait, m.write, m.ttfb, m.download, m.decode, m.total]
    const mms = (await c.query(sql, [], { metrics: 'ms' })).metrics!
    expect(mms.unit).toBe('ms')
    expect(durations(mms).every(Number.isInteger)).toBe(true) // whole ms, no floating point
    const mus = (await c.query(sql, [], { metrics: 'us' })).metrics!
    expect(mus.unit).toBe('us')
    expect(durations(mus).every(Number.isInteger)).toBe(true) // whole microseconds
    expect(mus.total).toBeGreaterThan(0) // sub-ms queries keep resolution in us (unlike coarse ms rounding)
    const mtrue = (await c.query(sql, [], { metrics: true })).metrics!
    expect(mtrue.unit).toBe('ms')
    expect(mtrue.total).toBeGreaterThan(0) // `true` keeps sub-ms floating-point ms (not rounded)
  })
})

describe('otel() plugin (mock tracer)', () => {
  const mockTracer = () => {
    const spans: any[] = []
    return { spans, startSpan(name: string, opts?: { attributes?: Record<string, unknown> }) {
      const s = { name, attrs: { ...(opts?.attributes ?? {}) }, ended: false, status: undefined as any, exceptions: [] as unknown[],
        setAttributes(a: Record<string, unknown>) { Object.assign(this.attrs, a) }, setStatus(st: any) { this.status = st }, recordException(e: unknown) { this.exceptions.push(e) }, end() { this.ended = true } }
      spans.push(s); return s } }
  }

  test('creates a db span with semconv attributes and ends it', async () => {
    const t = mockTracer()
    const c = await withPlugins([otel({ tracer: t })])
    await c.query('select g from generate_series(1, 3) g')
    expect(t.spans.length).toBe(1)
    const s = t.spans[0]
    expect(s.name).toBe('pg.query')
    expect(s.attrs['db.system.name']).toBe('postgresql')
    expect(s.attrs['db.namespace']).toBe('testdb')
    expect(s.attrs['db.operation.name']).toBe('SELECT')
    expect(s.attrs['db.response.returned_rows']).toBe(3)
    expect(s.attrs['minipg.decode_ms']).toBeGreaterThanOrEqual(0)
    expect(typeof s.attrs['minipg.prepared']).toBe('boolean')
    expect(s.ended).toBe(true)
    expect(s.status).toBeUndefined()
  })

  test('records exception + error status on failure', async () => {
    const t = mockTracer()
    const c = await withPlugins([otel({ tracer: t })])
    await c.query('select * from nope_xyz').catch(() => {})
    const s = t.spans[0]
    expect(s.exceptions.length).toBe(1)
    expect(s.status.code).toBe(2) // ERROR
    expect(s.ended).toBe(true)
  })
})

describe('sentry() plugin (mock client)', () => {
  test('starts a db span, sets metrics, ends; captures exception on error', async () => {
    const spans: any[] = []
    const captured: unknown[] = []
    const client = {
      startInactiveSpan(o: any) { const s = { o, attrs: {}, ended: false, status: undefined as any, setAttributes(a: any) { Object.assign(this.attrs, a) }, setStatus(st: any) { this.status = st }, end() { this.ended = true } }; spans.push(s); return s },
      captureException(e: unknown) { captured.push(e) },
    }
    const c = await withPlugins([sentry({ client })])
    await c.query('select 1 as n')
    expect(spans.length).toBe(1)
    expect(spans[0].o.op).toBe('db')
    expect(spans[0].attrs['db.rows']).toBe(1)
    expect(spans[0].ended).toBe(true)
    await c.query('select * from nope_xyz').catch(() => {})
    expect(captured.length).toBe(1)
    expect(spans[1].status.code).toBe(2)
    expect(spans[1].ended).toBe(true)
  })
})

describe('multiple plugins compose', () => {
  test('collector + otel both fire for one query', async () => {
    const events: any[] = []
    const t = { spans: [] as any[], startSpan(_n: string, o?: any) { const s = { attrs: { ...(o?.attributes ?? {}) }, ended: false, setAttributes(a: any) { Object.assign(this.attrs, a) }, end() { this.ended = true } }; this.spans.push(s); return s } }
    const c = await withPlugins([collector((e) => events.push(e)), otel({ tracer: t })])
    await c.query('select 1')
    expect(events.length).toBe(1)
    expect(t.spans.length).toBe(1)
    expect(t.spans[0].ended).toBe(true)
  })
})
