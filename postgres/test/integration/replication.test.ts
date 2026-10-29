// replication(): logical replication over the real auth/transport stack (TCP + SCRAM here).
// Requires the local cluster with wal_level=logical (test/setup-pg.sh cluster, reconfigured).
import { test, expect, describe } from 'bun:test'
import { replication, connect, defineType, Jsonb, Collect, Transform, ReplicationStreamEnded, ReplicationBusy, ReplicationReceiveTimeout, PublicationMissing, PublicationEmpty, PgError, batchTransactions, lsnFromString, type ReplicationEvent, type ReplicationWarning, type TableShape, type TransactionBatch } from '../../src/index.ts'
import { replicate } from '../../src/cdc.ts'
import { TEST_CONFIG, withConn, testPool, TEST_TIMEOUT } from '../helpers/db.ts'

const K = `repl_${process.pid}`

async function collectUntil(gen: AsyncGenerator<ReplicationEvent>, done: (events: ReplicationEvent[]) => boolean): Promise<ReplicationEvent[]> {
  const events: ReplicationEvent[] = []
  for await (const e of gen) { events.push(e); if (done(events)) break }
  return events
}

describe('replication()', () => {
  test('connects (SCRAM over TCP) and IDENTIFY_SYSTEM works', async () => {
    const repl = await replication(TEST_CONFIG)
    try {
      const sys = await repl.identify()
      expect(sys.timeline).toBeGreaterThan(0)
      expect(sys.xlogpos).toMatch(/^[0-9A-F]+\/[0-9A-F]+$/)
      expect(sys.dbname).toBe('testdb')
    } finally { repl.end() }
  }, TEST_TIMEOUT)

  test('streams decoded insert/update/delete/message events; temp slot; catalog decoding', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_t(id int4 primary key, name text, ok bool, data jsonb)`)
      await c.query(`create publication ${K}_pub for table ${K}_t`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_slot`, { temporary: true })
          await c.query(`insert into ${K}_t values (1, 'alice', true, '{"a":1}')`)
          await c.query(`update ${K}_t set name = 'bob' where id = 1`)
          await c.query(`delete from ${K}_t where id = 1`)
          await c.query(`select pg_logical_emit_message(true, '${K}', 'marker')`)

          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_pub`] }),
            (es) => es.some((e) => e.kind === 'message'),
          )
          const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
          expect(ins.table).toBe(`${K}_t`)
          expect(ins.new).toEqual({ id: 1, name: 'alice', ok: true, data: { a: 1 } }) // int4->number, bool->boolean, jsonb->object
          const upd = events.find((e) => e.kind === 'update') as Extract<ReplicationEvent, { kind: 'update' }>
          expect(upd.new.name).toBe('bob')
          expect(upd.old).toBeNull() // REPLICA IDENTITY DEFAULT
          const del = events.find((e) => e.kind === 'delete') as Extract<ReplicationEvent, { kind: 'delete' }>
          expect(del.old.id).toBe(1)
          expect(del.oldKind).toBe('key')
          const msg = events.find((e) => e.kind === 'message') as Extract<ReplicationEvent, { kind: 'message' }>
          expect(msg.prefix).toBe(K)
          expect(msg.content.toString()).toBe('marker')
          expect(events.some((e) => e.kind === 'relation')).toBe(true)
        } finally { repl.end() } // temporary slot drops with the connection
      } finally {
        await c.query(`drop publication ${K}_pub`)
        await c.query(`drop table ${K}_t`)
      }
    })
  }, TEST_TIMEOUT)

  test('gapless backfill: exported snapshot excludes post-slot rows; stream delivers them', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_g(id int4 primary key)`)
      await c.query(`create publication ${K}_gpub for table ${K}_g`)
      await c.query(`insert into ${K}_g select generate_series(1, 3)`)
      const repl = await replication(TEST_CONFIG)
      try {
        const slot = await repl.createSlot(`${K}_gslot`, { temporary: true, snapshot: 'export' })
        await c.query(`insert into ${K}_g values (4)`) // after the slot: stream-only
        const seen = await withConn(async (c2) =>
          c2.begin({ isolation: 'repeatable read' }, async (tx) => {
            await tx.query(`set transaction snapshot '${slot.snapshot}'`)
            return tx.query(`select count(*)::int4 from ${K}_g`)
          }))
        expect((seen.rows[0] as unknown[])[0]).toBe(3) // row 4 invisible to the snapshot
        const events = await collectUntil(
          repl.start({ slot: slot.slot, publications: [`${K}_gpub`], from: slot.consistentPoint }),
          (es) => es.some((e) => e.kind === 'commit'),
        )
        const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
        expect(ins.new.id).toBe(4) // …and arrives as the FIRST streamed tx
      } finally {
        repl.end()
        await c.query(`drop publication ${K}_gpub`)
        await c.query(`drop table ${K}_g`)
      }
    })
  }, TEST_TIMEOUT)

  test('cursor + snapshot: eager open() pins per-table backfills, CONCURRENT with streaming', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_b1(id int4 primary key, v text)`)
      await c.query(`create table ${K}_b2(id int4 primary key)`)
      await c.query(`create publication ${K}_bpub for table ${K}_b1, ${K}_b2`)
      await c.query(`insert into ${K}_b1 select g, 'v' || g from generate_series(1, 2500) g`)
      await c.query(`insert into ${K}_b2 select generate_series(1, 7)`)
      const pool = testPool({ max: 2 })
      const repl = await replication(TEST_CONFIG)
      try {
        const slot = await repl.createSlot(`${K}_bslot`, { temporary: true, snapshot: 'export' })
        // pin BOTH tables' cursors eagerly (while the slot tx is open)…
        const bf1 = pool.cursor({ sql: `select * from ${K}_b1`, snapshot: slot.snapshot!, fullScan: true, fetchSize: 1000 })
        const bf2 = pool.cursor({ sql: `select * from ${K}_b2`, snapshot: slot.snapshot!, fullScan: true })
        await Promise.all([bf1.open(), bf2.open()])
        // …then a post-slot write, and START STREAMING while the cursors are still undrained
        await c.query(`insert into ${K}_b1 values (9001, 'streamed')`)
        const streamP = collectUntil(
          repl.start({ slot: slot.slot, publications: [`${K}_bpub`] }),
          (es) => es.some((e) => e.kind === 'commit'),
        )
        const drain = async (cur: { batches(): AsyncGenerator<Record<string, unknown>[]> }): Promise<Record<string, unknown>[]> => {
          const all: Record<string, unknown>[] = []
          for await (const batch of cur.batches()) all.push(...batch)
          return all
        }
        const [rows1, rows2, events] = await Promise.all([drain(bf1), drain(bf2), streamP])
        expect(rows1.length).toBe(2500)                       // batched (3 fetches of 1000)
        expect(rows1.some((r) => r.id === 9001)).toBe(false)  // post-slot row NOT in the snapshot
        expect(rows1[0]).toEqual({ id: 1, v: 'v1' })          // decoded like normal queries
        expect(rows2.length).toBe(7)
        const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
        expect(ins.new.id).toBe(9001)                          // …and arrives via the stream instead
      } finally {
        repl.end()
        await pool.end()
        await c.query(`drop publication ${K}_bpub`)
        await c.query(`drop table ${K}_b1, ${K}_b2`)
      }
    })
  }, TEST_TIMEOUT)

  test('ack advances confirmed_flush on a durable slot; dropSlot cleans up', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_a(id int4 primary key)`)
      await c.query(`create publication ${K}_apub for table ${K}_a`)
      const repl = await replication(TEST_CONFIG)
      try {
        const slot = await repl.createSlot(`${K}_aslot`) // durable
        await c.query(`insert into ${K}_a values (1)`)
        const events = await collectUntil(
          repl.start({ slot: slot.slot, publications: [`${K}_apub`] }),
          (es) => es.some((e) => e.kind === 'commit'),
        )
        const commit = events.find((e) => e.kind === 'commit') as Extract<ReplicationEvent, { kind: 'commit' }>
        repl.ack(commit.endLsn)
        await Bun.sleep(300)
        const cf = await c.query(`select confirmed_flush_lsn::text from pg_replication_slots where slot_name = '${K}_aslot'`)
        expect((cf.rows[0] as unknown[])[0]).toBe(commit.endLsn)
      } finally {
        repl.end()
        // drop via a FRESH replication connection (the streaming one is stuck in CopyBoth)
        const r2 = await replication(TEST_CONFIG)
        try { await r2.dropSlot(`${K}_aslot`) } finally { r2.end() }
        await c.query(`drop publication ${K}_apub`)
        await c.query(`drop table ${K}_a`)
      }
    })
  }, TEST_TIMEOUT)

  test('tuple decode matches query() defaults: int8 -> BigInt, timestamptz -> Date, numeric -> exact string', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_d(id int8 primary key, at timestamptz, price numeric, tags int4[])`)
      await c.query(`create publication ${K}_dpub for table ${K}_d`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_dslot`, { temporary: true })
          await c.query(`insert into ${K}_d values (9007199254740993, '2026-01-02T03:04:05.678Z', 10.50, array[1,2,3])`)
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_dpub`], binary: false }), // pin TEXT: this test is about text-mode defaults
            (es) => es.some((e) => e.kind === 'commit'))
          const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
          expect(ins.new.id).toBe(9007199254740993n)                     // BigInt, exact (was a string before)
          expect(ins.new.at).toBeInstanceOf(Date)
          expect((ins.new.at as Date).getTime()).toBe(Date.UTC(2026, 0, 2, 3, 4, 5, 678))
          expect(ins.new.price).toBe('10.50')                            // exact string, like query()
          expect(ins.new.tags).toEqual([1, 2, 3])                        // text mode parses '{1,2,3}', like a plain query (and like the binary path)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_dpub`)
        await c.query(`drop table ${K}_d`)
      }
    })
  }, TEST_TIMEOUT)

  test("binary 'auto' (default): engages when every column is binary-decodable, stays text otherwise", async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_a1(id int8 primary key, price numeric, name text, ns int4[])`) // all decodable (arrays included)
      await c.query(`create table ${K}_a2(id int8 primary key, dur interval)`)                        // interval: no binary decoder
      await c.query(`create publication ${K}_a1pub for table ${K}_a1`)
      await c.query(`create publication ${K}_a2pub for table ${K}_a2`)
      try {
        for (const [pub, tbl, expectBinary] of [[`${K}_a1pub`, `${K}_a1`, true], [`${K}_a2pub`, `${K}_a2`, false]] as const) {
          const repl = await replication(TEST_CONFIG)
          try {
            const slot = await repl.createSlot(`${tbl}_slot`, { temporary: true })
            await c.query(tbl.endsWith('a1') ? `insert into ${tbl} values (1, 10.50, 'x', array[1,2])` : `insert into ${tbl} values (1, interval '1 day')`)
            const events = await collectUntil(
              repl.start({ slot: slot.slot, publications: [pub] }), // binary unset -> 'auto'
              (es) => es.some((e) => e.kind === 'commit'))
            expect(repl.binaryTuples).toBe(expectBinary)
            const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
            expect(ins.new.id).toBe(1n)
            if (expectBinary) { expect(ins.new.price).toBe('10.50'); expect(ins.new.ns).toEqual([1, 2]) } // binary: real JS array
            else expect(ins.new.dur).toBe('1 day') // undecodable column -> whole stream text, interval as PG text
          } finally { repl.end() }
        }
      } finally {
        await c.query(`drop publication ${K}_a1pub`); await c.query(`drop publication ${K}_a2pub`)
        await c.query(`drop table ${K}_a1, ${K}_a2`)
      }
    })
  }, TEST_TIMEOUT)

  test("binary 'auto' + shapes: a text-only shape target keeps the stream on text (negotiation matches decode)", async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_a3(id int8 primary key, at timestamptz)`) // every column binary-decodable by default
      await c.query(`create publication ${K}_a3pub for table ${K}_a3`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_a3slot`, { temporary: true })
          await c.query(`insert into ${K}_a3 values (1, '2024-01-02T03:04:05Z')`)
          const events = await collectUntil(
            repl.start({
              slot: slot.slot, publications: [`${K}_a3pub`],
              shapes: [{ table: `${K}_a3`, shape: { at: 'timestamptz:string' } }], // binary can't produce PG's text
            }),
            (es) => es.some((e) => e.kind === 'commit'))
          expect(repl.binaryTuples).toBe(false) // the shaped target flipped auto to text — no decode-time crash possible
          const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
          expect(ins.new.at).toMatch(/^2024-01-02 /) // decoded as the declared exact PG text
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_a3pub`)
        await c.query(`drop table ${K}_a3`)
      }
    })
  }, TEST_TIMEOUT)

  test('binary tuples: start({ binary: true }) — fixed-width decode, exact numeric, JS arrays', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_b(id int8 primary key, price numeric, u uuid, name text, ok bool, at timestamptz, ns int4[], meta jsonb, raw bytea)`)
      await c.query(`create publication ${K}_bpub for table ${K}_b`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_bslot`, { temporary: true })
          await c.query(
            `insert into ${K}_b values (9007199254740993, 10.50, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'café 😀', true, '2026-01-02T03:04:05.678Z', array[1,null,3], '{"a":1}', '\\xdeadbeef')`)
          await c.query(`insert into ${K}_b values (2, -0.00012, null, null, false, null, array[]::int4[], null, null)`)
          await c.query(`insert into ${K}_b values (3, 'NaN', null, null, false, null, null, null, null)`)
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_bpub`], binary: true }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 3)
          const ins = events.filter((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>[]
          expect(ins[0]!.new.id).toBe(9007199254740993n)
          expect(ins[0]!.new.price).toBe('10.50')                        // binary numeric -> exact text render
          expect(ins[0]!.new.u).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
          expect(ins[0]!.new.name).toBe('café 😀')
          expect(ins[0]!.new.ok).toBe(true)
          expect((ins[0]!.new.at as Date).getTime()).toBe(Date.UTC(2026, 0, 2, 3, 4, 5, 678))
          expect(ins[0]!.new.ns).toEqual([1, null, 3])                   // binary mode: REAL JS array
          expect(ins[0]!.new.meta).toEqual({ a: 1 })
          expect(ins[0]!.new.raw).toEqual(Buffer.from('deadbeef', 'hex'))
          expect(ins[1]!.new.price).toBe('-0.00012')                     // small-fraction numeric (weight < 0)
          expect(ins[1]!.new.ns).toEqual([])
          expect(ins[2]!.new.price).toBe('NaN')
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_bpub`)
        await c.query(`drop table ${K}_b`)
      }
    })
  }, TEST_TIMEOUT)

  test('start({ shapes }): declared columns decode like a query() shape; undeclared keep defaults', async () => {
    const doubler = defineType(`${K}_doubler`, { ascii: true, targets: { x2: (s) => Number(s) * 2 } })
    await withConn(async (c) => {
      await c.query(`create table ${K}_s(id int4 primary key, big int8, n numeric, at timestamptz, tags int8[], meta jsonb, label text, loc point, dbl int4)`)
      await c.query(`create publication ${K}_spub for table ${K}_s`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_sslot`, { temporary: true })
          await c.query(
            `insert into ${K}_s values (7, 42, '1267650600228229401496703205376', '2024-01-02T03:04:05Z', array[1,2], '{"when":"2024-01-02T03:04:05"}', 'hi', '(1.5,2.5)', 21)`)
          await c.query(`update ${K}_s set label = 'yo' where id = 7`)
          const events = await collectUntil(
            repl.start({
              slot: slot.slot, publications: [`${K}_spub`],
              shapes: [{
                table: `${K}_s`,
                shape: {
                  big: 'int8:number',
                  n: 'numeric:bigint',
                  at: 'timestamptz:ms',
                  tags: 'int8[]:number',
                  meta: Jsonb({ when: 'timestamp:ms' }),
                  label: Transform('text', (s) => (s as string).toUpperCase()),
                  loc: 'point:xy',
                  dbl: doubler('x2'),
                },
              }],
            }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 2)
          const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
          expect(ins.new.id).toBe(7)                                            // undeclared -> default int4
          expect(ins.new.big).toBe(42)                                          // :number -> a JS number, not the default 42n
          expect(ins.new.n).toBe(1267650600228229401496703205376n)              // numeric:bigint = 2^100 exact
          expect(ins.new.at).toBe(Date.UTC(2024, 0, 2, 3, 4, 5))                // :ms epoch number
          expect(ins.new.tags).toEqual([1, 2])                                  // int8[]:number -> JS numbers (default: raw '{1,2}')
          expect(ins.new.meta).toEqual({ when: Date.UTC(2024, 0, 2, 3, 4, 5) }) // Jsonb() field target
          expect(ins.new.label).toBe('HI')                                      // Transform()
          expect(ins.new.loc).toEqual({ x: 1.5, y: 2.5 })                       // point:xy
          expect(ins.new.dbl).toBe(42)                                          // defineType() marker (name-driven, real oid irrelevant)
          const upd = events.find((e) => e.kind === 'update') as Extract<ReplicationEvent, { kind: 'update' }>
          expect(upd.new.label).toBe('YO')                                      // shapes apply to every tuple of the table
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_spub`)
        await c.query(`drop table ${K}_s`)
      }
    })
  }, TEST_TIMEOUT)

  test('start({ shapes }): never silent — bad column, Collect(), duplicates all throw', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_e(id int4 primary key, name text)`)
      await c.query(`create publication ${K}_epub for table ${K}_e`)
      try {
        // Collect() and duplicate entries fail on the first pull, before any streaming
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_eslot`, { temporary: true })
          await expect(
            repl.start({ slot: slot.slot, publications: [`${K}_epub`], shapes: [{ table: `${K}_e`, shape: { g: Collect({ id: 'int4' }) as never } }] }).next(),
          ).rejects.toThrow(/Collect\(\) groups/)
          await expect(
            repl.start({ slot: slot.slot, publications: [`${K}_epub`], shapes: [{ table: `${K}_e`, shape: {} }, { table: `${K}_e`, shape: {} }] }).next(),
          ).rejects.toThrow(/duplicate replication shape/)
          // a declared column the live relation doesn't have throws when the relation is announced
          await c.query(`insert into ${K}_e values (1, 'x')`)
          await expect(
            collectUntil(
              repl.start({ slot: slot.slot, publications: [`${K}_epub`], shapes: [{ table: `${K}_e`, shape: { nope: 'text' } }] }),
              (es) => es.some((e) => e.kind === 'commit')),
          ).rejects.toThrow(/declares column "nope" but the relation has: id, name/)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_epub`)
        await c.query(`drop table ${K}_e`)
      }
    })
  }, TEST_TIMEOUT)

  test("ack() is forgiving: a commit's lsn counts as its endLsn", async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_f(id int4 primary key)`)
      await c.query(`create publication ${K}_fpub for table ${K}_f`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_fslot`, { temporary: true })
          await c.query(`insert into ${K}_f values (1)`)
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_fpub`] }),
            (es) => es.some((e) => e.kind === 'commit'))
          const commit = events.find((e) => e.kind === 'commit') as Extract<ReplicationEvent, { kind: 'commit' }>
          repl.ack(commit.lsn) // the natural-looking WRONG field
          expect(repl.flushedLsn).toBe(commit.endLsn) // normalized — the idle-keepalive gate opens anyway
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_fpub`)
        await c.query(`drop table ${K}_f`)
      }
    })
  }, TEST_TIMEOUT)

  test('server CopyDone surfaces as a ReplicationStreamEnded THROW, never a silent clean end', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_cd(id int4 primary key)`)
      await c.query(`create publication ${K}_cdpub for table ${K}_cd`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_cdslot`, { temporary: true })
          await c.query(`insert into ${K}_cd values (1)`)
          const gen = repl.start({ slot: slot.slot, publications: [`${K}_cdpub`] })
          for (;;) { const r = await gen.next(); if (r.done || (r.value as ReplicationEvent).kind === 'commit') break } // stream live
          // inject a server CopyDone (+ the ReadyForQuery that ends the handshake), as onData would
          const priv = repl as unknown as { q: { type: string; body: Buffer }[]; wake: (() => void) | null }
          priv.q.push({ type: 'c', body: Buffer.alloc(0) }, { type: 'Z', body: Buffer.from('I') })
          const w = priv.wake; priv.wake = null; w?.()
          const err = await gen.next().then(() => null, (e: unknown) => e)
          expect(err).toBeInstanceOf(ReplicationStreamEnded)
          expect((err as ReplicationStreamEnded).reason).toBe('copy-done')
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_cdpub`)
        await c.query(`drop table ${K}_cd`)
      }
    })
  }, TEST_TIMEOUT)

  test('command(): a real CopyDone exchange leaves the connection usable after an abandoned stream', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_xc(id int4 primary key)`)
      await c.query(`create publication ${K}_xcpub for table ${K}_xc`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_xcslot`, { temporary: true })
          await c.query(`insert into ${K}_xc values (1)`)
          const gen = repl.start({ slot: slot.slot, publications: [`${K}_xcpub`] })
          // Abandon mid-stream. The generator's finally clears `streaming`, but copy mode stays
          // open on the server — the client-side CopyDone is deferred to the next command.
          for (;;) { const r = await gen.next(); if (r.done || (r.value as ReplicationEvent).kind === 'insert') break }
          await gen.return(undefined as never)

          // Each of these drives a REAL CopyDone/ReadyForQuery exchange with the walsender, not an
          // injected one. Without it the plain 'Q' below lands mid-copy and the server hangs up.
          const id = await repl.identify()
          expect(id.timeline).toBeGreaterThan(0)
          expect(id.dbname).toBe(TEST_CONFIG.database ?? 'testdb')

          // Second command: copy mode is already closed, so this must not send another CopyDone.
          const rows = await repl.command('IDENTIFY_SYSTEM')
          expect(rows.rows.length).toBe(1)

          // The connection is fully usable — a new stream can still start on it.
          const slot2 = await repl.createSlot(`${K}_xcslot2`, { temporary: true })
          expect(slot2.slot).toBe(`${K}_xcslot2`)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_xcpub`)
        await c.query(`drop table ${K}_xc`)
      }
    })
  }, TEST_TIMEOUT)

  test('end() and AbortSignal deterministically finish a parked start() iterator', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_e2(id int4 primary key)`)
      await c.query(`create publication ${K}_e2pub for table ${K}_e2`)
      const finishes = (p: Promise<IteratorResult<ReplicationEvent>>, what: string) =>
        Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what} did not finish the iterator`)), 2000))])
      try {
        // end(): the parked next() finishes NOW, not when the (here: 60s) status timer would fire
        const r1 = await replication(TEST_CONFIG)
        try {
          const s1 = await r1.createSlot(`${K}_e2slot1`, { temporary: true })
          const gen = r1.start({ slot: s1.slot, publications: [`${K}_e2pub`], statusIntervalMs: 60_000 })
          const pending = gen.next() // no traffic -> parks awaiting messages
          await new Promise((r) => setTimeout(r, 100))
          r1.end()
          expect((await finishes(pending, 'end()')).done).toBe(true)
        } finally { r1.end() }

        // AbortSignal: same clean finish + connection close
        const r2 = await replication(TEST_CONFIG)
        try {
          const s2 = await r2.createSlot(`${K}_e2slot2`, { temporary: true })
          const ac = new AbortController()
          const gen2 = r2.start({ slot: s2.slot, publications: [`${K}_e2pub`], statusIntervalMs: 60_000, signal: ac.signal })
          const pending2 = gen2.next()
          await new Promise((r) => setTimeout(r, 100))
          ac.abort()
          expect((await finishes(pending2, 'abort')).done).toBe(true)
        } finally { r2.end() }
      } finally {
        await c.query(`drop publication ${K}_e2pub`)
        await c.query(`drop table ${K}_e2`)
      }
    })
  }, TEST_TIMEOUT)

  test('start({ shapes }): shape keys are OUTPUT keys — columns maps them to SQL names, like a query() shape', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_k(id int4 primary key, big_int_col int8)`)
      await c.query(`create publication ${K}_kpub for table ${K}_k`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_kslot`, { temporary: true })
          await c.query(`insert into ${K}_k values (1, 42)`)
          await c.query(`update ${K}_k set big_int_col = 43 where id = 1`)
          const events = await collectUntil(
            repl.start({
              slot: slot.slot, publications: [`${K}_kpub`],
              shapes: [{ table: `${K}_k`, columns: { bigIntCol: 'big_int_col' }, shape: { id: 'int4', bigIntCol: 'int8:number' } }],
            }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 2)
          const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
          expect(ins.new).toEqual({ id: 1, bigIntCol: 42 }) // the query()-shape row, not { big_int_col }
          const upd = events.find((e) => e.kind === 'update') as Extract<ReplicationEvent, { kind: 'update' }>
          expect(upd.new).toEqual({ id: 1, bigIntCol: 43 })
        } finally { repl.end() }

        // a columns entry whose key isn't in the shape is a typo: fails on the first pull
        const r2 = await replication(TEST_CONFIG)
        try {
          const s2 = await r2.createSlot(`${K}_kslot2`, { temporary: true })
          await expect(
            r2.start({ slot: s2.slot, publications: [`${K}_kpub`], shapes: [{ table: `${K}_k`, columns: { nope: 'id' }, shape: { id: 'int4' } }] }).next(),
          ).rejects.toThrow(/columns maps "nope" but the shape has no such key/)
          // a mapped column missing from the live relation names BOTH the key and the SQL name
          await c.query(`update ${K}_k set big_int_col = 44 where id = 1`)
          await expect(
            collectUntil(
              r2.start({ slot: s2.slot, publications: [`${K}_kpub`], shapes: [{ table: `${K}_k`, columns: { bigIntCol: 'wrong_col' }, shape: { bigIntCol: 'int8' } }] }),
              (es) => es.some((e) => e.kind === 'commit')),
          ).rejects.toThrow(/declares column "bigIntCol" \(-> "wrong_col"\) but the relation has: id, big_int_col/)
        } finally { r2.end() }

        // output-key collision / two keys on one column: loud at relation arrival (fresh conn each — the throw poisons the stream)
        const bad: Array<[TableShape, RegExp]> = [
          [{ table: `${K}_k`, columns: { big_int_col: 'id' }, shape: { big_int_col: 'int4' } }, /output key "big_int_col" collides/],
          [{ table: `${K}_k`, columns: { a: 'id', b: 'id' }, shape: { a: 'int4', b: 'int4:string' } }, /"a" and "b" both map to column "id"/],
        ]
        for (let i = 0; i < bad.length; i++) {
          const r = await replication(TEST_CONFIG)
          try {
            const s = await r.createSlot(`${K}_kslot_e${i}`, { temporary: true })
            await c.query(`update ${K}_k set big_int_col = big_int_col + 1 where id = 1`)
            await expect(
              collectUntil(
                r.start({ slot: s.slot, publications: [`${K}_kpub`], shapes: [bad[i]![0]] }),
                (es) => es.some((e) => e.kind === 'commit')),
            ).rejects.toThrow(bad[i]![1])
          } finally { r.end() }
        }
      } finally {
        await c.query(`drop publication ${K}_kpub`)
        await c.query(`drop table ${K}_k`)
      }
    })
  }, TEST_TIMEOUT)

  test('start({ shapes, binary: true }): declared targets decode from binary tuples; unhonorable targets error loudly', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_sb(id int8 primary key, n numeric, at timestamptz, ns int8[], meta jsonb)`)
      await c.query(`create publication ${K}_sbpub for table ${K}_sb`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_sbslot`, { temporary: true })
          await c.query(`insert into ${K}_sb values (1, '1267650600228229401496703205376', '2024-01-02T03:04:05Z', array[1,2], '{"when":"2024-01-02T03:04:05"}')`)
          const events = await collectUntil(
            repl.start({
              slot: slot.slot, publications: [`${K}_sbpub`], binary: true,
              shapes: [{ table: `${K}_sb`, shape: { id: 'int8:number', n: 'numeric:bigint', at: 'timestamptz:ms', ns: 'int8[]:number', meta: Jsonb({ when: 'timestamp:ms' }) } }],
            }),
            (es) => es.some((e) => e.kind === 'commit'))
          expect(repl.binaryTuples).toBe(true)
          const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
          expect(ins.new.id).toBe(1)
          expect(ins.new.n).toBe(1267650600228229401496703205376n)              // BigInt(exact binary numeric render)
          expect(ins.new.at).toBe(Date.UTC(2024, 0, 2, 3, 4, 5))
          expect(ins.new.ns).toEqual([1, 2])                                    // array_recv with :number elements
          expect(ins.new.meta).toEqual({ when: Date.UTC(2024, 0, 2, 3, 4, 5) }) // binary json payload = the json text
        } finally { repl.end() }

        // 'timestamptz:string' promises PG's exact text — binary bytes can't honor it: loud error on arrival
        const repl2 = await replication(TEST_CONFIG)
        try {
          const slot = await repl2.createSlot(`${K}_sbslot2`, { temporary: true })
          await c.query(`update ${K}_sb set n = 2 where id = 1`)
          await expect(
            collectUntil(
              repl2.start({ slot: slot.slot, publications: [`${K}_sbpub`], binary: true, shapes: [{ table: `${K}_sb`, shape: { at: 'timestamptz:string' } }] }),
              (es) => es.some((e) => e.kind === 'commit')),
          ).rejects.toThrow(/no binary decoder/)
        } finally { repl2.end() }
      } finally {
        await c.query(`drop publication ${K}_sbpub`)
        await c.query(`drop table ${K}_sb`)
      }
    })
  }, TEST_TIMEOUT)

  test('start(): a healthy idle stream with server keepalives does NOT trip a 5s receive timeout (idle)', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_idle(id int4 primary key)`)
      await c.query(`create publication ${K}_idlepub for table ${K}_idle`)
      try {
        const repl = await replication({ ...TEST_CONFIG, options: '-c wal_sender_timeout=2000' })
        try {
          const slot = await repl.createSlot(`${K}_idleslot`, { temporary: true })
          const ac = new AbortController()
          setTimeout(() => ac.abort(), 6500)
          // PG 14 does not skip empty transactions, so a concurrent transaction anywhere in the
          // database puts a begin/commit pair on this slot — count timeouts, not events.
          let timedOut = false
          try {
            await collectUntil(
              repl.start({ slot: slot.slot, publications: [`${K}_idlepub`], statusIntervalMs: 30_000, receiveTimeoutMs: 5000, signal: ac.signal }),
              () => false,
            )
          } catch (e) {
            if (e instanceof ReplicationReceiveTimeout) timedOut = true
            else throw e
          }
          expect(timedOut).toBe(false)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_idlepub`)
        await c.query(`drop table ${K}_idle`)
      }
    })
  }, 10_000)

  test('command(): rejects with ReplicationBusy mid-stream; the stream keeps delivering afterward', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_cmd(id int4 primary key)`)
      await c.query(`create publication ${K}_cmdpub for table ${K}_cmd`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_cmdslot`, { temporary: true })
          const gen = repl.start({ slot: slot.slot, publications: [`${K}_cmdpub`] })
          await c.query(`insert into ${K}_cmd values (1)`)
          let r = await gen.next()
          while (!r.done && r.value.kind !== 'commit') r = await gen.next()
          expect(r.done).toBe(false) // suspended at the yield — the generator body is paused mid-stream

          await expect(repl.command('select 1')).rejects.toThrow(ReplicationBusy)

          await c.query(`insert into ${K}_cmd values (2)`)
          r = await gen.next()
          while (!r.done && r.value.kind !== 'commit') r = await gen.next()
          expect(r.done).toBe(false) // the second insert's commit still arrives — the rejected command() didn't kill the stream

          await gen.return(undefined)
          await repl.command('select 1') // resolves once more — the flag cleared when the consumer stopped
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_cmdpub`)
        await c.query(`drop table ${K}_cmd`)
      }
    })
  }, TEST_TIMEOUT)

  test('command(): a failed start() setup clears the streaming flag — identify() works after', async () => {
    await withConn(async (c) => {
      // an existing (empty) publication so the probe passes through to the bad-slot rejection this test is about
      await c.query(`create publication ${K}_nosuchpub`)
      try {
        const repl2 = await replication(TEST_CONFIG)
        try {
          const gen = repl2.start({ slot: 'no_such_slot_02x', publications: [`${K}_nosuchpub`] })
          await expect(gen.next()).rejects.toThrow(PgError)
          const sys = await repl2.identify()
          expect(sys.timeline).toBeGreaterThan(0)
        } finally { repl2.end() }
      } finally {
        await c.query(`drop publication ${K}_nosuchpub`)
      }
    })
  }, TEST_TIMEOUT)

  test('publication: a missing publication rejects with PublicationMissing before START_REPLICATION', async () => {
    const repl = await replication(TEST_CONFIG)
    try {
      const slot = await repl.createSlot(`${K}_pmslot`, { temporary: true })
      const gen = repl.start({ slot: slot.slot, publications: [`${K}_pmissing`] })
      let err: unknown
      try { await gen.next() } catch (e) { err = e }
      expect(err).toBeInstanceOf(PublicationMissing)
      expect((err as PublicationMissing).reason).toBe('publication-missing')
      expect((err as PublicationMissing).message).toContain(`${K}_pmissing`)
    } finally { repl.end() }
  }, TEST_TIMEOUT)

  test('publication: an empty list rejects; a tableless publication warns, streams, and picks up a table added after start()', async () => {
    await withConn(async (c) => {
      await c.query(`create publication ${K}_emptypub`) // no FOR clause -> valid, publishes zero tables
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_emptyslot`, { temporary: true })

          // an empty list can't be sent at all: pgoutput reads publication_names '' as absent, and
          // the binary capability probe would emit `pubname in ()` first
          let err: unknown
          try { await repl.start({ slot: slot.slot, publications: [] }).next() } catch (e) { err = e }
          expect(err).toBeInstanceOf(PublicationEmpty)
          expect((err as PublicationEmpty).reason).toBe('publications-empty')
          const sys = await repl.identify() // rejected before anything reached the walsender
          expect(sys.timeline).toBeGreaterThan(0)

          const warnings: ReplicationWarning[] = []
          const gen = repl.start({ slot: slot.slot, publications: [`${K}_emptypub`], onWarning: (w) => warnings.push(w) })
          const first = gen.next() // establishes the stream; nothing to deliver yet
          await Bun.sleep(50)
          expect(warnings).toEqual([{ kind: 'publication-empty', publication: `${K}_emptypub`, message: expect.any(String) }])

          // the point of warning instead of throwing: a table added afterwards reaches this stream
          await c.query(`create table ${K}_late(id int4 primary key)`)
          await c.query(`alter publication ${K}_emptypub add table ${K}_late`)
          await c.query(`insert into ${K}_late values (7)`)
          let ins = (await first).value as ReplicationEvent // the DDL transaction commits first, with no data changes
          for await (const e of gen) { ins = e; if (e.kind === 'insert') break }
          expect(ins.kind).toBe('insert')
          expect((ins as Extract<ReplicationEvent, { kind: 'insert' }>).table).toBe(`${K}_late`)
          expect((ins as Extract<ReplicationEvent, { kind: 'insert' }>).new.id).toBe(7)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_emptypub`)
        await c.query(`drop table if exists ${K}_late`)
      }

      await c.query(`create table ${K}_normal(id int4 primary key)`)
      await c.query(`create publication ${K}_normalpub for table ${K}_normal`)
      try {
        const repl2 = await replication(TEST_CONFIG)
        try {
          const slot2 = await repl2.createSlot(`${K}_normalslot`, { temporary: true })
          const warnings2: ReplicationWarning[] = []
          const ac2 = new AbortController()
          const gen2 = repl2.start({
            slot: slot2.slot, publications: [`${K}_normalpub`],
            onWarning: (w) => warnings2.push(w), onReady: () => ac2.abort(), signal: ac2.signal,
          })
          await collectUntil(gen2, () => false)
          expect(warnings2.length).toBe(0) // a publication with tables never warns
        } finally { repl2.end() }
      } finally {
        await c.query(`drop publication ${K}_normalpub`)
        await c.query(`drop table ${K}_normal`)
      }
    })
  }, TEST_TIMEOUT)

  test('publication: a name containing a single quote streams (probe and START_REPLICATION agree)', async () => {
    await withConn(async (c) => {
      const pub = `${K}_it's_pub` // legal, and it terminates the option literal unless escaped
      await c.query(`create table ${K}_q(id int4 primary key)`)
      await c.query(`create publication "${pub}" for table ${K}_q`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_qslot`, { temporary: true })
          await c.query(`insert into ${K}_q values (1)`)
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [pub] }),
            (es) => es.some((e) => e.kind === 'commit'))
          const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
          expect(ins.new.id).toBe(1)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication "${pub}"`)
        await c.query(`drop table ${K}_q`)
      }
    })
  }, TEST_TIMEOUT)

  test('publication: FOR ALL TABLES over a non-empty database never warns empty (pins pg_publication_tables expansion)', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_fat(id int4 primary key)`) // create the table BEFORE the publication
      await c.query(`create publication ${K}_fatpub for all tables`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_fatslot`, { temporary: true })
          const warnings: ReplicationWarning[] = []
          const ac = new AbortController()
          const gen = repl.start({
            slot: slot.slot, publications: [`${K}_fatpub`],
            onWarning: (w) => warnings.push(w), onReady: () => ac.abort(), signal: ac.signal,
          })
          await collectUntil(gen, () => false)
          expect(warnings.length).toBe(0) // a false read here would spuriously warn every FOR ALL TABLES publication empty
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_fatpub`)
        await c.query(`drop table ${K}_fat`)
      }
    })
  }, TEST_TIMEOUT)

  test('announce: a mid-stream DDL adding an undecodable-binary column fails at the Relation re-announce, not on first value', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_ann(id int4 primary key, n int4)`)
      await c.query(`create publication ${K}_annpub for table ${K}_ann`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_annslot`, { temporary: true })
          await c.query(`insert into ${K}_ann values (1, 10)`)
          const gen = repl.start({ slot: slot.slot, publications: [`${K}_annpub`], binary: true })
          let r = await gen.next()
          while (!r.done && r.value.kind !== 'commit') r = await gen.next()
          expect(r.done).toBe(false)
          expect(repl.binaryTuples).toBe(true)

          await c.query(`alter table ${K}_ann add column iv interval`) // interval: no binary decoder
          await c.query(`insert into ${K}_ann values (2, 20, interval '1 day')`)
          // the ALTER's own DDL transaction commits first with no data changes (begin/commit, no
          // relation/insert) — the Relation re-announce lives in the FOLLOWING transaction
          let err: unknown
          let commits = 0
          try {
            while (commits < 2 && !r.done) { r = await gen.next(); if (!r.done && r.value.kind === 'commit') commits++ }
          } catch (e) { err = e }
          expect(err).toBeInstanceOf(Error)
          const msg = (err as Error).message
          expect(msg).toMatch(/no binary decoder/)
          expect(msg).toContain(`${K}_ann.iv`)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_annpub`)
        await c.query(`drop table ${K}_ann`)
      }
    })
  }, TEST_TIMEOUT)

  test('cdc temporary slot: the naive four-line sketch backfills in the window and streams', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_cdc(id int4 primary key)`)
      await c.query(`create publication ${K}_cdcpub for table ${K}_cdc`)
      await c.query(`insert into ${K}_cdc values (1)`)
      let backfillRows: number[] = []
      const batches: TransactionBatch[] = []
      let releaseBackfillRead: (() => void) | undefined
      const backfillRead = new Promise<void>((resolve) => { releaseBackfillRead = resolve })
      let allowBackfillToReturn: (() => void) | undefined
      const insertDone = new Promise<void>((resolve) => { allowBackfillToReturn = resolve })
      let resolveStreamed: (() => void) | undefined
      const streamed = new Promise<void>((resolve) => { resolveStreamed = resolve })

      const handle = replicate({
        url: TEST_CONFIG,
        slot: 'temporary',
        publications: [`${K}_cdcpub`],
        backfill: async ({ snapshot }) => {
          await withConn(async (bc) => {
            await bc.query('begin isolation level repeatable read')
            await bc.query(`set transaction snapshot '${snapshot}'`)
            const r = await bc.query(`select id from ${K}_cdc order by id`)
            backfillRows = (r.rows as unknown[][]).map((row) => row[0] as number)
            await bc.query('commit')
          })
          releaseBackfillRead?.()
          await insertDone // still inside the backfill window: no command runs on the replication connection meanwhile
        },
        onTransaction: (batch) => {
          batches.push(batch)
          if (batch.done && batch.events.some((e) => e.kind === 'insert')) resolveStreamed?.()
        },
      })
      try {
        await backfillRead
        await c.query(`insert into ${K}_cdc values (2)`) // strictly post-slot: stream-only
        allowBackfillToReturn?.()
        await handle.ready // resolves once START_REPLICATION is accepted by the real server
        await Promise.race([
          streamed,
          Bun.sleep(10_000).then(() => { throw new Error('timed out waiting for the post-slot insert to stream') }),
        ])
        expect(backfillRows).toEqual([1])
        const ins = batches.flatMap((b) => b.events).find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }> | undefined
        expect(ins?.new.id).toBe(2)
      } finally {
        await handle.stop()
        await c.query(`drop publication ${K}_cdcpub`)
        await c.query(`drop table ${K}_cdc`)
      }
    })
  }, 15_000)

  test('cdc temporary slot with a prefix: the row in pg_replication_slots names the process', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_pfxtbl(id int4 primary key)`)
      await c.query(`create publication ${K}_pfxpub for table ${K}_pfxtbl`)
      const handle = replicate({
        url: TEST_CONFIG,
        slot: { temporary: true, prefix: `${K}_pfx` },
        publications: [`${K}_pfxpub`],
        backfill: async () => {},
        onTransaction: () => {},
      })
      try {
        await handle.ready // the slot exists by the time START_REPLICATION is accepted
        const rows = await c.query(`select slot_name, temporary from pg_replication_slots where slot_name like '${K}\\_pfx\\_%'`)
        expect(rows.rows.length).toBe(1)
        const [slotName, temporary] = rows.rows[0] as unknown[]
        expect(slotName as string).toMatch(new RegExp(`^${K}_pfx_[0-9a-f]+$`))
        expect(temporary).toBe(true)
      } finally {
        await handle.stop()
        await c.query(`drop publication ${K}_pfxpub`)
        await c.query(`drop table ${K}_pfxtbl`)
      }
    })
  }, 15_000)

  test('cdc slot health: a durable slot is created when absent and health-checked on reconnect', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_cdchealth(id int4 primary key)`)
      await c.query(`create publication ${K}_cdchealthpub for table ${K}_cdchealth`)
      const slotName = `${K}_cdchealthslot`
      try {
        let backfillCalls = 0
        let firstIsReconnect: boolean | undefined
        let resolveSlotCreated: (() => void) | undefined
        const slotCreated = new Promise<void>((resolve) => { resolveSlotCreated = resolve })
        let resolveFirst: (() => void) | undefined
        const firstStreamed = new Promise<void>((resolve) => { resolveFirst = resolve })
        const handle = replicate({
          url: TEST_CONFIG,
          slot: { name: slotName },
          publications: [`${K}_cdchealthpub`],
          backfill: async ({ isReconnect }) => { backfillCalls++; firstIsReconnect = isReconnect; resolveSlotCreated?.() },
          onTransaction: (batch) => {
            if (batch.done && batch.events.some((e) => e.kind === 'insert')) resolveFirst?.()
          },
        })
        try {
          await slotCreated // the slot must exist before the insert, or it lands before the slot's restart point
          await c.query(`insert into ${K}_cdchealth values (1)`)
          await Promise.race([
            firstStreamed,
            Bun.sleep(10_000).then(() => { throw new Error('timed out waiting for the first insert to stream') }),
          ])
        } finally { await handle.stop() }
        expect(backfillCalls).toBe(1) // creation path only
        expect(firstIsReconnect).toBe(false)

        const health = await c.query(`select confirmed_flush_lsn::text from pg_replication_slots where slot_name = '${slotName}'`)
        expect((health.rows[0] as unknown[])[0]).not.toBeNull()

        // a fresh handle against the SAME durable slot: resumes, no createSlot/backfill
        let secondBackfillCalls = 0
        let onResumeFired = false
        let resolveSecond: (() => void) | undefined
        const secondStreamed = new Promise<void>((resolve) => { resolveSecond = resolve })
        const handle2 = replicate({
          url: TEST_CONFIG,
          slot: { name: slotName },
          publications: [`${K}_cdchealthpub`],
          backfill: async () => { secondBackfillCalls++ },
          onResume: () => { onResumeFired = true },
          onTransaction: (batch) => {
            if (batch.done && batch.events.some((e) => e.kind === 'insert')) resolveSecond?.()
          },
        })
        try {
          await c.query(`insert into ${K}_cdchealth values (2)`)
          await Promise.race([
            secondStreamed,
            Bun.sleep(10_000).then(() => { throw new Error('timed out waiting for the second insert to stream') }),
          ])
        } finally { await handle2.stop() }
        expect(onResumeFired).toBe(true)
        expect(secondBackfillCalls).toBe(0)
      } finally {
        const r2 = await replication(TEST_CONFIG)
        try { await r2.dropSlot(slotName) } finally { r2.end() }
        await c.query(`drop publication ${K}_cdchealthpub`)
        await c.query(`drop table ${K}_cdchealth`)
      }
    })
  }, 20_000)

  test('cdc onResume: an existing durable slot reports confirmedFlush and restartLsn and backfill is not called', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_cdcresume(id int4 primary key)`)
      await c.query(`create publication ${K}_cdcresumepub for table ${K}_cdcresume`)
      const slotName = `${K}_cdcresumeslot`
      const raw = await replication(TEST_CONFIG)
      try { await raw.createSlot(slotName) } finally { raw.end() } // durable, no export needed
      try {
        let backfillCalls = 0
        let resumePayload: { confirmedFlush: string; restartLsn: string } | undefined
        let resolveStreamed: (() => void) | undefined
        const streamed = new Promise<void>((resolve) => { resolveStreamed = resolve })
        const handle = replicate({
          url: TEST_CONFIG,
          slot: { name: slotName },
          publications: [`${K}_cdcresumepub`],
          backfill: async () => { backfillCalls++ },
          onResume: (info) => { resumePayload = info },
          onTransaction: (batch) => {
            if (batch.done && batch.events.some((e) => e.kind === 'insert')) resolveStreamed?.()
          },
        })
        try {
          await c.query(`insert into ${K}_cdcresume values (1)`)
          await Promise.race([
            streamed,
            Bun.sleep(10_000).then(() => { throw new Error('timed out waiting for the insert to stream') }),
          ])
        } finally { await handle.stop() }
        expect(backfillCalls).toBe(0)
        expect(resumePayload).toBeDefined()
        expect(lsnFromString(resumePayload!.confirmedFlush)).toBeGreaterThan(0n)
        expect(lsnFromString(resumePayload!.restartLsn)).toBeGreaterThan(0n)
      } finally {
        const r2 = await replication(TEST_CONFIG)
        try { await r2.dropSlot(slotName) } finally { r2.end() }
        await c.query(`drop publication ${K}_cdcresumepub`)
        await c.query(`drop table ${K}_cdcresume`)
      }
    })
  }, 15_000)

  test('cdc backfill window: the exported snapshot excludes rows inserted after slot creation', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_cdcwin(id int4 primary key)`)
      await c.query(`create publication ${K}_cdcwinpub for table ${K}_cdcwin`)
      await c.query(`insert into ${K}_cdcwin values (1)`) // baseline: visible to the snapshot
      try {
        let baselineSeen: number[] = []
        let postSlotVisible = false
        let resolveStreamed: (() => void) | undefined
        const streamed = new Promise<void>((resolve) => { resolveStreamed = resolve })
        const handle = replicate({
          url: TEST_CONFIG,
          slot: 'temporary',
          publications: [`${K}_cdcwinpub`],
          backfill: async ({ snapshot }) => {
            await c.query(`insert into ${K}_cdcwin values (2)`) // strictly post-slot: stream-only
            const seen = await withConn(async (bc) =>
              bc.begin({ isolation: 'repeatable read' }, async (tx) => {
                await tx.query(`set transaction snapshot '${snapshot}'`)
                return tx.query(`select id from ${K}_cdcwin order by id`)
              }))
            baselineSeen = (seen.rows as unknown[][]).map((row) => row[0] as number)
            postSlotVisible = baselineSeen.includes(2)
          },
          onTransaction: (batch) => {
            if (batch.done && batch.events.some((e) => e.kind === 'insert' && (e as Extract<ReplicationEvent, { kind: 'insert' }>).new.id === 2)) resolveStreamed?.()
          },
        })
        try {
          await Promise.race([
            streamed,
            Bun.sleep(10_000).then(() => { throw new Error('timed out waiting for the post-slot insert to stream') }),
          ])
        } finally { await handle.stop() }
        expect(baselineSeen).toEqual([1]) // baseline visible to the exported snapshot
        expect(postSlotVisible).toBe(false) // post-slot row invisible to the same snapshot
      } finally {
        await c.query(`drop publication ${K}_cdcwinpub`)
        await c.query(`drop table ${K}_cdcwin`)
      }
    })
  }, 15_000)

  test('cdc slot busy evict: eviction terminates the holder and streaming proceeds', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_cdcevict(id int4 primary key)`)
      await c.query(`create publication ${K}_cdcevictpub for table ${K}_cdcevict`)
      const slotName = `${K}_cdcevictslot`
      const holder = await replication(TEST_CONFIG)
      await holder.createSlot(slotName)
      const holderGen = holder.start({ slot: slotName, publications: [`${K}_cdcevictpub`] })
      const holderNext = holderGen.next() // parks, but START_REPLICATION lands first -> active_pid is set
      await Bun.sleep(300)
      const activeRow = await c.query(`select active from pg_replication_slots where slot_name = '${slotName}'`)
      expect((activeRow.rows[0] as unknown[])[0]).toBe(true)

      try {
        const warnings: string[] = []
        let resolveStreamed: (() => void) | undefined
        const streamed = new Promise<void>((resolve) => { resolveStreamed = resolve })
        const handle = replicate({
          url: TEST_CONFIG,
          slot: { name: slotName },
          publications: [`${K}_cdcevictpub`],
          onSlotBusy: 'evict',
          onWarning: (w) => { if (w.kind === 'slot-evicted') warnings.push(w.kind) },
          onTransaction: (batch) => {
            if (batch.done && batch.events.some((e) => e.kind === 'insert')) resolveStreamed?.()
          },
        })
        try {
          await c.query(`insert into ${K}_cdcevict values (1)`)
          await Promise.race([
            streamed,
            Bun.sleep(10_000).then(() => { throw new Error('timed out waiting for eviction to unblock streaming') }),
          ])
          expect(warnings).toContain('slot-evicted')

          // The insert above may have already queued a begin/insert/commit for the holder before
          // its termination reached the socket, so the FIRST next() can resolve normally — loop
          // until the terminate's FATAL (or a clean end) actually surfaces.
          let holderErr: unknown
          try {
            let r = await holderNext
            while (!r.done) r = await holderGen.next()
          } catch (e) { holderErr = e }
          expect(holderErr).toBeInstanceOf(Error) // PgError 57P01, a socket error, or ReplicationStreamEnded — all mean "terminated"
        } finally { await handle.stop() }
      } finally {
        holder.end()
        const r2 = await replication(TEST_CONFIG)
        try { await r2.dropSlot(slotName) } finally { r2.end() }
        await c.query(`drop publication ${K}_cdcevictpub`)
        await c.query(`drop table ${K}_cdcevict`)
      }
    })
  }, 20_000)

  test('cdc reconnect: a killed walsender is survived and the durable slot resumes without backfill', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_cdcrec(id int4 primary key)`)
      await c.query(`create publication ${K}_cdcrecpub for table ${K}_cdcrec`)
      const slotName = `${K}_cdcrecslot`
      try {
        let backfillCalls = 0
        let reconnectWarnings = 0
        let resumeCalls = 0
        let resolveSlotCreated: (() => void) | undefined
        const slotCreated = new Promise<void>((resolve) => { resolveSlotCreated = resolve })
        let resolveFirst: (() => void) | undefined
        const firstStreamed = new Promise<void>((resolve) => { resolveFirst = resolve })
        let resolveSecond: (() => void) | undefined
        const secondStreamed = new Promise<void>((resolve) => { resolveSecond = resolve })
        const handle = replicate({
          url: TEST_CONFIG,
          slot: { name: slotName },
          publications: [`${K}_cdcrecpub`],
          backfill: async () => { backfillCalls++; resolveSlotCreated?.() },
          onResume: () => { resumeCalls++ },
          onWarning: (w) => { if (w.kind === 'reconnect-attempt') reconnectWarnings++ },
          onTransaction: (batch) => {
            if (!batch.done) return
            if (batch.events.some((e) => e.kind === 'insert' && (e as Extract<ReplicationEvent, { kind: 'insert' }>).new.id === 1)) resolveFirst?.()
            if (batch.events.some((e) => e.kind === 'insert' && (e as Extract<ReplicationEvent, { kind: 'insert' }>).new.id === 2)) resolveSecond?.()
          },
        })
        try {
          await slotCreated // the slot must exist before the insert, or it lands before the slot's restart point
          await c.query(`insert into ${K}_cdcrec values (1)`)
          await Promise.race([
            firstStreamed,
            Bun.sleep(10_000).then(() => { throw new Error('timed out waiting for the first insert to stream') }),
          ])
          expect(backfillCalls).toBe(1) // creation path only

          const pidRow = await c.query(`select active_pid from pg_replication_slots where slot_name = '${slotName}'`)
          const pid = (pidRow.rows[0] as unknown[])[0] as number
          expect(pid).toBeGreaterThan(0)
          await c.query(`select pg_terminate_backend(${pid})`)

          await c.query(`insert into ${K}_cdcrec values (2)`)
          await Promise.race([
            secondStreamed,
            Bun.sleep(15_000).then(() => { throw new Error('timed out waiting for the second insert to stream after reconnect') }),
          ])
          expect(backfillCalls).toBe(1) // reconnect resumed the durable slot — no second backfill
          expect(reconnectWarnings).toBeGreaterThan(0)
          expect(resumeCalls).toBeGreaterThan(0)
        } finally { await handle.stop() }
      } finally {
        const r2 = await replication(TEST_CONFIG)
        try { await r2.dropSlot(slotName) } finally { r2.end() }
        await c.query(`drop publication ${K}_cdcrecpub`)
        await c.query(`drop table ${K}_cdcrec`)
      }
    })
  }, 20_000)

  test('cdc onResume recreate verdict: drops and recreates the durable slot with a fresh exported snapshot', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_verd(id int4 primary key)`)
      await c.query(`create publication ${K}_verdpub for table ${K}_verd`)
      const slotName = `${K}_verdslot`
      try {
        // Run 1: create the durable slot for real and ack past insert 1 — the durable progress a
        // long-running process resumes from.
        let resolveSlotCreated: (() => void) | undefined
        const slotCreated = new Promise<void>((resolve) => { resolveSlotCreated = resolve })
        let resolveFirst: (() => void) | undefined
        const firstStreamed = new Promise<void>((resolve) => { resolveFirst = resolve })
        const handle1 = replicate({
          url: TEST_CONFIG,
          slot: { name: slotName },
          publications: [`${K}_verdpub`],
          backfill: async () => { resolveSlotCreated?.() },
          onTransaction: (batch) => {
            if (!batch.done) return
            if (batch.events.some((e) => e.kind === 'insert' && (e as Extract<ReplicationEvent, { kind: 'insert' }>).new.id === 1)) resolveFirst?.()
          },
        })
        try {
          await slotCreated // the slot must exist before the insert, or it lands before the slot's restart point
          await c.query(`insert into ${K}_verd values (1)`)
          await Promise.race([
            firstStreamed,
            Bun.sleep(10_000).then(() => { throw new Error('timed out waiting for the first insert to stream') }),
          ])
        } finally { await handle1.stop() }

        // The real pre-recreate position — the verdict must have been judged against this, not
        // some value the driver invents.
        const flushRow = await c.query(`select confirmed_flush_lsn from pg_replication_slots where slot_name = '${slotName}'`)
        const confirmedFlushBefore = (flushRow.rows[0] as unknown[])[0] as string

        // Run 2: onResume answers 'recreate' once — this is the one server behavior worth a live
        // proof: drop, create with an exported snapshot, adopt it, then stream.
        let onResumeCalls = 0
        const resumeInfos: { confirmedFlush: string; restartLsn: string }[] = []
        let backfillCallsRun2 = 0
        let lastBackfillIsReconnect: boolean | undefined
        let resolveRebuilt: (() => void) | undefined
        const rebuilt = new Promise<void>((resolve) => { resolveRebuilt = resolve })
        let resolveSecond: (() => void) | undefined
        const secondStreamed = new Promise<void>((resolve) => { resolveSecond = resolve })
        const handle2 = replicate({
          url: TEST_CONFIG,
          slot: { name: slotName },
          publications: [`${K}_verdpub`],
          onResume: (info) => {
            onResumeCalls++
            resumeInfos.push(info)
            return onResumeCalls === 1 ? 'recreate' : undefined
          },
          backfill: async (info) => {
            backfillCallsRun2++
            lastBackfillIsReconnect = info.isReconnect
            resolveRebuilt?.()
          },
          onTransaction: (batch) => {
            if (!batch.done) return
            if (batch.events.some((e) => e.kind === 'insert' && (e as Extract<ReplicationEvent, { kind: 'insert' }>).new.id === 2)) resolveSecond?.()
          },
        })
        try {
          await Promise.race([
            rebuilt,
            Bun.sleep(10_000).then(() => { throw new Error('timed out waiting for the recreate to rebuild the slot') }),
          ])
          // backfill firing at all — a plain resume never calls it — is the proof the drop and
          // create really happened on the server, and the snapshot it consumed came from the
          // fresh slot.
          expect(backfillCallsRun2).toBe(1)
          expect(lastBackfillIsReconnect).toBe(true)
          expect(resumeInfos[0]?.confirmedFlush).toBe(confirmedFlushBefore)

          await c.query(`insert into ${K}_verd values (2)`)
          await Promise.race([
            secondStreamed,
            Bun.sleep(15_000).then(() => { throw new Error('timed out waiting for the second insert to stream after recreate') }),
          ])
          // The recreated slot takes the create path on the same connect — no second resume
          // happens within run 2.
          expect(onResumeCalls).toBe(1)
        } finally { await handle2.stop() }
      } finally {
        // No step here may be skipped because an earlier one threw — a leaked slot or
        // publication poisons every later run on this cluster.
        try {
          const r = await replication(TEST_CONFIG)
          try { await r.dropSlot(slotName) } catch { /* a mid-test failure can leave no slot; 42704 must never skip the drops below */ } finally { r.end() }
        } finally {
          try { await c.query(`drop publication ${K}_verdpub`) }
          finally { await c.query(`drop table ${K}_verd`) }
        }
      }
    })
  }, 20_000)

  // A fixed 60s receiveTimeoutMs false-fires a healthy idle stream at ~70s, measured: the server
  // pings only once the client has been silent for wal_sender_timeout/2, and a 10s status cadence
  // keeps resetting that clock, so no keepalive ever arrives. The window here can't
  // compress below ~75s — the locked 60s receiveTimeoutMs floor and the server's own 60s default
  // wal_sender_timeout both require a real elapsed silence, not a scaled-down one, to observe
  // honestly. Gated out of the default run: `bun run test` never pays this cost; `bun run test:slow`
  // is the one command that does.
  test.skipIf(!process.env.SLOW_TESTS)('cdc idle managed: derived defaults survive 75 seconds of idle with zero spurious reconnects', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_cdcidle(id int4 primary key)`)
      await c.query(`create publication ${K}_cdcidlepub for table ${K}_cdcidle`)
      try {
        const reconnectWarnings: string[] = []
        let backfillCalls = 0
        // deliberately no statusIntervalMs / receiveTimeoutMs — the derived values are the subject
        const handle = replicate({
          url: TEST_CONFIG,
          slot: 'temporary',
          publications: [`${K}_cdcidlepub`],
          backfill: async () => { backfillCalls++ },
          onWarning: (w) => { if (w.kind === 'reconnect-attempt') reconnectWarnings.push(w.message) },
          onTransaction: () => {},
        })
        try {
          await Bun.sleep(75_000)
        } finally {
          await handle.stop()
        }
        expect(reconnectWarnings).toEqual([])
        expect(backfillCalls).toBe(1)
      } finally {
        await c.query(`drop publication ${K}_cdcidlepub`)
        await c.query(`drop table ${K}_cdcidle`)
      }
    })
  }, 90_000)
})

// keep the import used even if helpers change
void connect

  test('config.options reaches the replication startup packet (wal_sender_timeout lever)', async () => {
    const repl = await replication({ ...TEST_CONFIG, options: '-c wal_sender_timeout=54321' })
    try {
      const r = await repl.command('show wal_sender_timeout')
      expect(r.rows[0]![0]).toBe('54321ms') // server-applied at startup; RESET ALL would restore it
    } finally { repl.end() }
  }, TEST_TIMEOUT)

  test('onReady fires when START_REPLICATION is accepted, before any event', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_r2(id int4 primary key)`)
      await c.query(`create publication ${K}_r2pub for table ${K}_r2`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_r2slot`, { temporary: true })
          await c.query(`insert into ${K}_r2 values (1)`)
          const order: string[] = []
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_r2pub`], onReady: () => order.push('ready') }),
            (es) => { if (es.length === 1) order.push('first-event'); return es.some((e) => e.kind === 'commit') })
          expect(order).toEqual(['ready', 'first-event']) // established BEFORE anything yields
          expect(events.length).toBeGreaterThan(0)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_r2pub`)
        await c.query(`drop table ${K}_r2`)
      }
    })
  }, TEST_TIMEOUT)

  test('TOAST fill: with REPLICA IDENTITY FULL, unchanged columns are filled into new (and still listed)', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_t2(id int4 primary key, fat text, n int4)`)
      await c.query(`alter table ${K}_t2 replica identity full`)
      await c.query(`create publication ${K}_t2pub for table ${K}_t2`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_t2slot`, { temporary: true })
          // incompressible-enough payload so it TOASTs out-of-line (>2KB post-compression)
          await c.query(`insert into ${K}_t2 select 1, string_agg(md5(random()::text), ''), 0 from generate_series(1, 2000)`)
          await c.query(`update ${K}_t2 set n = 7 where id = 1`) // fat untouched -> pgoutput omits it ('u')
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_t2pub`] }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 2)
          const upd = events.find((e) => e.kind === 'update') as Extract<ReplicationEvent, { kind: 'update' }>
          expect(upd.oldKind).toBe('full')
          expect(upd.unchanged).toEqual(['fat'])                       // still listed: filled ≠ retransmitted
          expect(typeof upd.new.fat).toBe('string')                    // FILLED from the old tuple
          expect((upd.new.fat as string).length).toBe(64000)           // the whole 2000×32-char value
          expect(upd.new.fat).toBe(upd.old!.fat)                       // lossless by definition of "unchanged"
          expect(upd.new.n).toBe(7)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_t2pub`)
        await c.query(`drop table ${K}_t2`)
      }
    })
  }, TEST_TIMEOUT)

  test('hydrateToast: false restores the sparse TOAST shape (unchanged still listed)', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_hy(id int4 primary key, fat text, n int4)`)
      await c.query(`alter table ${K}_hy replica identity full`)
      await c.query(`create publication ${K}_hypub for table ${K}_hy`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_hyslot`, { temporary: true })
          // incompressible-enough payload so it TOASTs out-of-line (>2KB post-compression)
          await c.query(`insert into ${K}_hy select 1, string_agg(md5(random()::text), ''), 0 from generate_series(1, 2000)`)
          await c.query(`update ${K}_hy set n = 7 where id = 1`) // fat untouched -> pgoutput omits it ('u')
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_hypub`], hydrateToast: false }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 2)
          const upd = events.find((e) => e.kind === 'update') as Extract<ReplicationEvent, { kind: 'update' }>
          expect(upd.oldKind).toBe('full')
          expect('fat' in upd.new).toBe(false)                          // NOT filled — sparse shape restored
          expect(upd.unchanged).toEqual(['fat'])                        // still listed: the flag changes the fill, not the wire
          expect(typeof upd.old!.fat).toBe('string')                    // the old tuple still carries the value
          expect((upd.old!.fat as string).length).toBe(64000)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_hypub`)
        await c.query(`drop table ${K}_hy`)
      }
    })
  }, TEST_TIMEOUT)

  test('keyChanged: FULL identity, declared int PK — false on non-key update, true on key-changing update, absent on delete', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_kc(id int4 primary key, v text)`)
      await c.query(`alter table ${K}_kc replica identity full`)
      await c.query(`create publication ${K}_kcpub for table ${K}_kc`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_kcslot`, { temporary: true })
          await c.query(`insert into ${K}_kc values (1, 'a')`)
          await c.query(`update ${K}_kc set v = 'b' where id = 1`) // non-key change
          await c.query(`update ${K}_kc set id = 2 where id = 1`) // key change
          await c.query(`delete from ${K}_kc where id = 2`)
          const shapes: TableShape[] = [{ table: `${K}_kc`, shape: { id: 'int4' }, key: ['id'] }]
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_kcpub`], shapes }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 4)
          const updates = events.filter((e) => e.kind === 'update') as Extract<ReplicationEvent, { kind: 'update' }>[]
          expect(updates[0]!.keyChanged).toBe(false)
          expect(updates[1]!.keyChanged).toBe(true)
          const del = events.find((e) => e.kind === 'delete') as Extract<ReplicationEvent, { kind: 'delete' }>
          expect('keyChanged' in del).toBe(false)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_kcpub`)
        await c.query(`drop table ${K}_kc`)
      }
    })
  }, TEST_TIMEOUT)

  test('keyChanged: FULL identity, composite Date/Buffer key — sameValue not reference equality', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_kd(id int4 primary key, ts timestamptz, b bytea, v text)`)
      await c.query(`alter table ${K}_kd replica identity full`)
      await c.query(`create publication ${K}_kdpub for table ${K}_kd`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_kdslot`, { temporary: true })
          await c.query(`insert into ${K}_kd values (1, '2026-01-01T00:00:00.000Z', '\\xdeadbeef', 'a')`)
          await c.query(`update ${K}_kd set v = 'b' where id = 1`) // neither key column touched
          await c.query(`update ${K}_kd set ts = '2026-01-01T00:00:00.001Z' where id = 1`) // 1ms shift
          await c.query(`update ${K}_kd set b = '\\xfeedface' where id = 1`) // bytea change
          const shapes: TableShape[] = [{ table: `${K}_kd`, shape: { ts: 'timestamptz', b: 'bytea' }, key: ['ts', 'b'] }]
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_kdpub`], shapes }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 4)
          const updates = events.filter((e) => e.kind === 'update') as Extract<ReplicationEvent, { kind: 'update' }>[]
          expect(updates[0]!.keyChanged).toBe(false)
          expect(updates[1]!.keyChanged).toBe(true)
          expect(updates[2]!.keyChanged).toBe(true)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_kdpub`)
        await c.query(`drop table ${K}_kd`)
      }
    })
  }, TEST_TIMEOUT)

  test('keyChanged: DEFAULT identity — oldKind key yields true with no comparison, oldKind null yields false', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_ke(id int4 primary key, v text)`)
      await c.query(`create publication ${K}_kepub for table ${K}_ke`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_keslot`, { temporary: true })
          await c.query(`insert into ${K}_ke values (1, 'a')`)
          await c.query(`update ${K}_ke set v = 'b' where id = 1`) // non-key change -> oldKind null
          await c.query(`update ${K}_ke set id = 2 where id = 1`) // key change -> oldKind key
          const shapes: TableShape[] = [{ table: `${K}_ke`, shape: { id: 'int4' }, key: ['id'] }]
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_kepub`], shapes }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 3)
          const updates = events.filter((e) => e.kind === 'update') as Extract<ReplicationEvent, { kind: 'update' }>[]
          expect(updates[0]!.oldKind).toBe(null)
          expect(updates[0]!.keyChanged).toBe(false)
          expect(updates[1]!.oldKind).toBe('key')
          expect(updates[1]!.keyChanged).toBe(true)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_kepub`)
        await c.query(`drop table ${K}_ke`)
      }
    })
  }, TEST_TIMEOUT)

  test('keyChanged: absent when TableShape.key is not declared', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_kn(id int4 primary key, v text)`)
      await c.query(`alter table ${K}_kn replica identity full`)
      await c.query(`create publication ${K}_knpub for table ${K}_kn`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_knslot`, { temporary: true })
          await c.query(`insert into ${K}_kn values (1, 'a')`)
          await c.query(`update ${K}_kn set v = 'b' where id = 1`)
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_knpub`] }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 2)
          const upd = events.find((e) => e.kind === 'update') as Extract<ReplicationEvent, { kind: 'update' }>
          expect('keyChanged' in upd).toBe(false)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_knpub`)
        await c.query(`drop table ${K}_kn`)
      }
    })
  }, TEST_TIMEOUT)

  test('replica identity warning: DEFAULT identity warns once across two updates and a delete', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_ri(id int4 primary key, v int4)`)
      await c.query(`create publication ${K}_ripub for table ${K}_ri`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_rislot`, { temporary: true })
          await c.query(`insert into ${K}_ri values (1, 0)`)
          await c.query(`update ${K}_ri set v = 1 where id = 1`)
          await c.query(`update ${K}_ri set v = 2 where id = 1`)
          await c.query(`delete from ${K}_ri where id = 1`)
          const warnings: ReplicationWarning[] = []
          await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_ripub`], onWarning: (w) => warnings.push(w) }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 4)
          expect(warnings).toEqual([{ kind: 'replica-identity', schema: 'public', table: `${K}_ri`, replicaIdentity: 'd', message: expect.any(String) }])
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_ripub`)
        await c.query(`drop table ${K}_ri`)
      }
    })
  }, TEST_TIMEOUT)

  test('replica identity warning: FULL table never warns', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_rf(id int4 primary key, v int4)`)
      await c.query(`alter table ${K}_rf replica identity full`)
      await c.query(`create publication ${K}_rfpub for table ${K}_rf`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_rfslot`, { temporary: true })
          await c.query(`insert into ${K}_rf values (1, 0)`)
          await c.query(`update ${K}_rf set v = 1 where id = 1`)
          await c.query(`delete from ${K}_rf where id = 1`)
          const warnings: ReplicationWarning[] = []
          await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_rfpub`], onWarning: (w) => warnings.push(w) }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 3)
          expect(warnings.length).toBe(0)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_rfpub`)
        await c.query(`drop table ${K}_rf`)
      }
    })
  }, TEST_TIMEOUT)

  // The stale-callback case ("replica identity warning: a finished stream's callback never fires
  // for a later stream") needs two start() calls on the SAME ReplicationConnection — that is what
  // exercises this.warn's clearing in the finally. Restarting START_REPLICATION on one physical
  // connection hangs against this live cluster for reasons unrelated to warnings (reproduced with
  // a bare insert-only stream, no onWarning at all — a fresh connection on the same slot works
  // fine), so that case is proven instead in test/unit/replication-lifecycle.test.ts against the
  // fake backend, which does not hit whatever the live cluster's restart limitation is.

  test('partition warning: publish_via_partition_root off warns naming the leaf and the publication', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_pt_parent(id int4, ts timestamptz, v int4, primary key (id, ts)) partition by range (ts)`)
      await c.query(`create table ${K}_pt_leaf partition of ${K}_pt_parent for values from ('2020-01-01') to ('2030-01-01')`)
      await c.query(`create publication ${K}_ptpub for table ${K}_pt_parent`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_ptslot`, { temporary: true })
          await c.query(`insert into ${K}_pt_parent values (1, '2025-06-01T00:00:00Z', 0)`) // routed to the leaf
          await c.query(`update ${K}_pt_parent set v = 1 where id = 1`) // second transaction: old-row-less update
          const warnings: ReplicationWarning[] = []
          await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_ptpub`], onWarning: (w) => warnings.push(w) }),
            (es) => es.filter((e) => e.kind === 'commit').length >= 2)
          // per-kind dedupe: the leaf's announce-time partition warning must not swallow its own
          // replica-identity warning on the follow-up update
          expect(warnings).toEqual([
            { kind: 'partition-relation', schema: 'public', table: `${K}_pt_leaf`, publication: `${K}_ptpub`, message: expect.any(String) },
            { kind: 'replica-identity', schema: 'public', table: `${K}_pt_leaf`, replicaIdentity: 'd', message: expect.any(String) },
          ])
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_ptpub`)
        await c.query(`drop table ${K}_pt_parent`) // cascades to the leaf
      }
    })
  }, TEST_TIMEOUT)

  test('partition warning: publish_via_partition_root on stays silent (announce arrives under the parent name)', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_pt2_parent(id int4, ts timestamptz, v int4, primary key (id, ts)) partition by range (ts)`)
      await c.query(`create table ${K}_pt2_leaf partition of ${K}_pt2_parent for values from ('2020-01-01') to ('2030-01-01')`)
      await c.query(`create publication ${K}_pt2pub for table ${K}_pt2_parent with (publish_via_partition_root = true)`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_pt2slot`, { temporary: true })
          await c.query(`insert into ${K}_pt2_parent values (1, '2025-06-01T00:00:00Z', 0)`)
          const warnings: ReplicationWarning[] = []
          const events = await collectUntil(
            repl.start({ slot: slot.slot, publications: [`${K}_pt2pub`], onWarning: (w) => warnings.push(w) }),
            (es) => es.some((e) => e.kind === 'insert'))
          const ins = events.find((e) => e.kind === 'insert') as Extract<ReplicationEvent, { kind: 'insert' }>
          expect(ins.table).toBe(`${K}_pt2_parent`) // announced under the ROOT's name, not the leaf's
          expect(warnings.filter((w) => w.kind === 'partition-relation').length).toBe(0)
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_pt2pub`)
        await c.query(`drop table ${K}_pt2_parent`)
      }
    })
  }, TEST_TIMEOUT)

  test('batchTransactions: a real transaction is yielded, and break after a batch leaves the connection commandable', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_bt(id int4 primary key, v int4)`)
      await c.query(`create publication ${K}_btpub for table ${K}_bt`)
      try {
        const repl = await replication(TEST_CONFIG)
        try {
          const slot = await repl.createSlot(`${K}_btslot`, { temporary: true })
          await c.query(`insert into ${K}_bt(id, v) values (1, 1)`)

          const batches: TransactionBatch[] = []
          for await (const b of batchTransactions(repl.start({ slot: slot.slot, publications: [`${K}_btpub`] }))) {
            batches.push(b)
            if (b.done && b.events.some((e) => e.kind === 'insert')) break
          }

          const insertBatch = batches.find((b) => b.done && b.events.some((e) => e.kind === 'insert'))
          expect(insertBatch).toBeDefined()
          expect(insertBatch!.done).toBe(true)
          if (insertBatch!.done) expect(insertBatch!.endLsn.length).toBeGreaterThan(0)
          expect(insertBatch!.events.some((e) => e.kind === 'relation')).toBe(true)

          const sys = await repl.identify() // break propagated return() through batchTransactions into start()'s finally
          expect(sys.systemId).toBeTruthy()
        } finally { repl.end() }
      } finally {
        await c.query(`drop publication ${K}_btpub`)
        await c.query(`drop table ${K}_bt`)
      }
    })
  }, TEST_TIMEOUT)

  test('channel_binding=require throws loudly on replication connections too', async () => {
    const { host, port, user, password, database } = TEST_CONFIG as { host: string; port: number; user: string; password: string; database: string }
    const url = `postgres://${user}:${password}@${host}:${port}/${database}?channel_binding=require`
    await expect(replication(url)).rejects.toThrow(/channel_binding=require needs TLS/)
  }, TEST_TIMEOUT)
