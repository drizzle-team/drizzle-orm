import { describe, expect, test } from 'bun:test';
import {
  createPulseClient,
  type PulseCollection,
  type PulseCollectionOptions,
} from '../client/embedded/index.js';
import { asRuntime, makeMockRuntime } from './mock-runtime.js';

// ---------------------------------------------------------------------------
// No DB required: these cover the embedded client's tap-direct handshake, the
// watermark filter, and the locked surface (list/onChange/onError/dispose). Real WAL
// push behavior against Postgres is covered by the integration suite.
// ---------------------------------------------------------------------------

const tableKey = 'public.orders';

type TestRow = Record<string, unknown>;

// The mock's client, narrowed to the queries the fixture registry serves — collection
// assertions get the real PulseCollection surface instead of `any`.
function makeClient(runtime: ReturnType<typeof makeMockRuntime>) {
  return createPulseClient(asRuntime(runtime)) as unknown as {
    orders: (options?: PulseCollectionOptions) => Promise<PulseCollection<TestRow>>;
    nope: () => Promise<PulseCollection<TestRow>>;
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('embedded client — user-facing error paths', () => {
  test('creating a .transform() query rejects (unsupported in the embedded client)', async () => {
    const runtime = makeMockRuntime({ hasTransform: true });
    const client = makeClient(runtime);
    await expect(client.orders()).rejects.toThrow(/\.transform\(\)/);
  });

  test('creating a .limit() query rejects (unsupported in the embedded client)', async () => {
    const runtime = makeMockRuntime({ limit: 2 });
    const client = makeClient(runtime);
    await expect(client.orders()).rejects.toThrow(/\.limit\(\)/);
  });

  test('creating a collection before runtime.start() rejects', async () => {
    const runtime = makeMockRuntime({ isRunning: false });
    const client = makeClient(runtime);
    await expect(client.orders()).rejects.toThrow(/after runtime\.start\(\)/);
  });

  test('an unknown query name rejects', async () => {
    const runtime = makeMockRuntime();
    runtime.registry = { ...runtime.registry, getPulseQuery: () => undefined };
    const client = makeClient(runtime);
    await expect(client.nope()).rejects.toThrow('Unknown query: "nope"');
  });

  test('the factory rejects when the initial baseline read fails and the tap is detached', async () => {
    const runtime = makeMockRuntime();
    runtime.readCollectionBaseline = async () => {
      throw new Error('DB connection failed');
    };

    let unsubCount = 0;
    const realSubscribe = runtime.subscribeTap;
    runtime.subscribeTap = (key: string, listener: any) => {
      const inner = realSubscribe(key, listener);
      return () => {
        unsubCount++;
        inner();
      };
    };

    const client = makeClient(runtime);
    await expect(client.orders()).rejects.toThrow('DB connection failed');
    // dispose() ran on the failed handshake, detaching the WAL tap.
    expect(unsubCount).toBe(1);
  });

  test('the factory rejects when the runtime stops mid-load', async () => {
    let releaseBaseline!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseBaseline = resolve;
    });
    const stopListeners: Array<() => void> = [];

    const runtime = makeMockRuntime();
    runtime.readCollectionBaseline = async () => {
      await gate;
      return { rows: [], watermark: '0/100' };
    };
    runtime.onStop = (listener: () => void) => {
      stopListeners.push(listener);
      return () => {};
    };

    const client = makeClient(runtime);
    const pending = client.orders();
    // Simulate runtime.stop() broadcasting while the baseline read is in flight.
    for (const listener of stopListeners) listener();
    releaseBaseline();

    await expect(pending).rejects.toThrow(/disposed before the initial sync completed/);
  });

  test('the client proxy is not accidentally thenable — awaiting it settles instead of hanging', async () => {
    const runtime = makeMockRuntime();
    const client = makeClient(runtime);

    expect((client as { then?: unknown }).then).toBeUndefined();
    // Race against a short timeout: pre-fix, `await client` never settles because the
    // proxy's `then` triggers a rejected-but-ignored promise instead of resolving/rejecting
    // the awaiting one. `Promise.race` proves the await itself resolves promptly.
    const resolvedInTime = await Promise.race([
      Promise.resolve(client).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 200)),
    ]);
    expect(resolvedInTime).toBe(true);
  });
});

describe('embedded client — zero wire protocol', () => {
  test('the mock runtime has no handlers property and the collection still works', async () => {
    // The tap-direct client must not need the SDK/wire-protocol surface at all.
    const runtime = makeMockRuntime({ baselineRows: [{ id: 1, status: 'accepted', price: 10 }] });
    expect('handlers' in runtime).toBe(false);

    const client = makeClient(runtime);
    const collection = await client.orders();
    expect(collection.list()).toHaveLength(1);

    runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/999');
    expect(collection.list()).toHaveLength(2);

    collection.dispose();
  });
});

describe('embedded client — tap-direct handshake', () => {
  test('a tap payload below the watermark is dropped; at-or-above is applied (exactly-once)', async () => {
    const runtime = makeMockRuntime({
      baselineRows: [{ id: 1, status: 'accepted', price: 10 }],
      watermark: '0/100',
    });
    const client = makeClient(runtime);
    const collection = await client.orders();

    const changes: Array<{ events: readonly any[]; state: readonly any[]; lsn: string }> = [];
    collection.onChange((c: any) => changes.push(c));

    // Below the watermark: guaranteed already present in the baseline, so it's dropped.
    runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/90');
    expect(collection.list()).toHaveLength(1);
    expect(changes).toHaveLength(0);

    // At-or-above the watermark: applied and onChange fires with that payload's lsn.
    runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/110');
    expect(collection.list()).toHaveLength(2);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.lsn).toBe('0/110');

    collection.dispose();
  });

  test('an insert already present in the baseline is deduped by pk, even above the watermark', async () => {
    const runtime = makeMockRuntime({
      baselineRows: [{ id: 1, status: 'accepted', price: 10 }],
      watermark: '0/100',
    });
    const client = makeClient(runtime);
    const collection = await client.orders();

    runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/110');

    expect(collection.list()).toHaveLength(1);
    expect(collection.list().map((r: any) => r.id)).toEqual([1]);

    collection.dispose();
  });

  test('an update moving a row out of filter removes it from list(); a delete removes the old row', async () => {
    const runtime = makeMockRuntime({
      baselineRows: [{ id: 1, status: 'accepted', price: 10 }],
      where: { status: { eq: 'accepted' } },
    });
    const client = makeClient(runtime);
    const collection = await client.orders();

    const changes: any[] = [];
    collection.onChange((c: any) => changes.push(c));

    // UPDATE out of filter: accepted -> completed (matchesNew=false; membership removes the row)
    runtime.emitTap(
      tableKey,
      'update',
      { id: 1, status: 'completed', price: 15 },
      { id: 1, status: 'accepted', price: 10 },
      '0/300',
    );
    expect(collection.list()).toHaveLength(0);
    expect(changes[0]!.events[0].op).toBe('update');
    expect(changes[0]!.events[0].matchesNew).toBe(false);

    // INSERT another matching row, then DELETE it.
    runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/400');
    expect(collection.list()).toHaveLength(1);

    runtime.emitTap(tableKey, 'delete', {}, { id: 2, status: 'accepted', price: 20 }, '0/500');
    expect(collection.list()).toHaveLength(0);
    expect(changes[2]!.events[0].op).toBe('delete');

    collection.dispose();
  });

  test('onChange and onError both return functions that detach', async () => {
    let terminalErrorListener: ((error: Error) => void) | undefined;
    const runtime = makeMockRuntime();
    runtime.onTerminalError = (listener: (error: Error) => void) => {
      terminalErrorListener = listener;
      return () => {
        terminalErrorListener = undefined;
      };
    };

    const client = makeClient(runtime);
    const collection = await client.orders();

    let changeCount = 0;
    let errorCount = 0;
    const offChange = collection.onChange(() => changeCount++);
    const offError = collection.onError(() => errorCount++);

    runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/200');
    terminalErrorListener?.(new Error('boom'));
    expect(changeCount).toBe(1);
    expect(errorCount).toBe(1);

    offChange();
    offError();

    runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/300');
    terminalErrorListener?.(new Error('boom again'));
    expect(changeCount).toBe(1);
    expect(errorCount).toBe(1);

    collection.dispose();
  });

  test('rebaseline on reconnect refreshes state and fires onChange with the new watermark', async () => {
    let reconnectListener: (() => void) | undefined;
    const runtime = makeMockRuntime({
      baselineRows: [{ id: 1, status: 'accepted', price: 10 }],
      watermark: '0/100',
    });
    runtime.onReconnect = (listener: () => void) => {
      reconnectListener = listener;
      return () => {
        reconnectListener = undefined;
      };
    };

    const client = makeClient(runtime);
    const collection = await client.orders();
    expect(collection.list()).toHaveLength(1);

    const changes: any[] = [];
    collection.onChange((c: any) => changes.push(c));

    runtime.readCollectionBaseline = async () => ({
      rows: [
        { id: 1, status: 'accepted', price: 10 },
        { id: 2, status: 'accepted', price: 20 },
      ],
      watermark: '0/200',
    });

    reconnectListener?.();
    await flushMicrotasks();

    expect(collection.list()).toHaveLength(2);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.events).toEqual([]);
    expect(changes[0]!.lsn).toBe('0/200');

    collection.dispose();
  });

  test('an overlapping reconnect handshake supersedes a slower stale one', async () => {
    let reconnectListener: (() => void) | undefined;
    const runtime = makeMockRuntime({
      baselineRows: [{ id: 1, status: 'accepted', price: 10 }],
      watermark: '0/100',
    });
    runtime.onReconnect = (listener: () => void) => {
      reconnectListener = listener;
      return () => {
        reconnectListener = undefined;
      };
    };

    let releaseInitial!: () => void;
    let releaseReconnect!: () => void;
    const initialGate = new Promise<void>((resolve) => {
      releaseInitial = resolve;
    });
    const reconnectGate = new Promise<void>((resolve) => {
      releaseReconnect = resolve;
    });

    let call = 0;
    runtime.readCollectionBaseline = async () => {
      call++;
      if (call === 1) {
        await initialGate;
        return { rows: [{ id: 1, status: 'accepted', price: 10 }], watermark: '0/100' };
      }
      await reconnectGate;
      return {
        rows: [
          { id: 1, status: 'accepted', price: 10 },
          { id: 2, status: 'accepted', price: 20 },
        ],
        watermark: '0/200',
      };
    };

    const client = makeClient(runtime);
    // Initial handshake (gen 1) starts and blocks on initialGate.
    const collectionPromise = client.orders();

    // Reconnect fires while the initial handshake is still awaiting its baseline read — this
    // is the overlap under test: a reconnect racing collection creation.
    reconnectListener?.();

    // The newer handshake (gen 2) resolves first with the current 2-row state...
    releaseReconnect();
    await flushMicrotasks();
    // ...then the older, now-stale initial handshake (gen 1) resolves. Pre-fix, it would
    // unconditionally rebuild the core from its 1-row baseline, clobbering gen 2's state.
    releaseInitial();

    const collection = await collectionPromise;
    await flushMicrotasks();

    expect(collection.list()).toHaveLength(2);
    expect(
      collection
        .list()
        .map((r: any) => r.id)
        .sort(),
    ).toEqual([1, 2]);

    collection.dispose();
  });

  test('a rejecting rebaseline fires onError instead of throwing', async () => {
    let reconnectListener: (() => void) | undefined;
    const runtime = makeMockRuntime();
    runtime.onReconnect = (listener: () => void) => {
      reconnectListener = listener;
      return () => {
        reconnectListener = undefined;
      };
    };

    const client = makeClient(runtime);
    const collection = await client.orders();

    const errors: Error[] = [];
    collection.onError((e: Error) => errors.push(e));

    runtime.readCollectionBaseline = async () => {
      throw new Error('reconnect baseline failed');
    };

    reconnectListener?.();
    await flushMicrotasks();

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('reconnect baseline failed');

    // The collection must not be left permanently latched into buffering: a live tap
    // payload after the failed rebaseline should apply immediately, not queue forever.
    runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/999');
    expect(collection.list()).toHaveLength(1);

    collection.dispose();
  });

  test('a buffered payload drained by a rebaseline after dispose() does not fire onChange', async () => {
    let reconnectListener: (() => void) | undefined;
    const runtime = makeMockRuntime();
    runtime.onReconnect = (listener: () => void) => {
      reconnectListener = listener;
      return () => {
        reconnectListener = undefined;
      };
    };

    const client = makeClient(runtime);
    const collection = await client.orders();

    let changeCount = 0;
    collection.onChange(() => changeCount++);

    let releaseBaseline!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseBaseline = resolve;
    });
    runtime.readCollectionBaseline = async () => {
      await gate;
      return { rows: [], watermark: '0/100' };
    };

    reconnectListener?.();
    // While the rebaseline is in flight, this payload is buffered (above the watermark, so
    // it will be applied when the buffer drains).
    runtime.emitTap(tableKey, 'insert', { id: 9, status: 'accepted', price: 90 }, null, '0/200');

    // dispose() before the buffer drains — the drain (inside runHandshake, before the
    // reconnect wrapper's own isDisposed check runs) must not fire onChange into it.
    collection.dispose();
    releaseBaseline();
    await flushMicrotasks();

    expect(changeCount).toBe(0);
  });

  test('a terminal replication error fires onError', async () => {
    let terminalErrorListener: ((error: Error) => void) | undefined;
    const runtime = makeMockRuntime();
    runtime.onTerminalError = (listener: (error: Error) => void) => {
      terminalErrorListener = listener;
      return () => {
        terminalErrorListener = undefined;
      };
    };

    const client = makeClient(runtime);
    const collection = await client.orders();

    const errors: Error[] = [];
    collection.onError((e: Error) => errors.push(e));

    terminalErrorListener?.(new Error('replication gave up'));

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('replication gave up');

    collection.dispose();
  });
});
