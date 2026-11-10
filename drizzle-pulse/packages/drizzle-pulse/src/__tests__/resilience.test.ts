import { afterAll, describe, expect, mock, test } from 'bun:test';
import * as realCdc from '@drizzle-team/minipg/cdc';
import { makePulseRuntime } from './mock-runtime.js';

// ---------------------------------------------------------------------------
// The reconnect edge that stayed in pulse after the CDC layer took the connection loop.
// minipg's `replicate()` owns connect, slot administration, backoff and the retry budget, and
// tests those itself. What is still pulse policy — and only observable here — is WHICH session
// events rebuild consumer state: a rebaseline round must fire when a stream re-opens under live
// collections, and must not fire on the very first one, when no collection exists yet.
//
// `replicate()` is a free function, not a method on the runtime, so there is no instance seam to
// override — the module is mocked (live-binding update, per Bun's mock.module docs) to capture
// the options object, and the test drives the driver's callbacks directly.
// ---------------------------------------------------------------------------

type ReplicateOpts = Parameters<typeof realCdc.replicate>[0];

let captured: ReplicateOpts | null = null;
let handleReady: Promise<void>;
let stopCalls = 0;

mock.module('@drizzle-team/minipg/cdc', () => ({
  ...realCdc,
  replicate: (opts: ReplicateOpts) => {
    captured = opts;
    return {
      stop: async () => {
        stopCalls++;
      },
      ready: handleReady,
    };
  },
}));

afterAll(() => {
  mock.module('@drizzle-team/minipg/cdc', () => realCdc);
});

describe('runtime reconnect edge', () => {
  test('the rebaseline round fires when a stream re-opens, not on the first one', async () => {
    // pull:false: no events tables and no store, so the backfill callback's only job here
    // is the collection rebaseline round this test observes.
    const runtime = makePulseRuntime({ pull: false });
    // rebaselineCollections pins the exported snapshot in an admin transaction before firing the
    // round; the store is normally opened by start(), which this test bypasses.
    (runtime as any).store = {
      getDb: () => ({
        transaction: async (fn: (tx: unknown) => Promise<void>) =>
          fn({ execute: async () => ({ rows: [] }) }),
      }),
    };
    let fired = 0;
    runtime.onReconnect(() => {
      fired++;
    });

    let resolveReady!: () => void;
    handleReady = new Promise<void>((res) => {
      resolveReady = res;
    });

    // openSession is the private seam that builds the replicate() options; awaiting it settles
    // once the mocked driver's ready promise resolves.
    const opening = (runtime as any).openSession();
    const opts = captured;
    if (!opts?.backfill) throw new Error('replicate() was called without a backfill callback');

    // A temporary slot is recreated per session, so every stream open arrives as a backfill.
    const window = {
      snapshot: 'snap-1',
      streamStartLsn: '0/1000000',
      isReconnect: false,
      signal: new AbortController().signal,
    };

    await opts.backfill(window);

    // openSession settles on ready, not on backfill completing. A Promise.race against an
    // already-resolved sentinel cannot show this: .then() costs a microtask tick, so the
    // sentinel wins even when opening has settled. Flush the queue and read the flag instead.
    let opened = false;
    void opening.then(() => {
      opened = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(opened).toBe(false);

    resolveReady();
    await opening;
    expect(fired).toBe(0);

    await opts.backfill({ ...window, snapshot: 'snap-2', isReconnect: true });
    expect(fired).toBe(1);
  });

  test('a rejected ready stops the session and openSession rejects with the same error', async () => {
    // A real first-connect failure fails bootstrap() before a session ever exists, so this path
    // is only reachable against the mock.
    stopCalls = 0;
    handleReady = Promise.reject(new Error('connect refused'));

    const runtime = makePulseRuntime({ pull: false });

    await expect((runtime as any).openSession()).rejects.toThrow('connect refused');
    expect(stopCalls).toBe(1);
  });
});
