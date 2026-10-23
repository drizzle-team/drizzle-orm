// Server-side cursor over any SELECT: DECLARE … FETCH batches with constant memory on both
// sides (the executor suspends between fetches). Created SYNCHRONOUSLY and lazily — the
// connection is acquired and the cursor declared on the first next(). Guards against
// abandonment: a client idle timer (non-destructive rollback) + the server's
// idle_in_transaction_session_timeout (fires even if this process is frozen).
//
//   const cur = pool.cursor({ sql: 'select * from orders where created_at > $1', params: [d] })
//   for await (const row of cur) { … }          // rows; cur.batches() for batches; cur.next() for batch|null
//   const rows = await cur.all()                 // drain everything into one array
//   await cur.close()                            // early termination (idempotent)
import type { Connection } from './connection.ts'
import type { ShapeSpec } from './spec.ts'
import type { ShapeMapper } from './shape.ts'

export interface CursorOptions {
  sql: string
  params?: unknown[]
  /** Rows per batch (default 5_000). */
  fetchSize?: number
  /** Row shape: 'object' (default) or 'array'. */
  mode?: 'array' | 'object'
  /** Decode with a declared column shape (same as query's `shape`). */
  shape?: ShapeSpec | ShapeMapper
  /** Pin an exported snapshot (from replication createSlot) — implies repeatable read, read only. */
  snapshot?: string
  /** The cursor will be drained fully: plan for throughput (cursor_tuple_fraction = 1.0)
   *  instead of the fast-startup plans Postgres picks for cursors by default. */
  fullScan?: boolean
  /** Abandonment guard (default 300_000 = 5 min, 0 = off): if the consumer stops calling
   *  next() for this long, the cursor aborts (transaction rolled back). The same value is set
   *  as the server's idle_in_transaction_session_timeout, which kills the session even if
   *  this process is frozen — the transaction (and its snapshot) can never leak. */
  idleTimeoutMs?: number
  /** Hard ceiling for the cursor's whole lifetime (default off). */
  maxDurationMs?: number
}

/** How a Cursor gets (and gives back) its connection. Pool: dedicated checkout; Connection: itself. */
export interface CursorLease { conn: Connection; release: () => void }

let cursorSeq = 0

export class Cursor<Row = Record<string, unknown>> implements AsyncIterable<Row> {
  private state: 'idle' | 'open' | 'done' = 'idle'
  private err: Error | null = null
  private lease: CursorLease | null = null
  private name = `_minipg_c${cursorSeq++}`
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private deadline: ReturnType<typeof setTimeout> | null = null
  private opening: Promise<void> | null = null
  private fetching = false

  constructor(private acquire: () => Promise<CursorLease>, private opts: CursorOptions) {}

  private get idleMs(): number { return this.opts.idleTimeoutMs ?? 300_000 }

  /** Acquire + BEGIN + guards + DECLARE. Idempotent; next() calls it lazily. */
  open(): Promise<void> {
    if (this.err) return Promise.reject(this.err)
    if (this.state !== 'idle') return this.opening ?? Promise.resolve()
    this.state = 'open'
    this.opening = (async () => {
      const lease = await this.acquire()
      this.lease = lease
      try {
        const { conn } = lease
        await conn.query(this.opts.snapshot ? 'begin isolation level repeatable read read only' : 'begin')
        if (this.idleMs > 0) await conn.query(`set local idle_in_transaction_session_timeout = ${Math.floor(this.idleMs)}`)
        if (this.opts.fullScan) await conn.query('set local cursor_tuple_fraction = 1.0')
        if (this.opts.snapshot) await conn.query(`set transaction snapshot '${this.opts.snapshot.replace(/'/g, "''")}'`)
        await conn.query(`declare ${this.name} no scroll cursor for ${this.opts.sql}`, this.opts.params ?? [])
        if (this.opts.maxDurationMs) this.deadline = setTimeout(() => { void this.abort(`cursor exceeded maxDurationMs (${this.opts.maxDurationMs}ms)`) }, this.opts.maxDurationMs)
      } catch (e) {
        await this.cleanup(e as Error)
        throw e
      }
    })()
    return this.opening
  }

  /** The next batch (up to fetchSize rows), or null when exhausted (auto-closed). */
  async next(): Promise<Row[] | null> {
    if (this.err) throw this.err
    if (this.state === 'done') return null
    if (this.state === 'idle') await this.open()
    else if (this.opening) await this.opening
    if (this.err) throw this.err
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
    this.fetching = true
    let rows: unknown[]
    try {
      const r = await this.lease!.conn.query(`fetch ${Math.max(1, this.opts.fetchSize ?? 5_000)} from ${this.name}`, [],
        { mode: this.opts.mode ?? 'object', ...(this.opts.shape ? { shape: this.opts.shape } : {}) } as never)
      rows = r.rows
    } catch (e) {
      await this.cleanup(this.err ?? (e as Error))
      throw this.err
    } finally { this.fetching = false }
    if (rows.length < Math.max(1, this.opts.fetchSize ?? 5_000)) {
      if (rows.length === 0) { await this.close(); return null }
      await this.close()
      return rows as Row[]
    }
    // idle window: the consumer is holding this batch — arm the abandonment guard
    if (this.idleMs > 0) this.idleTimer = setTimeout(() => { void this.abort(`cursor idle for ${this.idleMs}ms — consumer stopped calling next()`) }, this.idleMs)
    return rows as Row[]
  }

  /** Early termination: CLOSE + COMMIT + release. Idempotent; safe after errors. */
  async close(): Promise<void> {
    if (this.state === 'done') return
    const wasOpen = this.state === 'open' && !!this.lease
    this.state = 'done'
    this.clearTimers()
    if (wasOpen && !this.err) {
      const { conn } = this.lease!
      try { await conn.query(`close ${this.name}`); await conn.query('commit') } catch { try { await conn.query('rollback') } catch { /* connection gone */ } }
    }
    this.lease?.release()
    this.lease = null
  }

  // guard trip: non-destructive — roll the transaction back (frees cursor + snapshot), keep the
  // connection alive. If the process is frozen and this never runs, the SERVER kills the session.
  private async abort(why: string): Promise<void> {
    if (this.state === 'done' || this.err) return
    await this.cleanup(new Error(why))
  }

  private async cleanup(e: Error): Promise<void> {
    this.err = e
    this.state = 'done'
    this.clearTimers()
    if (this.lease) {
      const { conn } = this.lease
      if (!this.fetching) { try { await conn.query('rollback') } catch { /* connection gone */ } }
      else { try { await conn.end() } catch { /* mid-fetch: can't interject — drop the connection */ } }
      this.lease.release()
      this.lease = null
    }
  }

  private clearTimers(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
    if (this.deadline) { clearTimeout(this.deadline); this.deadline = null }
  }

  /** Drain the rest of the cursor into ONE array (exact-size, single final copy — batches are
   *  collected by reference, never spread). Called mid-iteration it returns the REMAINING rows;
   *  after exhaustion it returns []. */
  async all(): Promise<Row[]> {
    const batches: Row[][] = []
    let total = 0
    for (;;) {
      const b = await this.next()
      if (b === null) break
      batches.push(b)
      total += b.length
    }
    const rows = new Array<Row>(total)
    let i = 0
    for (const b of batches) for (const r of b) rows[i++] = r
    return rows
  }

  /** Alias for all(). */
  drain(): Promise<Row[]> { return this.all() }

  /** Iterate BATCHES (`for await (const batch of cur.batches())`). Break/throw closes the cursor. */
  async *batches(): AsyncGenerator<Row[]> {
    try {
      for (;;) {
        const b = await this.next()
        if (b === null) return
        yield b
      }
    } finally { await this.close() } // break/throw inside for-await lands here
  }

  /** Iterate ROWS (`for await (const row of cursor)`) — batching stays internal.
   *  Break/throw closes the cursor. Use batches() or next() for batch-wise consumption. */
  async *[Symbol.asyncIterator](): AsyncGenerator<Row> {
    try {
      for (;;) {
        const b = await this.next()
        if (b === null) return
        yield* b
      }
    } finally { await this.close() }
  }
}
