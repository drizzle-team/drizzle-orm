/**
 * Integration proof for the drizzle-pulse/embedded entrypoint. The primitives it composes
 * (collection convergence, events delivery, pull:false provisioning) are covered by
 * pull-false.test.ts — this suite exercises only the factory's own wiring: the registry and
 * pull:false runtime built internally, collection baselines read over the app-provided
 * sourceDb, the provision-on-running guard, and full release of the runtime's connections on
 * stop().
 */

import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createRuntime, LogLevel } from 'drizzle-pulse/embedded';
import postgres from 'postgres';
import { orders, ordersByStatusArgsSchema } from './fixtures/minimal-orders/schema.js';
import { createScenarioDb, waitFor } from './helpers/scenario.js';
import { withQuietPostgresUrl } from './helpers/test-harness.js';

const ordersByStatus = pulse(orders)
  .args(ordersByStatusArgsSchema)
  .order('asc')
  .query((ctx) => ctx.query({ status: ctx.args.status }));

describe('drizzle-pulse/embedded — createRuntime', () => {
  test('baselines read over the app sourceDb; stop() releases the runtime connections', async () => {
    const scenario = await createScenarioDb('pulse_embedded_entry');
    const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));
    try {
      await scenario.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );

      const runtime = createRuntime({
        queries: { ordersByStatus },
        databaseUrl: scenario.databaseUrl,
        sourceDb: drizzle({ client: sourceSql }),
        wal: { publicationName: 'embedded_entry_pub', slotName: 'embedded_entry_slot' },
        logLevel: LogLevel.Error,
      });

      const backendCount = async (): Promise<number> => {
        const rows = await scenario.sql.unsafe<{ count: string }[]>(
          `SELECT count(*)::text AS count FROM pg_stat_activity
           WHERE datname = current_database() AND pid <> pg_backend_pid()`,
        );
        return Number(rows[0]?.count ?? '0');
      };
      // Open the app connection first so the post-stop floor accounts for it — sourceDb is
      // app-owned and must survive the runtime's teardown.
      await sourceSql`SELECT 1`;
      const floor = await backendCount();

      await runtime.start();

      const collection = await runtime.client.ordersByStatus({ status: 'accepted' });
      expect(collection.list()).toHaveLength(1);
      expect(collection.list()[0]?.status).toBe('accepted');

      // provision() on a running runtime would close the live admin store out from under the
      // replication loop — it must refuse instead.
      await expect(runtime.provision()).rejects.toThrow(/before start/);

      collection.dispose();
      await runtime.stop();

      // The admin store and the replication connection must be gone; the app's sourceDb
      // connection (inside the floor) must not be.
      await waitFor(async () => (await backendCount()) <= floor);
    } finally {
      await sourceSql.end();
      await scenario.drop();
    }
  });
});
