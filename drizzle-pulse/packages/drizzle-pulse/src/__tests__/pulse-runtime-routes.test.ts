import { describe, expect, test } from 'bun:test';
import type { PgAsyncDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { integer, pgSchema, pgTable, serial, text } from 'drizzle-orm/pg-core';
import SuperJSON from 'superjson';
import { z } from 'zod';
import { pulse } from '../pulse-table.js';
import { buildEventsTable } from '../server/events-table-resolver.js';
import { createPulseHonoRouter } from '../server/hono.js';
import type { AnyPulseBuilders, PulseRegistry } from '../server/pulse-registry.js';
import { createPulseRegistry } from '../server/pulse-registry.js';
import { PulseRuntime } from '../server/pulse-runtime.js';
import type { PulseStore } from '../server/pulse-store.js';
import { PulseRequestHandler } from '../server/sdk.js';
import type {
  LoadMoreResponse,
  PullResponse,
  PullResponseErrorResult,
  SubscribeResponse,
} from '../shared/protocol-types.js';

const ordersTable = pgTable('orders', {
  id: serial('id').primaryKey(),
  status: text('status').notNull(),
  price: integer('price'),
});

// PK whose JS property key ("orderId") differs from its SQL column name ("order_id") —
// idiomatic drizzle, and the exact shape that reproduced a 500 against.
const mismatchedPkTable = pgTable('mismatched_pk_orders', {
  orderId: serial('order_id').primaryKey(),
  status: text('status').notNull(),
});

const QUERY_DATA = {
  queryName: 'testQuery',
  args: { status: 'requested' },
};

// Stable epoch the harness handler mints/validates tokens against.
const HARNESS_EPOCH = 'epoch-1';

type MockSourceDb = {
  takeRows: () => Record<string, unknown>[];
};

type MockPulseSourceDb = PgAsyncDatabase<PgQueryResultHKT, never>;

type MockDynamicQuery = Promise<Record<string, unknown>[]> & {
  $dynamic(): MockDynamicQuery;
  orderBy(order: unknown): MockDynamicQuery;
  limit(limit: number): Promise<Record<string, unknown>[]>;
};

type SubscribeResponseBody = SubscribeResponse<Record<string, unknown>>;
type LoadMoreResponseBody = LoadMoreResponse<Record<string, unknown>>;
type PullResponseBody = {
  results?: Record<
    string,
    PullResponse<Record<string, unknown>, Record<string, unknown>> | PullResponseErrorResult
  >;
};

type ErrorBody = {
  error?: string;
};

function getPullResult(
  body: PullResponseBody,
  key: string,
): PullResponse<Record<string, unknown>, Record<string, unknown>> | PullResponseErrorResult {
  const result = body.results?.[key];
  if (!result) {
    throw new Error(`Missing pull result for key ${key}`);
  }

  return result;
}

function createRegistry() {
  return createPulseRegistry({
    testQuery: pulse(ordersTable)
      .query()
      .args(z.object({ status: z.string() }))
      .order('asc')
      .limit(2)
      .query((ctx) => ctx.query({ status: ctx.args.status })),
  });
}

function createMismatchedPkRegistry() {
  return createPulseRegistry({
    mismatchedOrders: pulse(mismatchedPkTable).query().order('asc').limit(1),
  });
}

function createMockSourceDb(batches: Record<string, unknown>[][]): MockSourceDb {
  let idx = 0;

  const takeRows = () => {
    const rows = batches[idx] ?? [];
    idx += 1;
    return rows;
  };

  return {
    takeRows() {
      return takeRows();
    },
  };
}

function createPulseSourceDbMock(rowsProvider: () => Record<string, unknown>[]): MockPulseSourceDb {
  const createQuery = (): MockDynamicQuery => {
    const rows = rowsProvider();
    const query = Promise.resolve(rows) as MockDynamicQuery;
    query.$dynamic = () => query;
    query.orderBy = () => query;
    query.limit = () => Promise.resolve(rows);

    return query;
  };

  return {
    select() {
      return {
        from() {
          return {
            where() {
              return createQuery();
            },
          };
        },
      };
    },
  } as unknown as MockPulseSourceDb;
}

function createPulseStoreMock(data?: {
  latestSnapshot?: number;
  events?: Record<string, unknown>[];
}): Pick<PulseStore, 'getDb' | 'getLatestSnapshot'> {
  const latestSnapshot = data?.latestSnapshot ?? 0;
  const events = data?.events ?? [];

  return {
    getDb() {
      // orderBy(...).limit(...) both resolve to the fixed events batch so the pull cap's
      // .limit(N+1) chain has something to await.
      const withLimit = (): Promise<Record<string, unknown>[]> & {
        limit(n: number): Promise<Record<string, unknown>[]>;
      } => {
        const promise = Promise.resolve(events) as Promise<Record<string, unknown>[]> & {
          limit(n: number): Promise<Record<string, unknown>[]>;
        };
        promise.limit = () => Promise.resolve(events);
        return promise;
      };
      const createQuery = () => {
        const promise = Promise.resolve(events) as Promise<Record<string, unknown>[]> & {
          orderBy(order: unknown): ReturnType<typeof withLimit>;
        };
        promise.orderBy = () => withLimit();
        return promise;
      };

      return {
        select() {
          return {
            from() {
              return {
                where() {
                  return createQuery();
                },
              };
            },
          };
        },
      } as unknown as ReturnType<PulseStore['getDb']>;
    },
    async getLatestSnapshot(_table: unknown) {
      return latestSnapshot;
    },
  };
}

async function decodeBody<T extends Record<string, unknown>>(response: Response): Promise<T> {
  const raw = await response.text();
  const parsed = SuperJSON.parse(raw);
  if (parsed && typeof parsed === 'object') {
    return parsed as T;
  }
  return {} as T;
}

function createRouterHarness(params?: {
  sourceRows?: Record<string, unknown>[][];
  latestSnapshot?: number;
  events?: Record<string, unknown>[];
  registry?: PulseRegistry<AnyPulseBuilders>;
  eventsTable?: Parameters<typeof buildEventsTable>[0];
  epoch?: string | undefined;
  pull?: { eventLimit?: number };
}) {
  const registry = params?.registry ?? createRegistry();
  const eventsSourceTable = params?.eventsTable ?? ordersTable;
  const sourceDb = createMockSourceDb(params?.sourceRows ?? [[]]);
  const pulseSourceDb = createPulseSourceDbMock(() => sourceDb.takeRows());
  const pulseStore = createPulseStoreMock({
    latestSnapshot: params?.latestSnapshot,
    events: params?.events,
  });
  const epoch = params && 'epoch' in params ? params.epoch : HARNESS_EPOCH;
  const requestHandler = new PulseRequestHandler(
    registry,
    pulseSourceDb,
    () => pulseStore,
    () => buildEventsTable(eventsSourceTable),
    () => epoch,
    params?.pull?.eventLimit,
  );

  const router = createPulseHonoRouter(requestHandler, { userId: null });

  return { router };
}

async function subscribe(
  router: ReturnType<typeof createRouterHarness>['router'],
  body: Record<string, unknown> = QUERY_DATA,
): Promise<SubscribeResponseBody> {
  const response = await router.request('/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  return decodeBody<SubscribeResponseBody>(response);
}

async function pull(
  router: ReturnType<typeof createRouterHarness>['router'],
  entries: Array<Record<string, unknown> & { key: string }>,
): Promise<{ response: Response; body: PullResponseBody }> {
  const response = await router.request('/pull', {
    method: 'POST',
    body: JSON.stringify({ subscriptions: entries }),
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await decodeBody<PullResponseBody>(response);
  return { response, body };
}

// These tests cover request-shape validation and guard clauses that need no real DB.
// Result-shaping behavior (row/event content produced by an actual query) is proven against
// live PostgreSQL in packages/integration-tests rather than re-tested here against a mock.
describe('pulse-runtime routes request validation', () => {
  test('subscribe returns HTTP 400 for invalid queryName', async () => {
    const { router } = createRouterHarness({
      sourceRows: [[{ id: 101, status: 'requested', price: 20 }]],
    });

    const response = await router.request('/subscribe', {
      method: 'POST',
      body: JSON.stringify({ queryName: 'nope', args: { status: 'requested' } }),
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await decodeBody<ErrorBody>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Unknown query: "nope"');
  });

  test('subscribe returns a cursor token (epoch:snapshot), not a bare number', async () => {
    const { router } = createRouterHarness({
      sourceRows: [[{ id: 101, status: 'requested', price: 20 }]],
      latestSnapshot: 4,
    });

    const body = await subscribe(router);
    expect(body.snapshot).toBe(`${HARNESS_EPOCH}:4`);
  });

  test('pull returns empty results when no subscriptions provided', async () => {
    const { router } = createRouterHarness();

    const { response, body } = await pull(router, []);

    expect(response.status).toBe(200);
    expect(body.results).toEqual({});
  });

  test('pull with a matching epoch and up-to-date snapshot returns an empty incremental', async () => {
    const { router } = createRouterHarness({
      sourceRows: [[{ id: 101, status: 'requested', price: 20 }]],
      latestSnapshot: 3,
    });

    const { body } = await pull(router, [
      {
        key: 'q1',
        queryName: QUERY_DATA.queryName,
        args: QUERY_DATA.args,
        snapshot: `${HARNESS_EPOCH}:3`,
      },
    ]);
    const result = getPullResult(body, 'q1');

    expect('reset' in result && result.reset).toBeFalsy();
    if ('snapshot' in result) {
      expect(result.snapshot).toBe(`${HARNESS_EPOCH}:3`);
    }
  });

  test('load-more returns 400 for an unknown query', async () => {
    const { router } = createRouterHarness();

    const response = await router.request('/load-more', {
      method: 'POST',
      body: JSON.stringify({ queryName: 'nope', args: {}, cursor: 100 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await decodeBody<ErrorBody>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Unknown query: "nope"');
  });

  test('load-more returns 400 for missing cursor', async () => {
    const { router } = createRouterHarness({
      sourceRows: [[{ id: 101, status: 'requested', price: 20 }]],
      latestSnapshot: 2,
    });

    const response = await router.request('/load-more', {
      method: 'POST',
      body: JSON.stringify({ queryName: QUERY_DATA.queryName, args: QUERY_DATA.args }),
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await decodeBody<ErrorBody>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('missing_cursor');
  });

  test('load-more returns 400 for invalid cursor type', async () => {
    const { router } = createRouterHarness({
      sourceRows: [[{ id: 101, status: 'requested', price: 20 }]],
      latestSnapshot: 2,
    });

    const response = await router.request('/load-more', {
      method: 'POST',
      body: JSON.stringify({
        queryName: QUERY_DATA.queryName,
        args: QUERY_DATA.args,
        cursor: { bad: true },
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await decodeBody<ErrorBody>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid_cursor');
  });
});

// A stale token (minted against a since-recreated events table) or an unparseable one must
// reset BEFORE any snapshot comparison, re-materializing the client's window.
describe('pull epoch-token validation', () => {
  test('a token with a mismatched epoch resets', async () => {
    const { router } = createRouterHarness({
      sourceRows: [[{ id: 101, status: 'requested', price: 20 }]],
      latestSnapshot: 7,
    });

    const { body } = await pull(router, [
      {
        key: 'q1',
        queryName: QUERY_DATA.queryName,
        args: QUERY_DATA.args,
        snapshot: 'stale-epoch:3',
      },
    ]);
    const result = getPullResult(body, 'q1');

    expect(result.reset).toBe(true);
    if ('reason' in result) expect(result.reason).toBe('epoch');
    if ('snapshot' in result) expect(result.snapshot).toBe(`${HARNESS_EPOCH}:7`);
  });

  test('a null entry is skipped without poisoning sibling entries', async () => {
    const { router } = createRouterHarness({
      sourceRows: [[{ id: 101, status: 'requested', price: 20 }]],
      latestSnapshot: 7,
    });

    const { response, body } = await pull(router, [
      null as never,
      {
        key: 'q1',
        queryName: QUERY_DATA.queryName,
        args: QUERY_DATA.args,
        snapshot: `${HARNESS_EPOCH}:7`,
      },
    ]);

    expect(response.status).toBe(200);
    const result = getPullResult(body, 'q1');
    expect('error' in result).toBe(false);
  });

  test('an unparseable token resets', async () => {
    const { router } = createRouterHarness({
      sourceRows: [[{ id: 101, status: 'requested', price: 20 }]],
      latestSnapshot: 7,
    });

    const { body } = await pull(router, [
      {
        key: 'q1',
        queryName: QUERY_DATA.queryName,
        args: QUERY_DATA.args,
        snapshot: 'not-a-token',
      },
    ]);
    const result = getPullResult(body, 'q1');

    expect(result.reset).toBe(true);
  });

  test('order/limit injected by the client are ignored — the server derives them from resolve()', async () => {
    const { router } = createRouterHarness({
      sourceRows: [[{ id: 101, status: 'requested', price: 20 }]],
      latestSnapshot: 7,
    });

    // Force a reset (stale epoch) so the response echoes the SERVER order/limit, then confirm
    // the tampered desc/9999 were never trusted: testQuery is registered as .order('asc').limit(2).
    const { body } = await pull(router, [
      {
        key: 'q1',
        queryName: QUERY_DATA.queryName,
        args: QUERY_DATA.args,
        snapshot: 'stale-epoch:1',
        order: 'desc',
        limit: 9999,
      },
    ]);
    const result = getPullResult(body, 'q1');

    expect(result.reset).toBe(true);
    if ('order' in result) {
      expect(result.order).toBe('asc');
      expect(result.limit).toBe(2);
    }
  });
});

// Overflowing the per-pull event cap must fall back to a full reset rather than stream an
// unbounded batch.
describe('pull event cap', () => {
  test('more than pullEventLimit events triggers a reset', async () => {
    const { router } = createRouterHarness({
      sourceRows: [[{ id: 101, status: 'requested', price: 20 }]],
      latestSnapshot: 9,
      // 3 raw events, cap of 2 → over the cap.
      events: [{ $op: 'insert' }, { $op: 'insert' }, { $op: 'insert' }],
      pull: { eventLimit: 2 },
    });

    const { body } = await pull(router, [
      {
        key: 'q1',
        queryName: QUERY_DATA.queryName,
        args: QUERY_DATA.args,
        snapshot: `${HARNESS_EPOCH}:0`,
      },
    ]);
    const result = getPullResult(body, 'q1');

    expect(result.reset).toBe(true);
    if ('reason' in result) expect(result.reason).toBe('cap');
  });
});

// PK JS property key vs SQL column name: baseline SELECT rows are keyed by JS property name
// (drizzle's `db.select(...)` shape), but pipeline sites used to index by the PK's SQL name,
// 500ing on any table where the two diverge (e.g. `orderId: serial('order_id')`).
describe('subscribe/loadMore with a PK whose JS key differs from its SQL name', () => {
  test('subscribe resolves non-null ranges using the PK JS query key, not its SQL name', async () => {
    const { router } = createRouterHarness({
      registry: createMismatchedPkRegistry(),
      eventsTable: mismatchedPkTable,
      sourceRows: [[{ orderId: 101, status: 'requested' }]],
      latestSnapshot: 2,
    });

    const body = await subscribe(router, { queryName: 'mismatchedOrders' });

    expect(body.rangeStart).toBe(101);
    expect(body.rangeEnd).toBe(101);
    expect(body.rows[0]).toHaveProperty('$pk', 101);
  });

  test('load-more succeeds (not a 500) and advances the range using the PK JS query key', async () => {
    const { router } = createRouterHarness({
      registry: createMismatchedPkRegistry(),
      eventsTable: mismatchedPkTable,
      sourceRows: [[{ orderId: 102, status: 'requested' }]],
      latestSnapshot: 2,
    });

    const response = await router.request('/load-more', {
      method: 'POST',
      body: JSON.stringify({
        queryName: 'mismatchedOrders',
        args: {},
        rangeStart: 101,
        rangeEnd: 101,
        cursor: 101,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await decodeBody<LoadMoreResponseBody>(response);

    expect(response.status).toBe(200);
    expect(body.rangeEnd).toBe(102);
    expect(body.rows[0]).toHaveProperty('$pk', 102);
  });
});

// The HTTP subscribe path must read the snapshot cursor BEFORE the baseline SELECT, the same
// ordering the embedded client's startHandshake uses — a write committed between the two reads
// must remain covered by the returned cursor.
describe('subscribe reads the snapshot cursor before the baseline SELECT', () => {
  test('calls getLatestSnapshot() before the baseline SELECT', async () => {
    const registry = createRegistry();
    const callOrder: string[] = [];

    const pulseSourceDb = {
      select() {
        callOrder.push('select');
        const rows = [{ id: 101, status: 'requested', price: 20 }];
        return {
          from() {
            return {
              where() {
                const query = Promise.resolve(rows) as unknown as {
                  $dynamic(): typeof query;
                  orderBy(order: unknown): typeof query;
                  limit(limit: number): Promise<Record<string, unknown>[]>;
                } & Promise<Record<string, unknown>[]>;
                query.$dynamic = () => query;
                query.orderBy = () => query;
                query.limit = () => Promise.resolve(rows);
                return query;
              },
            };
          },
        };
      },
    } as unknown as MockPulseSourceDb;

    const pulseStore: Pick<PulseStore, 'getDb' | 'getLatestSnapshot'> = {
      getDb() {
        throw new Error('getDb should not be called from subscribe()');
      },
      async getLatestSnapshot() {
        callOrder.push('snapshot');
        return 5;
      },
    };

    const requestHandler = new PulseRequestHandler(
      registry,
      pulseSourceDb,
      () => pulseStore,
      () => buildEventsTable(ordersTable),
      () => HARNESS_EPOCH,
    );

    const result = await requestHandler.subscribe(
      { queryName: QUERY_DATA.queryName, args: QUERY_DATA.args },
      { userId: null },
    );

    expect(result.status).toBe(200);
    expect(callOrder).toEqual(['snapshot', 'select']);
  });
});

describe('PulseRuntime rejects events-table name collisions', () => {
  test('distinct source tables deriving the same events-table name throw, naming both', () => {
    // Escaping is not injective: schema "a_" table "b" and schema "a" table "_b" both
    // derive "a___b".
    const tableA = pgSchema('a_').table('b', { id: serial('id').primaryKey() });
    const tableB = pgSchema('a').table('_b', { id: serial('id').primaryKey() });

    const registry = createPulseRegistry({
      a: pulse(tableA).query(),
      b: pulse(tableB).query(),
    });

    expect(
      () =>
        new PulseRuntime(registry, {
          databaseUrl: 'postgresql://unused',
          sourceDb: createPulseSourceDbMock(() => []),
          pull: true,
        }),
    ).toThrow(/a_\.b and a\._b both derive the same events-table name drizzle_pulse\.a___b/);
  });
});
