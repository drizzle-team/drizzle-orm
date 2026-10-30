// Telemetry plugins — `import { otel, sentry } from '@drizzle-team/postgres/telemetry'`.
// Explicit, no monkey-patching: `connect({ plugins: [otel()] })`. Each factory returns a Plugin that
// turns the driver's per-query lifecycle into spans/metrics. The OTel/Sentry SDKs are OPTIONAL: they
// are lazily resolved at runtime (so this module has no hard dependency), or you can inject the
// instance for testing. Drizzle Postgres emits OTel spans following DB semantic conventions — which is also what
// makes Sentry (its Node SDK runs on OpenTelemetry) display them, so `otel()` alone often suffices.
import { createRequire } from 'node:module'
import { metricAttributes, type Plugin, type QueryInfo, type QueryMetrics } from './plugin.ts'

// minimal shapes so we don't depend on the real SDK types
interface SpanLike { setAttribute?(k: string, v: unknown): void; setAttributes?(a: Record<string, unknown>): void; setStatus?(s: { code: number; message?: string }): void; recordException?(e: unknown): void; end?(): void }
interface TracerLike { startSpan(name: string, opts?: { attributes?: Record<string, unknown> }): SpanLike }
interface SentryLike { startInactiveSpan?(o: { op?: string; name?: string; attributes?: Record<string, unknown> }): SpanLike | undefined; captureException?(e: unknown): void }

function optionalRequire(name: string): unknown {
  try { return createRequire(import.meta.url)(name) } catch { return undefined }
}
const operationOf = (sql: string) => (sql.trimStart().split(/\s+/, 1)[0] || '').toUpperCase() // SELECT / INSERT / …
const ERROR_STATUS = 2 // OTel SpanStatusCode.ERROR

/** OpenTelemetry plugin — one span per query with DB semantic-convention attributes + Drizzle Postgres's timings.
 *  Uses the global tracer unless you pass one. Works with any OTel exporter (Jaeger, Honeycomb, Datadog,
 *  and Sentry, whose Node SDK consumes OTel spans). */
export function otel(opts: { tracer?: TracerLike; captureText?: boolean } = {}): Plugin {
  const api = opts.tracer ? undefined : (optionalRequire('@opentelemetry/api') as { trace?: { getTracer?(n: string): TracerLike } } | undefined)
  const tracer: TracerLike | undefined = opts.tracer ?? api?.trace?.getTracer?.('@drizzle-team/postgres')
  if (!tracer) throw new Error("@drizzle-team/postgres/telemetry: otel() needs @opentelemetry/api installed (or pass { tracer })")
  const withText = opts.captureText ?? true
  return {
    name: 'otel',
    onQueryStart(info: QueryInfo) {
      return tracer.startSpan('pg.query', { attributes: {
        'db.system.name': 'postgresql', 'db.namespace': info.database, 'db.operation.name': operationOf(info.sql),
        ...(info.host ? { 'server.address': info.host } : {}), ...(withText ? { 'db.query.text': info.sql } : {}) } })
    },
    onQueryEnd(span: unknown, _info: QueryInfo, m: QueryMetrics) {
      const s = span as SpanLike
      s.setAttributes?.(metricAttributes(m))
      s.end?.()
    },
    onQueryError(span: unknown, _info: QueryInfo, err: Error) {
      const s = span as SpanLike; s.recordException?.(err); s.setStatus?.({ code: ERROR_STATUS, message: err.message }); s.end?.()
    },
  }
}

/** Sentry plugin — a `db` span per query on the active trace, exception captured on failure. Uses the
 *  ambient Sentry SDK unless you pass a client. (If you already run Sentry's OTel pipeline, `otel()`
 *  covers Postgres too and you don't need this.) */
export function sentry(opts: { client?: SentryLike; captureText?: boolean } = {}): Plugin {
  const S: SentryLike | undefined = opts.client ?? (optionalRequire('@sentry/node') as SentryLike | undefined)
  if (!S) throw new Error("@drizzle-team/postgres/telemetry: sentry() needs @sentry/node installed (or pass { client })")
  const withText = opts.captureText ?? true
  return {
    name: 'sentry',
    onQueryStart(info: QueryInfo) {
      return S.startInactiveSpan?.({ op: 'db', name: withText ? info.sql : (info.statementName ?? operationOf(info.sql)),
        attributes: { 'db.system': 'postgresql', 'db.name': info.database, ...(info.host ? { 'server.address': info.host } : {}) } })
    },
    onQueryEnd(span: unknown, _info: QueryInfo, m: QueryMetrics) {
      const s = span as SpanLike | undefined; if (!s) return
      s.setAttributes?.({ 'db.rows': m.rowCount ?? 0, 'db.bytes': m.bytesReceived, 'db.queue_wait_ms': m.queueWait, 'db.ttfb_ms': m.ttfb, 'db.decode_ms': m.decode, 'db.total_ms': m.total })
      s.end?.()
    },
    onQueryError(span: unknown, _info: QueryInfo, err: Error) {
      S.captureException?.(err)
      const s = span as SpanLike | undefined; if (s) { s.setStatus?.({ code: ERROR_STATUS, message: err.message }); s.end?.() }
    },
  }
}

/** Dependency-free sink plugin — forwards every completed/failed query's info + metrics to your
 *  callback (aggregate, log, ship to a custom backend). */
export function collector(sink: (e: { info: QueryInfo; metrics: QueryMetrics; error?: Error }) => void): Plugin {
  return {
    name: 'collector',
    onQueryEnd(_s: unknown, info: QueryInfo, metrics: QueryMetrics) { sink({ info, metrics }) },
    onQueryError(_s: unknown, info: QueryInfo, error: Error, metrics: QueryMetrics) { sink({ info, metrics, error }) },
  }
}
