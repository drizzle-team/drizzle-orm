import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseEvents } from 'drizzle-pulse/client/embedded';
import { createPulseRegistry } from 'drizzle-pulse/server';
import { fullOrdersFixture } from './fixtures/full-orders/index.js';
import type {
  HarnessProcessDbOperations,
  RuntimeOf,
  TestSuiteResult,
} from './helpers/test-harness.js';
import { insertTestUser, setupTestSuiteForFixture, waitFor } from './helpers/test-harness.js';

// This suite's own defaults differ from waitFor()'s canonical 8000ms/50ms — pass them explicitly.
const EVENTS_WAIT_FOR_TIMEOUT_MS = 2000;
const EVENTS_WAIT_FOR_POLL_INTERVAL_MS = 20;

const LSN_PATTERN = /^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/;

function parseLsnForAssertions(lsn: string): bigint {
  const [hi, lo] = lsn.split('/');
  return (BigInt(`0x${hi}`) << 32n) | BigInt(`0x${lo}`);
}

// ---------------------------------------------------------------------------
// createPulseEvents: stateless, per-event WAL subscription — typed,
// WHERE-filtered insert/update/delete callbacks in commit order, no baseline, no
// merge core, no materialized state anywhere in this suite's assertions.
// ---------------------------------------------------------------------------

describe('createPulseEvents', () => {
  const fixture = fullOrdersFixture;
  const { orders } = fixture.tables;

  let suite: TestSuiteResult;
  let db: PostgresJsDatabase;
  let runtime!: RuntimeOf<typeof registry>;
  let processDbOperations: HarnessProcessDbOperations;

  const ordersByStatus = pulse(orders)
    .args(fixture.schemas.ordersByStatusArgs)
    .order('asc')
    .query((ctx) => ctx.query({ status: ctx.args.status }));
  // Kept solely to prove the synchronous rejections below.
  const ordersByStatusLimited = pulse(orders)
    .args(fixture.schemas.ordersByStatusArgs)
    .order('asc')
    .limit(2)
    .query((ctx) => ctx.query({ status: ctx.args.status }));
  const ordersByStatusTransformed = pulse(orders)
    .args(fixture.schemas.ordersByStatusArgs)
    .query((ctx) => ctx.query({ status: ctx.args.status }))
    .transform((rows) => rows.map((row) => ({ id: row.id })));
  const registry = createPulseRegistry({
    ordersByStatus,
    ordersByStatusLimited,
    ordersByStatusTransformed,
  });

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

  test('delivers typed insert/update/delete events with query-keyed rows', async () => {
    const events = createPulseEvents(runtime);
    const log: Array<{ event: any; lsn: string }> = [];
    const unsub = events.ordersByStatus({ status: 'accepted' }, (event, lsn) => {
      log.push({ event, lsn });
    });

    // INSERT (matching)
    const { results: r1 } = await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'Ins', dropoff: 'Ins', price: 30, status: 'accepted' })
        .returning(),
    ]);
    const [inserted] = r1[0] as Array<{ id: number }>;

    await waitFor(
      () => log.length === 1,
      EVENTS_WAIT_FOR_TIMEOUT_MS,
      EVENTS_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(log[0]!.event.op).toBe('insert');
    expect(log[0]!.event.row.id).toBe(inserted!.id);
    expect(log[0]!.event.pk).toBe(inserted!.id);
    expect(log[0]!.lsn).toMatch(LSN_PATTERN);

    // UPDATE out of filter (accepted -> completed): matchesNew=false
    await processDbOperations([
      db.update(orders).set({ status: 'completed' }).where(eq(orders.id, inserted!.id)),
    ]);
    await waitFor(
      () => log.length === 2,
      EVENTS_WAIT_FOR_TIMEOUT_MS,
      EVENTS_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(log[1]!.event.op).toBe('update');
    expect(log[1]!.event.matchesNew).toBe(false);
    expect(log[1]!.event.old_row.id).toBe(inserted!.id);

    // A second matching row, then delete it.
    const { results: r2 } = await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'Del', dropoff: 'Del', price: 40, status: 'accepted' })
        .returning(),
    ]);
    const [toDelete] = r2[0] as Array<{ id: number }>;
    await waitFor(
      () => log.length === 3,
      EVENTS_WAIT_FOR_TIMEOUT_MS,
      EVENTS_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(log[2]!.event.op).toBe('insert');

    await processDbOperations([db.delete(orders).where(eq(orders.id, toDelete!.id))]);
    await waitFor(
      () => log.length === 4,
      EVENTS_WAIT_FOR_TIMEOUT_MS,
      EVENTS_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(log[3]!.event.op).toBe('delete');
    expect(log[3]!.event.pk).toBe(toDelete!.id);

    unsub();
  });

  test('commit order + lsn: sequential commits arrive in order, non-decreasing lsn, shared lsn per transaction', async () => {
    const events = createPulseEvents(runtime);
    const log: Array<{ op: string; lsn: string }> = [];
    const unsub = events.ordersByStatus({ status: 'accepted' }, (event, lsn) => {
      log.push({ op: event.op, lsn });
    });

    await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'C1', dropoff: 'C1', price: 10, status: 'accepted' }),
    ]);
    await waitFor(
      () => log.length === 1,
      EVENTS_WAIT_FOR_TIMEOUT_MS,
      EVENTS_WAIT_FOR_POLL_INTERVAL_MS,
    );

    await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'C2', dropoff: 'C2', price: 20, status: 'accepted' }),
    ]);
    await waitFor(
      () => log.length === 2,
      EVENTS_WAIT_FOR_TIMEOUT_MS,
      EVENTS_WAIT_FOR_POLL_INTERVAL_MS,
    );

    // Multi-row single transaction: both events share one lsn.
    await processDbOperations([
      db.insert(orders).values([
        { driverId: 1, pickup: 'TxA', dropoff: 'TxA', price: 30, status: 'accepted' },
        { driverId: 1, pickup: 'TxB', dropoff: 'TxB', price: 40, status: 'accepted' },
      ]),
    ]);
    await waitFor(
      () => log.length === 4,
      EVENTS_WAIT_FOR_TIMEOUT_MS,
      EVENTS_WAIT_FOR_POLL_INTERVAL_MS,
    );

    expect(log.map((e) => e.op)).toEqual(['insert', 'insert', 'insert', 'insert']);
    for (const entry of log) {
      expect(entry.lsn).toMatch(LSN_PATTERN);
    }
    for (let i = 1; i < log.length; i += 1) {
      expect(parseLsnForAssertions(log[i]!.lsn) >= parseLsnForAssertions(log[i - 1]!.lsn)).toBe(
        true,
      );
    }
    expect(log[2]!.lsn).toBe(log[3]!.lsn);

    unsub();
  });

  test('no baseline: pre-existing rows produce no callback, only new matching inserts do', async () => {
    await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'Pre', dropoff: 'Pre', price: 10, status: 'accepted' }),
    ]);

    const events = createPulseEvents(runtime);
    const log: Array<{ op: string }> = [];
    const unsub = events.ordersByStatus({ status: 'accepted' }, (event) => {
      log.push({ op: event.op });
    });

    await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'New', dropoff: 'New', price: 20, status: 'accepted' }),
    ]);
    await waitFor(
      () => log.length === 1,
      EVENTS_WAIT_FOR_TIMEOUT_MS,
      EVENTS_WAIT_FOR_POLL_INTERVAL_MS,
    );
    expect(log).toEqual([{ op: 'insert' }]);

    unsub();
  });

  test('WHERE filtering: a non-matching insert produces no callback', async () => {
    const events = createPulseEvents(runtime);
    const log: Array<{ op: string }> = [];
    const unsub = events.ordersByStatus({ status: 'accepted' }, (event) => {
      log.push({ op: event.op });
    });

    await processDbOperations([
      db.insert(orders).values({
        driverId: 1,
        pickup: 'NoMatch',
        dropoff: 'NoMatch',
        price: 10,
        status: 'requested',
      }),
    ]);

    // Give the tap a brief window to (incorrectly) deliver, then assert nothing arrived.
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    expect(log).toEqual([]);

    unsub();
  });

  test('unsubscribe stops delivery', async () => {
    const events = createPulseEvents(runtime);
    let callCount = 0;
    const unsub = events.ordersByStatus({ status: 'accepted' }, () => {
      callCount += 1;
    });

    await processDbOperations([
      db.insert(orders).values({
        driverId: 1,
        pickup: 'Before',
        dropoff: 'Before',
        price: 10,
        status: 'accepted',
      }),
    ]);
    await waitFor(
      () => callCount === 1,
      EVENTS_WAIT_FOR_TIMEOUT_MS,
      EVENTS_WAIT_FOR_POLL_INTERVAL_MS,
    );

    unsub();

    await processDbOperations([
      db
        .insert(orders)
        .values({ driverId: 1, pickup: 'After', dropoff: 'After', price: 20, status: 'accepted' }),
    ]);
    // Give the tap a brief window, then assert the unsubscribed callback saw nothing further.
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    expect(callCount).toBe(1);
  });

  test('the .limit() and .transform() queries throw synchronously at subscription creation', () => {
    const events = createPulseEvents(runtime);
    expect(() => events.ordersByStatusLimited({ status: 'accepted' }, () => {})).toThrow(
      /\.limit\(\)/,
    );
    expect(() => events.ordersByStatusTransformed({ status: 'accepted' }, () => {})).toThrow(
      /\.transform\(\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// Lifecycle suite — separate registry/runtime so runtime.stop() can be exercised
// in-test without tearing down the suites above.
// ---------------------------------------------------------------------------

describe('createPulseEvents lifecycle', () => {
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

  test('runtime.stop() tears down subscriptions without error', async () => {
    const events = createPulseEvents(lcRuntime);
    let firedAfterStop = false;
    events.ordersByStatusLC({ status: 'accepted' }, () => {
      firedAfterStop = true;
    });

    await expect(lcRuntime.stop()).resolves.toBeUndefined();

    expect(firedAfterStop).toBe(false);
  });
});
