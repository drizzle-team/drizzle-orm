import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createRuntime, LogLevel, type TelemetryEvent } from 'drizzle-pulse/embedded';
import postgres from 'postgres';
import { orders, ordersByStatusArgsSchema } from './fixtures/minimal-orders/schema.js';
import { createScenarioDb, waitFor } from './helpers/scenario.js';
import { withQuietPostgresUrl } from './helpers/test-harness.js';

const ordersByStatus = pulse(orders)
  .args(ordersByStatusArgsSchema)
  .order('asc')
  .query((ctx) => ctx.query({ status: ctx.args.status }));

describe('drizzle-pulse/embedded — telemetry', () => {
  test('reports one grouped event per transaction with microsecond stamps', async () => {
    const scenario = await createScenarioDb('pulse_telemetry');
    const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));
    const received: TelemetryEvent[] = [];
    try {
      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );

      const runtime = createRuntime({
        queries: { ordersByStatus },
        databaseUrl: scenario.databaseUrl,
        sourceDb: drizzle({ client: sourceSql }),
        wal: { publicationName: 'telemetry_pub', slotName: 'telemetry_slot' },
        logLevel: LogLevel.Error,
        telemetry: (event) => {
          received.push(event);
        },
      });

      await runtime.start();

      const collection = await runtime.client.ordersByStatus({ status: 'accepted' });
      expect(collection.list()).toHaveLength(1);
      // Baseline reads emit no telemetry — only newly applied WAL row events do.
      expect(received.length).toBe(0);

      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (2, 'accepted', 20)`,
      );
      await waitFor(() => received.length === 1);

      const event = received[0]!;
      expect(Object.keys(event).sort()).toEqual([
        'appliedAt',
        'commitLsn',
        'committedAt',
        'op',
        'rowCount',
        'schema',
        'table',
      ]);
      expect(event.op).toBe('insert');
      expect(event.schema).toBe('public');
      expect(event.table).toBe('orders');
      expect(event.rowCount).toBe(1);
      expect(event.commitLsn).toMatch(/^[0-9A-F]+\/[0-9A-F]+$/i);
      expect(Number.isInteger(event.committedAt)).toBe(true);
      expect(Number.isInteger(event.appliedAt)).toBe(true);
      expect(event.committedAt).toBeGreaterThan(0);
      // Two different clocks (database host vs. app host) — generous bound, not a precision check.
      expect(Math.abs(event.appliedAt - event.committedAt)).toBeLessThan(60_000_000);
      // Pins the UNIT: a millisecond value or a PG-epoch value both blow this bound; only a
      // correct epoch-microsecond value stays within it.
      expect(Math.abs(event.committedAt - Date.now() * 1000)).toBeLessThan(60_000_000);

      // Two rows in one transaction collapse into a single grouped event with rowCount 2.
      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (3, 'accepted', 30), (4, 'accepted', 40)`,
      );
      await waitFor(() => received.length === 2);
      const grouped = received[1]!;
      expect(grouped.op).toBe('insert');
      expect(grouped.rowCount).toBe(2);
      expect(grouped.commitLsn).not.toBe(event.commitLsn);

      // Telemetry counts WAL events as the wire delivered them: a pk-changing UPDATE (which
      // pulse applies as delete-then-insert) reports one update.
      await scenario.sql.unsafe(`UPDATE "orders" SET id = 99 WHERE id = 1`);
      await waitFor(() => received.length === 3);
      const pkChange = received[2]!;
      expect(pkChange.op).toBe('update');
      expect(pkChange.rowCount).toBe(1);

      collection.dispose();
      await runtime.stop();
    } finally {
      await sourceSql.end();
      await scenario.drop();
    }
  });

  test('a throwing callback does not stop subsequent events from applying', async () => {
    const scenario = await createScenarioDb('pulse_telemetry_throw');
    const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));
    let calls = 0;
    const received: TelemetryEvent[] = [];
    try {
      const runtime = createRuntime({
        queries: { ordersByStatus },
        databaseUrl: scenario.databaseUrl,
        sourceDb: drizzle({ client: sourceSql }),
        wal: { publicationName: 'telemetry_throw_pub', slotName: 'telemetry_throw_slot' },
        logLevel: LogLevel.Silent,
        telemetry: (event) => {
          calls += 1;
          if (calls === 1) throw new Error('boom');
          received.push(event);
        },
      });

      await runtime.start();

      const collection = await runtime.client.ordersByStatus({ status: 'accepted' });
      expect(collection.list()).toHaveLength(0);

      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (2, 'accepted', 20)`,
      );

      await waitFor(() => received.length === 1);
      expect(received[0]?.op).toBe('insert');

      await waitFor(() => collection.list().length === 2);

      collection.dispose();
      await runtime.stop();
    } finally {
      await sourceSql.end();
      await scenario.drop();
    }
  });

  test('a reconnect rebaseline reports the recovered rows', async () => {
    const scenario = await createScenarioDb('pulse_telemetry_reconnect');
    const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));
    const received: TelemetryEvent[] = [];
    const slotName = 'telemetry_reconnect_slot';
    try {
      const runtime = createRuntime({
        queries: { ordersByStatus },
        databaseUrl: scenario.databaseUrl,
        sourceDb: drizzle({ client: sourceSql }),
        wal: { publicationName: 'telemetry_reconnect_pub', slotName },
        logLevel: LogLevel.Error,
        telemetry: (event) => {
          received.push(event);
        },
      });

      await runtime.start();

      const collection = await runtime.client.ordersByStatus({ status: 'accepted' });

      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      await waitFor(() => received.filter((event) => event.op === 'insert').length === 1);

      // Locate the active temp slot (randomized-suffix, never the base slotName) and its
      // walsender backend.
      const before = await scenario.sql.unsafe<{ slot_name: string; active_pid: number | null }[]>(
        `SELECT slot_name, active_pid FROM pg_replication_slots WHERE slot_name LIKE $1`,
        [`${slotName}\\_%`],
      );
      expect(before).toHaveLength(1);
      const activePid = before[0]?.active_pid;
      expect(activePid).not.toBeNull();

      // Terminate only — do NOT drop. The temporary slot dies with its backend, and the
      // reconnect creates a fresh one.
      await scenario.sql.unsafe(`SELECT pg_terminate_backend($1)`, [activePid ?? null]);

      // Downtime write while disconnected — the row only a rebaseline can recover.
      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (2, 'accepted', 20)`,
      );

      // First reconnect lands ~1-2s after the edge (the driver's base backoff plus jitter).
      await waitFor(() => collection.list().length === 2, 10000);
      await waitFor(() => received.some((event) => event.op === 'rebaseline'));

      const rebaselineEvents = received.filter((event) => event.op === 'rebaseline');
      expect(rebaselineEvents).toHaveLength(1);
      const rebaseline = rebaselineEvents[0]!;
      expect(rebaseline.rowCount).toBe(2);
      expect(rebaseline.schema).toBe('public');
      expect(rebaseline.table).toBe('orders');
      expect(rebaseline.commitLsn).toMatch(/^[0-9A-F]+\/[0-9A-F]+$/i);
      expect(rebaseline.committedAt).toBe(rebaseline.appliedAt);
      expect(Object.keys(rebaseline).sort()).toEqual([
        'appliedAt',
        'commitLsn',
        'committedAt',
        'op',
        'rowCount',
        'schema',
        'table',
      ]);

      // No double count: the downtime row is accounted for by the rebaseline event and by
      // nothing else — the insert count from before the reconnect still stands alone.
      expect(received.filter((event) => event.op === 'insert')).toHaveLength(1);

      // Counts continue past the edge.
      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (3, 'accepted', 30)`,
      );
      await waitFor(() => received.filter((event) => event.op === 'insert').length === 2);
      const secondInsert = received.filter((event) => event.op === 'insert')[1]!;
      expect(secondInsert.rowCount).toBe(1);

      collection.dispose();
      await runtime.stop();
    } finally {
      await sourceSql.end();
      await scenario.drop();
    }
  }, 30000);
});
