import { describe, expect, test } from 'bun:test';
import SuperJSON from 'superjson';
import { createPulseClient } from '../client/create-client.js';
import { PulseQuery } from '../client/pulse-query.js';
import type { PullResponse } from '../shared/protocol-types.js';
import type { QueryDescriptor } from '../types.js';

type TestRow = {
  $pk: number;
  label: string;
};

type FetchCall = {
  url: string;
  body: unknown;
};

type PullEntry = {
  key: string;
  queryName: string;
  args: { status?: string };
};

// A queued item is either a ready Response or a factory that builds one from the parsed
// request body — the latter lets /pull responses be keyed by the client-chosen queryKey,
// which is random and unknown to the test up front.
type QueuedResponse = Response | ((body: { subscriptions: PullEntry[] }) => Response);

function serialize(value: unknown): string {
  return SuperJSON.stringify(value);
}

function createQueuedFetch(responses: QueuedResponse[]): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const queue = [...responses];
  const calls: FetchCall[] = [];

  const fetchImpl = Object.assign(
    async (input: URL | RequestInfo, init?: RequestInit) => {
      const next = queue.shift();
      if (!next) {
        throw new Error('No queued response available for fetch call');
      }

      const url = typeof input === 'string' ? input : input.toString();
      const bodyText = typeof init?.body === 'string' ? init.body : '';
      const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;
      calls.push({ url, body });
      return typeof next === 'function' ? next(body) : next;
    },
    { preconnect() {} },
  ) satisfies typeof fetch;

  return { fetchImpl, calls };
}

function createTestClient(fetchImpl: typeof fetch) {
  return createPulseClient<{
    ordersByStatus(args?: Record<string, unknown>): QueryDescriptor<TestRow>;
  }>({
    url: '/api/pulse',
    fetchImpl,
  });
}

// Build a batched /pull response by mapping each self-describing entry to a result, keyed by
// the entry's client-side queryKey.
function pullResponder(
  resultFor: (entry: PullEntry) => PullResponse<TestRow, unknown>,
): (body: { subscriptions: PullEntry[] }) => Response {
  return (body) => {
    const results: Record<string, PullResponse<TestRow, unknown>> = {};
    for (const entry of body.subscriptions) {
      results[entry.key] = resultFor(entry);
    }
    return new Response(serialize({ results }), { status: 200 });
  };
}

describe('PulseQuery runtime characterization', () => {
  test('subscribe initializes runtime state and sends only {queryName, args}', async () => {
    const subscribeResponse = new Response(
      serialize({
        rows: [
          { $pk: 1, label: 'a' },
          { $pk: 2, label: 'b' },
        ],
        rangeStart: 1,
        rangeEnd: 2,
        snapshot: 'e:4',
        order: 'asc',
        limit: 2,
        hasMore: true,
      }),
      { status: 200 },
    );

    const { fetchImpl, calls } = createQueuedFetch([subscribeResponse]);
    const core = new PulseQuery(
      createTestClient(fetchImpl).ordersByStatus({ status: 'requested' }),
    );

    await core.subscribe();

    expect(core.getState().isLoading).toBe(false);
    expect(core.getState().hasMore).toBe(true);
    expect(core.getState().data).toEqual([
      { $pk: 1, label: 'a' },
      { $pk: 2, label: 'b' },
    ]);
    expect(calls[0]?.body).toEqual({
      queryName: 'ordersByStatus',
      args: { status: 'requested' },
    });
  });

  test('an error pull result sets error state, keeps the cursor, and recovers on the next poll', async () => {
    const subscribeResponse = new Response(
      serialize({
        rows: [{ $pk: 1, label: 'a' }],
        rangeStart: 1,
        rangeEnd: 1,
        snapshot: 'e:5',
        order: 'asc',
        limit: null,
        hasMore: false,
      }),
      { status: 200 },
    );
    const pullError = (body: { subscriptions: PullEntry[] }) => {
      const results: Record<string, unknown> = {};
      for (const entry of body.subscriptions)
        results[entry.key] = { error: 'query_resolution_failed' };
      return new Response(serialize({ results }), { status: 200 });
    };
    const pullOk = pullResponder(() => ({
      events: [{ op: 'insert', row: { $pk: 2, label: 'b' }, pk: 2 }],
      rangeStart: 1,
      rangeEnd: 2,
      snapshot: 'e:6',
    }));

    const { fetchImpl } = createQueuedFetch([subscribeResponse, pullError, pullOk]);
    const core = new PulseQuery(createTestClient(fetchImpl).ordersByStatus({}));

    await core.subscribe();
    await core.poll();

    expect(core.getState().error?.message).toBe('query_resolution_failed');
    expect(core.getState().data).toEqual([{ $pk: 1, label: 'a' }]);

    await core.poll();

    expect(core.getState().data).toEqual([
      { $pk: 1, label: 'a' },
      { $pk: 2, label: 'b' },
    ]);
  });

  test('applyEvents follows insert/update/delete merge intent', async () => {
    const subscribeResponse = new Response(
      serialize({
        rows: [{ $pk: 2, label: 'b' }],
        rangeStart: 2,
        rangeEnd: 2,
        snapshot: 'e:5',
        order: 'asc',
        limit: 10,
      }),
      { status: 200 },
    );

    const { fetchImpl } = createQueuedFetch([subscribeResponse]);
    const core = new PulseQuery(createTestClient(fetchImpl).ordersByStatus({}));

    await core.subscribe();

    core.applyEvents([
      { op: 'insert', row: { $pk: 3, label: 'c' }, pk: 3 },
      { op: 'insert', row: { $pk: 1, label: 'a' }, pk: 1 },
      {
        op: 'update',
        row: { $pk: 1, label: 'a2' },
        old_row: { $pk: 1, label: 'a' },
        pk: 1,
        matchesNew: true,
      },
      {
        op: 'update',
        row: { $pk: 2, label: 'b2' },
        old_row: { $pk: 2, label: 'b' },
        pk: 2,
        matchesNew: false,
      },
      {
        op: 'update',
        row: { $pk: 4, label: 'd' },
        old_row: { $pk: 4, label: 'd-old' },
        pk: 4,
        matchesNew: true,
      },
      {
        op: 'delete',
        old_row: { $pk: 4, label: 'd' },
        pk: 4,
      },
    ]);

    expect(core.getState().data).toEqual([{ $pk: 1, label: 'a2' }]);
  });

  test('loadMore appends unseen rows, dedupes, and sends the stateless window', async () => {
    const subscribeResponse = new Response(
      serialize({
        rows: [
          { $pk: 1, label: 'a' },
          { $pk: 2, label: 'b' },
        ],
        rangeStart: 1,
        rangeEnd: 2,
        snapshot: 'e:8',
        order: 'asc',
        limit: 2,
      }),
      { status: 200 },
    );

    const loadMoreResponse = new Response(
      serialize({
        rows: [
          { $pk: 2, label: 'b-duplicate' },
          { $pk: 3, label: 'c' },
        ],
        rangeStart: 1,
        rangeEnd: 3,
        hasMore: false,
      }),
      { status: 200 },
    );

    const { fetchImpl, calls } = createQueuedFetch([subscribeResponse, loadMoreResponse]);
    const core = new PulseQuery(createTestClient(fetchImpl).ordersByStatus({}));

    await core.subscribe();
    await core.loadMore();

    expect(calls[1]?.url).toBe('/api/pulse/load-more');
    expect(calls[1]?.body).toEqual({
      queryName: 'ordersByStatus',
      args: {},
      rangeStart: 1,
      rangeEnd: 2,
      cursor: 2,
    });
    expect(core.getState().data).toEqual([
      { $pk: 1, label: 'a' },
      { $pk: 2, label: 'b' },
      { $pk: 3, label: 'c' },
    ]);
    expect(core.getState().hasMore).toBe(false);
  });

  test('poll handles reset from batched pull response and echoes the cursor token', async () => {
    const subscribeResponse = new Response(
      serialize({
        rows: [{ $pk: 10, label: 'x' }],
        rangeStart: 10,
        rangeEnd: 10,
        snapshot: 'e:1',
        order: 'asc',
        limit: null,
        hasMore: false,
      }),
      { status: 200 },
    );

    const pullReset = pullResponder(() => ({
      events: [],
      rows: [{ $pk: 11, label: 'y' }],
      rangeStart: 11,
      rangeEnd: 11,
      snapshot: 'e:3',
      reset: true,
      reason: 'snapshot',
      order: 'asc',
      limit: null,
      hasMore: false,
    }));

    const { fetchImpl, calls } = createQueuedFetch([subscribeResponse, pullReset]);
    const core = new PulseQuery(createTestClient(fetchImpl).ordersByStatus({}));

    await core.subscribe();
    await core.poll();

    expect(calls.map((call) => call.url)).toEqual(['/api/pulse/subscribe', '/api/pulse/pull']);
    expect(calls[1]?.body).toEqual({
      subscriptions: [
        {
          key: expect.any(String),
          queryName: 'ordersByStatus',
          args: {},
          rangeStart: 10,
          rangeEnd: 10,
          hasMore: false,
          snapshot: 'e:1',
        },
      ],
    });
    expect(core.getState().data).toEqual([{ $pk: 11, label: 'y' }]);
  });

  test('two active queries share one pull request, keyed by queryKey', async () => {
    const subscribeOne = new Response(
      serialize({
        rows: [{ $pk: 1, label: 'a' }],
        rangeStart: 1,
        rangeEnd: 1,
        snapshot: 'e:1',
        order: 'asc',
        limit: null,
        hasMore: false,
      }),
      { status: 200 },
    );

    const subscribeTwo = new Response(
      serialize({
        rows: [{ $pk: 2, label: 'b' }],
        rangeStart: 2,
        rangeEnd: 2,
        snapshot: 'e:4',
        order: 'asc',
        limit: null,
        hasMore: false,
      }),
      { status: 200 },
    );

    const pullResponse = pullResponder((entry) =>
      entry.args.status === 'requested'
        ? {
            events: [{ op: 'insert', row: { $pk: 3, label: 'a2' }, pk: 3 }],
            rangeStart: 1,
            rangeEnd: 3,
            snapshot: 'e:2',
          }
        : {
            events: [{ op: 'insert', row: { $pk: 5, label: 'b2' }, pk: 5 }],
            rangeStart: 2,
            rangeEnd: 5,
            snapshot: 'e:5',
          },
    );

    const { fetchImpl, calls } = createQueuedFetch([subscribeOne, subscribeTwo, pullResponse]);
    const client = createTestClient(fetchImpl);
    const first = new PulseQuery(client.ordersByStatus({ status: 'requested' }));
    const second = new PulseQuery(client.ordersByStatus({ status: 'accepted' }));

    await first.subscribe();
    await second.subscribe();
    await Promise.all([first.poll(), second.poll()]);

    expect(calls.map((call) => call.url)).toEqual([
      '/api/pulse/subscribe',
      '/api/pulse/subscribe',
      '/api/pulse/pull',
    ]);
    const pullBody = calls[2]?.body as { subscriptions: PullEntry[] };
    expect(pullBody.subscriptions).toHaveLength(2);
    expect(pullBody.subscriptions.map((s) => s.args)).toEqual(
      expect.arrayContaining([{ status: 'requested' }, { status: 'accepted' }]),
    );
    expect(first.getState().data).toEqual([
      { $pk: 1, label: 'a' },
      { $pk: 3, label: 'a2' },
    ]);
    expect(second.getState().data).toEqual([
      { $pk: 2, label: 'b' },
      { $pk: 5, label: 'b2' },
    ]);
  });

  test('destroy prevents delayed subscribe from registering state', async () => {
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const subscribeResponse = new Response(
      serialize({
        rows: [{ $pk: 1, label: 'a' }],
        rangeStart: 1,
        rangeEnd: 1,
        snapshot: 'e:1',
      }),
      { status: 200 },
    );

    const fetchImpl = Object.assign(
      async () => {
        await responseGate;
        return subscribeResponse;
      },
      { preconnect() {} },
    ) satisfies typeof fetch;

    const core = new PulseQuery(createTestClient(fetchImpl).ordersByStatus({}));
    const subscribePromise = core.subscribe();
    core.destroy();
    releaseResponse();
    await subscribePromise;

    expect(core.getState()).toEqual({
      data: [],
      isLoading: true,
      isLoadingMore: false,
      hasMore: false,
      error: null,
    });
  });
});
