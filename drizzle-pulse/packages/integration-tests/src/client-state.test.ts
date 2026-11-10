import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseClient } from 'drizzle-pulse/client';
import { createPulseRegistry } from 'drizzle-pulse/server';
import { fullOrdersFixture } from './fixtures/full-orders/index.js';
import { minimalOrdersFixture } from './fixtures/minimal-orders/index.js';
import { pgDataTypesFixture } from './fixtures/pg-data-types/index.js';
import { pgDataTypeInsertValues } from './fixtures/pg-data-types/inventory.js';
import type {
  HarnessInitTestQuery,
  HarnessProcessDbOperations,
  TestSuiteResult,
} from './helpers/test-harness.js';
import { insertTestUser, setupTestSuiteForFixture } from './helpers/test-harness.js';

describe('Client State', () => {
  describe('Full-Orders Fixture', () => {
    let suite: TestSuiteResult;
    let db: PostgresJsDatabase;
    let processDbOperations: HarnessProcessDbOperations;
    let initTestQuery: HarnessInitTestQuery;

    const fixture = fullOrdersFixture;
    const { orders } = fixture.tables;
    const ordersByStatus = pulse(orders)
      .args(fixture.schemas.ordersByStatusArgs)
      .order('desc')
      .limit(5)
      .query((ctx) => ctx.query({ status: ctx.args.status }));
    const unlimitedOrdersByStatus = pulse(orders)
      .args(fixture.schemas.ordersByStatusArgs)
      .order('desc')
      .query((ctx) => ctx.query({ status: ctx.args.status }));
    const registry = createPulseRegistry({ ordersByStatus, unlimitedOrdersByStatus });
    const client = createPulseClient<typeof registry.$client>({ url: 'http://localhost' });

    beforeAll(async () => {
      suite = await setupTestSuiteForFixture(fixture, registry);
      db = suite.db;
      processDbOperations = suite.processDbOperations;
      initTestQuery = suite.initTestQuery;
    });

    afterAll(async () => {
      await suite?.teardown();
    });

    beforeEach(async () => {
      await suite?.cleanupBetweenTests();
      await insertTestUser(db, `driver_${randomUUID().slice(0, 8)}`);
    });

    const buildRequestedOrder = (label: string, price: number) => ({
      driverId: 1,
      pickup: `${label} Pickup`,
      dropoff: `${label} Dropoff`,
      price,
      status: 'requested' as const,
    });

    test('matching insert: fresh subscribe returns one row', async () => {
      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));

      await processDbOperations([
        db.insert(orders).values({
          driverId: 1,
          pickup: 'Base Matching Pickup',
          dropoff: 'Base Matching Dropoff',
          price: 50,
          status: 'requested',
        }),
      ]);

      await query.poll();

      expect(query.getState().data).toEqual([
        expect.objectContaining({
          price: 50,
          status: 'requested',
        }),
      ]);
    });

    test('non-matching insert: fresh subscribe filters out completed status', async () => {
      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));

      expect(query.getState().data).toEqual([]);

      await processDbOperations([
        db.insert(orders).values({
          driverId: 1,
          pickup: 'Non-Matching Pickup',
          dropoff: 'Non-Matching Dropoff',
          price: 60,
          status: 'completed',
        }),
      ]);

      await query.poll();

      expect(query.getState().data).toEqual([]);
    });

    test('insert then update: row transitions and final state matches', async () => {
      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));

      const insertStep = await processDbOperations([
        db
          .insert(orders)
          .values({
            driverId: 1,
            pickup: 'Insert Then Update Pickup',
            dropoff: 'Insert Then Update Dropoff',
            price: 75,
            status: 'requested',
          })
          .returning({ id: orders.id }),
      ]);
      expect(insertStep.results[0]).toHaveLength(1);
      const insertedId = insertStep.results[0][0]!.id;

      await query.poll();
      expect(query.getState().data).toHaveLength(1);

      await processDbOperations([
        db.update(orders).set({ price: 85 }).where(eq(orders.id, insertedId)),
      ]);

      await query.poll();

      expect(query.getState().data).toEqual([
        expect.objectContaining({ price: 85, status: 'requested' }),
      ]);
    });

    test('insert then delete: row is removed and final state is empty', async () => {
      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));

      const insertStep = await processDbOperations([
        db
          .insert(orders)
          .values({
            driverId: 1,
            pickup: 'Insert Then Delete Pickup',
            dropoff: 'Insert Then Delete Dropoff',
            price: 90,
            status: 'requested',
          })
          .returning({ id: orders.id }),
      ]);
      expect(insertStep.results[0]).toHaveLength(1);
      const insertedId = insertStep.results[0][0]!.id;

      await query.poll();
      expect(query.getState().data).toHaveLength(1);

      await processDbOperations([db.delete(orders).where(eq(orders.id, insertedId))]);

      await query.poll();

      expect(query.getState().data).toEqual([]);
    });

    test('transition out of filter: requested→accepted removes row', async () => {
      const seedStep = await processDbOperations([
        db
          .insert(orders)
          .values({
            driverId: 1,
            pickup: 'Transition Out Pickup',
            dropoff: 'Transition Out Dropoff',
            price: 110,
            status: 'requested',
          })
          .returning({ id: orders.id }),
      ]);
      expect(seedStep.results[0]).toHaveLength(1);
      const seededId = seedStep.results[0][0]!.id;

      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));
      expect(query.getState().data).toHaveLength(1);

      await processDbOperations([
        db.update(orders).set({ status: 'accepted' }).where(eq(orders.id, seededId)),
      ]);

      await query.poll();

      expect(query.getState().data).toEqual([]);
    });

    test('transition into filter: completed→requested adds row', async () => {
      const seedStep = await processDbOperations([
        db
          .insert(orders)
          .values({
            driverId: 1,
            pickup: 'Transition In Pickup',
            dropoff: 'Transition In Dropoff',
            price: 120,
            status: 'completed',
          })
          .returning({ id: orders.id }),
      ]);
      expect(seedStep.results[0]).toHaveLength(1);
      const seededId = seedStep.results[0][0]!.id;

      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));
      expect(query.getState().data).toEqual([]);

      await processDbOperations([
        db.update(orders).set({ status: 'requested' }).where(eq(orders.id, seededId)),
      ]);

      await query.poll();

      expect(query.getState().data).toEqual([
        expect.objectContaining({ price: 120, status: 'requested' }),
      ]);
    });

    test('descending PK ordering: inserts preserve desc-pk order', async () => {
      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));

      expect(query.getState().data).toEqual([]);

      await processDbOperations([
        db.insert(orders).values({
          driverId: 1,
          pickup: 'Ordering 1 Pickup',
          dropoff: 'Ordering 1 Dropoff',
          price: 10,
          status: 'requested',
        }),
        db.insert(orders).values({
          driverId: 1,
          pickup: 'Ordering 2 Pickup',
          dropoff: 'Ordering 2 Dropoff',
          price: 11,
          status: 'requested',
        }),
        db.insert(orders).values({
          driverId: 1,
          pickup: 'Ordering 3 Pickup',
          dropoff: 'Ordering 3 Dropoff',
          price: 12,
          status: 'requested',
        }),
      ]);

      await query.poll();

      expect(query.getState().data.map((row) => row.price)).toEqual([12, 11, 10]);
    });

    test('initial subscribe respects limit and reports hasMore for descending queries', async () => {
      await processDbOperations(
        Array.from({ length: 6 }, (_, index) =>
          db.insert(orders).values(buildRequestedOrder(`Limited ${index + 1}`, 10 + index)),
        ),
      );

      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));

      expect(query.getState().data.map((row) => row.price)).toEqual([15, 14, 13, 12, 11]);
      expect(query.getState().hasMore).toBe(true);
    });

    test('poll prepends new leading-edge rows without trimming the visible descending page', async () => {
      await processDbOperations(
        Array.from({ length: 5 }, (_, index) =>
          db.insert(orders).values(buildRequestedOrder(`Window ${index + 1}`, 20 + index)),
        ),
      );

      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));
      expect(query.getState().data.map((row) => row.price)).toEqual([24, 23, 22, 21, 20]);

      await processDbOperations([
        db.insert(orders).values(buildRequestedOrder('Leading Edge', 99)),
      ]);

      await query.poll();

      expect(query.getState().data.map((row) => row.price)).toEqual([99, 24, 23, 22, 21, 20]);
      // Exactly `limit` rows existed at subscribe with nothing beyond them, and the
      // leading-edge insert adds no rows *below* the window — so there is no more to load.
      expect(query.getState().hasMore).toBe(false);
    });

    test('loadMore appends older rows after pulse inserts without duplicating visible rows', async () => {
      await processDbOperations(
        Array.from({ length: 8 }, (_, index) =>
          db.insert(orders).values(buildRequestedOrder(`Paged ${index + 1}`, 30 + index)),
        ),
      );

      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));
      expect(query.getState().data.map((row) => row.price)).toEqual([37, 36, 35, 34, 33]);
      expect(query.getState().hasMore).toBe(true);

      await processDbOperations([
        db.insert(orders).values(buildRequestedOrder('Pulse Before Load More', 99.5)),
      ]);

      await query.poll();
      expect(query.getState().data.map((row) => row.price)).toEqual([99.5, 37, 36, 35, 34, 33]);

      await query.loadMore();

      expect(query.getState().data.map((row) => row.price)).toEqual([
        99.5, 37, 36, 35, 34, 33, 32, 31, 30,
      ]);
      expect(query.getState().hasMore).toBe(false);
      expect(query.getState().isLoadingMore).toBe(false);
    });

    test('unlimited queries accept append-side inserts during poll', async () => {
      const unlimitedQuery = await initTestQuery(
        client.unlimitedOrdersByStatus({ status: 'requested' }),
      );

      await processDbOperations(
        Array.from({ length: 2 }, (_, index) =>
          db.insert(orders).values(buildRequestedOrder(`Unlimited ${index + 1}`, 200 + index)),
        ),
      );

      await unlimitedQuery.poll();
      expect(unlimitedQuery.getState().data.map((row) => row.price)).toEqual([201, 200]);

      const newestId = unlimitedQuery
        .getState()
        .data.map((row) => row.$pk)
        .filter((pk): pk is number => typeof pk === 'number')
        .reduce((max, current) => (current > max ? current : max));

      await processDbOperations([
        db.insert(orders).values({
          ...buildRequestedOrder('Unlimited Append-Side', 199),
          id: newestId + 1,
        }),
      ]);

      await unlimitedQuery.poll();

      expect(unlimitedQuery.getState().data.map((row) => row.price)).toEqual([199, 201, 200]);
    });

    test('poll reset re-subscribes from a snapshot baseline and continues processing later events', async () => {
      await processDbOperations([
        db.insert(orders).values(buildRequestedOrder('Before Reset', 70)),
      ]);

      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));
      expect(query.getState().data.map((row) => row.price)).toEqual([70]);

      await processDbOperations([
        db.insert(orders).values(buildRequestedOrder('Visible After Reset', 71)),
      ]);

      await db.execute(
        sql`INSERT INTO drizzle_pulse.public_orders (id, "$op") OVERRIDING SYSTEM VALUE VALUES (2, 'snapshot')`,
      );
      await db.execute(
        sql`SELECT setval(pg_get_serial_sequence('drizzle_pulse.public_orders', '$snapshot'), 999, true)`,
      );

      await query.poll();

      expect(query.getState().data.map((row) => row.price)).toEqual([71, 70]);
      expect(query.getState().error).toBe(null);

      await processDbOperations([
        db.insert(orders).values(buildRequestedOrder('After Reset Poll', 72)),
      ]);

      await query.poll();

      expect(query.getState().data.map((row) => row.price)).toEqual([72, 71, 70]);
    });

    test('reset after loadMore preserves expanded descending window', async () => {
      await processDbOperations(
        Array.from({ length: 8 }, (_, index) =>
          db.insert(orders).values(buildRequestedOrder(`Reset Window ${index + 1}`, 30 + index)),
        ),
      );

      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));
      expect(query.getState().data.map((row) => row.price)).toEqual([37, 36, 35, 34, 33]);

      await query.loadMore();
      expect(query.getState().data.map((row) => row.price)).toEqual([
        37, 36, 35, 34, 33, 32, 31, 30,
      ]);

      await processDbOperations([
        db.insert(orders).values(buildRequestedOrder('Reset Visible After Load More', 38)),
      ]);

      await db.execute(
        sql`INSERT INTO drizzle_pulse.public_orders (id, "$op") OVERRIDING SYSTEM VALUE VALUES (9, 'snapshot')`,
      );
      await db.execute(
        sql`SELECT setval(pg_get_serial_sequence('drizzle_pulse.public_orders', '$snapshot'), 999, true)`,
      );

      await query.poll();

      expect(query.getState().data.map((row) => row.price)).toEqual([
        38, 37, 36, 35, 34, 33, 32, 31, 30,
      ]);
      expect(query.getState().hasMore).toBe(false);
      expect(query.getState().error).toBe(null);
    });

    test('multiple deletes on same row result in empty final state', async () => {
      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));

      expect(query.getState().data).toEqual([]);

      const insertStep = await processDbOperations([
        db
          .insert(orders)
          .values({
            driverId: 1,
            pickup: 'Idempotent Delete Pickup',
            dropoff: 'Idempotent Delete Dropoff',
            price: 200,
            status: 'requested',
          })
          .returning({ id: orders.id }),
      ]);
      expect(insertStep.results[0]).toHaveLength(1);
      const insertedId = insertStep.results[0][0]!.id;

      await query.poll();
      expect(query.getState().data).toHaveLength(1);

      await processDbOperations([db.delete(orders).where(eq(orders.id, insertedId))]);

      await query.poll();
      expect(query.getState().data).toEqual([]);
    });
  });

  describe('Minimal-Orders Fixture', () => {
    let suite: TestSuiteResult;
    let db: PostgresJsDatabase;
    let processDbOperations: HarnessProcessDbOperations;
    let initTestQuery: HarnessInitTestQuery;

    const fixture = minimalOrdersFixture;
    const { orders } = fixture.tables;
    const ordersByStatus = pulse(orders)
      .args(fixture.schemas.ordersByStatusArgs)
      .order('desc')
      .limit(5)
      .query((ctx) => ctx.query({ status: ctx.args.status }));
    const registry = createPulseRegistry({ ordersByStatus });
    const client = createPulseClient<typeof registry.$client>({ url: 'http://localhost' });

    beforeAll(async () => {
      suite = await setupTestSuiteForFixture(fixture, registry);
      db = suite.db;
      processDbOperations = suite.processDbOperations;
      initTestQuery = suite.initTestQuery;
    });

    afterAll(async () => {
      await suite?.teardown();
    });

    beforeEach(async () => {
      await suite?.cleanupBetweenTests();
    });

    test('null driverId insert: minimal schema allows null FK', async () => {
      const insertStep = await processDbOperations([
        db
          .insert(orders)
          .values({
            driverId: null,
            price: 30,
            status: 'requested',
          })
          .returning({ id: orders.id }),
      ]);
      expect(insertStep.results[0]).toHaveLength(1);

      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));

      expect(query.getState().data).toEqual([
        expect.objectContaining({ price: 30, status: 'requested', driverId: null }),
      ]);
    });

    test('null driverId insert then update: null persists across transitions', async () => {
      const insertStep = await processDbOperations([
        db
          .insert(orders)
          .values({
            price: 35,
            status: 'requested',
          })
          .returning({ id: orders.id }),
      ]);
      expect(insertStep.results[0]).toHaveLength(1);
      const insertedId = insertStep.results[0][0]!.id;

      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));
      expect(query.getState().data).toHaveLength(1);

      await processDbOperations([
        db.update(orders).set({ price: 40 }).where(eq(orders.id, insertedId)),
      ]);

      await query.poll();

      expect(query.getState().data).toEqual([
        expect.objectContaining({ price: 40, status: 'requested', driverId: null }),
      ]);
    });

    test('update of non-filter column replaces the row and preserves camelCase columns', async () => {
      // Regression: the HTTP incremental-pull path must key the new-value row by SQL
      // column name. driverId/createdAt have JS names != SQL names (driver_id/created_at);
      // a mis-keyed new row silently drops them and the merge appends a duplicate instead
      // of replacing in place.
      const insertStep = await processDbOperations([
        db
          .insert(orders)
          .values({ driverId: 7, price: 35, status: 'requested' })
          .returning({ id: orders.id }),
      ]);
      const insertedId = insertStep.results[0][0]!.id;

      const query = await initTestQuery(client.ordersByStatus({ status: 'requested' }));
      expect(query.getState().data).toHaveLength(1);

      await processDbOperations([
        db.update(orders).set({ price: 40 }).where(eq(orders.id, insertedId)),
      ]);
      await query.poll();

      const data = query.getState().data;
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        id: insertedId,
        price: 40,
        status: 'requested',
        driverId: 7,
      });
      expect(data[0]!.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('PG Data Types Fixture', () => {
    let suite: TestSuiteResult;
    let db: PostgresJsDatabase;
    let processDbOperations: HarnessProcessDbOperations;
    let initTestQuery: HarnessInitTestQuery;

    const fixture = pgDataTypesFixture;
    const { pgDataTypes } = fixture.tables;
    const allPgDataTypesWithEvents = pulse(pgDataTypes).query(() => null);
    const registry = createPulseRegistry({ allPgDataTypes: allPgDataTypesWithEvents });

    beforeAll(async () => {
      suite = await setupTestSuiteForFixture(fixture, registry);
      db = suite.db;
      processDbOperations = suite.processDbOperations;
      initTestQuery = suite.initTestQuery;
    });

    afterAll(async () => {
      await suite?.teardown();
    });

    beforeEach(async () => {
      await suite?.cleanupBetweenTests();
    });

    test('subscribe returns every pg data type with runtime-normalized client state', async () => {
      await processDbOperations([db.insert(pgDataTypes).values(pgDataTypeInsertValues)]);

      const pgDataTypesClient = createPulseClient<typeof registry.$client>({
        url: 'http://localhost',
      });
      const query = await initTestQuery(pgDataTypesClient.allPgDataTypes());

      expect(query.getState().data).toEqual([
        expect.objectContaining({ ...pgDataTypeInsertValues }),
      ]);
    });

    test('pull returns every pg data type with runtime-normalized client state', async () => {
      const pgDataTypesClient = createPulseClient<typeof registry.$client>({
        url: 'http://localhost',
      });
      const query = await initTestQuery(pgDataTypesClient.allPgDataTypes());
      expect(query.getState().data).toEqual([]);

      await processDbOperations([db.insert(pgDataTypes).values(pgDataTypeInsertValues)]);

      await query.poll();

      expect(query.getState().data).toEqual([
        expect.objectContaining({ ...pgDataTypeInsertValues }),
      ]);
    });
  });
});
