import { describe, expect, test } from 'bun:test';
import { createPulseRegistry } from '../server/pulse-registry.js';
import { PulseRuntime } from '../server/pulse-runtime.js';
import type { PulseSourceDb } from '../server/pulse-sql.js';
import { makePulseRuntime } from './mock-runtime.js';

describe('wal config resolution', () => {
  test('defaults to drizzle_pulse/drizzle_pulse when wal is omitted', () => {
    const runtime = new PulseRuntime(createPulseRegistry({}), {
      databaseUrl: 'postgresql://user:pass@localhost/test',
      sourceDb: {} as PulseSourceDb,
      pull: true,
    });

    expect(runtime.publicationName).toBe('drizzle_pulse');
    expect(runtime.slotName).toBe('drizzle_pulse');
  });
});

describe('start() failure rolls back to a restartable state', () => {
  test('a throw from bootstrap() resets isRunning and tears down the store instead of leaving a zombie', async () => {
    const runtime = makePulseRuntime({
      databaseUrl: 'postgresql://user:pass@localhost/test',
    });
    // store/bootstrap/openSession are private seams; every other access in this
    // test stays on the public type.
    const internals = runtime as any;

    // Baseline seeding happens inside the CDC session's backfill/resume callbacks — a failure
    // there becomes a driver retry, not a start() rejection. bootstrap() is the only await left
    // in start()'s try block before the session opens, so it's the seam that must throw to
    // exercise the rollback path.
    let storeEnded = 0;
    internals.store = {
      end: async () => {
        storeEnded++;
      },
    };
    internals.bootstrap = async () => {
      throw new Error('sourceDb briefly unavailable');
    };

    await expect(runtime.start()).rejects.toThrow('sourceDb briefly unavailable');

    expect(runtime.isRunning).toBe(false);
    expect(internals.store).toBeNull();
    expect(storeEnded).toBe(1);

    // A retry must not hit the "Already running" early return and silently no-op — it
    // must re-attempt bootstrap() and actually start the replication loop.
    let secondAttemptRan = false;
    internals.bootstrap = async () => {
      secondAttemptRan = true;
    };
    internals.openSession = async () => {
      internals.session = { stop: async () => {} };
    };

    await runtime.start();

    expect(secondAttemptRan).toBe(true);
    expect(runtime.isRunning).toBe(true);
  });
});

describe('rebaselineCollections', () => {
  // The snapshot transaction itself (BEGIN/SET TRANSACTION SNAPSHOT/COMMIT) is drizzle's
  // job now — what stays ours is the listener round inside it and the no-snapshot fast path.
  function makeRuntimeWithRebaseline(
    transaction: (cb: (tx: unknown) => Promise<void>) => Promise<void>,
  ) {
    const runtime = makePulseRuntime({
      databaseUrl: 'postgresql://user:pass@localhost/test',
    });
    // getPulseStore/rebaselineCollections are private seams; the casts stay inside this
    // helper so the tests below run against the public type.
    (runtime as any).getPulseStore = () => ({
      getDb: () => ({ transaction }),
    });
    return {
      runtime,
      rebaseline: (snapshotName?: string, consistentPoint?: string) =>
        (runtime as any).rebaselineCollections(snapshotName, consistentPoint) as Promise<void>,
    };
  }

  test('a rejecting listener still lets the round finish', async () => {
    const { runtime, rebaseline } = makeRuntimeWithRebaseline(async (cb) => {
      await cb({ execute: async () => {} });
    });

    let secondRan = false;
    runtime.onReconnect(async () => {
      throw new Error('rebaseline boom');
    });
    runtime.onReconnect(async () => {
      secondRan = true;
    });

    await rebaseline('00000000-0000-0000-0000-000000000000', '0/100');

    // A listener rejecting on its own (before touching the connection) is fully isolated. A
    // listener whose SELECT errors is not — it poisons the shared snapshot transaction — which is
    // why this asserts the round completing, not per-collection isolation.
    expect(secondRan).toBe(true);
  });

  test('an intact resumed slot exports no snapshot — listeners run with null and no transaction is opened', async () => {
    const { runtime, rebaseline } = makeRuntimeWithRebaseline(async () => {
      throw new Error('no transaction should be opened without a snapshot');
    });

    let received: unknown = 'unset';
    runtime.onReconnect((snapshot) => {
      received = snapshot;
    });

    await rebaseline(undefined, undefined);

    expect(received).toBeNull();
  });
});
