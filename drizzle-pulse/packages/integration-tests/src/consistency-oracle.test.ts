import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseClient as createHttpClient, PulseQuery } from 'drizzle-pulse/client';
import { createPulseClient as createEmbeddedClient } from 'drizzle-pulse/client/embedded';
import { createPulseRegistry } from 'drizzle-pulse/server';
import fc from 'fast-check';
import type { Hono } from 'hono';
import type postgres from 'postgres';
import { fullOrdersFixture, type HarnessOrderStatus } from './fixtures/full-orders/index.js';
import { makeOperationSequenceArb } from './helpers/order-ops-arbitrary.js';
import type { RuntimeOf, TestSuiteResult } from './helpers/test-harness.js';
import {
  createRouterFetchAdapter,
  insertTestUser,
  setupTestSuiteForFixture,
  waitFor,
  waitForEventsForFixture,
} from './helpers/test-harness.js';

// ---------------------------------------------------------------------------
// The LSN watermark handshake re-opens the mid-baseline exactly-once
// question the events-table snapshot cursor used to answer. This suite proves it
// two ways: Part A deterministically races insert/update/delete against collection
// creation; Part B runs 15 randomized operation sequences comparing THREE views of
// the same database — embedded list() (tap-direct), an HTTP PulseQuery pull (the
// wire protocol via the router fetch adapter), and a direct SQL SELECT — against
// the SAME registry/runtime.
// ---------------------------------------------------------------------------

const ORACLE_TEST_TIMEOUT_MS = 300_000;
// This suite's own default differs from waitFor()'s canonical 8000ms/50ms — pass it explicitly.
const ORACLE_WAIT_FOR_TIMEOUT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ComparableRow = { id: number; status: string; price: number; driverId: number | null };

function normalizeRow(row: Record<string, unknown>): ComparableRow {
  return {
    id: row.id as number,
    status: row.status as string,
    price: row.price as number,
    driverId: (row.driverId as number | null) ?? null,
  };
}

function sortById(rows: ComparableRow[]): ComparableRow[] {
  return [...rows].sort((a, b) => a.id - b.id);
}

describe('Consistency Oracle', () => {
  const fixture = fullOrdersFixture;
  const { orders } = fixture.tables;

  let suite: TestSuiteResult;
  let pool: ReturnType<typeof postgres>;
  let db: PostgresJsDatabase;
  let router: Hono;
  let runtime!: RuntimeOf<typeof registry>;

  // No `.limit()` — the oracle needs the full set on both sides so embedded `list()` and the
  // HTTP pull are directly comparable, and no `.args()` — one full-table view avoids the WHERE
  // filter itself becoming a variable this suite has to reason about.
  const oracleQuery = pulse(orders)
    .columns({ id: true, status: true, price: true, driverId: true })
    .order('asc')
    .query(() => null);
  const registry = createPulseRegistry({ oracleQuery });

  async function groundTruth(): Promise<ComparableRow[]> {
    const rows = await db
      .select({
        id: orders.id,
        status: orders.status,
        price: orders.price,
        driverId: orders.driverId,
      })
      .from(orders)
      .orderBy(orders.id);
    return sortById(rows.map(normalizeRow));
  }

  beforeAll(async () => {
    suite = await setupTestSuiteForFixture(fixture, registry);
    pool = suite.pool;
    db = suite.db;
    router = suite.router;
    runtime = suite.runtime;
  });

  afterAll(async () => {
    await suite?.teardown();
  });

  beforeEach(async () => {
    await suite?.cleanupBetweenTests();
    await insertTestUser(db, `oracle_driver_${randomUUID().slice(0, 8)}`);
  });

  // ---------------------------------------------------------------------------
  // Part A — mid-baseline concurrent writes (deterministic). Extends the existing
  // "concurrently-inserted row" race (embedded-collection.test.ts) to updates and
  // deletes of a pre-seeded row: the three cases of the exactly-once argument —
  // before-watermark, straddling, and after-select — each must resolve to exactly
  // the DB's true state, not a duplicate or a lost row.
  // ---------------------------------------------------------------------------

  describe('Part A — mid-baseline concurrent writes', () => {
    test('a concurrently-inserted row appears exactly once', async () => {
      await db
        .insert(orders)
        .values({ driverId: null, pickup: 'Pre', dropoff: 'Pre', price: 10, status: 'requested' });

      const client = createEmbeddedClient(runtime);
      const collectionPromise = client.oracleQuery();

      const [race] = await db
        .insert(orders)
        .values({ driverId: null, pickup: 'Race', dropoff: 'Race', price: 20, status: 'requested' })
        .returning({ id: orders.id });

      const collection = await collectionPromise;
      await waitFor(() => collection.list().length === 2, ORACLE_WAIT_FOR_TIMEOUT_MS);

      const truth = await groundTruth();
      expect(sortById(collection.list().map(normalizeRow))).toEqual(truth);
      expect(collection.list().map((r) => r.id)).toContain(race!.id);

      collection.dispose();
    });

    test('a concurrent update racing collection creation lands exactly once', async () => {
      const [seed] = await db
        .insert(orders)
        .values({ driverId: null, pickup: 'Seed', dropoff: 'Seed', price: 10, status: 'requested' })
        .returning({ id: orders.id });

      const client = createEmbeddedClient(runtime);
      const collectionPromise = client.oracleQuery();

      await db.update(orders).set({ price: 999 }).where(eq(orders.id, seed!.id));

      const collection = await collectionPromise;
      await waitFor(() => {
        const row = collection.list().find((r) => r.id === seed!.id);
        return row !== undefined && row.price === 999;
      }, ORACLE_WAIT_FOR_TIMEOUT_MS);

      const truth = await groundTruth();
      expect(truth).toHaveLength(1);
      expect(truth[0]!.price).toBe(999);
      expect(sortById(collection.list().map(normalizeRow))).toEqual(truth);

      collection.dispose();
    });

    test('a concurrent delete racing collection creation lands exactly once', async () => {
      const [seed] = await db
        .insert(orders)
        .values({ driverId: null, pickup: 'Seed', dropoff: 'Seed', price: 10, status: 'requested' })
        .returning({ id: orders.id });

      const client = createEmbeddedClient(runtime);
      const collectionPromise = client.oracleQuery();

      await db.delete(orders).where(eq(orders.id, seed!.id));

      const collection = await collectionPromise;
      await waitFor(() => collection.list().length === 0, ORACLE_WAIT_FOR_TIMEOUT_MS);

      const truth = await groundTruth();
      expect(truth).toHaveLength(0);
      expect(collection.list()).toHaveLength(0);

      collection.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // Part B — the 15/15 oracle (randomized). Each run drives a fresh randomized
  // operation sequence against a fresh embedded collection AND a fresh HTTP
  // PulseQuery over the SAME runtime/database, then asserts all three views
  // (embedded, HTTP, direct SQL) agree. A single failing run fails the suite.
  // ---------------------------------------------------------------------------

  const operationSequenceArb = makeOperationSequenceArb({ minLength: 6, maxLength: 12 });

  test(
    '15/15: embedded list() === HTTP pull === SQL ground truth under randomized concurrent churn',
    async () => {
      await fc.assert(
        fc.asyncProperty(operationSequenceArb, async (sequence) => {
          await suite?.cleanupBetweenTests();
          const seededUser = await insertTestUser(db, `oracle_run_${randomUUID().slice(0, 8)}`);

          // Race the embedded baseline against the whole operation sequence: the collection
          // factory is not awaited until every operation has been fired, so at least one
          // (usually all) commits land while the watermark/baseline handshake is in flight.
          const embeddedClient = createEmbeddedClient(runtime);
          const collectionPromise = embeddedClient.oracleQuery();

          const refToId = new Map<number, number>();
          const liveIds = new Set<number>();

          try {
            for (const op of sequence) {
              if (op.type === 'insert') {
                const [row] = await db
                  .insert(orders)
                  .values({
                    driverId: op.assignDriver ? seededUser.id : null,
                    pickup: `oracle-${op.ref}`,
                    dropoff: `oracle-${op.ref}`,
                    price: op.price,
                    status: op.status,
                  })
                  .returning({ id: orders.id });
                refToId.set(op.ref, row!.id);
                liveIds.add(row!.id);
                continue;
              }

              const targetId = refToId.get(op.ref);
              if (targetId === undefined) continue;

              if (op.type === 'update') {
                const payload: {
                  status?: HarnessOrderStatus;
                  price?: number;
                  driverId?: number | null;
                } = {};
                if (op.status !== undefined) payload.status = op.status;
                if (op.price !== undefined) payload.price = op.price;
                if (op.driverMode === 'set') payload.driverId = seededUser.id;
                if (op.driverMode === 'clear') payload.driverId = null;
                await db.update(orders).set(payload).where(eq(orders.id, targetId));
                continue;
              }

              await db.delete(orders).where(eq(orders.id, targetId));
              liveIds.delete(targetId);
              refToId.delete(op.ref);
            }

            const expectedCount = liveIds.size;

            // Drain the server's WAL listener fully before asserting or letting the next fc
            // run truncate the events table again: the runtime's events-table INSERT through
            // the store runs BEFORE the tap emits, so an in-flight persist for this run's tail
            // events can otherwise be lock-queued behind the next run's TRUNCATE, delaying that
            // event's tap delivery by an entire run and surfacing as a spurious embedded/HTTP
            // divergence.
            await waitForEventsForFixture(fixture, pool, 0, sequence.length, { timeoutMs: 20_000 });

            // Every commit is already durable at this point — the ground truth read here is
            // the actual correctness target. Row *count* alone is an insufficient convergence
            // signal for embedded/HTTP below: an update-only tail (count unchanged) can let a
            // premature length-only check pass before the tap has applied that update.
            const truth = await groundTruth();
            expect(truth).toHaveLength(expectedCount);
            const truthJson = JSON.stringify(truth);

            const collection = await collectionPromise;
            await waitFor(() => {
              return JSON.stringify(sortById(collection.list().map(normalizeRow))) === truthJson;
            }, 10_000);

            const fetchImpl = createRouterFetchAdapter(router);
            // pollIntervalMs: 0 disables PullClient's batched auto-poll interval — this test
            // drives poll() explicitly and must not leak a background timer past the assertions.
            const httpClient = createHttpClient<typeof registry.$client>({
              url: 'http://localhost',
              fetchImpl,
              pollIntervalMs: 0,
            });
            const httpQuery = new PulseQuery(httpClient.oracleQuery());
            // subscribe() reads the current DB state directly (same ordering guarantee as the
            // embedded baseline SELECT) — it should already match truth by construction, since
            // every write above is already committed. Re-poll defensively in case the initial
            // read raced an in-flight write anyway.
            await httpQuery.subscribe();
            const httpDeadline = Date.now() + 10_000;
            while (
              JSON.stringify(sortById(httpQuery.getState().data.map(normalizeRow))) !== truthJson &&
              Date.now() < httpDeadline
            ) {
              await sleep(50);
              await httpQuery.poll();
            }

            const embeddedNormalized = sortById(collection.list().map(normalizeRow));
            const httpNormalized = sortById(httpQuery.getState().data.map(normalizeRow));

            expect(embeddedNormalized).toEqual(truth);
            expect(httpNormalized).toEqual(truth);

            collection.dispose();
            httpQuery.destroy();
          } catch (err) {
            throw new Error(
              `Oracle divergence for sequence ${JSON.stringify(sequence)}: ${
                err instanceof Error ? err.message : String(err)
              }`,
              { cause: err },
            );
          }
        }),
        { numRuns: 15 },
      );
    },
    ORACLE_TEST_TIMEOUT_MS,
  );
});
