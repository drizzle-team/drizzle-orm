import { describe, expect, it } from 'bun:test';
import { pgTable, serial } from 'drizzle-orm/pg-core';
import type { PendingWalEvent } from '../server/pulse-runtime.js';
import { makePulseRuntime } from './mock-runtime.js';

// PulseRuntime's in-process tap surface: subscribeTap registers embedded listeners keyed by a
// source table's qualified name, and the WAL loop's emitTap fans each PendingWalEvent out to
// them. emitTap is internal (driven by the WAL loop) — reached here via a cast to exercise the
// registry/fan-out/error-isolation behavior in isolation.

const TABLE_A = 'public.orders';
const TABLE_B = 'public.users';
const eventsTable = pgTable('orders_events', { id: serial('id').primaryKey() });

function walEvent(
  tableQualifiedName: string,
  op: PendingWalEvent['op'],
  row: Record<string, unknown>,
  oldRow: Record<string, unknown> | null,
): PendingWalEvent {
  const [schema, table] = tableQualifiedName.split('.') as [string, string];
  // Cast: op/oldRow are independent parameters here so the tap's fan-out can be driven with any
  // combination, including ones PendingWalEvent's op-discriminated shape forbids.
  return {
    eventsTable,
    pkKey: 'id',
    pkValue: (row as { id?: unknown }).id ?? (oldRow as { id?: unknown } | null)?.id,
    op,
    row,
    oldRow,
    tableQualifiedName,
    schema,
    table,
  } as PendingWalEvent;
}

function emit(runtime: unknown, event: PendingWalEvent, lsn: string): void {
  (runtime as { emitTap: (event: PendingWalEvent, lsn: string) => void }).emitTap(event, lsn);
}

describe('PulseRuntime tap surface', () => {
  it('delivers the exact event and commit lsn to a single listener', () => {
    const runtime = makePulseRuntime();
    const received: Array<{ event: PendingWalEvent; lsn: string }> = [];
    runtime.subscribeTap(TABLE_A, (event, lsn) => received.push({ event, lsn }));

    const event = walEvent(TABLE_A, 'insert', { id: 1 }, null);
    emit(runtime, event, '0/1A2B3C');

    expect(received).toHaveLength(1);
    expect(received[0]?.event).toBe(event);
    expect(received[0]?.lsn).toBe('0/1A2B3C');
  });

  it('fans out to multiple listeners on the same table in registration order', () => {
    const runtime = makePulseRuntime();
    const order: string[] = [];
    runtime.subscribeTap(TABLE_A, () => order.push('first'));
    runtime.subscribeTap(TABLE_A, () => order.push('second'));
    runtime.subscribeTap(TABLE_A, () => order.push('third'));

    emit(runtime, walEvent(TABLE_A, 'update', { id: 1 }, { id: 1, old: true }), '0/1');

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('does not call a listener registered on a different table', () => {
    const runtime = makePulseRuntime();
    let callsA = 0;
    let callsB = 0;
    runtime.subscribeTap(TABLE_A, () => callsA++);
    runtime.subscribeTap(TABLE_B, () => callsB++);

    emit(runtime, walEvent(TABLE_A, 'delete', {}, { id: 2 }), '0/1');

    expect(callsA).toBe(1);
    expect(callsB).toBe(0);
  });

  it('is a no-op when no listeners are registered for the table', () => {
    const runtime = makePulseRuntime();
    expect(() => emit(runtime, walEvent(TABLE_A, 'insert', { id: 1 }, null), '0/1')).not.toThrow();
  });

  it('stops delivering to a listener after unsubscribe', () => {
    const runtime = makePulseRuntime();
    const lsns: string[] = [];
    const unsub = runtime.subscribeTap(TABLE_A, (_event, lsn) => lsns.push(lsn));

    emit(runtime, walEvent(TABLE_A, 'insert', { id: 1 }, null), '0/1');
    unsub();
    emit(runtime, walEvent(TABLE_A, 'insert', { id: 2 }, null), '0/2');

    expect(lsns).toEqual(['0/1']);
  });

  it('isolates listener errors — a throwing listener neither drops others nor propagates out', () => {
    const runtime = makePulseRuntime({ logLevel: 0 });
    let reached = 0;
    runtime.subscribeTap(TABLE_A, () => {
      throw new Error('listener boom');
    });
    runtime.subscribeTap(TABLE_A, () => reached++);

    expect(() => emit(runtime, walEvent(TABLE_A, 'insert', { id: 1 }, null), '0/1')).not.toThrow();
    expect(reached).toBe(1);
  });
});
