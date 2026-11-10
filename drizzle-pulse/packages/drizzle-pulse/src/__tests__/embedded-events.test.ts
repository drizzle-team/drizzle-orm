import { describe, expect, test } from 'bun:test';
import { createPulseEvents, type PulseEventsOptions } from '../client/embedded/events.js';
import type { PulseEvent } from '../shared/pulse-events.js';
import { asRuntime, makeMockRuntime } from './mock-runtime.js';

// ---------------------------------------------------------------------------
// No DB required: createPulseEvents is synchronous and stateless — no baseline,
// no merge core, no per-subscription error surface. Real WAL delivery order is
// covered by the integration suite.
// ---------------------------------------------------------------------------

const tableKey = 'public.orders';

type TestRow = Record<string, unknown>;
type TestCallback = (event: PulseEvent<TestRow>, lsn: string) => void;

// The mock's feed, narrowed to the queries the fixture registry serves — subscriptions
// get typed events instead of `any`.
function makeEvents(runtime: ReturnType<typeof makeMockRuntime>) {
  return createPulseEvents(asRuntime(runtime)) as unknown as {
    orders: (callback: TestCallback, options?: PulseEventsOptions) => () => void;
    nope: (callback: TestCallback) => () => void;
  };
}

describe('createPulseEvents — sync rejection paths', () => {
  test('an unknown query name throws synchronously', () => {
    const runtime = makeMockRuntime();
    runtime.registry = { ...runtime.registry, getPulseQuery: () => undefined };
    const events = makeEvents(runtime);
    expect(() => events.nope(() => {})).toThrow('Unknown query: "nope"');
  });

  test('subscribing before runtime.start() throws synchronously', () => {
    const runtime = makeMockRuntime({ isRunning: false });
    const events = makeEvents(runtime);
    expect(() => events.orders(() => {})).toThrow(/after runtime\.start\(\)/);
  });

  test('a .transform() query throws synchronously', () => {
    const runtime = makeMockRuntime({ hasTransform: true });
    const events = makeEvents(runtime);
    expect(() => events.orders(() => {})).toThrow(/\.transform\(\)/);
  });

  test('a .limit() query throws synchronously', () => {
    const runtime = makeMockRuntime({ limit: 2 });
    const events = makeEvents(runtime);
    expect(() => events.orders(() => {})).toThrow(/\.limit\(\)/);
  });

  test('a missing/wrong-arity callback throws synchronously instead of failing silently per event', () => {
    const runtime = makeMockRuntime();
    const events = makeEvents(runtime);
    // No-args query called as `events.orders(optionsObject)` — the "callback" is really options,
    // a misuse the type surface forbids, so the call goes through a deliberately-wrong shape.
    expect(() =>
      (events.orders as unknown as (options: unknown) => void)({ auth: { userId: 'u1' } }),
    ).toThrow(/expected a callback function/);
  });
});

describe('createPulseEvents — WHERE-filtered per-event delivery', () => {
  test('never calls readCollectionBaseline — the subscription needs no baseline', () => {
    const runtime = makeMockRuntime();
    runtime.readCollectionBaseline = async () => {
      throw new Error('readCollectionBaseline must never be called by createPulseEvents');
    };
    const events = makeEvents(runtime);
    const received: unknown[] = [];

    expect(() =>
      events.orders((event: unknown) => {
        received.push(event);
      }),
    ).not.toThrow();

    runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/100');
    expect(received).toHaveLength(1);
  });

  test('only rows matching the resolved WHERE produce callbacks', () => {
    const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
    const events = makeEvents(runtime);
    const received: unknown[] = [];
    events.orders((event: unknown) => received.push(event));

    runtime.emitTap(tableKey, 'insert', { id: 1, status: 'requested', price: 10 }, null, '0/100');
    expect(received).toHaveLength(0);

    runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/200');
    expect(received).toHaveLength(1);
  });

  test('the callback receives (event, lsn) with lsn equal to the emitted payload lsn', () => {
    const runtime = makeMockRuntime();
    const events = makeEvents(runtime);
    const received: Array<[string, string]> = [];
    events.orders((event: any, lsn: string) => received.push([event.op, lsn]));

    runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/1A2B');
    expect(received).toEqual([['insert', '0/1A2B']]);
  });

  test('an update carries matchesNew as the row moves out of the filter', () => {
    const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
    const events = makeEvents(runtime);
    const received: Array<{ matchesNew: boolean }> = [];
    events.orders((event: any) => received.push(event));

    runtime.emitTap(
      tableKey,
      'update',
      { id: 1, status: 'completed', price: 10 },
      { id: 1, status: 'accepted', price: 10 },
      '0/300',
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.matchesNew).toBe(false);
  });

  test('a delete whose old row does not match the where is suppressed', () => {
    const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
    const events = makeEvents(runtime);
    const received: Array<{ op: string }> = [];
    events.orders((event: any) => received.push(event));

    runtime.emitTap(tableKey, 'delete', {}, { id: 1, status: 'completed', price: 10 }, '0/302');

    expect(received).toHaveLength(0);
  });

  test('a delete whose old row matches the where is delivered', () => {
    const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
    const events = makeEvents(runtime);
    const received: Array<{ op: string }> = [];
    events.orders((event: any) => received.push(event));

    runtime.emitTap(tableKey, 'delete', {}, { id: 1, status: 'accepted', price: 10 }, '0/303');

    expect(received).toHaveLength(1);
    expect(received[0]!.op).toBe('delete');
  });

  test('an update where neither side matches the where is suppressed', () => {
    const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
    const events = makeEvents(runtime);
    const received: unknown[] = [];
    events.orders((event: unknown) => received.push(event));

    runtime.emitTap(
      tableKey,
      'update',
      { id: 1, status: 'requested', price: 10 },
      { id: 1, status: 'completed', price: 5 },
      '0/304',
    );

    expect(received).toHaveLength(0);
  });

  test('an update leaving the filter is delivered with an empty row and the pk on the event', () => {
    const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
    const events = makeEvents(runtime);
    const received: Array<{ row: unknown; pk: unknown; matchesNew: boolean }> = [];
    events.orders((event: any) => received.push(event));

    runtime.emitTap(
      tableKey,
      'update',
      { id: 1, status: 'completed', price: 10 },
      { id: 1, status: 'accepted', price: 10 },
      '0/305',
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.matchesNew).toBe(false);
    expect(received[0]!.row).toEqual({});
    expect(received[0]!.pk).toBe(1);
  });

  test('an update entering the filter redacts old_row — out-of-scope pre-update data never delivers', () => {
    const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
    const events = makeEvents(runtime);
    const received: Array<{ row: unknown; old_row: unknown; pk: unknown }> = [];
    events.orders((event: any) => received.push(event));

    runtime.emitTap(
      tableKey,
      'update',
      { id: 1, status: 'accepted', price: 10 },
      { id: 1, status: 'secret-other-scope', price: 999 },
      '0/306',
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.row).toEqual({ id: 1, status: 'accepted', price: 10 });
    expect(received[0]!.old_row).toEqual({});
    expect(received[0]!.pk).toBe(1);
  });

  test('unsubscribe stops delivery and is idempotent', () => {
    const runtime = makeMockRuntime();
    const events = makeEvents(runtime);
    let count = 0;
    const unsub = events.orders(() => count++);

    runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/100');
    expect(count).toBe(1);

    unsub();
    unsub(); // idempotent — no throw, no double-detach error

    runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/200');
    expect(count).toBe(1);
  });

  test('the captured onStop listener tears the subscription down', () => {
    let stopListener: (() => void) | undefined;
    const runtime = makeMockRuntime();
    runtime.onStop = (listener: () => void) => {
      stopListener = listener;
      return () => {
        stopListener = undefined;
      };
    };

    const events = makeEvents(runtime);
    let count = 0;
    events.orders(() => count++);

    runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/100');
    expect(count).toBe(1);

    stopListener?.();

    runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/200');
    expect(count).toBe(1);
  });
});
