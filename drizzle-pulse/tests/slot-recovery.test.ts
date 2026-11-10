/**
 * Integration proof: the backfill/resume mechanism auto-heals a lost or invalidated replication
 * slot — mid-run and across a restart — without ever terminating the runtime or consuming a
 * reconnect retry, recreating via an exported snapshot with epoch rotation and eager events-table
 * seeding, and gaplessly re-baselining any live embedded collection anchored at the same snapshot.
 *
 * Each scenario builds its own standalone ephemeral database (bare `orders` table only —
 * bootstrap() self-provisions the publication + REPLICA IDENTITY FULL + events schema exactly
 * as it does under normal boot) so parallel runs cannot collide, and tears itself down in a
 * `finally` block.
 */

import { describe, expect, spyOn, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseClient } from 'drizzle-pulse/client/embedded';
import { createPulseRegistry, LogLevel, PulseRuntime } from 'drizzle-pulse/server';
import { createPulseHonoRouter as createServerRouter } from 'drizzle-pulse/server/hono';
import type { Hono } from 'hono';
import postgres from 'postgres';
import { orders, ordersByStatusArgsSchema } from './fixtures/minimal-orders/schema.js';
import { createScenarioDb, waitFor } from './helpers/scenario.js';
import {
  type PullCursor,
  pullClient,
  randomSuffix,
  subscribeClient,
  withQuietPostgresUrl,
} from './helpers/test-harness.js';

const ordersByStatus = pulse(orders)
  .args(ordersByStatusArgsSchema)
  .order('asc')
  .query((ctx) => ctx.query({ status: ctx.args.status }));

function buildRegistry() {
  return createPulseRegistry({ ordersByStatus });
}

function buildRuntime(databaseUrl: string, publicationName: string, slotName: string) {
  const sourceSql = postgres(withQuietPostgresUrl(databaseUrl));
  const sourceDb = drizzle({ client: sourceSql });
  const registry = buildRegistry();
  const runtime = new PulseRuntime(registry, {
    databaseUrl,
    sourceDb,
    pull: true,
    wal: { publicationName, slotName },
    logLevel: LogLevel.Error,
  });
  const router: Hono = createServerRouter(runtime.handlers, { userId: null });
  return { runtime, router, sourceSql };
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

async function snapshotSeedCount(sql: ReturnType<typeof postgres>): Promise<number> {
  const rows = await sql.unsafe(
    `SELECT 1 FROM "drizzle_pulse"."public_orders" WHERE "$op" = 'snapshot'`,
  );
  return rows.length;
}

async function pullUntilEvents(
  router: Hono,
  cursor: PullCursor,
  timeoutMs = 8000,
): Promise<Awaited<ReturnType<typeof pullClient>>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await pullClient(router, cursor);
    if (result.events.length > 0 || result.reset) return result;
    if (Date.now() >= deadline) throw new Error(`pullUntilEvents timed out after ${timeoutMs}ms`);
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}

describe('Slot recovery: backfill/resume auto-heal', () => {
  test('mid-run: slot loss auto-heals — no terminal error, gapless embedded convergence, PullResetResponse on the stale cursor, fresh $op=snapshot seed', async () => {
    const scenario = await createScenarioDb('pulse_slotrec_midrun');
    const { sql } = scenario;
    const publicationName = `slotrec_midrun_pub_${randomSuffix()}`;
    const slotName = `slotrec_midrun_slot_${randomSuffix()}`;
    const { runtime, router, sourceSql } = buildRuntime(
      scenario.databaseUrl,
      publicationName,
      slotName,
    );

    let terminalError: Error | null = null;
    runtime.onTerminalError((error) => {
      terminalError = error;
    });

    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      await runtime.start();

      const client = createPulseClient(runtime);
      const collection = await client.ordersByStatus({ status: 'accepted' });

      await sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      await waitFor(() => collection.list().length === 1);

      const staleCursor = await subscribeClient(router, 'ordersByStatus', { status: 'accepted' });
      expect(staleCursor.rows).toHaveLength(1);

      const epochBefore = await eventsTableEpoch(sql);
      expect(epochBefore).toBeDefined();

      await forceSlotLoss(sql, slotName);

      // Downtime delta — written while the slot is gone, before the runtime reconnects.
      await sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (2, 'accepted', 20)`,
      );

      // A new slot row exists and the embedded collection converges to full source truth,
      // including the downtime row — the rebaseline from the exported snapshot is gapless.
      await waitFor(async () => {
        const rows = await sql.unsafe(`SELECT 1 FROM pg_replication_slots WHERE slot_name = $1`, [
          slotName,
        ]);
        return rows.length > 0;
      }, 15000);
      await waitFor(() => collection.list().length === 2, 15000);
      expect(new Set(collection.list().map((row) => row.driverId))).toEqual(new Set([1, 2]));

      // The driver's own recreate is silent on the warning channel — this is the operator
      // signal's sole producer, and the positive control that keeps the absence assertions
      // elsewhere (slot-resume.test.ts, bootstrap.test.ts) meaningful.
      expect(
        errorSpy.mock.calls.some((call: unknown[]) => String(call[0]).includes('recreated')),
      ).toBe(true);

      // No terminal error — the recreate auto-healed inside the reconnect cycle.
      expect(terminalError).toBeNull();

      // Epoch rotated and a fresh $op='snapshot' seed row was written from the exported
      // snapshot into the recreated events table.
      const epochAfter = await eventsTableEpoch(sql);
      expect(epochAfter).toBeDefined();
      expect(epochAfter).not.toBe(epochBefore);
      expect(await snapshotSeedCount(sql)).toBeGreaterThan(0);

      // The pre-loss HTTP cursor is stale against the rotated epoch — its next pull resets.
      const pulled = await pullClient(router, staleCursor);
      expect(pulled.reset).toBe(true);

      // A fresh subscribe reflects full current state (subscribe reads the live source table,
      // not the events table).
      const freshCursor = await subscribeClient(router, 'ordersByStatus', { status: 'accepted' });
      expect(freshCursor.rows).toHaveLength(2);

      // Post-recovery events carry on.
      await sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (3, 'accepted', 30)`,
      );
      await waitFor(() => collection.list().length === 3);
      const postRecoveryPull = await pullUntilEvents(router, freshCursor);
      expect(postRecoveryPull.events.length).toBeGreaterThan(0);

      collection.dispose();
    } finally {
      errorSpy.mockRestore();
      await runtime.stop();
      await sourceSql.end();
      await scenario.drop();
    }
  }, 30000);

  test('boot-time: slot loss while stopped recreates + rotates the epoch on next boot, and the pipeline is live afterwards', async () => {
    const scenario = await createScenarioDb('pulse_slotrec_boot');
    const { sql } = scenario;
    const publicationName = `slotrec_boot_pub_${randomSuffix()}`;
    const slotName = `slotrec_boot_slot_${randomSuffix()}`;

    const first = buildRuntime(scenario.databaseUrl, publicationName, slotName);
    let epochBefore: string | undefined;

    try {
      // bootstrap() (which sets pulse_meta's initial epoch) completes inside start() before it
      // resolves — the epoch is already readable here, no poll needed.
      await first.runtime.start();
      epochBefore = await eventsTableEpoch(sql);
      expect(epochBefore).toBeDefined();

      // Subscribe before the write. /subscribe reads the events-table cursor before its
      // baseline SELECT, so a row inserted first can already sit behind the cursor and the
      // pull then waits out its deadline for an event it will never be offered.
      const preStopCursor = await subscribeClient(first.router, 'ordersByStatus', {
        status: 'accepted',
      });
      await sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      const preStopPull = await pullUntilEvents(first.router, preStopCursor);
      expect(preStopPull.events.length).toBeGreaterThan(0);
    } finally {
      await first.runtime.stop();
      await first.sourceSql.end();
    }

    // Drop the slot while stopped — first-boot-equivalent continuity breakage (no active
    // walsender to terminate; the runtime is fully stopped).
    await dropSlotWithRetry(sql, slotName);

    const second = buildRuntime(scenario.databaseUrl, publicationName, slotName);
    try {
      await second.runtime.start();

      await waitFor(async () => {
        const rows = await sql.unsafe(`SELECT 1 FROM pg_replication_slots WHERE slot_name = $1`, [
          slotName,
        ]);
        return rows.length > 0;
      });

      const epochAfter = await eventsTableEpoch(sql);
      expect(epochAfter).toBeDefined();
      expect(epochAfter).not.toBe(epochBefore);

      const cursor = await subscribeClient(second.router, 'ordersByStatus', { status: 'accepted' });
      expect(cursor.rows).toHaveLength(1);

      await sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (2, 'accepted', 20)`,
      );
      const pulled = await pullUntilEvents(second.router, cursor);
      expect(pulled.events.length).toBeGreaterThan(0);
    } finally {
      await second.runtime.stop();
      await second.sourceSql.end();
      await scenario.drop();
    }
  });
});
