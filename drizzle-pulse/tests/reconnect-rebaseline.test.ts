/**
 * A REAL dropped walsender socket must still trigger the embedded collection's rebaseline
 * handshake: one onChange with an empty event batch and a fresh watermark lsn, no row loss
 * or duplication, and continued delivery afterwards.
 *
 * The second test pins the ordering that makes that gapless: every live collection rebaselines
 * from the new slot's exported snapshot BEFORE the stream opens, so no event can be delivered
 * while a collection is still rebuilding.
 *
 * Uses a split URL configuration: the runtime's
 * `databaseUrl` (walsender + admin pool) routes through the test-only TCP proxy, `sourceDb`
 * stays on the direct connection.
 */

import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseClient, createPulseEvents } from 'drizzle-pulse/client/embedded';
import { createPulseRegistry, LogLevel, PulseRuntime } from 'drizzle-pulse/server';
import postgres from 'postgres';
import { orders, ordersByStatusArgsSchema } from './fixtures/minimal-orders/schema.js';
import { createScenarioDb, waitFor } from './helpers/scenario.js';
import { baseDatabaseUrl, randomSuffix, withQuietPostgresUrl } from './helpers/test-harness.js';
import { proxiedDatabaseUrl, startWalProxy } from './helpers/wal-proxy.js';

const LSN_PATTERN = /^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/;

const ordersByStatus = pulse(orders)
  .args(ordersByStatusArgsSchema)
  .order('asc')
  .query((ctx) => ctx.query({ status: ctx.args.status }));

function buildRegistry() {
  return createPulseRegistry({ ordersByStatus });
}

async function dropSlotWithRetry(
  sql: ReturnType<typeof postgres>,
  slotName: string,
): Promise<void> {
  await waitFor(async () => {
    try {
      await sql.unsafe(`SELECT pg_drop_replication_slot($1)`, [slotName]);
      return true;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === '42704') return true; // undefined_object — already gone
      if (code === '55006') return false; // object_in_use — walsender still attached, retry
      throw e;
    }
  }, 5000);
}

// Terminates the walsender backing `slotName` then drops the slot, poll-retrying on 55006
// (object_in_use — the "active" flag can lag the backend's actual termination by a beat).
async function forceSlotLoss(sql: ReturnType<typeof postgres>, slotName: string): Promise<void> {
  const rows = await sql.unsafe<{ active_pid: number | null }[]>(
    `SELECT active_pid FROM pg_replication_slots WHERE slot_name = $1`,
    [slotName],
  );
  const activePid = rows[0]?.active_pid;
  if (activePid) {
    await sql.unsafe(`SELECT pg_terminate_backend($1)`, [activePid]);
  }
  await dropSlotWithRetry(sql, slotName);
}

async function eventsTableEpoch(sql: ReturnType<typeof postgres>): Promise<string | undefined> {
  const rows = await sql.unsafe<{ epoch: string }[]>(
    `SELECT epoch FROM "drizzle_pulse"."pulse_meta" WHERE table_name = 'public_orders'`,
  );
  return rows[0]?.epoch;
}

describe('Reconnect rebaseline', () => {
  test('a real dropped socket triggers a rebaseline and the collection stays consistent', async () => {
    const base = new URL(baseDatabaseUrl());
    const proxy = startWalProxy(base.hostname, Number(base.port));
    const proxyPort = await proxy.listen();

    // Deliberately absent: the publication AND REPLICA IDENTITY FULL — bootstrap() self-
    // provisions both at boot, same as every other self-managed scenario in this suite.
    const scenario = await createScenarioDb('pulse_reconnrb_g7');
    const publicationName = `reconnrb_g7_pub_${randomSuffix()}`;
    const slotName = `reconnrb_g7_slot_${randomSuffix()}`;
    const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));

    const runtime = new PulseRuntime(buildRegistry(), {
      databaseUrl: proxiedDatabaseUrl(scenario.databaseUrl, proxyPort),
      sourceDb: drizzle({ client: sourceSql }),
      pull: true,
      wal: { publicationName, slotName },
      logLevel: LogLevel.Error,
    });

    let terminalError: Error | null = null;
    runtime.onTerminalError((error) => {
      terminalError = error;
    });

    try {
      await runtime.start();

      const client = createPulseClient(runtime);
      const collection = await client.ordersByStatus({ status: 'accepted' });

      const changes: Array<{ events: readonly unknown[]; lsn: string }> = [];
      collection.onChange((c) => changes.push(c));

      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (2, 'accepted', 20)`,
      );
      await waitFor(() => collection.list().length === 2);
      const changesBeforeReconnect = changes.length;

      // Real edge: destroys the walsender's client socket. The driver reconnects after its
      // backoff (~1-2s); the resume check is unreachable once any commit has landed (the
      // watermark only advances on recreate, confirmed_flush always outruns it), so this takes
      // the recreate path in practice — the slot is recreated with a fresh exported snapshot and
      // the reconnect listeners rebaseline from it either way.
      proxy.dropClient();

      // waitFor timeout 10000ms — the backoff makes the old 2000ms timeouts too tight.
      await waitFor(() => changes.length === changesBeforeReconnect + 1, 10000);

      const rebaselineChange = changes[changesBeforeReconnect]!;
      expect(rebaselineChange.events).toEqual([]);
      expect(rebaselineChange.lsn).toMatch(LSN_PATTERN);

      expect(collection.list().length).toBe(2);
      expect(new Set(collection.list().map((r) => r.id)).size).toBe(2);

      // The pipeline keeps delivering after the reconnect edge.
      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (3, 'accepted', 30)`,
      );
      await waitFor(() => collection.list().length === 3, 10000);

      expect(terminalError).toBeNull();

      collection.dispose();
    } finally {
      await runtime.stop();
      await sourceSql.end();
      await dropSlotWithRetry(scenario.sql, slotName).catch(() => {});
      await proxy.close();
      await scenario.drop();
    }
  });

  test('rebaselines to completion before opening the stream: nothing is delivered while collections rebuild', async () => {
    const scenario = await createScenarioDb('pulse_reconnrb_order');
    const publicationName = `reconnrb_order_pub_${randomSuffix()}`;
    const slotName = `reconnrb_order_slot_${randomSuffix()}`;
    const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));

    const runtime = new PulseRuntime(buildRegistry(), {
      databaseUrl: scenario.databaseUrl,
      sourceDb: drizzle({ client: sourceSql }),
      pull: true,
      wal: { publicationName, slotName },
      logLevel: LogLevel.Error,
    });

    let terminalError: Error | null = null;
    runtime.onTerminalError((error) => {
      terminalError = error;
    });

    try {
      await runtime.start();

      const client = createPulseClient(runtime);
      const collection = await client.ordersByStatus({ status: 'accepted' });

      // The stateless feed delivers straight off the tap with no baseline buffering, so it
      // observes exactly what the stream delivers, when it delivers it.
      const events = createPulseEvents(runtime);
      let delivered = 0;
      const unsubFeed = events.ordersByStatus({ status: 'accepted' }, () => {
        delivered++;
      });

      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      await waitFor(() => collection.list().length === 1);

      const epochBefore = await eventsTableEpoch(scenario.sql);
      expect(epochBefore).toBeDefined();

      // Rebaseline listeners run inside the pre-stream window, so this one both slows that window
      // down and probes it: the row it writes commits AFTER the new slot's consistent point, so no
      // baseline can contain it and only the stream can carry it.
      const REBASELINE_MS = 3000;
      let deliveredDuringRebaseline = -1; // -1 = the rebaseline listener never ran
      let probeWritten = false;
      runtime.onReconnect(async () => {
        const before = delivered;
        await scenario.sql.unsafe(
          `INSERT INTO "orders" (driver_id, status, price) VALUES (3, 'accepted', 30)`,
        );
        probeWritten = true;
        await new Promise((resolve) => setTimeout(resolve, REBASELINE_MS));
        deliveredDuringRebaseline = delivered - before;
      });

      await forceSlotLoss(scenario.sql, slotName);
      const tEdge = Date.now();

      // Downtime write — committed before the recreate, so it arrives through the baseline.
      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (2, 'accepted', 20)`,
      );

      await waitFor(() => collection.list().length === 3, 20000);
      expect(new Set(collection.list().map((r) => r.driverId))).toEqual(new Set([1, 2, 3]));

      // The ordering itself: the probe row existed and was streamable the whole time the
      // rebaseline ran, and still nothing was delivered — the stream had not opened yet. Moving
      // the rebaseline until after the stream opens fails here.
      expect(probeWritten).toBe(true);
      expect(deliveredDuringRebaseline).toBe(0);
      expect(Date.now() - tEdge).toBeGreaterThan(REBASELINE_MS);

      const epochAfter = await eventsTableEpoch(scenario.sql);
      expect(epochAfter).toBeDefined();
      expect(epochAfter).not.toBe(epochBefore);

      expect(terminalError).toBeNull();

      // Delivery resumes once the stream opens.
      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (4, 'accepted', 40)`,
      );
      await waitFor(() => collection.list().length === 4, 10000);

      unsubFeed();
      collection.dispose();
    } finally {
      await runtime.stop();
      await sourceSql.end();
      await dropSlotWithRetry(scenario.sql, slotName).catch(() => {});
      await scenario.drop();
    }
  });
});
