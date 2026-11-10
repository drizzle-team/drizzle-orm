import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseRegistry } from 'drizzle-pulse/server';
import type { Hono } from 'hono';
import type postgres from 'postgres';
import SuperJSON from 'superjson';
import { fullOrdersFixture } from './fixtures/full-orders/index.js';
import type {
  HarnessProcessDbOperations,
  RuntimeOf,
  TestSuiteResult,
} from './helpers/test-harness.js';
import {
  createPulseRouterWithAuth,
  insertTestUser,
  pullClient,
  setupTestSuiteForFixture,
  subscribeClient,
  waitForEventsForFixture,
} from './helpers/test-harness.js';

describe('Runtime Contracts', () => {
  let suite: TestSuiteResult;
  let router: Hono;
  let pool: ReturnType<typeof postgres>;
  let db: PostgresJsDatabase;
  let processDbOperations: HarnessProcessDbOperations;
  let runtime!: RuntimeOf<typeof registry>;

  const fixture = fullOrdersFixture;
  const { orders } = fixture.tables;
  const ordersByStatus = pulse(orders)
    .args(fixture.schemas.ordersByStatusArgs)
    .order('desc')
    .limit(5)
    .query((ctx) => ctx.query({ status: ctx.args.status }));
  const authScopedByStatus = pulse(orders)
    .args(fixture.schemas.ordersByStatusArgs)
    .order('desc')
    .limit(2)
    .query((ctx) =>
      ctx.query({
        AND: [
          { status: ctx.args.status },
          { OR: [{ driverId: { isNull: true } }, { driverId: ctx.auth.userId! }] },
        ],
      }),
    );
  const registry = createPulseRegistry({ ordersByStatus, authScopedByStatus });

  beforeAll(async () => {
    suite = await setupTestSuiteForFixture(fixture, registry);
    router = suite.router;
    pool = suite.pool;
    db = suite.db;
    processDbOperations = suite.processDbOperations;
    runtime = suite.runtime;
  });

  afterAll(async () => {
    await suite?.teardown();
  });

  beforeEach(async () => {
    await suite?.cleanupBetweenTests();
    await insertTestUser(db, `driver_${randomUUID().slice(0, 8)}`);
  });

  test('subscribe to empty table returns exact empty response contract', async () => {
    const subscription = await subscribeClient(router, 'ordersByStatus', { status: 'requested' });

    expect(subscription.rows).toEqual([]);
    expect(subscription.rangeStart).toBe(null);
    expect(subscription.rangeEnd).toBe(null);
    expect(subscription.snapshot).toBe(0);
  });

  test('subscribe after insert returns exact single-row ranges', async () => {
    await processDbOperations([
      db.insert(orders).values({
        driverId: 1,
        pickup: 'Smoke Pickup',
        dropoff: 'Smoke Dropoff',
        price: 55,
        status: 'requested',
      }),
    ]);

    const subscription = await subscribeClient(router, 'ordersByStatus', { status: 'requested' });

    expect(subscription.rows).toHaveLength(1);
    expect(subscription.rangeStart).toBe(1);
    expect(subscription.rangeEnd).toBe(1);
    expect(subscription.snapshot).toBe(1);
  });

  test('pull response has exact insert event contract', async () => {
    const subscription = await subscribeClient(router, 'ordersByStatus', { status: 'requested' });

    await processDbOperations([
      db.insert(orders).values({
        driverId: 1,
        pickup: 'Pull Contract Pickup',
        dropoff: 'Pull Contract Dropoff',
        price: 65,
        status: 'requested',
      }),
    ]);

    const pullResponse = await pullClient(router, subscription);

    expect(pullResponse.events).toHaveLength(1);
    expect(pullResponse.events[0]).toEqual(
      expect.objectContaining({
        op: 'insert',
        pk: 1,
        row: expect.objectContaining({
          pickup: 'Pull Contract Pickup',
          dropoff: 'Pull Contract Dropoff',
          price: 65,
          status: 'requested',
        }),
      }),
    );
    expect(pullResponse.rangeStart).toBe(1);
    expect(pullResponse.rangeEnd).toBe(1);
    expect(pullResponse.snapshot).toBe(1);
  });

  test('transition out of filter exposes exact update flags', async () => {
    const seededRows = await db
      .insert(orders)
      .values({
        driverId: 1,
        pickup: 'Transition Out Pickup',
        dropoff: 'Transition Out Dropoff',
        price: 110,
        status: 'requested',
      })
      .returning({ id: orders.id });
    expect(seededRows).toHaveLength(1);
    const seededId = seededRows[0]!.id;

    await waitForEventsForFixture(fixture, pool, 0, 1);

    const subscription = await subscribeClient(router, 'ordersByStatus', { status: 'requested' });
    expect(subscription.rows).toHaveLength(1);

    await processDbOperations([
      db.update(orders).set({ status: 'accepted' }).where(eq(orders.id, seededId)),
    ]);

    const updatePull = await pullClient(router, subscription);

    expect(updatePull.events).toHaveLength(1);
    expect(updatePull.events[0]).toEqual(
      expect.objectContaining({
        op: 'update',
        matchesNew: false,
      }),
    );
    expect(updatePull.events[0]).not.toHaveProperty('matchesOld');
    // The new row left the subscriber's WHERE, so its state is out of scope: the wire ships
    // it pk-only (the client keys the membership removal off $pk). The old side matched, so
    // it ships in full.
    expect((updatePull.events[0] as { row: unknown }).row).toEqual({ $pk: seededId });
    expect((updatePull.events[0] as { old_row: unknown }).old_row).toEqual(
      expect.objectContaining({ status: 'requested', $pk: seededId }),
    );
  });

  test('transition into filter exposes exact update flags', async () => {
    const seededRows = await db
      .insert(orders)
      .values({
        driverId: 1,
        pickup: 'Transition In Pickup',
        dropoff: 'Transition In Dropoff',
        price: 120,
        status: 'completed',
      })
      .returning({ id: orders.id });
    expect(seededRows).toHaveLength(1);
    const seededId = seededRows[0]!.id;

    await waitForEventsForFixture(fixture, pool, 0, 1);

    const subscription = await subscribeClient(router, 'ordersByStatus', { status: 'requested' });
    expect(subscription.rows).toEqual([]);

    await processDbOperations([
      db.update(orders).set({ status: 'requested' }).where(eq(orders.id, seededId)),
    ]);

    const updatePull = await pullClient(router, subscription);

    expect(updatePull.events).toHaveLength(1);
    expect(updatePull.events[0]).toEqual(
      expect.objectContaining({
        op: 'update',
        matchesNew: true,
      }),
    );
    expect(updatePull.events[0]).not.toHaveProperty('matchesOld');
    // The old row never matched this subscriber's WHERE, so its pre-update state is out of
    // scope and ships empty; the new side matched and ships in full.
    expect((updatePull.events[0] as { old_row: unknown }).old_row).toEqual({});
    expect((updatePull.events[0] as { row: unknown }).row).toEqual(
      expect.objectContaining({ status: 'requested', $pk: seededId }),
    );
  });

  test('a token minted against a since-recreated events table resets on epoch mismatch', async () => {
    const stale = await subscribeClient(router, 'ordersByStatus', { status: 'requested' });

    // Bounce the runtime: teardown drops the DB, setup provisions a fresh events table and
    // rotates its epoch — so `stale.token`'s epoch no longer matches. `suite` is reassigned to
    // the new context before this test returns; if setup below throws, `suite` still points at
    // the already-torn-down context, and afterAll's teardown() call on it must be a no-op.
    await suite?.teardown();
    suite = await setupTestSuiteForFixture(fixture, registry);
    router = suite.router;
    pool = suite.pool;
    db = suite.db;
    processDbOperations = suite.processDbOperations;
    runtime = suite.runtime;
    await insertTestUser(db, `driver_${randomUUID().slice(0, 8)}`);

    const pullResponse = await pullClient(router, stale);
    expect(pullResponse.reset).toBe(true);
    expect(pullResponse.reason).toBe('epoch');
    expect(pullResponse.events).toEqual([]);
  });

  test('two subscriptions only receive events matching their status filters', async () => {
    const requestedSubscription = await subscribeClient(router, 'ordersByStatus', {
      status: 'requested',
    });
    const acceptedSubscription = await subscribeClient(router, 'ordersByStatus', {
      status: 'accepted',
    });

    const requestedInsertRows = await db
      .insert(orders)
      .values({
        driverId: 1,
        pickup: 'Isolation Requested Pickup',
        dropoff: 'Isolation Requested Dropoff',
        price: 101,
        status: 'requested',
      })
      .returning({ id: orders.id });
    expect(requestedInsertRows).toHaveLength(1);
    const requestedInsertId = requestedInsertRows[0]!.id;

    await waitForEventsForFixture(fixture, pool, requestedSubscription.snapshot, 1);

    const requestedPhaseOne = await pullClient(router, requestedSubscription);
    const acceptedPhaseOne = await pullClient(router, acceptedSubscription);

    expect(requestedPhaseOne.events).toHaveLength(1);
    expect(requestedPhaseOne.events[0]).toEqual(
      expect.objectContaining({
        op: 'insert',
        pk: requestedInsertId,
        row: expect.objectContaining({ status: 'requested' }),
      }),
    );
    expect(acceptedPhaseOne.events).toEqual([]);

    const acceptedInsertRows = await db
      .insert(orders)
      .values({
        driverId: 1,
        pickup: 'Isolation Accepted Pickup',
        dropoff: 'Isolation Accepted Dropoff',
        price: 102,
        status: 'accepted',
      })
      .returning({ id: orders.id });
    expect(acceptedInsertRows).toHaveLength(1);
    const acceptedInsertId = acceptedInsertRows[0]!.id;

    await waitForEventsForFixture(fixture, pool, requestedPhaseOne.snapshot, 1);

    const requestedPhaseTwo = await pullClient(router, requestedPhaseOne);
    const acceptedPhaseTwo = await pullClient(router, acceptedPhaseOne);

    expect(requestedPhaseTwo.events).toEqual([]);
    expect(acceptedPhaseTwo.events).toHaveLength(1);
    expect(acceptedPhaseTwo.events[0]).toEqual(
      expect.objectContaining({
        op: 'insert',
        pk: acceptedInsertId,
        row: expect.objectContaining({ status: 'accepted' }),
      }),
    );
  });

  test('single batched pull returns results for multiple self-describing entries', async () => {
    const requested = await subscribeClient(router, 'ordersByStatus', { status: 'requested' });
    const accepted = await subscribeClient(router, 'ordersByStatus', { status: 'accepted' });

    await processDbOperations([
      db.insert(orders).values({
        driverId: 1,
        pickup: 'Batched Requested Pickup',
        dropoff: 'Batched Requested Dropoff',
        price: 301,
        status: 'requested',
      }),
      db.insert(orders).values({
        driverId: 1,
        pickup: 'Batched Accepted Pickup',
        dropoff: 'Batched Accepted Dropoff',
        price: 302,
        status: 'accepted',
      }),
    ]);

    const response = await router.request('/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscriptions: [
          {
            key: 'req',
            queryName: requested.queryName,
            args: requested.args,
            rangeStart: requested.rangeStart,
            rangeEnd: requested.rangeEnd,
            snapshot: requested.token,
          },
          {
            key: 'acc',
            queryName: accepted.queryName,
            args: accepted.args,
            rangeStart: accepted.rangeStart,
            rangeEnd: accepted.rangeEnd,
            snapshot: accepted.token,
          },
        ],
      }),
    });
    const parsed = SuperJSON.parse(await response.text()) as {
      results: Record<string, { events: unknown[] }>;
    };

    expect(response.status).toBe(200);
    expect(Object.keys(parsed.results).sort()).toEqual(['acc', 'req']);
    expect(parsed.results.req?.events).toHaveLength(1);
    expect(parsed.results.acc?.events).toHaveLength(1);
  });

  test('auth-scoped subscriptions keep subscribe, pull, and load-more tied to the same user', async () => {
    // Reuse the suite's existing runtime (from beforeAll) instead of calling
    // setupTestSuiteForFixture() again — each call provisions its own ephemeral DB, so a
    // second call here would leave an extra database/slot for this test alone to tear down.
    const driverOne = await insertTestUser(db, `auth_driver_${randomUUID().slice(0, 8)}`);
    const driverTwo = await insertTestUser(db, `auth_driver_${randomUUID().slice(0, 8)}`);

    const driverOneRouter = createPulseRouterWithAuth(runtime, {
      userId: driverOne.id,
    });
    const driverTwoRouter = createPulseRouterWithAuth(runtime, {
      userId: driverTwo.id,
    });

    await processDbOperations([
      db.insert(orders).values({
        driverId: driverOne.id,
        pickup: 'Auth Driver One Existing Pickup',
        dropoff: 'Auth Driver One Existing Dropoff',
        price: 201,
        status: 'requested',
      }),
      db.insert(orders).values({
        driverId: driverTwo.id,
        pickup: 'Auth Driver Two Existing Pickup',
        dropoff: 'Auth Driver Two Existing Dropoff',
        price: 202,
        status: 'requested',
      }),
      db.insert(orders).values({
        driverId: null,
        pickup: 'Auth Shared Existing Pickup',
        dropoff: 'Auth Shared Existing Dropoff',
        price: 203,
        status: 'requested',
      }),
    ]);

    const driverOneSubscription = await subscribeClient(driverOneRouter, 'authScopedByStatus', {
      status: 'requested',
    });
    const driverTwoSubscription = await subscribeClient(driverTwoRouter, 'authScopedByStatus', {
      status: 'requested',
    });

    expect(driverOneSubscription.rows.map((row) => row.price)).toEqual([203, 201]);
    expect(driverTwoSubscription.rows.map((row) => row.price)).toEqual([203, 202]);

    await processDbOperations([
      db.insert(orders).values({
        driverId: driverOne.id,
        pickup: 'Auth Driver One New Pickup',
        dropoff: 'Auth Driver One New Dropoff',
        price: 204,
        status: 'requested',
      }),
    ]);

    const driverOnePull = await pullClient(driverOneRouter, driverOneSubscription);
    const driverTwoPull = await pullClient(driverTwoRouter, driverTwoSubscription);

    expect(driverOnePull.events).toHaveLength(1);
    expect(driverOnePull.events[0]).toEqual(
      expect.objectContaining({
        op: 'insert',
        row: expect.objectContaining({ price: 204 }),
      }),
    );
    expect(driverTwoPull.events).toEqual([]);

    // Stateless auth re-resolution: a pull's auth comes from the router, never the cursor.
    // Replaying driverOne's cursor through driverTwo's router resolves the query under
    // driverTwo's auth, so driverOne's private new order (204) is filtered out — no leak.
    const crossUserPull = await pullClient(driverTwoRouter, driverOneSubscription);
    expect(
      crossUserPull.events.map((event) => (event.row as { price?: number } | undefined)?.price),
    ).not.toContain(204);

    const loadMoreBody = {
      queryName: 'authScopedByStatus',
      args: { status: 'requested' },
      rangeStart: driverOnePull.rangeStart,
      rangeEnd: driverOnePull.rangeEnd,
      cursor: 201,
    };

    const driverOneLoadMore = await driverOneRouter.request('/load-more', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loadMoreBody),
    });
    expect(driverOneLoadMore.status).toBe(200);
    const driverOneLoadMoreBody = (await driverOneLoadMore.json()) as {
      json: { rows: Array<{ price: number }> };
    };
    expect(driverOneLoadMoreBody.json.rows.map((row) => row.price)).toEqual([204, 203]);

    // Same window, driverTwo's router: re-resolved under driverTwo's auth, so driverOne's
    // private orders never surface.
    const crossUserLoadMore = await driverTwoRouter.request('/load-more', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loadMoreBody),
    });
    expect(crossUserLoadMore.status).toBe(200);
    const crossUserLoadMoreBody = (await crossUserLoadMore.json()) as {
      json: { rows: Array<{ price: number }> };
    };
    expect(crossUserLoadMoreBody.json.rows.map((row) => row.price)).not.toContain(204);
  });
});
