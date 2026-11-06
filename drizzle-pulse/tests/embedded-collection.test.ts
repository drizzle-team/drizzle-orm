import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseClient } from 'drizzle-pulse/client/embedded';
import { createPulseRegistry } from 'drizzle-pulse/server';
import { fullOrdersFixture } from './fixtures/full-orders/index.js';
import { pgDataTypesFixture } from './fixtures/pg-data-types/index.js';
import { pgDataTypeInsertValues } from './fixtures/pg-data-types/inventory.js';
import type {
  HarnessProcessDbOperations,
  RuntimeOf,
  TestSuiteResult,
} from './helpers/test-harness.js';
import { insertTestUser, setupTestSuiteForFixture, waitFor } from './helpers/test-harness.js';

// Change delivery is tap-direct (WAL listener -> in-process WalEventEmitter -> merge core),
// not a poll — state converges a scheduling beat after processDbOperations resolves because
// the tap payload still has to flow through pgoutput, so poll for it rather than assert sync.
// This suite's own defaults differ from waitFor()'s canonical 8000ms/50ms — pass them explicitly.
const COLLECTION_WAIT_FOR_TIMEOUT_MS = 2000;
const COLLECTION_WAIT_FOR_POLL_INTERVAL_MS = 20;

// pg wire LSN form is "hex/hex" (e.g. "0/16B2D30") — assert the shape without importing the
// library's own shared/lsn.ts, so this test stays independent of the implementation it proves.
const LSN_PATTERN = /^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/;

function parseLsnForAssertions(lsn: string): bigint {
  const [hi, lo] = lsn.split('/');
  return (BigInt(`0x${hi}`) << 32n) | BigInt(`0x${lo}`);
}

// ---------------------------------------------------------------------------
// Main suite — collections fed tap-direct (WAL listener -> in-process
// WalEventEmitter -> baseline/watermark handshake -> PulseMergeCore). No
// events-table reads, no HTTP wire protocol anywhere in this path.
// ---------------------------------------------------------------------------

describe('Embedded Collection', () => {
  let suite: TestSuiteResult;
  let db: PostgresJsDatabase;
  let runtime!: RuntimeOf<typeof registry>;
  let processDbOperations: HarnessProcessDbOperations;

  const fixture = fullOrdersFixture;
  const { orders } = fixture.tables;

  const ordersByStatus = pulse(orders)
    .args(fixture.schemas.ordersByStatusArgs)
    .order('asc')
    .query((ctx) => ctx.query({ status: ctx.args.status }));
  // Kept solely to prove the rejection below — embedded collections must reject
  // `.limit()` at creation, so the registry needs one such query on hand.
  const ordersByStatusLimited = pulse(orders)
    .args(fixture.schemas.ordersByStatusArgs)
    .order('asc')
    .limit(2)
    .query((ctx) => ctx.query({ status: ctx.args.status }));
  const registry = createPulseRegistry({ ordersByStatus, ordersByStatusLimited });

  beforeAll(async () => {
    suite = await setupTestSuiteForFixture(fixture, registry);
    db = suite.db;
    runtime = suite.runtime;
    processDbOperations = suite.processDbOperations;
  });

  afterAll(async () => {
    await suite?.teardown();
  });

  beforeEach(async () => {
    await suite?.cleanupBetweenTests();
    await insertTestUser(db, `driver_${randomUUID().slice(0, 8)}`);
  });

  // A row committed while the collection is being created appears exactly once — the
  // baseline SELECT and the buffered tap payloads dedupe by pk against the read watermark.
  test('a concurrently-inserted row appears exactly once in list()', async () => {
    await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'Pre', dropoff: 'Pre', price: 10, status: 'accepted' }),
    ]);

    const client = createPulseClient(runtime);
    const collectionPromise = client.ordersByStatus({ status: 'accepted' });

    const { results } = await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'Race', dropoff: 'Race', price: 20, status: 'accepted' })
        .returning(),
    ]);
    const [raceInserted] = results[0] as Array<{ id: number }>;

    const collection = await collectionPromise;
    await waitFor(
      () => collection.list().length === 2,
      COLLECTION_WAIT_FOR_TIMEOUT_MS,
      COLLECTION_WAIT_FOR_POLL_INTERVAL_MS,
    );

    const ids = collection.list().map((r) => r.id as number);
    expect(new Set(ids).size).toBe(2); // no duplicate of the race-inserted row
    expect(ids).toContain(raceInserted!.id);

    collection.dispose();
  });

  // Insert into the source table -> onChange fires straight off the WAL tap, with no polling
  // interval anywhere. Covers insert/update/delete op shapes, state === list(), and the lsn
  // token every change now carries in place of the old events-table snapshot serial.
  test('push-shaped INSERT/UPDATE/DELETE reach onChange without any interval', async () => {
    const client = createPulseClient(runtime);
    const collection = await client.ordersByStatus({ status: 'accepted' });

    const changes: Array<{ events: readonly any[]; state: readonly any[]; lsn: string }> = [];
    collection.onChange((c) => changes.push(c));

    // INSERT
    const { results: r1 } = await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'Ins', dropoff: 'Ins', price: 30, status: 'accepted' })
        .returning(),
    ]);
    const [inserted] = r1[0] as Array<{ id: number }>;

    await waitFor(
      () => changes.length === 1,
      COLLECTION_WAIT_FOR_TIMEOUT_MS,
      COLLECTION_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(changes[0]!.events[0]!.op).toBe('insert');
    expect(changes[0]!.lsn).toMatch(LSN_PATTERN);
    expect(changes[0]!.state).toBe(collection.list());
    expect(collection.list()).toHaveLength(1);

    // UPDATE out of filter (accepted -> completed): matchesNew=false
    await processDbOperations([
      db.update(orders).set({ status: 'completed' }).where(eq(orders.id, inserted!.id)),
    ]);

    await waitFor(
      () => changes.length === 2,
      COLLECTION_WAIT_FOR_TIMEOUT_MS,
      COLLECTION_WAIT_FOR_POLL_INTERVAL_MS,
    );
    const updateEvt = changes[1]!.events[0];
    expect(updateEvt.op).toBe('update');
    expect(updateEvt.matchesNew).toBe(false);
    expect(changes[1]!.lsn).toMatch(LSN_PATTERN);
    expect(collection.list()).toHaveLength(0);
    expect(changes[1]!.state).toBe(collection.list());

    // INSERT a second accepted row, then DELETE it
    const { results: r2 } = await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'Del', dropoff: 'Del', price: 40, status: 'accepted' })
        .returning(),
    ]);
    const [toDelete] = r2[0] as Array<{ id: number }>;

    await waitFor(
      () => changes.length === 3,
      COLLECTION_WAIT_FOR_TIMEOUT_MS,
      COLLECTION_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(changes[2]!.events[0]!.op).toBe('insert');
    expect(changes[2]!.lsn).toMatch(LSN_PATTERN);
    expect(collection.list()).toHaveLength(1);

    await processDbOperations([db.delete(orders).where(eq(orders.id, toDelete!.id))]);

    await waitFor(
      () => changes.length === 4,
      COLLECTION_WAIT_FOR_TIMEOUT_MS,
      COLLECTION_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(changes[3]!.events[0]!.op).toBe('delete');
    expect(changes[3]!.lsn).toMatch(LSN_PATTERN);
    expect(collection.list()).toHaveLength(0);
    expect(changes[3]!.state).toBe(collection.list());

    // lsn is non-decreasing across sequential commits (compareLsn semantics, checked locally
    // rather than importing the library's own comparator).
    for (let i = 1; i < changes.length; i += 1) {
      expect(
        parseLsnForAssertions(changes[i]!.lsn) >= parseLsnForAssertions(changes[i - 1]!.lsn),
      ).toBe(true);
    }

    collection.dispose();
  });

  // Every event produced by one multi-row transaction must carry the same
  // commit lsn — asserted here against the real pgoutput pipeline, not just unit-mocked.
  test('a single-transaction multi-row insert delivers same-lsn changes', async () => {
    const client = createPulseClient(runtime);
    const collection = await client.ordersByStatus({ status: 'accepted' });

    const changes: Array<{ lsn: string }> = [];
    collection.onChange((c) => changes.push(c));

    await processDbOperations([
      db.insert(orders).values([
        { driverId: 1, pickup: 'TxA', dropoff: 'TxA', price: 10, status: 'accepted' },
        { driverId: 1, pickup: 'TxB', dropoff: 'TxB', price: 20, status: 'accepted' },
      ]),
    ]);

    await waitFor(
      () => collection.list().length === 2,
      COLLECTION_WAIT_FOR_TIMEOUT_MS,
      COLLECTION_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(changes.length).toBeGreaterThanOrEqual(2);

    for (const change of changes) {
      expect(change.lsn).toMatch(LSN_PATTERN);
    }
    expect(changes[0]!.lsn).toBe(changes[1]!.lsn);

    collection.dispose();
  });

  // onChange's unsubscribe function must actually detach — no further callbacks after calling it.
  test('onChange returns a working unsubscribe', async () => {
    const client = createPulseClient(runtime);
    const collection = await client.ordersByStatus({ status: 'accepted' });

    let callCount = 0;
    const unsubscribe = collection.onChange(() => {
      callCount += 1;
    });

    await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'U1', dropoff: 'U1', price: 10, status: 'accepted' }),
    ]);
    await waitFor(
      () => collection.list().length === 1,
      COLLECTION_WAIT_FOR_TIMEOUT_MS,
      COLLECTION_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(callCount).toBe(1);

    unsubscribe();

    await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'U2', dropoff: 'U2', price: 20, status: 'accepted' }),
    ]);
    await waitFor(
      () => collection.list().length === 2,
      COLLECTION_WAIT_FOR_TIMEOUT_MS,
      COLLECTION_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(callCount).toBe(1); // detached listener saw nothing further

    collection.dispose();
  });

  // The registry keeps a `.limit(2)` query definition precisely so this rejection
  // is exercised against a real runtime, not just unit-mocked.
  test('embedded collections reject .limit() queries at creation', async () => {
    const client = createPulseClient(runtime);
    await expect(client.ordersByStatusLimited({ status: 'accepted' })).rejects.toThrow(
      /\.limit\(\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// Lifecycle suite — separate registry/runtime so its runtime can be stopped in-test
// without tearing down the suite above.
// ---------------------------------------------------------------------------

describe('Embedded Collection lifecycle', () => {
  const lifecycleFixture = fullOrdersFixture;
  const { orders } = lifecycleFixture.tables;

  const ordersByStatusLC = pulse(orders)
    .args(lifecycleFixture.schemas.ordersByStatusArgs)
    .order('asc')
    .query((ctx) => ctx.query({ status: ctx.args.status }));
  const lcRegistry = createPulseRegistry({ ordersByStatusLC });

  let lcSuite: TestSuiteResult;
  let lcDb: PostgresJsDatabase;
  let lcRuntime!: RuntimeOf<typeof lcRegistry>;

  beforeAll(async () => {
    lcSuite = await setupTestSuiteForFixture(lifecycleFixture, lcRegistry);
    lcDb = lcSuite.db;
    lcRuntime = lcSuite.runtime;
  });

  afterAll(async () => {
    await lcSuite?.teardown();
  });

  beforeEach(async () => {
    await lcSuite?.cleanupBetweenTests();
    await insertTestUser(lcDb, `driver_${randomUUID().slice(0, 8)}`);
  });

  test('runtime.stop() disposes live collections and dispose() is idempotent', async () => {
    const client = createPulseClient(lcRuntime);
    const collection = await client.ordersByStatusLC({ status: 'accepted' });

    let firedAfterStop = false;
    collection.onChange(() => {
      firedAfterStop = true;
    });

    // runtime.stop() broadcasts onStop; each collection wires it to dispose(), which
    // synchronously unsubscribes from the WAL tap and tears down the merge core.
    await lcRuntime.stop();

    // dispose() must be idempotent — no throw on repeated calls
    expect(() => collection.dispose()).not.toThrow();
    expect(() => collection.dispose()).not.toThrow();

    // The tap subscription was detached by dispose(); no onChange fired during stop
    expect(firedAfterStop).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Exotic-type coverage: the WAL tap must deliver every pg data type in the same
// normalized JS shape a baseline SELECT produces. The raw pgoutput WAL arrives as
// text; the server normalizes it via the shape bridge (see server/wal-shape-bridge.ts)
// before the tap payload reaches the embedded client — this suite proves that
// normalization survives the tap-direct path end to end.
// ---------------------------------------------------------------------------

describe('Embedded Collection — PG Data Types (WAL normalization)', () => {
  let suite: TestSuiteResult;
  let db: PostgresJsDatabase;
  let runtime!: RuntimeOf<typeof registry>;
  let processDbOperations: HarnessProcessDbOperations;

  const fixture = pgDataTypesFixture;
  const { pgDataTypes } = fixture.tables;

  const allPgDataTypes = pulse(pgDataTypes).query(() => null);
  const registry = createPulseRegistry({ allPgDataTypes });

  beforeAll(async () => {
    suite = await setupTestSuiteForFixture(fixture, registry);
    db = suite.db;
    runtime = suite.runtime;
    processDbOperations = suite.processDbOperations;
  });

  afterAll(async () => {
    await suite?.teardown();
  });

  beforeEach(async () => {
    await suite?.cleanupBetweenTests();
  });

  test('push delta rows carry every pg data type in its normalized JS shape', async () => {
    const client = createPulseClient(runtime);
    const collection = await client.allPgDataTypes();
    expect(collection.list()).toEqual([]);

    await processDbOperations([db.insert(pgDataTypes).values(pgDataTypeInsertValues)]);

    await waitFor(
      () => collection.list().length === 1,
      COLLECTION_WAIT_FOR_TIMEOUT_MS,
      COLLECTION_WAIT_FOR_POLL_INTERVAL_MS,
    );

    expect(collection.list()).toEqual([expect.objectContaining({ ...pgDataTypeInsertValues })]);

    collection.dispose();
  });
});
