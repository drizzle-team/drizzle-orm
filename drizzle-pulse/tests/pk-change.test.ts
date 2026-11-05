/**
 * Integration proof: a pk-changing UPDATE (`UPDATE orders SET id = id + N`) must
 * synthesize delete(oldPk) + insert(newPk) so no consumer retains a ghost old-pk row. Proven
 * in both pull modes — REPLICA IDENTITY FULL is forced in both, so the synthesized delete
 * always carries the full old tuple.
 *
 * Each scenario builds its own standalone ephemeral database (bare `orders` table only —
 * bootstrap() self-provisions the publication and REPLICA IDENTITY FULL, exactly as it does
 * under normal boot) so it cannot collide with other suites, and tears itself down in a
 * `finally` block.
 */

import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseClient, createPulseEvents } from 'drizzle-pulse/client/embedded';
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

describe('pk-change: pk-changing UPDATE synthesizes delete(oldPk)+insert(newPk)', () => {
  test('pull: true — embedded collection, HTTP pull cursor, and events table all drop the ghost old-pk row', async () => {
    const scenario = await createScenarioDb('pulse_pkchange_pulltrue');
    const { sql } = scenario;
    const publicationName = `pkchange_pulltrue_pub_${randomSuffix()}`;
    const slotName = `pkchange_pulltrue_slot_${randomSuffix()}`;

    const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));
    const sourceDb = drizzle({ client: sourceSql });
    const runtime = new PulseRuntime(buildRegistry(), {
      databaseUrl: scenario.databaseUrl,
      sourceDb,
      pull: true,
      wal: { publicationName, slotName },
      logLevel: LogLevel.Error,
    });
    const router: Hono = createServerRouter(runtime.handlers, { userId: null });

    try {
      await runtime.start();

      const client = createPulseClient(runtime);
      const collection = await client.ordersByStatus({ status: 'accepted' });

      await sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      await waitFor(() => collection.list().length === 1);
      const oldPk = collection.list()[0]?.id as number;
      const newPk = oldPk + 1000;

      const cursor = await subscribeClient(router, 'ordersByStatus', { status: 'accepted' });
      expect(cursor.rows).toHaveLength(1);

      await sql.unsafe(`UPDATE "orders" SET id = id + 1000 WHERE id = $1`, [oldPk]);

      // Embedded: exactly one row, keyed by newPk — no ghost oldPk row. Waiting on length===1
      // alone would be a false-positive no-op (the count is 1 both before and after the
      // transient delete+insert), so wait for the new pk to actually appear.
      await waitFor(() => collection.list().some((row) => row.id === newPk));
      expect(collection.list().map((row) => row.id)).toEqual([newPk]);

      // HTTP pull: delete(oldPk) delivered before insert(newPk), in that order.
      const pulled = await pullUntilEvents(router, cursor);
      const opsForOldOrNew = pulled.events
        .filter((e) => e.pk === oldPk || e.pk === newPk)
        .map((e) => ({ op: e.op, pk: e.pk }));
      expect(opsForOldOrNew).toEqual([
        { op: 'delete', pk: oldPk },
        { op: 'insert', pk: newPk },
      ]);

      // A fresh subscribe reflects exactly one current row (newPk).
      const freshCursor = await subscribeClient(router, 'ordersByStatus', { status: 'accepted' });
      expect(freshCursor.rows).toHaveLength(1);
      expect(freshCursor.rows[0]?.id).toBe(newPk);

      // Events table itself carries a delete row keyed oldPk and an insert row keyed newPk,
      // from the update's commit (scoped past the pre-update cursor snapshot — id=oldPk also
      // appears in an earlier 'insert' row from the initial insert above).
      const eventsRows = await sql.unsafe<{ id: number; $op: string }[]>(
        `SELECT id, "$op" FROM "drizzle_pulse"."public_orders" WHERE id IN ($1, $2) AND "$snapshot" > $3 ORDER BY "$snapshot" ASC`,
        [oldPk, newPk, cursor.snapshot],
      );
      expect(eventsRows.map((r) => ({ id: r.id, op: r.$op }))).toEqual([
        { id: oldPk, op: 'delete' },
        { id: newPk, op: 'insert' },
      ]);

      collection.dispose();
    } finally {
      await runtime.stop();
      await sourceSql.end();
      await scenario.drop();
    }
  });

  test('pull: false — live collection and event log both drop the ghost old-pk row', async () => {
    const scenario = await createScenarioDb('pulse_pkchange_pullfalse');
    const { sql } = scenario;
    const publicationName = `pkchange_pullfalse_pub_${randomSuffix()}`;
    const slotName = `pkchange_pullfalse_slot_${randomSuffix()}`;

    const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));
    const sourceDb = drizzle({ client: sourceSql });
    const runtime = new PulseRuntime(buildRegistry(), {
      databaseUrl: scenario.databaseUrl,
      sourceDb,
      pull: false,
      wal: { publicationName, slotName },
      logLevel: LogLevel.Error,
    });

    try {
      await runtime.start();

      const client = createPulseClient(runtime);
      const events = createPulseEvents(runtime);
      const eventLog: Array<{ op: string; pk: unknown }> = [];

      const collection = await client.ordersByStatus({ status: 'accepted' });
      const unsub = events.ordersByStatus({ status: 'accepted' }, (event) => {
        eventLog.push({ op: event.op, pk: event.pk });
      });

      await sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      await waitFor(() => collection.list().length === 1 && eventLog.length === 1);
      const oldPk = collection.list()[0]?.id as number;
      const newPk = oldPk + 1000;

      await sql.unsafe(`UPDATE "orders" SET id = id + 1000 WHERE id = $1`, [oldPk]);

      await waitFor(() => collection.list().length === 1 && eventLog.length === 3);
      expect(collection.list().map((row) => row.id)).toEqual([newPk]);
      expect(eventLog.slice(1)).toEqual([
        { op: 'delete', pk: oldPk },
        { op: 'insert', pk: newPk },
      ]);

      unsub();
      collection.dispose();
    } finally {
      await runtime.stop();
      await sourceSql.end();
      await scenario.drop();
    }
  });
});
