// Proves the receive-timeout/slot-name/keepAlive seams over an in-process fake walsender — no
// cluster required. The fake speaks just enough of the protocol (startup, simple query, CopyBoth)
// to drive replication()'s state machine deterministically; it never sends a ParameterStatus, so
// serverMajor stays 0 and the binary 'auto' probe never engages against it.
import { test, expect } from 'bun:test'
import { Duplex } from 'node:stream'
import { frame, rowDescription, dataRow as dataRowBody, type WireCol, type Cell } from '../helpers/wire.ts'
import { replication, ReplicationReceiveTimeout, ReplicationBusy, ReplicationSessionSpent, InvalidSlotName, PublicationEmpty, PublicationMissing, type ReplicationConfig, type ReplicationWarning } from '../../src/index.ts'

const i32 = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeInt32BE(n); return b }
const u16 = (n: number) => { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(n); return b }
const i64zero = Buffer.alloc(8)

const authOk = () => frame('R', i32(0))
const ready = (s = 'I') => frame('Z', Buffer.from(s, 'latin1'))
const rowDesc = (cols: WireCol[]) => frame('T', rowDescription(cols))
const dataRow = (cells: Cell[]) => frame('D', dataRowBody(cells))
const copyBoth = () => frame('W', Buffer.from([0, 0, 0]))
const commandComplete = (tag = 'START_REPLICATION') => frame('C', Buffer.from(tag + '\0', 'latin1'))
const xlogData = (payload: Buffer) => frame('d', Buffer.concat([Buffer.from('w', 'latin1'), i64zero, i64zero, i64zero, payload]))
const keepalive = (reply = 0) => frame('d', Buffer.concat([Buffer.from('k', 'latin1'), i64zero, i64zero, Buffer.from([reply])]))
const pgBegin = () => xlogData(Buffer.concat([Buffer.from('B', 'latin1'), i64zero, i64zero, i32(1)]))

// pgoutput Relation ('R') and Update ('U') submessages, for tests that need a decodable relation
// announce + a following change event (not just a bare 'begin').
const cstrPg = (s: string) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.from([0])])
const pgRelation = (id: number, schema: string, table: string, identity: string, cols: { name: string; oid: number; key?: boolean }[]) =>
  xlogData(Buffer.concat([
    Buffer.from('R', 'latin1'), i32(id), cstrPg(schema), cstrPg(table), Buffer.from(identity, 'latin1'),
    u16(cols.length),
    ...cols.map((c) => Buffer.concat([Buffer.from([c.key ? 1 : 0]), cstrPg(c.name), i32(c.oid), i32(-1)])),
  ]))
const textCell = (s: string) => Buffer.concat([Buffer.from([0x74]), i32(Buffer.byteLength(s, 'utf8')), Buffer.from(s, 'utf8')])
// an Update with NO 'K'/'O' old-tuple marker — the DEFAULT-identity, old-row-less shape onWarning's
// replica-identity diagnostic fires on
const pgUpdateNoOld = (relId: number, cells: Buffer[]) =>
  xlogData(Buffer.concat([Buffer.from('U', 'latin1'), i32(relId), Buffer.from('N', 'latin1'), u16(cells.length), ...cells]))

/** An in-process fake walsender: authenticates unconditionally, then answers each simple-protocol
 *  'Q' via onQuery (default: START_REPLICATION -> CopyBothResponse, else -> ReadyForQuery). */
function fakeBackend(opts: { onQuery?: (sql: string) => Buffer[] } = {}) {
  const sent: Buffer[] = []    // CopyData/Terminate frames received after streaming begins
  const queries: string[] = [] // every 'Q' frame's SQL text, in order
  let authenticated = false
  const onQuery = opts.onQuery ?? ((sql: string) => {
    if (sql.startsWith('START_REPLICATION')) return [copyBoth()]
    // must precede the pg_publication branch below: the partition probe SQL also contains
    // 'pg_publication', and would otherwise get misrouted into the 3-column publication response
    if (sql.includes('relispartition')) {
      return [
        rowDesc([{ name: 'schemaname', oid: 25 }, { name: 'tablename', oid: 25 }, { name: 'pubname', oid: 25 }]),
        ready(),
      ]
    }
    if (sql.includes('pg_publication')) {
      const names = [...sql.matchAll(/'([^']*)'/g)].map((m) => m[1]!) // publication literals inside array[...]
      return [
        rowDesc([{ name: 'name', oid: 25 }, { name: 'present', oid: 25 }, { name: 'tables', oid: 25 }]),
        ...names.map((n) => dataRow([n, 't', '1'])),
        ready(),
      ]
    }
    return [ready()]
  })
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
          for (const f of onQuery(sql)) dx.push(f)
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
  return { socket: () => dx, dx, sent, queries }
}

const cfg = (o: Partial<ReplicationConfig> = {}): ReplicationConfig => ({ user: 'u', database: 'd', ...o })

test('receive timeout: a silent stream fails the iterator with ReplicationReceiveTimeout', async () => {
  const backend = fakeBackend()
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const gen = repl.start({ slot: 'repl_1_ok', publications: ['pub'], receiveTimeoutMs: 300 })
    const t0 = Date.now()
    let err: unknown
    try { await gen.next() } catch (e) { err = e }
    expect(err).toBeInstanceOf(ReplicationReceiveTimeout)
    expect((err as ReplicationReceiveTimeout).reason).toBe('receive-timeout')
    expect(Date.now() - t0).toBeLessThan(1000)
  } finally { repl.end() }
})

test('receive timeout disarmed: omitting receiveTimeoutMs never fires during a silent window', async () => {
  const backend = fakeBackend()
  const repl = await replication(cfg({ socket: backend.socket }))
  const gen = repl.start({ slot: 'repl_1_ok', publications: ['pub'] })
  let settled = false
  const p = gen.next().then(() => { settled = true }, () => { settled = true })
  await Bun.sleep(700)
  expect(settled).toBe(false)
  repl.end()
  await p
})

// Reproduces PostgreSQL BUG #18754: a second START_REPLICATION on one walsender session gets
// CopyBothResponse (the server accepts the command) followed by CommandComplete/ReadyForQuery
// with no CopyDone at all — the server never actually entered streaming.
test('session spent: CommandComplete during copy with no CopyDone surfaces ReplicationSessionSpent instead of hanging', async () => {
  const backend = fakeBackend({
    onQuery: (sql) => (sql.startsWith('START_REPLICATION') ? [copyBoth(), commandComplete(), commandComplete(), ready()] : [ready()]),
  })
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const gen = repl.start({ slot: 'repl_1_ok', publications: ['pub'] })
    let err: unknown
    await Promise.race([
      gen.next().catch((e) => { err = e }),
      Bun.sleep(1500).then(() => { throw new Error('timed out — the loop parked on CommandComplete instead of surfacing an end-of-stream error') }),
    ])
    expect(err).toBeInstanceOf(ReplicationSessionSpent)
    expect((err as ReplicationSessionSpent).reason).toBe('session-spent')
  } finally { repl.end() }
})

test('slot name: createSlot and dropSlot reject invalid names before any walsender command', async () => {
  const backend = fakeBackend()
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    await expect(repl.createSlot('Bad-Name')).rejects.toThrow(InvalidSlotName)
    await expect(repl.dropSlot('has space')).rejects.toThrow(InvalidSlotName)
    expect(backend.queries.some((q) => q.startsWith('CREATE_REPLICATION_SLOT') || q.startsWith('DROP_REPLICATION_SLOT'))).toBe(false)
  } finally { repl.end() }
})

test('slot name: start() rejects lazily on first iteration, writing no START_REPLICATION frame', async () => {
  const backend = fakeBackend()
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const gen = repl.start({ slot: '', publications: ['pub'] })
    await expect(gen.next()).rejects.toThrow(InvalidSlotName)
    expect(backend.queries.some((q) => q.startsWith('START_REPLICATION'))).toBe(false)
  } finally { repl.end() }
})

test('shape key: an empty key array rejects at the first next(), before any probe', async () => {
  const backend = fakeBackend()
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const gen = repl.start({ slot: 'repl_1_ok', publications: ['pub'], shapes: [{ table: 't', shape: { id: 'int4' }, key: [] }] })
    let err: unknown
    try { await gen.next() } catch (e) { err = e }
    expect(err).toBeInstanceOf(Error)
    const msg = (err as Error).message
    expect(msg).toMatch(/key is an empty array/)
    expect(msg).toContain('public.t')
    expect(backend.queries.some((q) => q.includes('pg_publication'))).toBe(false)
    expect(backend.queries.some((q) => q.startsWith('START_REPLICATION'))).toBe(false)
  } finally { repl.end() }
})

test('slot name: non-ASCII and over-length names reject; boundary and normal names pass through verbatim', async () => {
  const backend = fakeBackend()
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    await expect(repl.createSlot('слот')).rejects.toThrow(InvalidSlotName)
    await expect(repl.createSlot('a'.repeat(64))).rejects.toThrow(InvalidSlotName)
  } finally { repl.end() }

  const backend2 = fakeBackend({
    onQuery(sql) {
      if (sql.startsWith('CREATE_REPLICATION_SLOT')) {
        const name = sql.split(' ')[1]!
        return [
          rowDesc([{ name: 'slot_name', oid: 25 }, { name: 'consistent_point', oid: 25 }, { name: 'snapshot_name', oid: 25 }, { name: 'output_plugin', oid: 25 }]),
          dataRow([name, '0/0', null, 'pgoutput']),
          ready(),
        ]
      }
      return [ready()]
    },
  })
  const repl2 = await replication(cfg({ socket: backend2.socket }))
  try {
    const longName = 'a'.repeat(63)
    const r1 = await repl2.createSlot(longName)
    expect(r1.slot).toBe(longName)
    const r2 = await repl2.createSlot('repl_1_ok')
    expect(r2.slot).toBe('repl_1_ok')
    expect(backend2.queries.some((q) => q.startsWith(`CREATE_REPLICATION_SLOT ${longName}`))).toBe(true)
  } finally { repl2.end() }
})

test('keepAlive: object form reaches setKeepAlive(true, initialDelayMs)', async () => {
  const backend = fakeBackend()
  const calls: [boolean, number | undefined][] = []
  ;(backend.dx as unknown as { setKeepAlive?: (e: boolean, d?: number) => unknown }).setKeepAlive = (e, d) => { calls.push([e, d]) }
  const repl = await replication(cfg({ socket: backend.socket, keepAlive: { initialDelayMs: 7000 } }))
  try { expect(calls).toEqual([[true, 7000]]) } finally { repl.end() }
})

test('keepAlive: true reaches setKeepAlive(true, 0); omitted option never calls it', async () => {
  const backendTrue = fakeBackend()
  const callsTrue: [boolean, number | undefined][] = []
  ;(backendTrue.dx as unknown as { setKeepAlive?: (e: boolean, d?: number) => unknown }).setKeepAlive = (e, d) => { callsTrue.push([e, d]) }
  const replTrue = await replication(cfg({ socket: backendTrue.socket, keepAlive: true }))
  try { expect(callsTrue).toEqual([[true, 0]]) } finally { replTrue.end() }

  const backendOff = fakeBackend()
  const callsOff: [boolean, number | undefined][] = []
  ;(backendOff.dx as unknown as { setKeepAlive?: (e: boolean, d?: number) => unknown }).setKeepAlive = (e, d) => { callsOff.push([e, d]) }
  const replOff = await replication(cfg({ socket: backendOff.socket }))
  try { expect(callsOff).toEqual([]) } finally { replOff.end() }
})

test('keepAlive: a socket lacking setKeepAlive never throws connect()', async () => {
  const backend = fakeBackend()
  const repl = await replication(cfg({ socket: backend.socket, keepAlive: true }))
  repl.end()
})

test('backpressure: pauses the socket at the ceiling, resumes at half, no timeout or heartbeat loss while paused', async () => {
  const backend = fakeBackend({
    onQuery: (sql) => (sql.startsWith('START_REPLICATION') ? [copyBoth(), pgBegin()] : [ready()]),
  })
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const pauseCalls: number[] = []
    const resumeCalls: number[] = []
    // wrap, don't replace: Duplex.pause()/resume() also drive the stream's own flowing state — a
    // pure spy that skips the real implementation would starve the 'data' listener entirely.
    // Wrapped only after connect() so the listener attachment's own implicit resume() (unrelated
    // to our backpressure logic) isn't counted as a call.
    const origPause = backend.dx.pause.bind(backend.dx)
    const origResume = backend.dx.resume.bind(backend.dx)
    ;(backend.dx as unknown as { pause: () => void }).pause = () => { pauseCalls.push(pauseCalls.length); origPause() }
    ;(backend.dx as unknown as { resume: () => void }).resume = () => { resumeCalls.push(resumeCalls.length); origResume() }
    const gen = repl.start({ slot: 'repl_1_ok', publications: ['pub'], maxQueueBytes: 512, statusIntervalMs: 50, receiveTimeoutMs: 200 })
    const r1 = await gen.next() // event 1 — takes it, then stalls (no pending next())
    expect(r1.done).toBe(false)
    expect(r1.value.kind).toBe('begin')
    expect(pauseCalls.length).toBe(0)

    // fake floods keepalives (no yield) well past the ceiling while the generator is suspended at
    // the yield — frames accumulate in the queue with nobody pulling
    for (let i = 0; i < 60; i++) backend.dx.push(keepalive(0))
    await Bun.sleep(50)
    expect(pauseCalls.length).toBeGreaterThan(0)
    expect(resumeCalls.length).toBe(0)

    await Bun.sleep(600) // paused stall — receiveTimeoutMs: 200 must not fire; the status heartbeat must keep writing
    expect(backend.sent.some((b) => b[0] === 0x72)).toBe(true) // 'r' standby-status frame recorded during the pause

    backend.dx.push(pgBegin()) // event 2 — queued behind the flooded keepalives
    const r2 = await gen.next() // drains the keepalives internally (no yield), resumes below half, then yields event 2
    expect(r2.done).toBe(false)
    expect(r2.value.kind).toBe('begin') // arrival order preserved: begin, begin
    expect(resumeCalls.length).toBeGreaterThan(0)
  } finally { repl.end() }
})

test('publication: an empty publications array rejects before any round trip', async () => {
  const backend = fakeBackend()
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const gen = repl.start({ slot: 'repl_1_ok', publications: [] })
    await expect(gen.next()).rejects.toThrow(PublicationEmpty)
    expect(backend.queries.some((q) => q.includes('pg_publication'))).toBe(false)
    expect(backend.queries.some((q) => q.startsWith('START_REPLICATION'))).toBe(false)
  } finally { repl.end() }
})

test('backpressure: an abandoned stream\'s undelivered frames do not loosen the next stream\'s ceiling', async () => {
  const backend = fakeBackend({
    onQuery(sql) {
      if (sql.startsWith('START_REPLICATION')) return [copyBoth(), pgBegin()]
      if (sql.includes('pg_publication')) {
        const names = [...sql.matchAll(/'([^']*)'/g)].map((m) => m[1]!)
        return [rowDesc([{ name: 'name', oid: 25 }, { name: 'present', oid: 25 }, { name: 'tables', oid: 25 }]),
          ...names.map((n) => dataRow([n, 't', '1'])), ready()]
      }
      return [ready()]
    },
  })
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    let pauses = 0
    const origPause = backend.dx.pause.bind(backend.dx)
    ;(backend.dx as unknown as { pause: () => void }).pause = () => { pauses++; origPause() }

    const gen1 = repl.start({ slot: 'repl_1_ok', publications: ['pub'], maxQueueBytes: 512 })
    await gen1.next()
    for (let i = 0; i < 60; i++) backend.dx.push(keepalive(0)) // 60 x 23 bytes, far past the ceiling
    await Bun.sleep(50)
    expect(pauses).toBeGreaterThan(0)
    await gen1.return(undefined as never) // abandon the stream with those frames still queued
    await repl.command('select 1')        // exiting copy mode drains them, subtracting their bytes

    const before = pauses
    const gen2 = repl.start({ slot: 'repl_1_ok', publications: ['pub'], maxQueueBytes: 512 })
    await gen2.next()
    for (let i = 0; i < 30; i++) backend.dx.push(keepalive(0)) // 690 bytes: over the ceiling on its own
    await Bun.sleep(50)
    expect(pauses).toBeGreaterThan(before) // a counter left negative by the residue would not reach it
    await gen2.return(undefined as never)
  } finally { repl.end() }
})

test('end(): stops the stream timers even when the generator is suspended at a yield', async () => {
  const backend = fakeBackend({
    onQuery: (sql) => (sql.startsWith('START_REPLICATION') ? [copyBoth(), pgBegin()] : [ready()]),
  })
  const repl = await replication(cfg({ socket: backend.socket }))
  let writes = 0
  const origWrite = backend.dx.write.bind(backend.dx)
  ;(backend.dx as unknown as { write: (c: Buffer) => boolean }).write = (c) => { writes++; return origWrite(c) }

  // manual iteration, no for-await: taking an event and never asking for another parks the
  // generator at the yield, where nothing is waiting in next() for end() to wake
  const gen = repl.start({ slot: 'repl_1_ok', publications: ['pub'], statusIntervalMs: 50, receiveTimeoutMs: 400 })
  expect((await gen.next()).value.kind).toBe('begin')
  repl.end()

  const after = writes
  await Bun.sleep(300) // six status ticks' worth
  expect(writes).toBe(after) // a timer the generator's own finally can never reach keeps writing forever
  void gen
})

test('end(): resumes a socket the queue ceiling left paused', async () => {
  const backend = fakeBackend({
    onQuery: (sql) => (sql.startsWith('START_REPLICATION') ? [copyBoth(), pgBegin()] : [ready()]),
  })
  const repl = await replication(cfg({ socket: backend.socket }))
  const resumeCalls: number[] = []
  const origResume = backend.dx.resume.bind(backend.dx)
  ;(backend.dx as unknown as { resume: () => void }).resume = () => { resumeCalls.push(resumeCalls.length); origResume() }

  // Park at the yield so nothing drains the queue, then flood past the ceiling to trip the pause.
  const gen = repl.start({ slot: 'repl_1_ok', publications: ['pub'], maxQueueBytes: 512, statusIntervalMs: 60_000 })
  expect((await gen.next()).value.kind).toBe('begin')
  for (let i = 0; i < 60; i++) backend.dx.push(keepalive(0))
  await Bun.sleep(50)
  expect(resumeCalls.length).toBe(0) // paused, and the suspended generator will never resume it

  repl.end()
  expect(resumeCalls.length).toBeGreaterThan(0) // end() is the only remaining path off the pause
  void gen
})

test('abort signal: a start() that fails before streaming leaves no listener on the consumer signal', async () => {
  const backend = fakeBackend({
    onQuery(sql) {
      if (sql.includes('pg_publication')) {
        const names = [...sql.matchAll(/'([^']*)'/g)].map((m) => m[1]!)
        return [rowDesc([{ name: 'name', oid: 25 }, { name: 'present', oid: 25 }, { name: 'tables', oid: 25 }]),
          ...names.map((n) => dataRow([n, 'f', '0'])), ready()]
      }
      return [ready()]
    },
  })
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const ac = new AbortController() // the shared-controller case: one abort must not kill a connection a later start() owns
    await expect(repl.start({ slot: 'repl_1_ok', publications: ['gone'], signal: ac.signal }).next()).rejects.toThrow(PublicationMissing)
    ac.abort()
    await Bun.sleep(10)
    await repl.command('select 1') // a leaked listener would have end()ed the connection, and this would throw
  } finally { repl.end() }
})

test('unannounced: an Insert for a relid with no preceding Relation message throws instead of yielding fabricated keys', async () => {
  const insertNoRel = () => xlogData(Buffer.concat([Buffer.from('I', 'latin1'), i32(999), Buffer.from('N', 'latin1'), u16(0)]))
  const backend = fakeBackend({
    onQuery: (sql) => (sql.startsWith('START_REPLICATION') ? [copyBoth(), insertNoRel()] : [ready()]),
  })
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const gen = repl.start({ slot: 'repl_1_ok', publications: ['pub'] })
    let err: unknown
    try { await gen.next() } catch (e) { err = e }
    expect(err).toBeInstanceOf(Error)
    const msg = (err as Error).message
    expect(msg).toContain('unannounced relation')
    expect(msg).toContain('999')
  } finally { repl.end() }
})

test("onWarning: a fresh stream re-warns for a table a finished stream already warned about, and the finished stream's own array stays untouched", async () => {
  // restarting START_REPLICATION on the same live-cluster connection hangs for reasons unrelated
  // to warnings (reproduced with a bare insert-only stream, no onWarning at all — see
  // test/integration/replication.test.ts's comment above the channel_binding test); this fake
  // backend has no such limitation, so it is what proves the `warned` set resets per stream: if
  // it were not cleared at the top of start(), stream B would never warn for public.t again.
  const relId = 7
  const relAnnounce = () => pgRelation(relId, 'public', 't', 'd', [{ name: 'id', oid: 23, key: true }])
  const oldRowLessUpdate = () => pgUpdateNoOld(relId, [textCell('1')])
  const backend = fakeBackend({
    onQuery(sql) {
      if (sql.startsWith('START_REPLICATION')) return [copyBoth(), relAnnounce(), oldRowLessUpdate()]
      if (sql.includes('relispartition')) {
        return [
          rowDesc([{ name: 'schemaname', oid: 25 }, { name: 'tablename', oid: 25 }, { name: 'pubname', oid: 25 }]),
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
    },
  })
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const warningsA: ReplicationWarning[] = []
    const genA = repl.start({ slot: 'repl_1_ok', publications: ['pub'], onWarning: (w) => warningsA.push(w) })
    let rA = await genA.next()
    while (!rA.done && rA.value.kind !== 'update') rA = await genA.next()
    expect(rA.done).toBe(false)
    expect(warningsA).toEqual([{ kind: 'replica-identity', schema: 'public', table: 't', replicaIdentity: 'd', message: expect.any(String) }])
    await genA.return(undefined as never)

    const warningsB: ReplicationWarning[] = []
    const genB = repl.start({ slot: 'repl_1_ok', publications: ['pub'], onWarning: (w) => warningsB.push(w) })
    let rB = await genB.next()
    while (!rB.done && rB.value.kind !== 'update') rB = await genB.next()
    expect(rB.done).toBe(false)

    // a fresh stream on the same table warns again — proves `warned` is cleared at the top of
    // start(); if it were not, this array would stay empty
    expect(warningsB).toEqual([{ kind: 'replica-identity', schema: 'public', table: 't', replicaIdentity: 'd', message: expect.any(String) }])
    // stream A's own array is untouched by stream B's warning
    expect(warningsA.length).toBe(1)
  } finally { repl.end() }
})

test('ReplicationBusy: a second start() advanced concurrently with the first rejects before any probe, and the first stream is undisturbed', async () => {
  // a custom onQuery replaces the default entirely, so it carries both branches the probes need
  const onQuery = (sql: string): Buffer[] => {
    if (sql.startsWith('START_REPLICATION')) return [copyBoth(), pgBegin()]
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
  const backend = fakeBackend({ onQuery })
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const genA = repl.start({ slot: 'repl_1_ok', publications: ['pub'] })
    const genB = repl.start({ slot: 'repl_1_ok', publications: ['pub'] })
    const [ra, rb] = await Promise.allSettled([genA.next(), genB.next()])

    expect(ra.status).toBe('fulfilled')
    if (ra.status === 'fulfilled') expect(ra.value.done ? undefined : ra.value.value.kind).toBe('begin')
    expect(rb.status).toBe('rejected')
    if (rb.status === 'rejected') expect(rb.reason).toBeInstanceOf(ReplicationBusy)

    expect(backend.queries.filter((q) => q.startsWith('START_REPLICATION')).length).toBe(1)

    // B's rejection must not have run stream A's finally: A's reservation is still held
    await expect(repl.command('select 1')).rejects.toThrow(ReplicationBusy)

    // stream A is undisturbed by B's rejection — it keeps delivering
    backend.dx.push(pgBegin())
    const ra2 = await genA.next()
    expect(ra2.done ? undefined : ra2.value.kind).toBe('begin')
  } finally { repl.end() }
})

test('start(): a start() that fails before CopyBothResponse releases the reservation (pins a risk this redesign introduces — the reservation is now taken up front, so every throw path out of start() must still release it; this test is green both before and after the change)', async () => {
  let pubProbeCalls = 0
  const onQuery = (sql: string): Buffer[] => {
    if (sql.startsWith('START_REPLICATION')) return [copyBoth(), pgBegin()]
    if (sql.includes('pg_publication')) {
      pubProbeCalls++
      const present = pubProbeCalls === 1 ? 'f' : 't' // first probe: publication missing; later ones: present
      const names = [...sql.matchAll(/'([^']*)'/g)].map((m) => m[1]!)
      return [
        rowDesc([{ name: 'name', oid: 25 }, { name: 'present', oid: 25 }, { name: 'tables', oid: 25 }]),
        ...names.map((n) => dataRow([n, present, present === 't' ? '1' : '0'])),
        ready(),
      ]
    }
    return [ready()]
  }
  const backend = fakeBackend({ onQuery })
  const repl = await replication(cfg({ socket: backend.socket }))
  try {
    const gen1 = repl.start({ slot: 'repl_1_ok', publications: ['pub'] })
    await expect(gen1.next()).rejects.toThrow(PublicationMissing)

    await repl.command('select 1') // a leaked reservation would reject this with ReplicationBusy

    const gen2 = repl.start({ slot: 'repl_1_ok', publications: ['pub'] })
    const r2 = await gen2.next()
    expect(r2.done ? undefined : r2.value.kind).toBe('begin')
  } finally { repl.end() }
})

test('onWarning: a throwing callback is reported to stderr and the stream keeps delivering', async () => {
  // onWarning is diagnostic, so its own failure must not take down the stream it reports on. Both
  // halves matter: drop the try/catch in deliverWarning and the update never arrives; catch without
  // reporting and the consumer's bug vanishes silently, which is what propagating used to prevent.
  const relId = 9
  const backend = fakeBackend({
    onQuery(sql) {
      if (sql.startsWith('START_REPLICATION')) {
        return [copyBoth(), pgRelation(relId, 'public', 't', 'd', [{ name: 'id', oid: 23, key: true }]), pgUpdateNoOld(relId, [textCell('1')])]
      }
      if (sql.includes('relispartition')) {
        return [rowDesc([{ name: 'schemaname', oid: 25 }, { name: 'tablename', oid: 25 }, { name: 'pubname', oid: 25 }]), ready()]
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
    },
  })
  const repl = await replication(cfg({ socket: backend.socket }))
  const realError = console.error
  const logged: unknown[][] = []
  console.error = (...args: unknown[]) => { logged.push(args) }
  try {
    const boom = new Error('consumer onWarning blew up')
    const gen = repl.start({ slot: 'repl_1_ok', publications: ['pub'], onWarning: () => { throw boom } })
    let r = await gen.next()
    while (!r.done && r.value.kind !== 'update') r = await gen.next()

    // the throw did not fail next(): the event that triggered the warning still arrives
    expect(r.done).toBe(false)
    expect(r.value.kind).toBe('update')

    // and it was not swallowed — the callback's own error reached stderr
    expect(logged.length).toBe(1)
    expect(logged[0]![0]).toContain('onWarning callback threw')
    expect(logged[0]![1]).toBe(boom)

    await gen.return(undefined as never)
  } finally { console.error = realError; repl.end() }
})
