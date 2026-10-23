// Proves batchTransactions() as a pure transform over a hand-fed AsyncIterable — no cluster, no
// fake Duplex, no backend. The generator never touches connection state, so a plain array of
// ReplicationEvent literals fed through an async generator is the whole fixture.
import { test, expect } from 'bun:test'
import { batchTransactions, type ReplicationEvent, type TransactionBatch } from '../../src/index.ts'

let nextId = 0
const insertEvt = (): ReplicationEvent => ({ kind: 'insert', schema: 'public', table: 't', new: { id: nextId++ } })
const beginEvt = (xid: number): ReplicationEvent => ({ kind: 'begin', xid, commitTime: new Date(0), commitTimeUs: 0, finalLsn: '0/0' })
const commitEvt = (lsn: string, endLsn: string): ReplicationEvent => ({ kind: 'commit', lsn, endLsn, commitTime: new Date(1), commitTimeUs: 1000 })

async function* feed(events: ReplicationEvent[]): AsyncGenerator<ReplicationEvent> {
  for (const e of events) yield e
}

test('batchTransactions: two transactions yield two done-true batches with commit fields lifted; begin/commit absent from events[]', async () => {
  const events: ReplicationEvent[] = [
    beginEvt(100), insertEvt(), insertEvt(), commitEvt('0/10', '0/20'),
    beginEvt(200), insertEvt(), commitEvt('0/30', '0/40'),
  ]
  const batches: TransactionBatch[] = []
  for await (const b of batchTransactions(feed(events))) batches.push(b)

  expect(batches.length).toBe(2)
  expect(batches[0]!.xid).toBe(100)
  expect(batches[0]!.events.length).toBe(2)
  expect(batches[0]!.events.every((e) => e.kind !== 'begin' && e.kind !== 'commit')).toBe(true)
  expect(batches[0]!.done).toBe(true)
  if (batches[0]!.done) {
    expect(batches[0]!.commitLsn).toBe('0/10')
    expect(batches[0]!.endLsn).toBe('0/20')
  }
  expect(batches[1]!.xid).toBe(200)
  expect(batches[1]!.events.length).toBe(1)
})

// PostgreSQL 15 and newer skip empty transactions in pgoutput, so this pair reaches a client only
// from PostgreSQL 14 and older. The transform must still handle it.
test('batchTransactions: an empty begin/commit pair yields an events-empty done-true batch', async () => {
  const events = [beginEvt(1), commitEvt('0/1', '0/2')]
  const batches: TransactionBatch[] = []
  for await (const b of batchTransactions(feed(events))) batches.push(b)

  expect(batches.length).toBe(1)
  expect(batches[0]!.events).toEqual([])
  expect(batches[0]!.done).toBe(true)
})

test('batchTransactions: maxEvents chunks a 5-event transaction into 2, 2, and a final done-true chunk carrying the remainder plus commit fields', async () => {
  const events = [beginEvt(1), insertEvt(), insertEvt(), insertEvt(), insertEvt(), insertEvt(), commitEvt('0/1', '0/2')]
  const batches: TransactionBatch[] = []
  for await (const b of batchTransactions(feed(events), { maxEvents: 2 })) batches.push(b)

  expect(batches.length).toBe(3)
  expect(batches[0]!.done).toBe(false)
  expect(batches[0]!.events.length).toBe(2)
  expect(batches[1]!.done).toBe(false)
  expect(batches[1]!.events.length).toBe(2)
  expect(batches[2]!.done).toBe(true)
  expect(batches[2]!.events.length).toBe(1)
  // done:false chunks carry no commit fields at all, not even undefined ones present in the object
  expect(Object.keys(batches[0]!)).not.toContain('commitLsn')
})

test('batchTransactions: maxEvents over an exact-multiple transaction yields an events-empty final done-true chunk as the commit-field vehicle', async () => {
  const events = [beginEvt(1), insertEvt(), insertEvt(), insertEvt(), insertEvt(), commitEvt('0/1', '0/2')]
  const batches: TransactionBatch[] = []
  for await (const b of batchTransactions(feed(events), { maxEvents: 2 })) batches.push(b)

  expect(batches.length).toBe(3)
  expect(batches[0]!.events.length).toBe(2)
  expect(batches[1]!.events.length).toBe(2)
  expect(batches[2]!.done).toBe(true)
  expect(batches[2]!.events).toEqual([])
})

test('batchTransactions: a non-transactional message between transactions is dropped; a transactional message inside a transaction stays in events[]', async () => {
  const nonTx: ReplicationEvent = { kind: 'message', transactional: false, prefix: 'p', content: Buffer.from('a'), lsn: '0/5' }
  const tx: ReplicationEvent = { kind: 'message', transactional: true, prefix: 'p', content: Buffer.from('b'), lsn: '0/6' }
  const events = [
    beginEvt(1), insertEvt(), commitEvt('0/1', '0/2'),
    nonTx,
    beginEvt(2), tx, insertEvt(), commitEvt('0/3', '0/4'),
  ]
  const batches: TransactionBatch[] = []
  for await (const b of batchTransactions(feed(events))) batches.push(b)

  expect(batches.length).toBe(2)
  expect(batches.every((b) => !b.events.includes(nonTx))).toBe(true)
  expect(batches[1]!.events).toContainEqual(tx)
})

test('batchTransactions: relation and truncate events stay in events[]', async () => {
  const rel: ReplicationEvent = { kind: 'relation', relation: { schema: 'public', table: 't', replicaIdentity: 'd', columns: [] } }
  const trunc: ReplicationEvent = { kind: 'truncate', tables: [{ schema: 'public', table: 't' }], cascade: false, restartIdentity: false }
  const events = [beginEvt(1), rel, trunc, commitEvt('0/1', '0/2')]
  const batches: TransactionBatch[] = []
  for await (const b of batchTransactions(feed(events))) batches.push(b)

  expect(batches[0]!.events).toEqual([rel, trunc])
})

test('batchTransactions: a throw from the source stream mid-transaction propagates and discards the buffered events', async () => {
  async function* feedThrow(): AsyncGenerator<ReplicationEvent> {
    yield beginEvt(1)
    yield insertEvt()
    throw new Error('boom')
  }
  const batches: TransactionBatch[] = []
  let err: unknown
  try {
    for await (const b of batchTransactions(feedThrow())) batches.push(b)
  } catch (e) { err = e }

  expect((err as Error).message).toBe('boom')
  expect(batches.length).toBe(0)
})

test('batchTransactions: maxEvents omitted, zero, or negative all mean unbounded batching', async () => {
  const events = [beginEvt(1), insertEvt(), insertEvt(), insertEvt(), commitEvt('0/1', '0/2')]
  for (const maxEvents of [undefined, 0, -5] as const) {
    const batches: TransactionBatch[] = []
    for await (const b of batchTransactions(feed(events), maxEvents === undefined ? {} : { maxEvents })) batches.push(b)
    expect(batches.length).toBe(1)
    expect(batches[0]!.events.length).toBe(3)
  }
})

test('batchTransactions: break out of the consumer for-await closes the underlying source stream via return()', async () => {
  const events = [
    beginEvt(1), insertEvt(), commitEvt('0/1', '0/2'),
    beginEvt(2), insertEvt(), commitEvt('0/3', '0/4'),
  ]
  const state = { returned: false }
  const tracked: AsyncIterable<ReplicationEvent> = {
    [Symbol.asyncIterator]() {
      let i = 0
      return {
        async next(): Promise<IteratorResult<ReplicationEvent>> {
          if (i < events.length) return { value: events[i++]!, done: false }
          return { value: undefined, done: true }
        },
        async return(): Promise<IteratorResult<ReplicationEvent>> {
          state.returned = true
          return { value: undefined, done: true }
        },
      }
    },
  }
  const batches: TransactionBatch[] = []
  for await (const b of batchTransactions(tracked)) {
    batches.push(b)
    break
  }
  expect(batches.length).toBe(1)
  expect(state.returned).toBe(true)
})

test('batchTransactions: done fields are unreachable on a done-false chunk without narrowing (ack-safety compile check)', async () => {
  const events = [beginEvt(1), insertEvt(), commitEvt('0/1', '0/2')]
  let sawUnnarrowedChunk = false
  for await (const batch of batchTransactions(feed(events), { maxEvents: 1 })) {
    if (!batch.done) {
      sawUnnarrowedChunk = true
      // @ts-expect-error done:false chunks carry no commit fields — reading endLsn here would let a
      // consumer ack a mid-transaction chunk; only `bun run typecheck` observes this line, bun's test
      // runner does not typecheck.
      void batch.endLsn
    }
  }
  expect(sawUnnarrowedChunk).toBe(true)
})
