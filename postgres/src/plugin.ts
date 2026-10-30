// Explicit plugin system for telemetry/observability. Plugins are passed to the driver
// (`connect({ plugins: [otel(), sentry()] })`) and subscribe to lifecycle hooks — NO monkey-patching,
// no implicit global setup. Per query the driver calls onQueryStart (whose return value is threaded
// back as `state` to onQueryEnd/onQueryError, so a plugin can carry a span), then onQueryEnd or
// onQueryError with the collected metrics. All hooks are optional; when no plugin (and no `metrics`
// option) is present, the driver skips timing entirely (zero hot-path cost).

/** Static facts about a query, known when it starts. */
export interface QueryInfo {
	sql: string;
	statementName?: string | undefined;
	paramCount: number;
	database: string;
	host?: string | undefined;
	backendPid?: number | undefined;
	prepared: boolean; // true if this reused a cached prepared statement (Parse skipped)
}

/** Per-query measurements. Durations are in `unit`: 'ms' (default — `metrics:true` keeps sub-ms floating
 *  point; `metrics:'ms'` rounds to whole ms) or 'us' (microseconds, integer — `metrics:'us'`). ttfb ≈
 *  network RTT + server exec; download is first byte → ReadyForQuery (decode is the CPU subset of it). */
export interface QueryMetrics {
	unit: 'ms' | 'us'; // the unit of every duration field below
	queueWait: number; // enqueue → execution start (pool/serialization contention)
	write: number; // encode + serialize + socket.write
	ttfb: number; // write → first response byte
	download: number; // first byte → ReadyForQuery (wall; includes interleaved decode)
	decode: number; // CPU spent mapping DataRow bodies → JS
	total: number; // enqueue → resolve
	bytesSent: number;
	bytesReceived: number;
	rowCount: number | null;
	columnCount: number;
	command: string | null;
	prepared: boolean; // true if this reused a cached prepared statement (Parse skipped)
	error?: Error;
}

export interface Plugin {
	readonly name: string;
	/** Query about to execute. Return any per-query state (e.g. a span) — threaded to end/error. */
	onQueryStart?(info: QueryInfo): unknown;
	onQueryEnd?(state: unknown, info: QueryInfo, metrics: QueryMetrics): void;
	onQueryError?(state: unknown, info: QueryInfo, error: Error, metrics: QueryMetrics): void;
	/** Connection reached ReadyForQuery (initial connect). */
	onConnect?(info: { database: string; host?: string | undefined; backendPid?: number | undefined }): void;
	onReconnect?(info: { attempt: number; error: Error }): void;
	onDisconnect?(info: { error?: Error | undefined }): void;
}

/** The span attributes for a query's metrics, under the OTel database names where one exists. */
export const metricAttributes = (m: QueryMetrics) => ({
	'db.response.returned_rows': m.rowCount ?? 0,
	'db.client.response.body.size': m.bytesReceived,
	'postgres.bytes_sent': m.bytesSent,
	'postgres.queue_wait_ms': m.queueWait,
	'postgres.ttfb_ms': m.ttfb,
	'postgres.download_ms': m.download,
	'postgres.decode_ms': m.decode,
	'postgres.total_ms': m.total,
	'postgres.prepared': m.prepared,
});
