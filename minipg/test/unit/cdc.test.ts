// Proves the managed layer's OWN decisions — which commands it issues, in what order, whether it
// acks, whether it reconnects — driven over an in-process fake walsender (cdcBackend, a
// multi-session wrapper around the raw layer's fake-Duplex harness). What this fixture cannot
// prove: anything only Postgres decides (real catalog state, snapshot validity, privileges) —
// those live in test/integration/replication.test.ts.
import { test, expect } from 'bun:test'
import { Duplex } from 'node:stream'
import { frame, rowDescription, dataRow as dataRowBody, type WireCol, type Cell } from '../helpers/wire.ts'
import { replication as rawReplication, batchTransactions as rawBatchTransactions, PgError, InvalidSlotName, InvalidReplicationShape, PublicationEmpty, type ReplicationConfig, type TransactionBatch } from '../../src/index.ts'
import { replicate, SlotInvalidatedError, BackfillTimeoutError, SlotBusyError, UnsupportedServerVersionError, type CdcWarning } from '../../src/cdc.ts'

const i32 = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeInt32BE(n); return b }
const u16 = (n: number) => { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(n); return b }
const i64zero = Buffer.alloc(8)
const i64 = (n: bigint) => { const b = Buffer.allocUnsafe(8); b.writeBigInt64BE(n); return b }

const authOk = () => frame('R', i32(0))
const ready = (s = 'I') => frame('Z', Buffer.from(s, 'latin1'))
const rowDesc = (cols: WireCol[]) => frame('T', rowDescription(cols))
const dataRow = (cells: Cell[]) => frame('D', dataRowBody(cells))
const copyBoth = () => frame('W', Buffer.from([0, 0, 0]))
const cstrLatin1 = (s: string) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.from([0])])
// ErrorResponse ('E'): a run of (field-type-byte + cstring) pairs, terminated by a zero byte —
// only the three fields command()'s own PgError construction reads (S/C/M).
const errFrame = (code: string, message: string): Buffer =>
  frame('E', Buffer.concat([
    Buffer.from('S', 'latin1'), cstrLatin1('ERROR'),
    Buffer.from('C', 'latin1'), cstrLatin1(code),
    Buffer.from('M', 'latin1'), cstrLatin1(message),
    Buffer.from([0]),
  ]))
const healthCols: WireCol[] = [{ name: 'active', oid: 25 }, { name: 'active_pid', oid: 25 }, { name: 'wal_status', oid: 25 }, { name: 'confirmed_flush_lsn', oid: 25 }, { name: 'restart_lsn', oid: 25 }]
const xlogData = (payload: Buffer) => frame('d', Buffer.concat([Buffer.from('w', 'latin1'), i64zero, i64zero, i64zero, payload]))
const pgBegin = () => xlogData(Buffer.concat([Buffer.from('B', 'latin1'), i64zero, i64zero, i32(1)]))

const cstrPg = (s: string) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.from([0])])
const pgRelation = (id: number, schema: string, table: string, identity: string, cols: { name: string; oid: number; key?: boolean }[]) =>
  xlogData(Buffer.concat([
    Buffer.from('R', 'latin1'), i32(id), cstrPg(schema), cstrPg(table), Buffer.from(identity, 'latin1'),
    u16(cols.length),
    ...cols.map((c) => Buffer.concat([Buffer.from([c.key ? 1 : 0]), cstrPg(c.name), i32(c.oid), i32(-1)])),
  ]))
const textCell = (s: string) => Buffer.concat([Buffer.from([0x74]), i32(Buffer.byteLength(s, 'utf8')), Buffer.from(s, 'utf8')])
// pgoutput Insert ('I'): relid + a fixed 'N' tuple-kind byte + the tuple itself (count + cells).
const pgInsert = (relid: number, cells: Buffer[]) =>
  xlogData(Buffer.concat([Buffer.from('I', 'latin1'), i32(relid), Buffer.from('N', 'latin1'), u16(cells.length), ...cells]))
// pgoutput Commit ('C'): one zero flag byte + commit lsn + end lsn + a commit timestamp (unused here).
const pgCommit = (commitLsn: bigint, endLsn: bigint) =>
  xlogData(Buffer.concat([Buffer.from('C', 'latin1'), Buffer.from([0]), i64(commitLsn), i64(endLsn), i64(0n)]))

/** Scans CopyData bodies for standby status updates ('r', 0x72) and returns the most recent
 *  wal-flushed position (byte offset 9) — the layer's own ack output, not a value the fake
 *  backend computes for it. Defaults to 0n: nothing has been acked yet. */
const lastFlushed = (sent: Buffer[]): bigint => {
  for (let i = sent.length - 1; i >= 0; i--) {
    const b = sent[i]!
    if (b[0] === 0x72) return b.readBigUInt64BE(9)
  }
  return 0n
}

// Bound once, at module load — a test that monkeypatches globalThis.Date.now (e.g. the eviction-
// deadline test below, to exercise a real 3s deadline comparison in the code under test) must
// never also skew until()'s own elapsed-time math, or a real hang gets misreported as a pass.
const realDateNow = Date.now

/** Polls `check` until it returns true or `timeoutMs` elapses — the fake backend is entirely
 *  in-process, so a session reaching a given wire state (e.g. START_REPLICATION sent) settles in
 *  microtasks, not real network latency; a short poll interval is deliberate. */
async function until(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const t0 = realDateNow()
  while (!check()) {
    if (realDateNow() - t0 > timeoutMs) throw new Error('minipg test: timed out waiting for condition')
    await Bun.sleep(5)
  }
}

interface CdcSession { dx: Duplex; queries: string[]; sent: Buffer[] }

/** A multi-session fake walsender: each socket() call authenticates a FRESH Duplex and records
 *  its own queries/sent arrays onto `sessions` — cdc.ts's reconnect tests need one session per
 *  connection, so nothing here is shared across sessions. The shared default router answers
 *  exactly the commands the managed layer's happy path issues; opts.onQuery — given the SQL and
 *  the 0-based session index it arrived on — intercepts one branch and falls through to the
 *  default router by returning undefined, so a durable-mode test only has to override the one
 *  query it cares about. */
function cdcBackend(opts: { onQuery?: (sql: string, session: number) => Buffer[] | undefined } = {}) {
  const sessions: CdcSession[] = []
  const defaultOnQuery = (sql: string): Buffer[] => {
    if (sql.startsWith('START_REPLICATION')) return [copyBoth()]
    // 4-column reply, exactly what src/replication.ts's createSlot() destructures
    if (sql.startsWith('CREATE_REPLICATION_SLOT')) {
      const name = sql.split(' ')[1]!
      return [
        rowDesc([{ name: 'slot_name', oid: 25 }, { name: 'consistent_point', oid: 25 }, { name: 'snapshot_name', oid: 25 }, { name: 'output_plugin', oid: 25 }]),
        dataRow([name, '0/10', 'snap-1', 'pgoutput']),
        ready(),
      ]
    }
    // 4-column reply, exactly what identify() destructures (unused by this plan's happy path,
    // kept for forward-compatibility with the durable-slot tests later plans add)
    if (sql.startsWith('IDENTIFY_SYSTEM')) {
      return [
        rowDesc([{ name: 'systemid', oid: 25 }, { name: 'timeline', oid: 25 }, { name: 'xlogpos', oid: 25 }, { name: 'dbname', oid: 25 }]),
        dataRow(['7000000000000000001', '1', '0/10', 'd']),
        ready(),
      ]
    }
    // The derived-timeout probe, run once per connect in S2 (preparing), before createSlot.
    if (sql.includes('wal_sender_timeout')) {
      return [rowDesc([{ name: 'setting', oid: 25 }]), dataRow(['60000']), ready()]
    }
    // must precede the pg_publication branch below: the partition probe SQL also contains
    // 'pg_publication', and would otherwise get misrouted into the 3-column publication response
    if (sql.includes('relispartition')) {
      return [
        rowDesc([{ name: 'schemaname', oid: 25 }, { name: 'tablename', oid: 25 }, { name: 'pubname', oid: 25 }]),
        ready(),
      ]
    }
    // 5-column TEXT reply. Booleans are 't'/'f' — never true/false, never 'true'.
    if (sql.includes('pg_replication_slots')) {
      return [
        rowDesc([{ name: 'active', oid: 25 }, { name: 'active_pid', oid: 25 }, { name: 'wal_status', oid: 25 }, { name: 'confirmed_flush_lsn', oid: 25 }, { name: 'restart_lsn', oid: 25 }]),
        dataRow(['f', null, 'reserved', '0/10', '0/8']),
        ready(),
      ]
    }
    if (sql.includes('pg_publication')) {
      const names = [...sql.matchAll(/'([^']*)'/g)].map((m) => m[1]!)
      return [
        rowDesc([{ name: 'name', oid: 25 }, { name: 'present', oid: 25 }, { name: 'tables', oid: 25 }]),
        ...names.map((n) => dataRow([n, 't', '1'])),
        ready(),
      ]
    }
    return [ready()]
  }

  const socket = (): Duplex => {
    const sessionIndex = sessions.length // sessions.push() below runs synchronously before any query lands, so this is stable for the whole session
    let authenticated = false
    const queries: string[] = []
    const sent: Buffer[] = []
    const dx: Duplex = new Duplex({
      write(chunk: Buffer, _enc, cb) {
        if (!authenticated) {
          authenticated = true // whole startup packet arrives in one write; no type byte to parse
          dx.push(authOk())
          dx.push(ready())
          cb()
          return
        }
        let off = 0
        while (off < chunk.length) {
          const type = String.fromCharCode(chunk[off]!)
          const len = chunk.readInt32BE(off + 1)
          const body = chunk.subarray(off + 5, off + 1 + len)
          off += 1 + len
          if (type === 'Q') {
            let z = 0; while (body[z] !== 0) z++
            const sql = body.toString('utf8', 0, z)
            queries.push(sql)
            for (const f of opts.onQuery?.(sql, sessionIndex) ?? defaultOnQuery(sql)) dx.push(f)
          } else if (type === 'c') {
            dx.push(ready()) // CopyDone -> CommandComplete/ReadyForQuery, as a real walsender answers
          } else if (type === 'd' || type === 'X') {
            sent.push(Buffer.from(body))
          }
        }
        cb()
      },
      read() { /* pushed manually */ },
    })
    const session: CdcSession = { dx, queries, sent }
    sessions.push(session)
    return dx
  }

  return { socket, sessions, get latest(): CdcSession | undefined { return sessions[sessions.length - 1] } }
}

const cfg = (o: Partial<ReplicationConfig> = {}): ReplicationConfig => ({ user: 'u', database: 'd', ...o })

test('cdc exports: replicate is importable and the raw surface is untouched', () => {
  expect(typeof replicate).toBe('function')
  expect(typeof SlotInvalidatedError).toBe('function')
  expect(typeof BackfillTimeoutError).toBe('function')
  expect(typeof SlotBusyError).toBe('function')
  expect(typeof rawReplication).toBe('function') // the raw surface is unchanged underneath
  expect(typeof rawBatchTransactions).toBe('function')
})

test('cdc window order: no command runs between CREATE_REPLICATION_SLOT and START_REPLICATION', async () => {
  const backend = cdcBackend()
  let queriesAtBackfillStart = -1
  let queriesWhilePending = -1
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {
      queriesAtBackfillStart = backend.latest!.queries.length
      await Bun.sleep(20)
      queriesWhilePending = backend.latest!.queries.length
    },
    onTransaction: () => {},
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const queries = backend.latest!.queries
  const settingsIdx = queries.findIndex((q) => q.includes('wal_sender_timeout'))
  const createIdx = queries.findIndex((q) => q.startsWith('CREATE_REPLICATION_SLOT'))
  const startIdx = queries.findIndex((q) => q.startsWith('START_REPLICATION'))
  expect(settingsIdx).toBeGreaterThanOrEqual(0)
  expect(createIdx).toBeGreaterThan(settingsIdx) // fixed admin order: the probe precedes createSlot
  expect(startIdx).toBeGreaterThan(createIdx)
  // The layer itself issues ZERO commands on this connection while
  // backfill is in flight. start()'s own pre-stream probes (publication, leaf-partition) are
  // legitimate — but only once backfill has already returned, which is why they land AFTER
  // createIdx rather than making createIdx and startIdx wire-adjacent.
  expect(queriesAtBackfillStart).toBe(createIdx + 1)
  expect(queriesWhilePending).toBe(queriesAtBackfillStart)
  await handle.stop()
})

test('cdc ack after: a transaction is acked only once onTransaction resolves', async () => {
  // Part A: a single done:true batch — no ack while the handler is pending, one once it resolves
  const backend = cdcBackend()
  const batches: TransactionBatch[] = []
  const gates: (() => void)[] = []
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: async (batch) => {
      batches.push(batch)
      await new Promise<void>((resolve) => { gates.push(resolve) })
    },
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const session = backend.latest!
  const relId = 5
  const commitLsn = 0x20n, endLsn = 0x30n
  session.dx.push(pgBegin())
  session.dx.push(pgRelation(relId, 'public', 't', 'd', [{ name: 'id', oid: 23, key: true }]))
  session.dx.push(pgInsert(relId, [textCell('1')]))
  session.dx.push(pgCommit(commitLsn, endLsn))

  await until(() => batches.length >= 1)
  expect(batches[0]!.done).toBe(true)
  expect(lastFlushed(session.sent)).toBeLessThan(endLsn) // handler still pending — no ack has run
  gates[0]!()
  await until(() => lastFlushed(session.sent) >= endLsn)
  expect(lastFlushed(session.sent)).toBeGreaterThanOrEqual(endLsn)
  await handle.stop()

  // Part B: maxTransactionEvents 1 — every done:false chunk carries no commit fields (nothing to
  // ack, by construction); only the trailing done:true chunk advances the flushed position.
  const backend2 = cdcBackend()
  const batches2: TransactionBatch[] = []
  const gates2: (() => void)[] = []
  const handle2 = replicate({
    url: cfg({ socket: backend2.socket }),
    slot: 'temporary',
    publications: ['pub'],
    maxTransactionEvents: 1,
    backfill: async () => {},
    onTransaction: async (batch) => {
      batches2.push(batch)
      await new Promise<void>((resolve) => { gates2.push(resolve) })
    },
  })
  await until(() => !!backend2.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const session2 = backend2.latest!
  const relId2 = 6
  const commitLsn2 = 0x40n, endLsn2 = 0x50n
  session2.dx.push(pgBegin())
  session2.dx.push(pgRelation(relId2, 'public', 't2', 'd', [{ name: 'id', oid: 23, key: true }]))
  session2.dx.push(pgInsert(relId2, [textCell('1')]))
  session2.dx.push(pgCommit(commitLsn2, endLsn2))

  await until(() => batches2.length >= 1)
  while (!batches2[batches2.length - 1]!.done) {
    const idx = batches2.length - 1
    expect(batches2[idx]!.done).toBe(false)
    gates2[idx]!() // no ack is even expressible for a done:false chunk
    await until(() => batches2.length > idx + 1)
  }
  const doneIdx = batches2.length - 1
  expect(batches2[doneIdx]!.done).toBe(true)
  expect(lastFlushed(session2.sent)).toBeLessThan(endLsn2) // the done:true chunk's handler still pending
  gates2[doneIdx]!()
  await until(() => lastFlushed(session2.sent) >= endLsn2)
  expect(lastFlushed(session2.sent)).toBeGreaterThanOrEqual(endLsn2)
  await handle2.stop()
})

test('cdc one connection: all slot administration rides the single streaming session', async () => {
  const backend = cdcBackend()
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  expect(backend.sessions.length).toBe(1)
  const queries = backend.latest!.queries
  const settingsIdx = queries.findIndex((q) => q.includes('wal_sender_timeout'))
  const createIdx = queries.findIndex((q) => q.startsWith('CREATE_REPLICATION_SLOT'))
  const startIdx = queries.findIndex((q) => q.startsWith('START_REPLICATION'))
  expect(settingsIdx).toBeGreaterThanOrEqual(0)
  expect(createIdx).toBeGreaterThan(settingsIdx)
  expect(startIdx).toBeGreaterThan(createIdx)
  await handle.stop()
})

test('cdc default retry: additive jitter, 30s cap, null at attempt 10', async () => {
  // The real retry-delay formula is only reachable through an actual session failure (the policy is
  // module-private by design — not part of the public surface). Rather than waiting out real
  // 1s-30s delays, intercept setTimeout to record what delay the layer actually asked for, then
  // fast-forward it — this observes the REAL computed values, not a re-implementation of them.
  // The stack check attributes each capture to src/cdc.ts's own sleep() so an unrelated ≥500ms
  // timer from Bun internals or a leaked prior test can't land in delays[] and corrupt the exact
  // delays.length === 9 / per-index assertions below — a global interception window has no other
  // way to tell "our retry" from "something else that happened to fire during it".
  const delays: number[] = []
  const realSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
    if (typeof ms === 'number' && ms >= 500 && new Error().stack?.includes('/src/cdc.ts')) { delays.push(ms); return realSetTimeout(fn, 0) }
    return realSetTimeout(fn, ms, ...rest)
  }) as typeof setTimeout

  let fatalErr: Error | undefined
  try {
    // A minimal always-fails transport: authenticates, then dies on the very next query — no
    // cdcBackend fake-walsender router needed, this is a pure connection-never-stabilizes loop.
    const failingSocket = (): Duplex => {
      let authenticated = false
      const dx: Duplex = new Duplex({
        write(_chunk: Buffer, _enc, cb) {
          if (!authenticated) { authenticated = true; dx.push(authOk()); dx.push(ready()); cb(); return }
          queueMicrotask(() => dx.destroy())
          cb()
        },
        read() { /* pushed manually */ },
      })
      return dx
    }
    replicate({
      url: cfg({ socket: failingSocket, connectTimeout: 5 }),
      slot: 'temporary',
      publications: ['pub'],
      backfill: async () => {},
      onTransaction: () => {},
      onFatalError: (err) => { fatalErr = err },
    })
    await until(() => delays.length >= 9 && fatalErr !== undefined, 5000)
  } finally {
    globalThis.setTimeout = realSetTimeout
  }

  expect(delays.length).toBe(9) // attempt 10 returns null before ever calling sleep()
  expect(delays[0]).toBeGreaterThanOrEqual(1000); expect(delays[0]).toBeLessThan(2000) // attempt 1
  expect(delays[4]).toBeGreaterThanOrEqual(16000); expect(delays[4]).toBeLessThan(17000) // attempt 5
  expect(delays[8]).toBeLessThanOrEqual(30000) // attempt 9, capped
  expect(fatalErr).toBeDefined()
})

test('cdc budget: the retry counter resets on acked progress, not delivery', async () => {
  const backend = cdcBackend()
  const seenAttempts: number[] = []
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: async () => {},
    retryDelayMs: (attempt) => { seenAttempts.push(attempt); return 1 },
  })

  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  backend.latest!.dx.destroy() // session 1 dies with nothing acked -> attempt 1
  await until(() => seenAttempts.length >= 1)
  expect(seenAttempts[0]).toBe(1)

  await until(() => backend.sessions.length >= 2 && !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  backend.latest!.dx.destroy() // session 2 also dies with nothing acked -> attempt 2, no reset
  await until(() => seenAttempts.length >= 2)
  expect(seenAttempts[1]).toBe(2)

  await until(() => backend.sessions.length >= 3 && !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const s3 = backend.latest!
  const relId = 9, commitLsn = 0x60n, endLsn = 0x70n
  s3.dx.push(pgBegin())
  s3.dx.push(pgRelation(relId, 'public', 't3', 'd', [{ name: 'id', oid: 23, key: true }]))
  s3.dx.push(pgInsert(relId, [textCell('1')]))
  s3.dx.push(pgCommit(commitLsn, endLsn))
  await until(() => lastFlushed(s3.sent) >= endLsn) // acked -> the ONLY reset site fires here

  s3.dx.destroy() // session 3 dies right after the ack -> the budget was just reset -> attempt 1, not 3
  await until(() => seenAttempts.length >= 3)
  expect(seenAttempts[2]).toBe(1)

  await handle.stop()
})

test('cdc null stops: retryDelayMs returning null goes fatal without another attempt', async () => {
  const backend = cdcBackend()
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    retryDelayMs: () => null,
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  backend.latest!.dx.destroy()
  await until(() => fatalErr !== undefined)
  expect(fatalErr).toBeDefined()
  expect(backend.sessions.length).toBe(1)

  const before = backend.sessions.length
  await Bun.sleep(300)
  expect(backend.sessions.length).toBe(before) // no reconnect attempted after going fatal
  await handle.stop()
})

test('cdc fatal: onFatalError fires exactly once and nothing runs after it', async () => {
  const backend = cdcBackend()
  let fatalCount = 0
  let txnCount = 0
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => { txnCount++ },
    retryDelayMs: (attempt) => (attempt === 1 ? 1 : null), // one reconnect, then give up
    onFatalError: () => { fatalCount++ },
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  backend.latest!.dx.destroy() // failure source 1 -> attempt 1 -> reconnects
  await until(() => backend.sessions.length >= 2 && !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  backend.latest!.dx.destroy() // failure source 2 -> attempt 2 -> null -> fatal
  await until(() => fatalCount >= 1)

  expect(fatalCount).toBe(1)
  expect(txnCount).toBe(0)
  expect(backend.sessions.length).toBe(2)

  await Bun.sleep(200)
  expect(backend.sessions.length).toBe(2) // no further session opened
  expect(fatalCount).toBe(1) // still exactly once

  const t0 = Date.now()
  await handle.stop() // nothing in flight after fatal -> resolves promptly
  expect(Date.now() - t0).toBeLessThan(200)
})

test('cdc one START_REPLICATION: no session ever receives a second start command', async () => {
  const backend = cdcBackend()
  const seenBatches: TransactionBatch[] = []
  let queriesAtThrow = -1
  let queriesAtRetry = -1
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: async (batch) => {
      seenBatches.push(batch)
      if (seenBatches.length === 1) {
        queriesAtThrow = backend.latest!.queries.length
        throw new Error('handler boom')
      }
      queriesAtRetry = backend.latest!.queries.length
    },
    retryDelayMs: () => 1,
  })

  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const s1 = backend.latest!
  const relId = 11, commitLsn = 0x80n, endLsn = 0x90n
  s1.dx.push(pgBegin())
  s1.dx.push(pgRelation(relId, 'public', 't', 'd', [{ name: 'id', oid: 23, key: true }]))
  s1.dx.push(pgInsert(relId, [textCell('1')]))
  s1.dx.push(pgCommit(commitLsn, endLsn))

  await until(() => lastFlushed(s1.sent) >= endLsn) // handler-throw retry, then ack, all on session 1
  expect(seenBatches.length).toBe(2)
  expect(seenBatches[0]).toBe(seenBatches[1]) // same in-memory batch object, re-presented
  expect(queriesAtRetry).toBe(queriesAtThrow) // zero commands issued between the two invocations
  expect(backend.sessions.length).toBe(1) // the throw never reconnected

  // Now force a server CopyDone on session 1 — the ONLY path that must reconnect: the
  // session cannot stream again (PostgreSQL BUG #18754).
  s1.dx.push(frame('c', Buffer.alloc(0)))
  await until(() => backend.sessions.length >= 2)
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))

  for (const session of backend.sessions) {
    const starts = session.queries.filter((q) => q.startsWith('START_REPLICATION'))
    expect(starts.length).toBeLessThanOrEqual(1)
  }
  await handle.stop()
})

test('cdc isReconnect: false on the first session, true on the rebuilt one', async () => {
  const backend = cdcBackend()
  const seen: boolean[] = []
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async ({ isReconnect }) => { seen.push(isReconnect) },
    onTransaction: () => {},
    retryDelayMs: () => 1,
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  expect(seen).toEqual([false])

  backend.latest!.dx.destroy()
  await until(() => backend.sessions.length >= 2 && !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  expect(seen).toEqual([false, true])

  await handle.stop()
})

test('cdc backfill timeout: the deadline aborts the signal and goes straight to onFatalError', async () => {
  const backend = cdcBackend()
  let sawAborted = false
  let fatalErr: Error | undefined
  let retryCalls = 0
  const warnings: CdcWarning[] = []
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfillTimeoutMs: 50,
    backfill: async ({ signal }) => {
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => resolve(), { once: true }) })
      sawAborted = signal.aborted
    },
    onTransaction: () => {},
    retryDelayMs: () => { retryCalls++; return 1 }, // must never be consulted — the deadline is terminal
    onWarning: (w) => { warnings.push(w) },
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => fatalErr !== undefined)
  expect(sawAborted).toBe(true)
  expect(fatalErr).toBeInstanceOf(BackfillTimeoutError)
  expect((fatalErr as BackfillTimeoutError).ms).toBe(50)
  expect(retryCalls).toBe(0)
  expect(warnings.some((w) => w.kind === 'backfill-timeout')).toBe(true)
  await handle.stop()
})

test('cdc stop: idempotent, settles the in-flight handler, acks what completed', async () => {
  const backend = cdcBackend()
  let fatalCount = 0
  let release: (() => void) | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: async () => { await new Promise<void>((resolve) => { release = resolve }) },
    onFatalError: () => { fatalCount++ },
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const session = backend.latest!
  const relId = 20, commitLsn = 0xa0n, endLsn = 0xb0n
  session.dx.push(pgBegin())
  session.dx.push(pgRelation(relId, 'public', 't', 'd', [{ name: 'id', oid: 23, key: true }]))
  session.dx.push(pgInsert(relId, [textCell('1')]))
  session.dx.push(pgCommit(commitLsn, endLsn))
  await until(() => !!release) // handler is now parked, in flight

  const p1 = handle.stop()
  const p2 = handle.stop()
  expect(p1).toBe(p2) // idempotent: the second call returns the exact first promise

  let resolved = false
  p1.then(() => { resolved = true })
  await Bun.sleep(30)
  expect(resolved).toBe(false) // stop() must not resolve while the handler is still pending
  expect(lastFlushed(session.sent)).toBeLessThan(endLsn) // not acked yet either

  release!() // let the handler resolve
  await p1
  expect(resolved).toBe(true)
  expect(lastFlushed(session.sent)).toBeGreaterThanOrEqual(endLsn) // settled work got acked
  expect(fatalCount).toBe(0)

  const t0 = Date.now()
  await handle.stop() // a third call, after resolution
  expect(Date.now() - t0).toBeLessThan(50)
})

test('cdc stop: before the first connect, the socket factory is never invoked', async () => {
  let socketCalls = 0
  const handle = replicate({
    url: cfg({ socket: () => { socketCalls++; throw new Error('should never be called') } }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
  })
  await handle.stop() // synchronous stop, before run()'s own microtask ever executes
  await Bun.sleep(20)
  expect(socketCalls).toBe(0)
})

test('cdc stop: during backoff aborts the sleep and resolves without a new session', async () => {
  const backend = cdcBackend()
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    retryDelayMs: () => 5000, // large — stop() must not wait anywhere near this
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  backend.latest!.dx.destroy() // transient failure -> S6 backoff with a 5s delay
  await Bun.sleep(20) // land stop() mid-backoff
  const t0 = Date.now()
  await handle.stop()
  expect(Date.now() - t0).toBeLessThan(1000)
  expect(backend.sessions.length).toBe(1) // no reconnect attempted
})

test('cdc stop: during backfill waits for the backfill promise to settle', async () => {
  const backend = cdcBackend()
  let fatalCount = 0
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async ({ signal }) => {
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => resolve(), { once: true }) })
    },
    onTransaction: () => {},
    onFatalError: () => { fatalCount++ },
  })
  // land stop() while backfill is in flight, before START_REPLICATION is ever sent
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('CREATE_REPLICATION_SLOT')))
  await handle.stop()
  await Bun.sleep(20)
  expect(backend.latest!.queries.some((q) => q.startsWith('START_REPLICATION'))).toBe(false)
  expect(fatalCount).toBe(0)
})

test('cdc signal: aborting the consumer signal behaves like stop()', async () => {
  const backend = cdcBackend()
  let fatalCount = 0
  const ac = new AbortController()
  replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    signal: ac.signal,
    backfill: async () => {},
    onTransaction: () => {},
    onFatalError: () => { fatalCount++ },
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  ac.abort()
  await Bun.sleep(30)
  expect(fatalCount).toBe(0)
  expect(backend.sessions.length).toBe(1) // no reconnect attempted
})

test('cdc signal: a fatal end removes the abort listener instead of leaking it on a shared signal', async () => {
  const backend = cdcBackend()
  const ac = new AbortController()
  let added = 0, removed = 0
  const origAdd = ac.signal.addEventListener.bind(ac.signal)
  const origRemove = ac.signal.removeEventListener.bind(ac.signal)
  ac.signal.addEventListener = ((...args: Parameters<typeof origAdd>) => { added++; return origAdd(...args) }) as typeof ac.signal.addEventListener
  ac.signal.removeEventListener = ((...args: Parameters<typeof origRemove>) => { removed++; return origRemove(...args) }) as typeof ac.signal.removeEventListener

  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    signal: ac.signal,
    backfill: async () => {},
    onTransaction: () => {},
    retryDelayMs: () => null, // fatal on the very first failure
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  backend.latest!.dx.destroy() // session failure -> null retryDelayMs -> fireFatal
  await until(() => fatalErr !== undefined)

  expect(added).toBe(1)
  expect(removed).toBe(1) // fireFatal removed it — nothing left listening on the shared signal
  await handle.stop() // a stop() after fatal must not throw on the already-removed listener
  expect(removed).toBeGreaterThanOrEqual(1)
})

test('cdc invalidated: lost, null confirmed_flush, absent after seen, and systemId change go straight to onFatalError', async () => {
  // The real guarantee is that the INVALIDATION ITSELF never reaches retryDelayMs — not that
  // zero session churn ever happens getting there. "absent after seen" and "systemId change" are
  // both, by construction, only observable on a SECOND connect (you can't be "seen before" on the
  // first one), and the only way run()'s loop opens a second session is through the ordinary
  // transient-failure path, which legitimately spends one retryDelayMs call. What must never
  // happen is retryDelayMs being consulted FOR a SlotInvalidatedError — recorded here so a
  // regression (routing invalidation through the normal retry budget) fails loudly. This
  // guarantee holds when onSlotInvalidated is unset or 'error'; under 'recreate' the budget is
  // consulted with the caught invalidation deliberately, so a recreate loop stays bounded.
  const noRetryForInvalidation = (calls: { attempt: number; err: Error }[]) =>
    expect(calls.every((c) => !(c.err instanceof SlotInvalidatedError))).toBe(true)

  // Scenario 1: wal_status = 'lost' — observable on the very first connect.
  {
    const backend = cdcBackend({
      onQuery: (sql) => sql.includes('pg_replication_slots')
        ? [rowDesc(healthCols), dataRow(['f', null, 'lost', '0/10', '0/8']), ready()]
        : undefined,
    })
    let fatalErr: Error | undefined
    const calls: { attempt: number; err: Error }[] = []
    const handle = replicate({
      url: cfg({ socket: backend.socket }),
      slot: { name: 'durable_lost' },
      publications: ['pub'],
      backfill: async () => {},
      onTransaction: () => {},
      retryDelayMs: (attempt, err) => { calls.push({ attempt, err }); return 1 },
      onFatalError: (err) => { fatalErr = err },
    })
    await until(() => fatalErr !== undefined)
    expect(fatalErr).toBeInstanceOf(SlotInvalidatedError)
    expect((fatalErr as SlotInvalidatedError).cause).toBe('wal-lost')
    expect(calls.length).toBe(0) // no session churn was even needed to observe this
    expect(backend.sessions.length).toBe(1)
    noRetryForInvalidation(calls)
    await handle.stop()
  }

  // Scenario 2: confirmed_flush_lsn null — also observable on the first connect.
  {
    const backend = cdcBackend({
      onQuery: (sql) => sql.includes('pg_replication_slots')
        ? [rowDesc(healthCols), dataRow(['f', null, 'reserved', null, '0/8']), ready()]
        : undefined,
    })
    let fatalErr: Error | undefined
    const calls: { attempt: number; err: Error }[] = []
    const handle = replicate({
      url: cfg({ socket: backend.socket }),
      slot: { name: 'durable_nullflush' },
      publications: ['pub'],
      backfill: async () => {},
      onTransaction: () => {},
      retryDelayMs: (attempt, err) => { calls.push({ attempt, err }); return 1 },
      onFatalError: (err) => { fatalErr = err },
    })
    await until(() => fatalErr !== undefined)
    expect(fatalErr).toBeInstanceOf(SlotInvalidatedError)
    expect((fatalErr as SlotInvalidatedError).cause).toBe('no-confirmed-flush')
    expect(calls.length).toBe(0)
    expect(backend.sessions.length).toBe(1)
    noRetryForInvalidation(calls)
    await handle.stop()
  }

  // Scenario 3: absent after seen — the first connect sees zero rows (never seen before, so it
  // CREATES the slot — the first-observation rule, pinned here too), then a server CopyDone
  // forces the one legitimate reconnect, and the second connect sees zero rows again -> absent
  // after having been seen -> SlotInvalidatedError, never retried.
  {
    const backend = cdcBackend({
      onQuery: (sql) => sql.includes('pg_replication_slots') ? [rowDesc(healthCols), ready()] : undefined,
    })
    let fatalErr: Error | undefined
    const calls: { attempt: number; err: Error }[] = []
    const handle = replicate({
      url: cfg({ socket: backend.socket }),
      slot: { name: 'durable_absent' },
      publications: ['pub'],
      backfill: async () => {},
      onTransaction: () => {},
      retryDelayMs: (attempt, err) => { calls.push({ attempt, err }); return 1 },
      onFatalError: (err) => { fatalErr = err },
    })
    await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
    expect(backend.latest!.queries.some((q) => q.startsWith('CREATE_REPLICATION_SLOT'))).toBe(true) // first observation created it
    backend.latest!.dx.push(frame('c', Buffer.alloc(0))) // server CopyDone -> the one legitimate reconnect
    await until(() => fatalErr !== undefined)
    expect(fatalErr).toBeInstanceOf(SlotInvalidatedError)
    expect((fatalErr as SlotInvalidatedError).cause).toBe('absent')
    expect(backend.sessions.length).toBe(2)
    noRetryForInvalidation(calls)
    await Bun.sleep(50)
    expect(backend.sessions.length).toBe(2) // no third session after fatal
    await handle.stop()
  }

  // Scenario 4: systemId change — the first connect persists identity on a healthy resume, a
  // CopyDone forces the one legitimate reconnect, and the second connect's identity differs.
  {
    const backend = cdcBackend({
      onQuery: (sql, session) => sql.startsWith('IDENTIFY_SYSTEM')
        ? [rowDesc([{ name: 'systemid', oid: 25 }, { name: 'timeline', oid: 25 }, { name: 'xlogpos', oid: 25 }, { name: 'dbname', oid: 25 }]),
            dataRow([session === 0 ? '7000000000000000001' : '9999999999999999999', '1', '0/10', 'd']), ready()]
        : undefined,
    })
    let fatalErr: Error | undefined
    const calls: { attempt: number; err: Error }[] = []
    const handle = replicate({
      url: cfg({ socket: backend.socket }),
      slot: { name: 'durable_systemchange' },
      publications: ['pub'],
      backfill: async () => {},
      onTransaction: () => {},
      retryDelayMs: (attempt, err) => { calls.push({ attempt, err }); return 1 },
      onFatalError: (err) => { fatalErr = err },
    })
    await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
    backend.latest!.dx.push(frame('c', Buffer.alloc(0)))
    await until(() => fatalErr !== undefined)
    expect(fatalErr).toBeInstanceOf(SlotInvalidatedError)
    expect((fatalErr as SlotInvalidatedError).cause).toBe('system-changed')
    expect(backend.sessions.length).toBe(2)
    noRetryForInvalidation(calls)
    await handle.stop()
  }
})

test('cdc recreate: a lost durable slot is dropped, recreated, backfilled with the reconnect flag, and streams', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.startsWith('select active,')
      ? [rowDesc(healthCols), dataRow(['f', null, 'lost', '0/10', '0/8']), ready()]
      : undefined,
  })
  const backfillInfos: { isReconnect: boolean }[] = []
  const calls: { attempt: number; err: Error }[] = []
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_recreate' },
    onSlotInvalidated: 'recreate',
    publications: ['pub'],
    backfill: async (info) => { backfillInfos.push({ isReconnect: info.isReconnect }) },
    onTransaction: async () => {},
    retryDelayMs: (attempt, err) => { calls.push({ attempt, err }); return 1 },
    onFatalError: (err) => { fatalErr = err },
  })

  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const queries = backend.latest!.queries
  const healthIdx = queries.findIndex((q) => q.startsWith('select active,'))
  const dropIdx = queries.findIndex((q) => q.startsWith('DROP_REPLICATION_SLOT'))
  const createIdx = queries.findIndex((q) => q.startsWith('CREATE_REPLICATION_SLOT'))
  const startIdx = queries.findIndex((q) => q.startsWith('START_REPLICATION'))
  expect(healthIdx).toBeGreaterThanOrEqual(0)
  expect(dropIdx).toBeGreaterThan(healthIdx)
  expect(createIdx).toBeGreaterThan(dropIdx)
  expect(startIdx).toBeGreaterThan(createIdx)

  expect(backfillInfos.length).toBe(1)
  expect(backfillInfos[0]!.isReconnect).toBe(true)

  expect(calls.length).toBe(1)
  expect(calls[0]!.attempt).toBe(1)
  expect(calls[0]!.err).toBeInstanceOf(SlotInvalidatedError)
  expect((calls[0]!.err as SlotInvalidatedError).cause).toBe('wal-lost')

  const s0 = backend.latest!
  const relId = 11, commitLsn = 0x20n, endLsn = 0x30n
  s0.dx.push(pgBegin())
  s0.dx.push(pgRelation(relId, 'public', 'recreated', 'd', [{ name: 'id', oid: 23, key: true }]))
  s0.dx.push(pgInsert(relId, [textCell('1')]))
  s0.dx.push(pgCommit(commitLsn, endLsn))
  await until(() => lastFlushed(s0.sent) >= endLsn)

  expect(fatalErr).toBeUndefined()
  expect(backend.sessions.length).toBe(1)
  await handle.stop()
})

test('cdc recreate: absent after seen drops nothing that exists and recreates', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.startsWith('select active,') ? [rowDesc(healthCols), ready()] : undefined,
  })
  const backfillInfos: { isReconnect: boolean }[] = []
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_absent_recreate' },
    onSlotInvalidated: 'recreate',
    publications: ['pub'],
    backfill: async (info) => { backfillInfos.push({ isReconnect: info.isReconnect }) },
    onTransaction: async () => {},
    retryDelayMs: () => 1,
    onFatalError: (err) => { fatalErr = err },
  })

  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  expect(backend.sessions[0]!.queries.some((q) => q.startsWith('CREATE_REPLICATION_SLOT'))).toBe(true) // first observation created it
  expect(backend.sessions[0]!.queries.some((q) => q.startsWith('DROP_REPLICATION_SLOT'))).toBe(false)

  backend.latest!.dx.push(frame('c', Buffer.alloc(0))) // server CopyDone -> the one legitimate reconnect
  await until(() => backend.sessions.length >= 2 && !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))

  const s1Shape = backend.sessions[1]!.queries.filter((q) => q.startsWith('DROP_REPLICATION_SLOT') || q.startsWith('CREATE_REPLICATION_SLOT'))
  expect(s1Shape.length).toBe(2)
  expect(s1Shape[0]!.startsWith('DROP_REPLICATION_SLOT')).toBe(true)
  expect(s1Shape[1]!.startsWith('CREATE_REPLICATION_SLOT')).toBe(true)

  expect(backfillInfos.length).toBe(2)
  expect(backfillInfos[1]!.isReconnect).toBe(true)
  expect(fatalErr).toBeUndefined()
  await handle.stop()
})

test('cdc recreate: 55006 on the drop polls and retries on the same connection', async () => {
  let dropCalls = 0
  const backend = cdcBackend({
    onQuery: (sql) => {
      if (sql.startsWith('select active,')) return [rowDesc(healthCols), dataRow(['f', null, 'lost', '0/10', '0/8']), ready()]
      if (sql.startsWith('DROP_REPLICATION_SLOT')) {
        dropCalls++
        return dropCalls === 1
          ? [errFrame('55006', 'replication slot "durable_drop55006" is active for PID 111'), ready()]
          : [ready()]
      }
      return undefined
    },
  })
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_drop55006' },
    onSlotInvalidated: 'recreate',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: async () => {},
    retryDelayMs: () => 1,
    onFatalError: (err) => { fatalErr = err },
  })

  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const shape = backend.sessions[0]!.queries.filter((q) => q.startsWith('DROP_REPLICATION_SLOT') || q.startsWith('CREATE_REPLICATION_SLOT'))
  expect(shape.length).toBe(3)
  expect(shape[0]!.startsWith('DROP_REPLICATION_SLOT')).toBe(true)
  expect(shape[1]!.startsWith('DROP_REPLICATION_SLOT')).toBe(true)
  expect(shape[2]!.startsWith('CREATE_REPLICATION_SLOT')).toBe(true)
  expect(backend.sessions.length).toBe(1) // the retry stayed on the same connection
  expect(fatalErr).toBeUndefined()
  await handle.stop()
})

test('cdc recreate: 42704 on the drop means already gone and the create proceeds', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => {
      if (sql.startsWith('select active,')) return [rowDesc(healthCols), dataRow(['f', null, 'lost', '0/10', '0/8']), ready()]
      if (sql.startsWith('DROP_REPLICATION_SLOT')) return [errFrame('42704', 'replication slot "durable_drop42704" does not exist'), ready()]
      return undefined
    },
  })
  const backfillInfos: { isReconnect: boolean }[] = []
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_drop42704' },
    onSlotInvalidated: 'recreate',
    publications: ['pub'],
    backfill: async (info) => { backfillInfos.push({ isReconnect: info.isReconnect }) },
    onTransaction: async () => {},
    retryDelayMs: () => 1,
    onFatalError: (err) => { fatalErr = err },
  })

  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const shape = backend.sessions[0]!.queries.filter((q) => q.startsWith('DROP_REPLICATION_SLOT') || q.startsWith('CREATE_REPLICATION_SLOT'))
  expect(shape.length).toBe(2)
  expect(shape[0]!.startsWith('DROP_REPLICATION_SLOT')).toBe(true)
  expect(shape[1]!.startsWith('CREATE_REPLICATION_SLOT')).toBe(true)
  expect(backfillInfos.length).toBe(1)
  expect(backfillInfos[0]!.isReconnect).toBe(true)
  expect(fatalErr).toBeUndefined()
  await handle.stop()
})

test('cdc recreate: system-changed stays terminal and never drops', async () => {
  const backend = cdcBackend({
    onQuery: (sql, session) => sql.startsWith('IDENTIFY_SYSTEM')
      ? [rowDesc([{ name: 'systemid', oid: 25 }, { name: 'timeline', oid: 25 }, { name: 'xlogpos', oid: 25 }, { name: 'dbname', oid: 25 }]),
          dataRow([session === 0 ? '7000000000000000001' : '9999999999999999999', '1', '0/10', 'd']), ready()]
      : undefined,
  })
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_systemchange_recreate' },
    onSlotInvalidated: 'recreate',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: async () => {},
    retryDelayMs: () => 1,
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  backend.latest!.dx.push(frame('c', Buffer.alloc(0)))
  await until(() => fatalErr !== undefined)
  expect(fatalErr).toBeInstanceOf(SlotInvalidatedError)
  expect((fatalErr as SlotInvalidatedError).cause).toBe('system-changed')
  for (const s of backend.sessions) expect(s.queries.some((q) => q.startsWith('DROP_REPLICATION_SLOT'))).toBe(false)
  await handle.stop()
})

test('cdc recreate: repeated recreation without progress exhausts the budget', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.startsWith('select active,')
      ? [rowDesc(healthCols), dataRow(['f', null, 'lost', '0/10', '0/8']), ready()]
      : undefined,
  })
  const calls: { attempt: number; err: Error }[] = []
  let fatalErr: Error | undefined
  let fatalCount = 0
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_budget_exhaust' },
    onSlotInvalidated: 'recreate',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: async () => {},
    retryDelayMs: (attempt, err) => { calls.push({ attempt, err }); return attempt < 4 ? 1 : null },
    onFatalError: (err) => { fatalErr = err; fatalCount++ },
  })

  // Each recreated session dies via a server CopyDone before anything acks, forcing the next
  // connect's health check to see the slot lost again and recreate once more — until the budget
  // returns null. Waits on the SESSION INDEX, not backend.latest — the next session hasn't opened
  // yet right after a push, and re-checking the same dead session's queries would spin forever.
  let sessionIdx = 0
  while (fatalErr === undefined) {
    await until(() => (backend.sessions.length > sessionIdx && !!backend.sessions[sessionIdx]?.queries.some((q) => q.startsWith('START_REPLICATION'))) || fatalErr !== undefined)
    if (fatalErr !== undefined) break
    backend.sessions[sessionIdx]!.dx.push(frame('c', Buffer.alloc(0)))
    sessionIdx++
  }

  expect(fatalCount).toBe(1)
  expect(calls.map((c) => c.attempt)).toEqual([1, 2, 3, 4])
  expect(calls.some((c) => c.err instanceof SlotInvalidatedError)).toBe(true)
  const sessionsAtFatal = backend.sessions.length
  await Bun.sleep(50)
  expect(backend.sessions.length).toBe(sessionsAtFatal)
  await handle.stop()
})

test('cdc recreate: an acked transaction resets the budget after a recreate', async () => {
  const backend = cdcBackend({
    onQuery: (sql, session) => sql.startsWith('select active,')
      ? (session === 0
          ? [rowDesc(healthCols), dataRow(['f', null, 'lost', '0/10', '0/8']), ready()]
          : [rowDesc(healthCols), dataRow(['f', null, 'reserved', '0/10', '0/8']), ready()])
      : undefined,
  })
  const calls: { attempt: number; err: Error }[] = []
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_reset_after_recreate' },
    onSlotInvalidated: 'recreate',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: async () => {},
    retryDelayMs: (attempt, err) => { calls.push({ attempt, err }); return 1 },
    onFatalError: (err) => { fatalErr = err },
  })

  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  expect(calls.length).toBe(1)
  expect(calls[0]!.attempt).toBe(1)

  const s0 = backend.latest!
  const relId = 12, commitLsn = 0x40n, endLsn = 0x50n
  s0.dx.push(pgBegin())
  s0.dx.push(pgRelation(relId, 'public', 'reset_after_recreate', 'd', [{ name: 'id', oid: 23, key: true }]))
  s0.dx.push(pgInsert(relId, [textCell('1')]))
  s0.dx.push(pgCommit(commitLsn, endLsn))
  await until(() => lastFlushed(s0.sent) >= endLsn)

  s0.dx.destroy() // dies right after the ack -> the budget was just reset -> attempt 1, not 2
  await until(() => calls.length >= 2)
  expect(calls.map((c) => c.attempt)).toEqual([1, 1])
  expect(fatalErr).toBeUndefined()
  await handle.stop()
})

test('cdc recreate: a null confirmed_flush is dropped and recreated instead of going fatal', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.includes('pg_replication_slots')
      ? [rowDesc(healthCols), dataRow(['f', null, 'reserved', null, '0/8']), ready()]
      : undefined,
  })
  const backfillInfos: { isReconnect: boolean }[] = []
  const calls: { attempt: number; err: Error }[] = []
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_nullflush_recreate' },
    onSlotInvalidated: 'recreate',
    publications: ['pub'],
    backfill: async (info) => { backfillInfos.push({ isReconnect: info.isReconnect }) },
    onTransaction: async () => {},
    retryDelayMs: (attempt, err) => { calls.push({ attempt, err }); return 1 },
    onFatalError: (err) => { fatalErr = err },
  })

  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const queries = backend.sessions[0]!.queries
  const healthIdx = queries.findIndex((q) => q.startsWith('select active,'))
  const dropIdx = queries.findIndex((q) => q.startsWith('DROP_REPLICATION_SLOT'))
  const createIdx = queries.findIndex((q) => q.startsWith('CREATE_REPLICATION_SLOT'))
  const startIdx = queries.findIndex((q) => q.startsWith('START_REPLICATION'))
  expect(healthIdx).toBeGreaterThanOrEqual(0)
  expect(dropIdx).toBeGreaterThan(healthIdx)
  expect(createIdx).toBeGreaterThan(dropIdx)
  expect(startIdx).toBeGreaterThan(createIdx)

  expect(backfillInfos.length).toBe(1)
  expect(backfillInfos[0]!.isReconnect).toBe(true)
  expect(calls.length).toBe(1)
  expect(calls[0]!.attempt).toBe(1)
  expect(calls[0]!.err).toBeInstanceOf(SlotInvalidatedError)
  expect((calls[0]!.err as SlotInvalidatedError).cause).toBe('no-confirmed-flush')
  expect(fatalErr).toBeUndefined()
  expect(backend.sessions.length).toBe(1)
  await handle.stop()
})

test('cdc copydone: durable recovery reconnects without createSlot, snapshot, or backfill', async () => {
  const backend = cdcBackend() // default pg_replication_slots row is healthy: active 'f', confirmed_flush '0/10', restart '0/8'
  let backfillCalls = 0
  let queriesAtResume = -1
  const resumeInfos: { confirmedFlush: string; restartLsn: string; isReconnect: boolean }[] = []
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_resume' },
    publications: ['pub'],
    backfill: async () => { backfillCalls++ },
    onResume: async (info) => {
      queriesAtResume = backend.latest!.queries.length
      resumeInfos.push(info)
    },
    onTransaction: () => {},
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const s1 = backend.latest!
  expect(s1.queries.some((q) => q.startsWith('CREATE_REPLICATION_SLOT'))).toBe(false)
  expect(s1.queries.some((q) => q.includes('pg_replication_slots'))).toBe(true)
  expect(resumeInfos.length).toBe(1)
  expect(resumeInfos[0]).toEqual({ confirmedFlush: '0/10', restartLsn: '0/8', isReconnect: false }) // the fake's row
  const startIdx = s1.queries.findIndex((q) => q.startsWith('START_REPLICATION'))
  expect(startIdx).toBeGreaterThanOrEqual(queriesAtResume) // onResume ran BEFORE START_REPLICATION appears in queries

  // drive one committed transaction
  const relId = 30, commitLsn = 0xc0n, endLsn = 0xd0n
  s1.dx.push(pgBegin())
  s1.dx.push(pgRelation(relId, 'public', 't', 'd', [{ name: 'id', oid: 23, key: true }]))
  s1.dx.push(pgInsert(relId, [textCell('1')]))
  s1.dx.push(pgCommit(commitLsn, endLsn))
  await until(() => lastFlushed(s1.sent) >= endLsn)

  // force a reconnect via server CopyDone — the only path that must reconnect a durable slot
  s1.dx.push(frame('c', Buffer.alloc(0)))
  await until(() => backend.sessions.length >= 2 && !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const s2 = backend.latest!
  expect(s2.queries.some((q) => q.startsWith('CREATE_REPLICATION_SLOT'))).toBe(false)
  expect(s2.queries.some((q) => q.includes('pg_replication_slots'))).toBe(true)
  expect(s2.queries.some((q) => q.startsWith('START_REPLICATION'))).toBe(true)
  expect(backfillCalls).toBe(0)
  expect(resumeInfos.length).toBe(2) // onResume ran on BOTH sessions
  expect(resumeInfos[0]!.isReconnect).toBe(false)
  expect(resumeInfos[1]!.isReconnect).toBe(true) // a durable slot that only ever resumes never backfills — this is the only signal of a reconnect

  await handle.stop()
})

test('cdc onResume: a throw retries through retryDelayMs like a backfill throw', async () => {
  const backend = cdcBackend() // default healthy row -> resumes, never creates
  let resumeCalls = 0
  let capturedErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_resume_throw' },
    publications: ['pub'],
    backfill: async () => {},
    onResume: async () => { resumeCalls++; throw new Error('resume rejected') },
    onTransaction: () => {},
    retryDelayMs: (_attempt, err) => { capturedErr = err; return null }, // one capture, then stop
    onFatalError: () => {},
  })
  await until(() => capturedErr !== undefined)
  expect(capturedErr?.message).toBe('resume rejected')
  expect(resumeCalls).toBeGreaterThanOrEqual(1)
  expect(backend.latest!.queries.some((q) => q.startsWith('START_REPLICATION'))).toBe(false) // never reached start()
  await handle.stop()
})

test('cdc query order: wal_sender_timeout precedes slot creation and start on both slot modes', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.includes('pg_replication_slots') ? [rowDesc(healthCols), ready()] : undefined, // zero rows -> durable create path
  })
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_order' },
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const queries = backend.latest!.queries
  const settingsIdx = queries.findIndex((q) => q.includes('wal_sender_timeout'))
  const createIdx = queries.findIndex((q) => q.startsWith('CREATE_REPLICATION_SLOT'))
  const startIdx = queries.findIndex((q) => q.startsWith('START_REPLICATION'))
  expect(settingsIdx).toBeGreaterThanOrEqual(0)
  expect(createIdx).toBeGreaterThan(settingsIdx)
  expect(startIdx).toBeGreaterThan(createIdx)
  await handle.stop()
})

test('cdc 42704: a slot-acquisition error during start() maps to SlotInvalidatedError absent', async () => {
  let startCalls = 0
  const backend = cdcBackend({
    onQuery: (sql) => {
      if (sql.startsWith('START_REPLICATION')) { startCalls++; return [errFrame('42704', 'replication slot "durable_gone" does not exist'), ready()] }
      return undefined
    },
  })
  let fatalErr: Error | undefined
  let retryCalled = false
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_gone' },
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    retryDelayMs: () => { retryCalled = true; return 1 },
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => fatalErr !== undefined)
  expect(fatalErr).toBeInstanceOf(SlotInvalidatedError)
  expect((fatalErr as SlotInvalidatedError).cause).toBe('absent')
  expect(startCalls).toBe(1)
  expect(retryCalled).toBe(false)
  await handle.stop()
})

test('cdc slot busy error: default mode raises without terminating anyone', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.includes('pg_replication_slots')
      ? [rowDesc(healthCols), dataRow(['t', '63139', 'reserved', '0/10', '0/8']), ready()]
      : undefined,
  })
  let fatalErr: Error | undefined
  let retryCalled = false
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_busy' },
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    retryDelayMs: () => { retryCalled = true; return 1 },
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => fatalErr !== undefined)
  expect(fatalErr).toBeInstanceOf(SlotBusyError)
  expect((fatalErr as SlotBusyError).slot).toBe('durable_busy')
  expect((fatalErr as SlotBusyError).pid).toBe(63139)
  expect(retryCalled).toBe(false)
  expect(backend.sessions.length).toBe(1)
  expect(backend.latest!.queries.some((q) => q.startsWith('select pg_terminate_backend'))).toBe(false)
  await handle.stop()
})

test('cdc already gone: pg_terminate_backend returning f continues the eviction poll', async () => {
  let terminateCalls = 0
  let pollCalls = 0
  const backend = cdcBackend({
    onQuery: (sql) => {
      if (sql.startsWith('select pg_terminate_backend')) {
        terminateCalls++
        return [rowDesc([{ name: 'pg_terminate_backend', oid: 25 }]), dataRow(['f']), ready()]
      }
      if (sql.startsWith('select active from pg_replication_slots')) {
        pollCalls++
        return [rowDesc([{ name: 'active', oid: 25 }]), dataRow(['f']), ready()]
      }
      if (sql.startsWith('select active,')) {
        // First health read (before eviction runs): busy. The re-read after eviction: healthy.
        return terminateCalls === 0
          ? [rowDesc(healthCols), dataRow(['t', '63139', 'reserved', '0/10', '0/8']), ready()]
          : [rowDesc(healthCols), dataRow(['f', null, 'reserved', '0/10', '0/8']), ready()]
      }
      return undefined
    },
  })
  const warnings: CdcWarning[] = []
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_evict' },
    publications: ['pub'],
    onSlotBusy: 'evict',
    backfill: async () => {},
    onTransaction: () => {},
    onWarning: (w) => { warnings.push(w) },
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  expect(terminateCalls).toBe(1)
  expect(pollCalls).toBeGreaterThanOrEqual(1)
  const evicted = warnings.find((w) => w.kind === 'slot-evicted')
  expect(evicted).toBeDefined()
  expect((evicted as { slot: string }).slot).toBe('durable_evict')
  expect((evicted as { pid: number }).pid).toBe(63139)
  await handle.stop()
})

test('cdc eviction poll absent: the slot vanishing mid-poll raises SlotInvalidatedError, not a busy timeout', async () => {
  let terminateCalls = 0
  const backend = cdcBackend({
    onQuery: (sql) => {
      if (sql.startsWith('select pg_terminate_backend')) {
        terminateCalls++
        return [rowDesc([{ name: 'pg_terminate_backend', oid: 25 }]), dataRow(['t']), ready()]
      }
      if (sql.startsWith('select active from pg_replication_slots')) {
        return [rowDesc([{ name: 'active', oid: 25 }]), ready()] // zero rows: someone dropped it mid-poll
      }
      if (sql.startsWith('select active,')) {
        return [rowDesc(healthCols), dataRow(['t', '99001', 'reserved', '0/10', '0/8']), ready()]
      }
      return undefined
    },
  })
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_dropped_midpoll' },
    publications: ['pub'],
    onSlotBusy: 'evict',
    backfill: async () => {},
    onTransaction: () => {},
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => fatalErr !== undefined)
  expect(fatalErr).toBeInstanceOf(SlotInvalidatedError)
  expect((fatalErr as SlotInvalidatedError).cause).toBe('absent')
  expect(terminateCalls).toBe(1) // eviction still ran once — the poll after it is what finds the row gone
  await handle.stop()
})

test('cdc eviction denied: 42501 goes fatal without a retry or a further poll', async () => {
  let terminateCalls = 0
  let pollCalls = 0
  const backend = cdcBackend({
    onQuery: (sql) => {
      if (sql.startsWith('select pg_terminate_backend')) {
        terminateCalls++
        return [errFrame('42501', 'must be a member of the role whose process is being terminated or member of pg_signal_backend'), ready()]
      }
      if (sql.startsWith('select active from pg_replication_slots')) { pollCalls++; return [rowDesc([{ name: 'active', oid: 25 }]), dataRow(['f']), ready()] }
      if (sql.startsWith('select active,')) return [rowDesc(healthCols), dataRow(['t', '63139', 'reserved', '0/10', '0/8']), ready()]
      return undefined
    },
  })
  let fatalErr: Error | undefined
  let retryCalled = false
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_denied' },
    publications: ['pub'],
    onSlotBusy: 'evict',
    backfill: async () => {},
    onTransaction: () => {},
    retryDelayMs: () => { retryCalled = true; return 1 },
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => fatalErr !== undefined)
  expect(fatalErr).toBeInstanceOf(PgError)
  expect((fatalErr as PgError).code).toBe('42501')
  expect(terminateCalls).toBe(1)
  expect(pollCalls).toBe(0)
  expect(retryCalled).toBe(false)
  await handle.stop()
})

test('cdc wal_sender_timeout zero: receive timeout stays off, keepAlive on from the first stream, a warning names the setting once', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.includes('wal_sender_timeout') ? [rowDesc([{ name: 'setting', oid: 25 }]), dataRow(['0']), ready()] : undefined,
  })
  const keepAliveBySession: Record<number, { enable: boolean; delay?: number }[]> = {}
  const wrappedSocket = (): Duplex => {
    const sessionIndex = backend.sessions.length
    const dx = backend.socket()
    keepAliveBySession[sessionIndex] = []
    ;(dx as unknown as { setKeepAlive: (e: boolean, d?: number) => void }).setKeepAlive = (enable, delay) => {
      keepAliveBySession[sessionIndex]!.push({ enable, delay })
    }
    return dx
  }

  const warnings: CdcWarning[] = []
  const delays: number[] = []
  const realSetInterval = globalThis.setInterval
  globalThis.setInterval = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
    if (typeof ms === 'number') delays.push(ms)
    return realSetInterval(fn as never, ms as never, ...(rest as []))
  }) as typeof setInterval

  try {
    const handle = replicate({
      url: cfg({ socket: wrappedSocket }),
      slot: 'temporary',
      publications: ['pub'],
      backfill: async () => {},
      onTransaction: () => {},
      retryDelayMs: () => 0, // speed the forced reconnect below past the default ~1-2s jitter
      onWarning: (w) => { warnings.push(w) },
    })
    // The probe reads wst=0 on session 0, which never carried keepAlive — the layer reconnects
    // once before any slot administration, so the socket that actually reaches START_REPLICATION
    // is session 1, not session 0.
    await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
    expect(backend.sessions.length).toBe(2)

    // (a) the warning fired exactly once, naming the setting — not twice for the internal reconnect
    expect(warnings.filter((w) => w.kind === 'wal-sender-timeout-disabled').length).toBe(1)
    expect(warnings.some((w) => w.kind === 'wal-sender-timeout-disabled' && w.message.includes('wal_sender_timeout'))).toBe(true)

    // (b) session 0 (the probe-only connect) never carried keepAlive; session 1, the one that
    // actually streams, does — closing the keepAlive lag for the FIRST session, not just the second.
    expect(keepAliveBySession[0]?.some((c) => c.enable === true)).toBe(false)
    expect(keepAliveBySession[1]?.some((c) => c.enable === true)).toBe(true)

    // (c) session 1's recorded setInterval delays, taken BEFORE the CopyDone reconnect below — a
    // cumulative spy would otherwise pick up a later session's own status-cadence interval too.
    // The two setInterval sites in src/replication.ts separate cleanly on delay: receive-liveness
    // (armed iff receiveTimeoutMs is set) caps at 5000ms; status cadence never drops below
    // 10000ms floor. A wrongly-undisarmed receiveTimeoutMs at wst=0 would arm a
    // receive timer at 5000ms and trip the first assertion.
    expect(delays.some((d) => d < 10000)).toBe(false)
    expect(delays.some((d) => d >= 10000)).toBe(true)

    // (d) push a server CopyDone to force the ordinary reconnect, then check the rebuilt session's
    // socket — derivedKeepAlive carries forward, so no second internal reconnect is needed here.
    backend.latest!.dx.push(frame('c', Buffer.alloc(0)))
    await until(() => backend.sessions.length >= 3 && !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
    expect(keepAliveBySession[2]?.some((c) => c.enable === true)).toBe(true)

    await handle.stop()
  } finally {
    globalThis.setInterval = realSetInterval
  }
})

test('cdc wal_sender_timeout zero with keepAlive pinned false: the warning says nothing was enabled', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.includes('wal_sender_timeout') ? [rowDesc([{ name: 'setting', oid: 25 }]), dataRow(['0']), ready()] : undefined,
  })
  const warnings: CdcWarning[] = []
  const handle = replicate({
    url: cfg({ socket: backend.socket, keepAlive: false }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    onWarning: (w) => { warnings.push(w) },
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const w = warnings.find((x) => x.kind === 'wal-sender-timeout-disabled') as { message: string } | undefined
  expect(w).toBeDefined()
  expect(w!.message).not.toContain('keepAlive is enabled instead')
  expect(w!.message).toContain('no liveness detection at all')
  await handle.stop()
})

test('cdc 55006: object_in_use after eviction retries the session instead of failing permanently', async () => {
  // Contrast with 'cdc eviction denied' above: 42501 (missing pg_signal_backend) is permanent,
  // 55006 (the slot briefly still active server-side right after termination) is not — it has no
  // named branch in src/cdc.ts at all, so the assertion is that isPermanentFailure() genuinely
  // omits it, not a re-implementation of the omission.
  let healthReadsSession0 = 0
  let terminateCalls = 0
  let startCallsSession0 = 0
  const backend = cdcBackend({
    onQuery: (sql, session) => {
      if (sql.startsWith('select pg_terminate_backend')) {
        terminateCalls++
        return [rowDesc([{ name: 'pg_terminate_backend', oid: 25 }]), dataRow(['t']), ready()]
      }
      if (sql.startsWith('select active from pg_replication_slots')) {
        return [rowDesc([{ name: 'active', oid: 25 }]), dataRow(['f']), ready()] // clears right away
      }
      if (sql.startsWith('select active,')) {
        if (session === 0) {
          healthReadsSession0++
          // first read on session 0: busy, drives eviction; the re-read after eviction's continue: healthy
          return healthReadsSession0 === 1
            ? [rowDesc(healthCols), dataRow(['t', '24680', 'reserved', '0/10', '0/8']), ready()]
            : [rowDesc(healthCols), dataRow(['f', null, 'reserved', '0/10', '0/8']), ready()]
        }
        return [rowDesc(healthCols), dataRow(['f', null, 'reserved', '0/10', '0/8']), ready()] // already clear on retry
      }
      if (sql.startsWith('START_REPLICATION') && session === 0) {
        startCallsSession0++
        return [errFrame('55006', 'replication slot "durable_55006" is active for PID 24680'), ready()]
      }
      return undefined
    },
  })

  const warnings: CdcWarning[] = []
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_55006' },
    publications: ['pub'],
    onSlotBusy: 'evict',
    backfill: async () => {},
    onTransaction: () => {},
    retryDelayMs: () => 1,
    onWarning: (w) => { warnings.push(w) },
    onFatalError: (err) => { fatalErr = err },
  })

  // session 0's START_REPLICATION rejects with 55006; the layer must open a second session
  // (a further attempt) and reach a real START_REPLICATION there, never firing onFatalError.
  await until(() => backend.sessions.length >= 2 && !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  expect(startCallsSession0).toBe(1)
  expect(terminateCalls).toBe(1) // eviction ran once; the retry's re-read already saw the slot clear
  expect(fatalErr).toBeUndefined()
  expect(warnings.some((w) => w.kind === 'reconnect-attempt')).toBe(true) // 55006 consumed an ordinary retry attempt
  await Bun.sleep(50)
  expect(fatalErr).toBeUndefined() // still no fatal after settling
  await handle.stop()
})

test('cdc eviction deadline: an active slot that never clears raises SlotBusyError, not a forever poll', async () => {
  // The ~3s deadline in evictAndAwaitClear is real wall-clock arithmetic (Date.now() vs a fixed
  // deadline) — driven here by advancing what THAT comparison observes, once the poll loop has
  // genuinely started, rather than waiting out 3 real seconds or reimplementing the arithmetic.
  let terminateCalls = 0
  let pollCalls = 0
  let armDeadline = false
  const backend = cdcBackend({
    onQuery: (sql) => {
      if (sql.startsWith('select pg_terminate_backend')) {
        terminateCalls++
        return [rowDesc([{ name: 'pg_terminate_backend', oid: 25 }]), dataRow(['t']), ready()]
      }
      if (sql.startsWith('select active from pg_replication_slots')) {
        pollCalls++
        armDeadline = true // the deadline was already computed before this first poll landed
        return [rowDesc([{ name: 'active', oid: 25 }]), dataRow(['t']), ready()] // never clears
      }
      if (sql.startsWith('select active,')) {
        return [rowDesc(healthCols), dataRow(['t', '55221', 'reserved', '0/10', '0/8']), ready()]
      }
      return undefined
    },
  })

  const realNow = Date.now
  Date.now = () => armDeadline ? realNow() + 5000 : realNow()

  let fatalErr: Error | undefined
  try {
    const handle = replicate({
      url: cfg({ socket: backend.socket }),
      slot: { name: 'durable_deadline' },
      publications: ['pub'],
      onSlotBusy: 'evict',
      backfill: async () => {},
      onTransaction: () => {},
      onFatalError: (err) => { fatalErr = err },
    })
    await until(() => fatalErr !== undefined)
    expect(fatalErr).toBeInstanceOf(SlotBusyError)
    expect((fatalErr as SlotBusyError).slot).toBe('durable_deadline')
    expect((fatalErr as SlotBusyError).pid).toBe(55221)
    expect(terminateCalls).toBe(1)
    expect(pollCalls).toBe(1) // the deadline trips on the very first poll once Date.now() reports it elapsed
    await handle.stop()
  } finally {
    Date.now = realNow
  }
})

test('cdc stop guards buffered batches: onTransaction never runs again once stop() is called', async () => {
  // next() drains its queue before honoring `ended`, so a transaction fully received and
  // buffered while the handler is parked on an earlier one must not still reach onTransaction —
  // even though the raw layer already has it queued when stop() is called.
  const backend = cdcBackend()
  let calls = 0
  let release: (() => void) | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: async () => {
      calls++
      if (calls === 1) await new Promise<void>((resolve) => { release = resolve })
    },
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const session = backend.latest!

  session.dx.push(pgBegin())
  session.dx.push(pgRelation(20, 'public', 't', 'd', [{ name: 'id', oid: 23, key: true }]))
  session.dx.push(pgInsert(20, [textCell('1')]))
  session.dx.push(pgCommit(0xa0n, 0xb0n))
  await until(() => !!release) // handler #1 is parked

  // Fully received and buffered in the raw layer's message queue, never yet pulled by next().
  session.dx.push(pgBegin())
  session.dx.push(pgRelation(20, 'public', 't', 'd', [{ name: 'id', oid: 23, key: true }]))
  session.dx.push(pgInsert(20, [textCell('2')]))
  session.dx.push(pgCommit(0xc0n, 0xd0n))
  await Bun.sleep(20) // let the bytes settle into the raw layer's own queue before stopping

  const stopPromise = handle.stop() // `stopping` flips true now, while handler #1 is still parked
  release!() // let the parked handler resolve
  await stopPromise

  await Bun.sleep(30) // give a wrongly-scheduled second invocation a chance to run
  expect(calls).toBe(1)
})

test('cdc durable backfill throw retries in place, on the same snapshot, no new slot, no onResume', async () => {
  const backend = cdcBackend({
    // Session 0: zero rows -> durable create path. Any later session (a reconnect, which the
    // fix must never cause): the slot now exists and is healthy — this is what makes the
    // counterfactual (no in-place retry) manifest the actual bug, a silent resume, instead
    // of timing out some other way.
    onQuery: (sql, session) => sql.includes('pg_replication_slots')
      ? (session === 0 ? [rowDesc(healthCols), ready()] : [rowDesc(healthCols), dataRow(['f', null, 'reserved', '0/10', '0/8']), ready()])
      : undefined,
  })
  const backfillCalls: { snapshot: string; streamStartLsn: string; isReconnect: boolean }[] = []
  let onResumeCalls = 0
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_backfill_retry' },
    publications: ['pub'],
    backfill: async ({ snapshot, streamStartLsn, isReconnect }) => {
      backfillCalls.push({ snapshot, streamStartLsn, isReconnect })
      if (backfillCalls.length === 1) throw new Error('backfill failed once')
    },
    onResume: async () => { onResumeCalls++ },
    onTransaction: () => {},
    retryDelayMs: () => 1,
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  expect(backfillCalls.length).toBe(2)
  expect(backfillCalls[0]!.snapshot).toBe(backfillCalls[1]!.snapshot)
  expect(backfillCalls[0]!.streamStartLsn).toBe(backfillCalls[1]!.streamStartLsn)
  expect(backfillCalls[0]!.isReconnect).toBe(false)
  expect(backfillCalls[1]!.isReconnect).toBe(false) // still the SAME window, never a rebuilt session
  expect(onResumeCalls).toBe(0) // never took the resume path — this is still the create-slot session
  expect(backend.sessions.length).toBe(1) // no reconnect for the whole retry
  expect(backend.latest!.queries.filter((q) => q.startsWith('CREATE_REPLICATION_SLOT')).length).toBe(1)
  await handle.stop()
})

test('cdc backfillTimeoutMs timeout on a durable slot fires onFatalError without a retry', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.includes('pg_replication_slots') ? [rowDesc(healthCols), ready()] : undefined,
  })
  let backfillCalls = 0
  let fatalErr: Error | undefined
  let retryCalls = 0
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_backfill_timeout' },
    publications: ['pub'],
    backfillTimeoutMs: 30,
    backfill: async ({ signal }) => {
      backfillCalls++
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => resolve(), { once: true }) })
    },
    onTransaction: () => {},
    retryDelayMs: () => { retryCalls++; return 1 }, // must never be consulted — the deadline is terminal
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => fatalErr !== undefined)
  expect(fatalErr).toBeInstanceOf(BackfillTimeoutError)
  expect(backfillCalls).toBe(1) // never retried in place
  expect(retryCalls).toBe(0) // never consulted — the outer catch's isPermanentFailure short-circuits it
  expect(backend.sessions.length).toBe(1) // no reconnect, no second session
  await handle.stop()
})

test('cdc backfillTimeoutMs timeout on a durable slot never opens a second session or resumes', async () => {
  const backend = cdcBackend({
    // Session 0: zero rows -> durable create path, where the timeout fires. Session 1+ reports
    // the slot as healthy — the row a wrongly-retried reconnect would find and resume from,
    // streaming forever with the baseline never read. The fix must never let session 1 exist.
    onQuery: (sql, session) => sql.includes('pg_replication_slots')
      ? (session === 0 ? [rowDesc(healthCols), ready()] : [rowDesc(healthCols), dataRow(['f', null, 'reserved', '0/10', '0/8']), ready()])
      : undefined,
  })
  let backfillCalls = 0
  let onResumeCalls = 0
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_backfill_timeout_no_resume' },
    publications: ['pub'],
    backfillTimeoutMs: 30,
    backfill: async ({ signal }) => {
      backfillCalls++
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => resolve(), { once: true }) })
    },
    onResume: async () => { onResumeCalls++ },
    onTransaction: () => {},
    retryDelayMs: () => 1,
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => fatalErr !== undefined)
  expect(fatalErr).toBeInstanceOf(BackfillTimeoutError)
  expect(backfillCalls).toBe(1)
  expect(onResumeCalls).toBe(0) // the resume path this deadline used to reopen never runs
  expect(backend.sessions.length).toBe(1) // exactly one session — no reconnect ever finds the slot healthy
  await handle.stop()
})

test('cdc a throw from retryDelayMs is routed through fireFatal, not an unhandled rejection', async () => {
  const backend = cdcBackend()
  let fatalErr: Error | undefined
  let uncaught: unknown
  const onUnhandled = (reason: unknown): void => { uncaught = reason }
  process.on('unhandledRejection', onUnhandled)
  try {
    const handle = replicate({
      url: cfg({ socket: backend.socket }),
      slot: 'temporary',
      publications: ['pub'],
      backfill: async () => {},
      onTransaction: () => {},
      retryDelayMs: () => { throw new Error('retryDelayMs itself is broken') },
      onFatalError: (err) => { fatalErr = err },
    })
    await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
    backend.latest!.dx.destroy() // session failure -> the outer catch invokes the (throwing) retryDelayMs
    await until(() => fatalErr !== undefined)
    expect(fatalErr).toBeInstanceOf(Error)
    expect((fatalErr as Error).message).toBe('retryDelayMs itself is broken')
    await Bun.sleep(20)
    expect(uncaught).toBeUndefined() // must never surface as an unhandled rejection
    await handle.stop()
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

test('cdc onFatalError itself throwing does not produce an unhandled rejection', async () => {
  const backend = cdcBackend()
  let uncaught: unknown
  const onUnhandled = (reason: unknown): void => { uncaught = reason }
  process.on('unhandledRejection', onUnhandled)
  try {
    const handle = replicate({
      url: cfg({ socket: backend.socket }),
      slot: 'temporary',
      publications: ['pub'],
      backfill: async () => {},
      onTransaction: () => {},
      retryDelayMs: () => null, // fatal on the very first failure
      onFatalError: () => { throw new Error('onFatalError itself is broken') },
    })
    await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
    backend.latest!.dx.destroy()
    await Bun.sleep(50)
    expect(uncaught).toBeUndefined()
    await handle.stop()
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

test('cdc eviction rounds are capped — a rival that keeps re-acquiring the slot goes fatal instead of looping forever', async () => {
  let terminateCalls = 0
  const backend = cdcBackend({
    onQuery: (sql) => {
      if (sql.startsWith('select pg_terminate_backend')) {
        terminateCalls++
        return [rowDesc([{ name: 'pg_terminate_backend', oid: 25 }]), dataRow(['t']), ready()]
      }
      // The rival always wins the re-read after eviction clears — evictAndAwaitClear's own poll
      // sees it gone, but the NEXT S2 health read finds it busy again forever.
      if (sql.startsWith('select active from pg_replication_slots')) return [rowDesc([{ name: 'active', oid: 25 }]), dataRow(['f']), ready()]
      if (sql.startsWith('select active,')) return [rowDesc(healthCols), dataRow(['t', '77777', 'reserved', '0/10', '0/8']), ready()]
      return undefined
    },
  })
  let fatalErr: Error | undefined
  let retryCalled = false
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_pingpong' },
    publications: ['pub'],
    onSlotBusy: 'evict',
    backfill: async () => {},
    onTransaction: () => {},
    retryDelayMs: () => { retryCalled = true; return 1 },
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => fatalErr !== undefined)
  expect(fatalErr).toBeInstanceOf(SlotBusyError)
  expect((fatalErr as SlotBusyError).pid).toBe(77777)
  expect(terminateCalls).toBe(3) // three eviction rounds, then it gives up rather than a fourth
  expect(retryCalled).toBe(false) // SlotBusyError is permanent — no retry budget spent
  expect(backend.sessions.length).toBe(1) // never reconnected — this is entirely S2 -> S2
  await handle.stop()
})

test('cdc an invalid durable slot name throws synchronously, without ever needing onFatalError', () => {
  const backend = cdcBackend()
  expect(() => replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'Bad-Name' },
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    // deliberately no onFatalError — the whole point is that this must not need one
  })).toThrow(InvalidSlotName)
  expect(backend.sessions.length).toBe(0) // never even attempted to connect
})

test('cdc a non-positive backfillTimeoutMs throws synchronously instead of firing an instant timeout', () => {
  const backend = cdcBackend()
  for (const bad of [0, -100, -1]) {
    expect(() => replicate({
      url: cfg({ socket: backend.socket }),
      slot: 'temporary',
      publications: ['pub'],
      backfillTimeoutMs: bad,
      backfill: async () => {},
      onTransaction: () => {},
      // deliberately no onFatalError — the whole point is that this must not need one
    })).toThrow(RangeError)
  }
  expect(backend.sessions.length).toBe(0) // never even attempted to connect
})

test('cdc an empty publications array throws synchronously, without ever needing onFatalError', () => {
  const backend = cdcBackend()
  expect(() => replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: [],
    backfill: async () => {},
    onTransaction: () => {},
  })).toThrow(PublicationEmpty)
  expect(backend.sessions.length).toBe(0)
})

test('cdc a genuinely async fatal error with no onFatalError is reported to stderr instead of vanishing', async () => {
  const backend = cdcBackend()
  const originalError = console.error
  const errors: unknown[][] = []
  console.error = (...args: unknown[]) => { errors.push(args) }
  try {
    const handle = replicate({
      url: cfg({ socket: backend.socket }),
      slot: 'temporary',
      publications: ['pub'],
      backfill: async () => {},
      onTransaction: () => {},
      retryDelayMs: () => null, // fatal on the very first failure
      // deliberately no onFatalError
    })
    await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
    backend.latest!.dx.destroy()
    await until(() => errors.length > 0)
    expect(errors.some((args) => args.some((a) => typeof a === 'string' && a.includes('no onFatalError')))).toBe(true)
    await handle.stop()
  } finally {
    console.error = originalError
  }
})

test('cdc a pre-PG13 server (wal_status missing, 42703) fails fast instead of burning the retry budget', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.startsWith('select active,') ? [errFrame('42703', 'column "wal_status" does not exist'), ready()] : undefined,
  })
  let fatalErr: Error | undefined
  let retryCalled = false
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_old_server' },
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    retryDelayMs: (attempt) => { retryCalled = true; return attempt < 3 ? 1 : null }, // converge fast if this DOES retry
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => fatalErr !== undefined)
  expect(fatalErr).toBeInstanceOf(UnsupportedServerVersionError)
  expect((fatalErr as Error).message).toContain('PostgreSQL 13+')
  expect(retryCalled).toBe(false) // permanent — skips the retry loop entirely
  expect(backend.sessions.length).toBe(1) // never reconnected to retry the same doomed query
  await handle.stop()
})

test('cdc malformed shape: a duplicate shapes entry is fatal on the first attempt, not retried through the budget', async () => {
  const backend = cdcBackend()
  let backfillCalls = 0
  let fatalErr: Error | undefined
  let retryCalled = false
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    shapes: [
      { table: 'orders', shape: { id: 'int4' } },
      { table: 'orders', shape: { id: 'int4' } }, // duplicate schema.table — a deterministic typo, never a transient failure
    ],
    backfill: async () => { backfillCalls++ },
    onTransaction: () => {},
    retryDelayMs: (attempt) => { retryCalled = true; return attempt < 3 ? 1 : null }, // converge fast if this DOES retry
    onFatalError: (err) => { fatalErr = err },
  })
  await until(() => fatalErr !== undefined)

  expect(fatalErr).toBeInstanceOf(InvalidReplicationShape)
  expect((fatalErr as Error).message).toContain('duplicate replication shape for public.orders')
  expect(retryCalled).toBe(false) // permanent — skips the retry loop entirely
  expect(backfillCalls).toBe(1)   // exactly one backfill spent, not ten
  expect(backend.sessions.length).toBe(1) // exactly one session opened, not ten
  await handle.stop()
})

test('cdc and raw slot-name validation reject and accept identically at every boundary', async () => {
  const cases: { label: string; name: string }[] = [
    { label: '63 chars', name: 'a'.repeat(63) },
    { label: '64 chars', name: 'a'.repeat(64) },
    { label: 'uppercase', name: 'UpperCase' },
    { label: 'hyphen', name: 'has-hyphen' },
    { label: 'leading digit', name: '1leading' },
    { label: 'empty string', name: '' },
  ]

  // Raw surface: repl.createSlot() runs checkSlot() before any command is sent.
  const rawBackend = cdcBackend()
  const repl = await rawReplication(cfg({ socket: rawBackend.socket }))
  const rawAccepts = new Map<string, boolean>()
  try {
    for (const c of cases) {
      try { await repl.createSlot(c.name); rawAccepts.set(c.name, true) }
      catch (e) { if (e instanceof InvalidSlotName) rawAccepts.set(c.name, false); else throw e }
    }
  } finally { repl.end() }

  // Managed surface: replicate({ slot: { name } }) validates synchronously, before the handle's
  // session loop ever runs — a fresh backend per name keeps sessions from one call bleeding into
  // the next, though a rejected name never opens one anyway.
  const managedAccepts = new Map<string, boolean>()
  for (const c of cases) {
    const backend = cdcBackend()
    try {
      const handle = replicate({
        url: cfg({ socket: backend.socket }),
        slot: { name: c.name },
        publications: ['pub'],
        backfill: async () => {},
        onTransaction: () => {},
      })
      managedAccepts.set(c.name, true)
      await handle.stop()
    } catch (e) {
      if (e instanceof InvalidSlotName) managedAccepts.set(c.name, false)
      else throw e
    }
  }

  // The drift guard: whatever either surface decides for a given name, the OTHER surface must
  // decide the same thing — not a comparison against the shared regex, which is exactly the
  // "looks like itself" check that misses real drift between the two independent copies.
  for (const c of cases) expect(managedAccepts.get(c.name)).toBe(rawAccepts.get(c.name))
  // Ground truth on the two length boundaries, so the parity loop above can't pass by both
  // surfaces trivially agreeing to reject (or accept) everything.
  expect(rawAccepts.get('a'.repeat(63))).toBe(true)
  expect(rawAccepts.get('a'.repeat(64))).toBe(false)
})

test('cdc onResume verdict: recreate drops the healthy slot and rebuilds from a fresh snapshot', async () => {
  const backend = cdcBackend() // default healthy row: active 'f', confirmed_flush '0/10', restart '0/8'
  const resumeInfos: { confirmedFlush: string; restartLsn: string; isReconnect: boolean }[] = []
  const backfillInfos: { isReconnect: boolean }[] = []
  const calls: { attempt: number; err: Error }[] = []
  let onResumeCalls = 0
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_verdict_recreate' },
    publications: ['pub'],
    backfill: async (info) => { backfillInfos.push({ isReconnect: info.isReconnect }) },
    onResume: async (info) => {
      onResumeCalls++
      resumeInfos.push(info)
      return onResumeCalls === 1 ? 'recreate' : undefined
    },
    onTransaction: async () => {},
    retryDelayMs: (attempt, err) => { calls.push({ attempt, err }); return 1 },
    onFatalError: (err) => { fatalErr = err },
  })

  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const s0 = backend.sessions[0]!
  const healthIdx = s0.queries.findIndex((q) => q.startsWith('select active,'))
  const dropIdx = s0.queries.findIndex((q) => q.startsWith('DROP_REPLICATION_SLOT'))
  const createIdx = s0.queries.findIndex((q) => q.startsWith('CREATE_REPLICATION_SLOT'))
  const startIdx = s0.queries.findIndex((q) => q.startsWith('START_REPLICATION'))
  expect(healthIdx).toBeGreaterThanOrEqual(0)
  expect(dropIdx).toBeGreaterThan(healthIdx)
  expect(createIdx).toBeGreaterThan(dropIdx)
  expect(startIdx).toBeGreaterThan(createIdx)

  expect(backfillInfos.length).toBe(1)
  expect(backfillInfos[0]!.isReconnect).toBe(true)

  // Filtered, not calls.length: the CopyDone-driven reconnect below consumes the budget too, with
  // its own unrelated error — this checks only the verdict's own consult.
  const verdictCalls = calls.filter((c) => c.err.message.includes('onResume'))
  expect(verdictCalls.length).toBe(1)
  expect(verdictCalls[0]!.err).not.toBeInstanceOf(SlotInvalidatedError)

  expect(resumeInfos[0]).toEqual({ confirmedFlush: '0/10', restartLsn: '0/8', isReconnect: false }) // the fake's default row

  const relId = 40, commitLsn = 0x60n, endLsn = 0x70n
  s0.dx.push(pgBegin())
  s0.dx.push(pgRelation(relId, 'public', 'verdict', 'd', [{ name: 'id', oid: 23, key: true }]))
  s0.dx.push(pgInsert(relId, [textCell('1')]))
  s0.dx.push(pgCommit(commitLsn, endLsn))
  await until(() => lastFlushed(s0.sent) >= endLsn)

  // force a reconnect via server CopyDone — onResume runs again, now returning undefined
  s0.dx.push(frame('c', Buffer.alloc(0)))
  await until(() => backend.sessions.length >= 2 && !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  const s1 = backend.latest!
  expect(s1.queries.some((q) => q.startsWith('DROP_REPLICATION_SLOT'))).toBe(false)
  expect(s1.queries.some((q) => q.startsWith('CREATE_REPLICATION_SLOT'))).toBe(false)
  expect(backfillInfos.length).toBe(1)
  expect(onResumeCalls).toBe(2)

  expect(fatalErr).toBeUndefined()
  await handle.stop()
})

test('cdc onResume verdict: a recreate on every connect exhausts the budget', async () => {
  const backend = cdcBackend() // default healthy row: every connect's health check passes, onResume alone decides
  const calls: { attempt: number; err: Error }[] = []
  let fatalErr: Error | undefined
  let fatalCount = 0
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_verdict_exhaust' },
    publications: ['pub'],
    backfill: async () => {},
    onResume: async () => 'recreate' as const,
    onTransaction: async () => {},
    retryDelayMs: (attempt, err) => { calls.push({ attempt, err }); return attempt < 4 ? 1 : null },
    onFatalError: (err) => { fatalErr = err; fatalCount++ },
  })

  // Each rebuilt session consumes the budget twice: once for the verdict itself, once when the
  // CopyDone pushed below kills it before anything acks — neither consult resets the budget.
  let sessionIdx = 0
  while (fatalErr === undefined) {
    await until(() => (backend.sessions.length > sessionIdx && !!backend.sessions[sessionIdx]?.queries.some((q) => q.startsWith('START_REPLICATION'))) || fatalErr !== undefined)
    if (fatalErr !== undefined) break
    backend.sessions[sessionIdx]!.dx.push(frame('c', Buffer.alloc(0)))
    sessionIdx++
  }

  expect(fatalCount).toBe(1)
  expect(calls.map((c) => c.attempt)).toEqual([1, 2, 3, 4])
  expect(calls.every((c) => !(c.err instanceof SlotInvalidatedError))).toBe(true)
  const sessionsAtFatal = backend.sessions.length
  await Bun.sleep(50)
  expect(backend.sessions.length).toBe(sessionsAtFatal)
  await handle.stop()
})

test('cdc a temporary slot with a prefix names itself <prefix>_<hex>, still TEMPORARY', async () => {
  const backend = cdcBackend()
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { temporary: true, prefix: 'myproc' },
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
  })
  try {
    await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
    const createQuery = backend.latest!.queries.find((q) => q.startsWith('CREATE_REPLICATION_SLOT'))
    expect(createQuery).toMatch(/^CREATE_REPLICATION_SLOT myproc_[0-9a-f]{8} TEMPORARY LOGICAL pgoutput EXPORT_SNAPSHOT$/)
  } finally {
    await handle.stop()
  }
})

test('cdc bare slot: "temporary" still names itself minipg_cdc_<hex>', async () => {
  const backend = cdcBackend()
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
  })
  try {
    await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
    const createQuery = backend.latest!.queries.find((q) => q.startsWith('CREATE_REPLICATION_SLOT'))
    expect(createQuery).toMatch(/^CREATE_REPLICATION_SLOT minipg_cdc_[0-9a-f]{8} TEMPORARY/)
  } finally {
    await handle.stop()
  }
})

test('cdc a 54-character prefix is accepted, a 55-character one throws synchronously, and so does an empty one', async () => {
  const okBackend = cdcBackend()
  const okPrefix = 'a'.repeat(54)
  const handle = replicate({
    url: cfg({ socket: okBackend.socket }),
    slot: { temporary: true, prefix: okPrefix },
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
  })
  try {
    await until(() => !!okBackend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
    const createQuery = okBackend.latest!.queries.find((q) => q.startsWith('CREATE_REPLICATION_SLOT'))
    const name = createQuery!.split(' ')[1]!
    expect(name.length).toBe(63) // 54 + '_' + 8 hex
  } finally {
    await handle.stop()
  }

  const tooLongBackend = cdcBackend()
  expect(() => replicate({
    url: cfg({ socket: tooLongBackend.socket }),
    slot: { temporary: true, prefix: 'a'.repeat(55) },
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    // deliberately no onFatalError — the whole point is that this must not need one
  })).toThrow(InvalidSlotName)
  expect(tooLongBackend.sessions.length).toBe(0)

  const emptyBackend = cdcBackend()
  expect(() => replicate({
    url: cfg({ socket: emptyBackend.socket }),
    slot: { temporary: true, prefix: '' },
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    // deliberately no onFatalError — the whole point is that this must not need one
  })).toThrow(InvalidSlotName)
  expect(emptyBackend.sessions.length).toBe(0)
})

test('cdc a prefix with a character outside [a-z0-9_] throws synchronously', () => {
  const backend = cdcBackend()
  expect(() => replicate({
    url: cfg({ socket: backend.socket }),
    slot: { temporary: true, prefix: 'Bad-Name' },
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    // deliberately no onFatalError — the whole point is that this must not need one
  })).toThrow(InvalidSlotName)
  expect(backend.sessions.length).toBe(0)
})

test('cdc ready resolves once the server accepts START_REPLICATION', async () => {
  const backend = cdcBackend()
  let transactions = 0
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => { transactions++ },
  })
  await handle.ready
  expect(backend.latest!.queries.some((q) => q.startsWith('START_REPLICATION'))).toBe(true)
  expect(transactions).toBe(0)
  await handle.stop()
})

test('cdc ready rejects with the first attempt error, before the retry budget is touched', async () => {
  const backend = cdcBackend({
    onQuery: (sql, session) => sql.includes('wal_sender_timeout') && session === 0 ? [errFrame('57P01', 'boom'), ready()] : undefined,
  })
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
    retryDelayMs: () => 50,
    onFatalError: (err) => { fatalErr = err },
  })
  await expect(handle.ready).rejects.toBeInstanceOf(PgError)
  await expect(handle.ready).rejects.toHaveProperty('code', '57P01')
  expect(fatalErr).toBeUndefined() // proves the rejection came from the first attempt, not budget exhaustion
  await handle.stop()
})

test('cdc ready rejects via fireFatal on a give-up path that returns without throwing', async () => {
  const backend = cdcBackend()
  let fatalErr: Error | undefined
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => { throw new Error('backfill is broken') },
    onTransaction: () => {},
    retryDelayMs: () => null, // gives up on the first backfill throw — the outer catch never runs this session
    onFatalError: (err) => { fatalErr = err },
  })
  // Without the fireFatal reject site this await hangs forever: the give-up path here returns
  // from inside the try, so the outer catch below never settles ready.
  await expect(handle.ready).rejects.toThrow('backfill is broken')
  expect(fatalErr).toBeInstanceOf(Error)
  await handle.stop()
})

test('cdc an untouched ready produces no unhandled rejection when the first connect fails', async () => {
  const backend = cdcBackend({
    onQuery: (sql) => sql.includes('wal_sender_timeout') ? [errFrame('57P01', 'boom'), ready()] : undefined,
  })
  let uncaught: unknown
  const onUnhandled = (reason: unknown): void => { uncaught = reason }
  process.on('unhandledRejection', onUnhandled)
  try {
    let fatalErr: Error | undefined
    // handle.ready is deliberately never referenced below this point: no await, no .catch, no
    // .then, no expect().rejects — any of those attaches a handler and masks the bug under test.
    const handle = replicate({
      url: cfg({ socket: backend.socket }),
      slot: 'temporary',
      publications: ['pub'],
      backfill: async () => {},
      onTransaction: () => {},
      retryDelayMs: () => null, // fatal on the very first failure
      onFatalError: (err) => { fatalErr = err },
    })
    await until(() => fatalErr !== undefined)
    // Unhandled-rejection detection fires when the microtask queue drains, not on the next
    // microtask — a real timer turn is required before this assertion means anything.
    await Bun.sleep(20)
    expect(uncaught).toBeUndefined()
    await handle.stop()
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

test('cdc stop() before the first connect rejects ready', async () => {
  let socketCalls = 0
  const handle = replicate({
    url: cfg({ socket: () => { socketCalls++; throw new Error('should never be called') } }),
    slot: 'temporary',
    publications: ['pub'],
    backfill: async () => {},
    onTransaction: () => {},
  })
  const stopPromise = handle.stop() // synchronous stop, before run()'s own microtask ever executes
  await expect(handle.ready).rejects.toThrow('minipg: replicate() stopped before the first connect opened a stream')
  await stopPromise
  expect(socketCalls).toBe(0)
})

test('cdc backfill and onResume agree on the reconnect flag across a create-then-resume handle', async () => {
  const backend = cdcBackend({
    // Session 0: no row -> creates and backfills. Session 1: healthy row -> resumes.
    onQuery: (sql, session) => sql.includes('pg_replication_slots')
      ? (session === 0 ? [rowDesc(healthCols), ready()] : [rowDesc(healthCols), dataRow(['f', null, 'reserved', '0/10', '0/8']), ready()])
      : undefined,
  })
  const backfillFlags: boolean[] = []
  const resumeFlags: boolean[] = []
  const handle = replicate({
    url: cfg({ socket: backend.socket }),
    slot: { name: 'durable_create_then_resume' },
    publications: ['pub'],
    backfill: async ({ isReconnect }) => { backfillFlags.push(isReconnect) },
    onResume: async ({ isReconnect }) => { resumeFlags.push(isReconnect) },
    onTransaction: () => {},
    retryDelayMs: () => 1,
  })
  await until(() => !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  expect(backfillFlags).toEqual([false])
  expect(resumeFlags).toEqual([])

  backend.latest!.dx.destroy()
  await until(() => backend.sessions.length >= 2 && !!backend.latest?.queries.some((q) => q.startsWith('START_REPLICATION')))
  expect(backfillFlags).toEqual([false]) // unchanged — session 1 resumed, it never backfilled again
  expect(resumeFlags).toEqual([true]) // the same connect index (session 1) that backfill would have called a reconnect too

  await handle.stop()
})
