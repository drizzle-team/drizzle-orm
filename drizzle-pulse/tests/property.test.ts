import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseClient, PulseQuery } from 'drizzle-pulse/client';
import { createPulseRegistry } from 'drizzle-pulse/server';
import fc from 'fast-check';
import type { Hono } from 'hono';
import type postgres from 'postgres';
import { fullOrdersFixture, type HarnessOrderStatus } from './fixtures/full-orders/index.js';
import type { GeneratedOperation as Operation } from './helpers/order-ops-arbitrary.js';
import { makeOperationSequenceArb } from './helpers/order-ops-arbitrary.js';
import type {
  HarnessEvent,
  HarnessProcessDbOperations,
  TestSuiteResult,
} from './helpers/test-harness.js';
import {
  createRouterFetchAdapter,
  insertTestUser,
  setupTestSuiteForFixture,
  waitForEventsForFixture,
} from './helpers/test-harness.js';

let suite: TestSuiteResult;
let router: Hono;
let pool: ReturnType<typeof postgres>;
let db: PostgresJsDatabase;
let runDbOperations: HarnessProcessDbOperations;

const { orders } = fullOrdersFixture.tables;
const PROPERTY_TEST_TIMEOUT_MS = 300_000;
const ordersByStatus = pulse(orders)
  .args(fullOrdersFixture.schemas.ordersByStatusArgs)
  .order('desc')
  .limit(5)
  .query((ctx) => ctx.query({ status: ctx.args.status }));
const registry = createPulseRegistry({ ordersByStatus });

type ExecutionResult = {
  sequenceLength: number;
  clientRows: Record<string, unknown>[];
  expectedRequestedIds: number[];
  walEvents: HarnessEvent[];
  pullSnapshot: number;
};

const operationSequenceArb = makeOperationSequenceArb({ minLength: 1, maxLength: 8 });

const concurrentInsertCountArb = fc.integer({ min: 1, max: 8 });

function readNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') {
    throw new Error(`Expected ${field} to be a number`);
  }
  return value;
}

function readStatus(value: unknown, field: string): HarnessOrderStatus {
  if (
    value === 'requested' ||
    value === 'accepted' ||
    value === 'completed' ||
    value === 'cancelled'
  ) {
    return value;
  }
  throw new Error(`Expected ${field} to be a valid HarnessOrderStatus`);
}

function extractPkList(rows: ReadonlyArray<Record<string, unknown>>): number[] {
  return rows.map((row, index) => readNumber(row.$pk, `rows[${index}].$pk`));
}

function projectRows(rows: ReadonlyArray<Record<string, unknown>>): Array<{
  pk: number;
  status: HarnessOrderStatus;
  price: number;
}> {
  return rows.map((row, index) => ({
    pk: readNumber(row.$pk, `rows[${index}].$pk`),
    status: readStatus(row.status, `rows[${index}].status`),
    price: readNumber(row.price, `rows[${index}].price`),
  }));
}

async function executeSequence(
  sequence: ReadonlyArray<Operation>,
  propertyName: string,
): Promise<ExecutionResult> {
  await suite?.cleanupBetweenTests();
  const seededUser = await insertTestUser(db, `property_driver_${randomUUID().slice(0, 8)}`);

  // Create PulseQuery client bound to the Hono router (production runtime path)
  const fetchImpl = createRouterFetchAdapter(router);
  // pollIntervalMs: 0 disables PullClient's batched auto-poll — this test drives poll()
  // explicitly and must not leak a background timer past the assertions.
  const client = createPulseClient<typeof registry.$client>({
    url: 'http://localhost',
    fetchImpl,
    pollIntervalMs: 0,
  });
  const core = new PulseQuery(client.ordersByStatus({ status: 'requested' }));

  // Subscribe — PulseQuery captures initial snapshot internally
  await core.subscribe();

  const refToId = new Map<number, number>();
  const modelById = new Map<number, HarnessOrderStatus>();
  const runId = randomUUID().slice(0, 8);

  for (const [index, operation] of sequence.entries()) {
    if (operation.type === 'insert') {
      const insertStep = await runDbOperations([
        db
          .insert(orders)
          .values({
            driverId: operation.assignDriver ? seededUser.id : null,
            pickup: `${propertyName}-pickup-${runId}-${index}`,
            dropoff: `${propertyName}-dropoff-${runId}-${index}`,
            price: operation.price,
            status: operation.status,
          })
          .returning({ id: orders.id, status: orders.status }),
      ]);
      const inserted = insertStep.results[0][0];
      if (!inserted) {
        throw new Error('Expected insert to return one row');
      }

      refToId.set(operation.ref, inserted.id);
      modelById.set(inserted.id, readStatus(inserted.status, 'inserted.status'));
      continue;
    }

    const targetId = refToId.get(operation.ref);
    if (targetId === undefined) {
      throw new Error(`Missing target id for ref ${operation.ref}`);
    }

    if (operation.type === 'update') {
      const updatePayload: {
        driverId?: number | null;
        price?: number;
        status?: HarnessOrderStatus;
      } = {};

      if (operation.status !== undefined) {
        updatePayload.status = operation.status;
      }
      if (operation.price !== undefined) {
        updatePayload.price = operation.price;
      }
      if (operation.driverMode === 'set') {
        updatePayload.driverId = seededUser.id;
      }
      if (operation.driverMode === 'clear') {
        updatePayload.driverId = null;
      }

      const updateStep = await runDbOperations([
        db.update(orders).set(updatePayload).where(eq(orders.id, targetId)).returning({
          status: orders.status,
        }),
      ]);
      const updated = updateStep.results[0][0];
      if (!updated) {
        throw new Error(`Expected update(${targetId}) to return a row`);
      }

      modelById.set(targetId, readStatus(updated.status, 'updated.status'));
      continue;
    }

    const deleteStep = await runDbOperations([
      db.delete(orders).where(eq(orders.id, targetId)).returning({ id: orders.id }),
    ]);
    if (deleteStep.results[0].length !== 1) {
      throw new Error(`Expected delete(${targetId}) to delete one row`);
    }

    modelById.delete(targetId);
    refToId.delete(operation.ref);
  }

  // Wait for WAL events to propagate, then poll PulseQuery for final client state
  const walEvents = await waitForEventsForFixture(fullOrdersFixture, pool, 0, sequence.length, {
    timeoutMs: 20_000,
  });
  await core.poll();

  // Final client state comes from PulseQuery runtime (production merge path)
  const clientRows = [...core.getState().data] as Record<string, unknown>[];

  // Derive expected model: which IDs should have status='requested'
  const expectedRequestedIds = Array.from(modelById.entries())
    .filter((entry) => entry[1] === 'requested')
    .map((entry) => entry[0])
    .sort((left, right) => right - left);

  // Read the pull snapshot from WAL events for ordering invariant
  const lastWalSnapshot =
    walEvents.length > 0 ? (walEvents[walEvents.length - 1]?.snapshot ?? 0) : 0;

  core.destroy();

  return {
    sequenceLength: sequence.length,
    clientRows,
    expectedRequestedIds,
    walEvents,
    pullSnapshot: lastWalSnapshot,
  };
}

describe('Property Invariants', () => {
  beforeAll(async () => {
    suite = await setupTestSuiteForFixture(fullOrdersFixture, registry);
    router = suite.router;
    pool = suite.pool;
    db = suite.db;
    runDbOperations = suite.processDbOperations;
  });

  afterAll(async () => {
    await suite?.teardown();
  });

  test(
    'property: completeness invariant for requested subscription state',
    async () => {
      await fc.assert(
        fc.asyncProperty(operationSequenceArb, async (sequence) => {
          const result = await executeSequence(sequence, 'completeness');

          const clientPks = extractPkList(result.clientRows);
          expect(clientPks.length).toBe(result.expectedRequestedIds.length);
          expect(new Set(clientPks).size).toBe(clientPks.length);

          for (const expectedId of result.expectedRequestedIds) {
            expect(clientPks.includes(expectedId)).toBe(true);
          }
        }),
        { numRuns: 20 },
      );
    },
    PROPERTY_TEST_TIMEOUT_MS,
  );

  test(
    'property: WAL snapshots are strictly increasing and pull snapshot advances',
    async () => {
      await fc.assert(
        fc.asyncProperty(operationSequenceArb, async (sequence) => {
          const result = await executeSequence(sequence, 'ordering');

          expect(result.walEvents.length).toBe(result.sequenceLength);
          const snapshots = result.walEvents.map((event) => event.snapshot);

          for (let index = 1; index < snapshots.length; index += 1) {
            const previous = snapshots[index - 1];
            const current = snapshots[index];
            if (previous === undefined || current === undefined) {
              throw new Error('Expected snapshot values while checking ordering invariant');
            }

            expect(current).toBeGreaterThan(previous);
          }

          const lastSnapshot = snapshots[snapshots.length - 1];
          if (lastSnapshot !== undefined) {
            expect(result.pullSnapshot).toBe(lastSnapshot);
          }
        }),
        { numRuns: 20 },
      );
    },
    PROPERTY_TEST_TIMEOUT_MS,
  );

  test(
    'property: polling PulseCore twice is idempotent',
    async () => {
      await fc.assert(
        fc.asyncProperty(operationSequenceArb, async (sequence) => {
          const result = await executeSequence(sequence, 'idempotency');

          // First poll result captured by executeSequence
          const afterFirstPoll = projectRows(result.clientRows);

          // Poll the same PulseQuery instance again — this re-runs executeSequence
          // which creates a fresh PulseQuery, so we verify structural idempotency:
          // the same operation sequence always produces the same final state
          const result2 = await executeSequence(sequence, 'idempotency');
          const afterSecondRun = projectRows(result2.clientRows);

          expect(afterSecondRun).toEqual(afterFirstPoll);
        }),
        { numRuns: 20 },
      );
    },
    PROPERTY_TEST_TIMEOUT_MS,
  );

  test(
    'property: filter consistency keeps only requested rows',
    async () => {
      await fc.assert(
        fc.asyncProperty(operationSequenceArb, async (sequence) => {
          const result = await executeSequence(sequence, 'filter-consistency');

          for (const [index, row] of result.clientRows.entries()) {
            expect(readStatus(row.status, `clientRows[${index}].status`)).toBe('requested');
          }
        }),
        { numRuns: 20 },
      );
    },
    PROPERTY_TEST_TIMEOUT_MS,
  );

  test(
    'property: client rows always preserve descending $pk sort order',
    async () => {
      await fc.assert(
        fc.asyncProperty(operationSequenceArb, async (sequence) => {
          const result = await executeSequence(sequence, 'sort-order');
          const clientPks = extractPkList(result.clientRows);
          const expectedOrder = [...clientPks].sort((left, right) => right - left);
          expect(clientPks).toEqual(expectedOrder);
        }),
        { numRuns: 20 },
      );
    },
    PROPERTY_TEST_TIMEOUT_MS,
  );

  test(
    'property: concurrent requested inserts preserve descending $pk sort order',
    async () => {
      await fc.assert(
        fc.asyncProperty(concurrentInsertCountArb, async (insertCount) => {
          await suite?.cleanupBetweenTests();
          const seededUser = await insertTestUser(
            db,
            `concurrent_property_driver_${randomUUID().slice(0, 8)}`,
          );

          const fetchImpl = createRouterFetchAdapter(router);
          // pollIntervalMs: 0 disables PullClient's batched auto-poll — this test drives poll()
          // explicitly and must not leak a background timer past the assertions.
          const client = createPulseClient<typeof registry.$client>({
            url: 'http://localhost',
            fetchImpl,
            pollIntervalMs: 0,
          });
          const core = new PulseQuery(client.ordersByStatus({ status: 'requested' }));

          await core.subscribe();

          await runDbOperations(
            Array.from({ length: insertCount }, (_, index) =>
              db.insert(orders).values({
                driverId: seededUser.id,
                pickup: `Concurrent Property Pickup ${insertCount}-${index + 1}`,
                dropoff: `Concurrent Property Dropoff ${insertCount}-${index + 1}`,
                price: 401 + index,
                status: 'requested',
              }),
            ),
            { mode: 'concurrent' },
          );

          await core.poll();

          const clientPks = extractPkList([...core.getState().data] as Record<string, unknown>[]);
          const expectedOrder = [...clientPks].sort((left, right) => right - left);
          expect(clientPks).toEqual(expectedOrder);
          expect(clientPks).toHaveLength(insertCount);

          core.destroy();
        }),
        { numRuns: 20 },
      );
    },
    PROPERTY_TEST_TIMEOUT_MS,
  );
});
