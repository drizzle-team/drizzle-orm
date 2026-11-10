import { describe, expect, test } from 'bun:test';
import type { PulseSourceDb } from '../server/pulse-sql.js';
import { makePulseRuntime, makeResolvedQuery } from './mock-runtime.js';

// ---------------------------------------------------------------------------
// readCollectionBaseline: the watermark-then-baseline reader the embedded
// tap-direct handshake consumes. Ordering is the entire point —
// recorded via invocation order, not timing.
// ---------------------------------------------------------------------------

describe('readCollectionBaseline', () => {
  test('reads the watermark strictly before running the baseline SELECT', async () => {
    const order: string[] = [];
    const watermarkValue = '0/1A2B3C';
    const rows = [{ id: 1, status: 'open', price: 10 }];

    const dynamicQuery: any = Object.assign(Promise.resolve(rows), {
      $dynamic() {
        return dynamicQuery;
      },
      orderBy() {
        return dynamicQuery;
      },
    });

    const sourceDb = {
      async execute() {
        order.push('watermark');
        return [{ lsn: watermarkValue }];
      },
      select() {
        order.push('select');
        return {
          from() {
            return {
              where() {
                return {
                  $dynamic() {
                    return dynamicQuery;
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as PulseSourceDb;

    const runtime = makePulseRuntime({ sourceDb });
    const resolved = makeResolvedQuery();

    const result = await runtime.readCollectionBaseline(resolved);

    expect(order).toEqual(['watermark', 'select']);
    expect(result.watermark).toBe(watermarkValue);
    expect(result.rows).toEqual(rows);
  });

  test('throws if pg_current_wal_lsn() returns no watermark row', async () => {
    const sourceDb = {
      async execute() {
        return [];
      },
      select() {
        throw new Error('select must not run when the watermark read fails');
      },
    } as unknown as PulseSourceDb;

    const runtime = makePulseRuntime({ sourceDb });

    await expect(runtime.readCollectionBaseline(makeResolvedQuery())).rejects.toThrow(
      'pg_current_wal_lsn()',
    );
  });
});

// ---------------------------------------------------------------------------
// onTerminalError: the terminal-failure edge — fires once reconnect gives
// up permanently, then the runtime stops (collections dispose via onStop).
// ---------------------------------------------------------------------------

describe('onTerminalError', () => {
  test('fires with an Error before onStop on the give-up path', async () => {
    const runtime = makePulseRuntime();
    const events: string[] = [];
    let receivedError: Error | null = null;

    runtime.onTerminalError((error) => {
      receivedError = error;
      events.push('terminal');
    });
    runtime.onStop(() => {
      events.push('stop');
    });

    // handleFatal is the private terminal seam the driver's onFatalError routes into. A plain
    // Error is not slot-recoverable, so it takes the fan-out-and-stop path directly.
    await (runtime as any).handleFatal(new Error('replication gave up'));
    // stop() is invoked fire-and-forget (`void this.stop()`); flush any pending microtasks.
    await Promise.resolve();

    expect(events).toEqual(['terminal', 'stop']);
    expect(receivedError).toBeInstanceOf(Error);
  });

  test('an onTerminalError listener throwing does not prevent onStop from firing', async () => {
    const runtime = makePulseRuntime();
    const events: string[] = [];

    runtime.onTerminalError(() => {
      throw new Error('terminal listener boom');
    });
    runtime.onStop(() => {
      events.push('stop');
    });

    await (runtime as any).handleFatal(new Error('replication gave up'));
    await Promise.resolve();

    expect(events).toEqual(['stop']);
  });
});
