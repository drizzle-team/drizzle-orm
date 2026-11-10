/**
 * Integration proof: PulseRuntime's boot-time provisioning against real Postgres, through the full
 * start() path (WAL stream and all). All scenarios below run pull:true.
 *
 * Most preconditions the guard once only asserted are now self-provisioned inside bootstrap():
 * a missing publication is created, a missing member is added, and (pull:true only) a
 * source without REPLICA IDENTITY FULL is altered. These scenarios prove start() heals a
 * bare/partial setup and then boots. wal_level stays the one precondition boot rejects on rather
 * than fixing (the runtime can't change a server-wide setting), but it can't be toggled on the
 * shared test server, so it has
 * no live case here. Finer membership/RI coverage lives in bootstrap-publication.test.ts
 * (provision() path, both pull modes). Each scenario gets its own randomly-named
 * database/publication/slot and tears itself down in a `finally` block.
 */

import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseRegistry, LogLevel, PulseRuntime } from 'drizzle-pulse/server';
import postgres from 'postgres';
import { orders } from './fixtures/minimal-orders/schema.js';
import { createScenarioDb } from './helpers/scenario.js';
import { randomSuffix, withQuietPostgresUrl } from './helpers/test-harness.js';

type GuardScenarioContext = {
  databaseUrl: string;
  sql: ReturnType<typeof postgres>;
  drop: () => Promise<void>;
};

// The `orders` source table is provisioned by createScenarioDb's default DDL — deliberately
// absent: the publication AND REPLICA IDENTITY FULL, which bootstrap() self-provisions.
async function setupGuardScenario(scenario: string): Promise<GuardScenarioContext> {
  const s = await createScenarioDb(`pulse_guard_${scenario}`);
  return { databaseUrl: s.databaseUrl, sql: s.sql, drop: s.drop };
}

async function teardownGuardScenario(ctx: GuardScenarioContext): Promise<void> {
  await ctx.drop();
}

async function setReplicaIdentityFull(sql: GuardScenarioContext['sql']): Promise<void> {
  await sql.unsafe('ALTER TABLE "orders" REPLICA IDENTITY FULL');
}

async function publicationMembers(
  sql: GuardScenarioContext['sql'],
  publicationName: string,
): Promise<string[]> {
  const rows = await sql.unsafe<{ qualified: string }[]>(
    `SELECT schemaname || '.' || tablename AS qualified FROM pg_publication_tables WHERE pubname = $1 ORDER BY qualified`,
    [publicationName],
  );
  return rows.map((row) => row.qualified);
}

async function ordersReplicaIdentity(
  sql: GuardScenarioContext['sql'],
): Promise<string | undefined> {
  const rows = await sql.unsafe<{ relreplident: string }[]>(
    `SELECT c.relreplident FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'orders'`,
  );
  return rows[0]?.relreplident;
}

describe('Startup bootstrap (self-provisioning)', () => {
  test('(a) bare database: start() self-provisions the publication + REPLICA IDENTITY, then boots', async () => {
    const ctx = await setupGuardScenario('a');
    const publicationName = `guard_pub_a_${randomSuffix()}`;
    const slotName = `guard_slot_a_${randomSuffix()}`;
    const sourceSql = postgres(withQuietPostgresUrl(ctx.databaseUrl));

    try {
      const registry = createPulseRegistry({ orders: pulse(orders).query() });
      const runtime = new PulseRuntime(registry, {
        databaseUrl: ctx.databaseUrl,
        sourceDb: drizzle({ client: sourceSql }),
        pull: true,
        wal: { publicationName, slotName },
        logLevel: LogLevel.Error,
      });

      await runtime.start();
      expect(runtime.isRunning).toBe(true);
      expect(await publicationMembers(ctx.sql, publicationName)).toEqual(['public.orders']);
      expect(await ordersReplicaIdentity(ctx.sql)).toBe('f');

      await runtime.stop();
      expect(runtime.isRunning).toBe(false);
    } finally {
      await sourceSql.end();
      await teardownGuardScenario(ctx);
    }
  });

  test('(b) defaults: wal omitted entirely self-provisions a publication named drizzle_pulse', async () => {
    const ctx = await setupGuardScenario('b');
    const sourceSql = postgres(withQuietPostgresUrl(ctx.databaseUrl));

    try {
      // No wal config supplied — proves the default publication name (drizzle_pulse) flows all
      // the way into the CREATE PUBLICATION bootstrap() runs. provision() avoids slot setup.

      const registry = createPulseRegistry({ orders: pulse(orders).query() });
      const runtime = new PulseRuntime(registry, {
        databaseUrl: ctx.databaseUrl,
        sourceDb: drizzle({ client: sourceSql }),
        pull: true,
        logLevel: LogLevel.Error,
      });

      await runtime.provision();
      expect(await publicationMembers(ctx.sql, 'drizzle_pulse')).toEqual(['public.orders']);
    } finally {
      await sourceSql.end();
      await teardownGuardScenario(ctx);
    }
  });

  test('(c) healthy FOR ALL TABLES setup: boot creates the events table + pulse_meta, runtime starts then stops cleanly', async () => {
    const ctx = await setupGuardScenario('c');
    const publicationName = `guard_pub_c_${randomSuffix()}`;
    const slotName = `guard_slot_c_${randomSuffix()}`;
    const sourceSql = postgres(withQuietPostgresUrl(ctx.databaseUrl));

    try {
      await setReplicaIdentityFull(ctx.sql);
      await ctx.sql.unsafe(`CREATE PUBLICATION ${publicationName} FOR ALL TABLES`);
      // Deliberately absent: the events table — the runtime creates it at boot.

      const registry = createPulseRegistry({ orders: pulse(orders).query() });
      const runtime = new PulseRuntime(registry, {
        databaseUrl: ctx.databaseUrl,
        sourceDb: drizzle({ client: sourceSql }),
        pull: true,
        wal: { publicationName, slotName },
      });

      await runtime.start();
      expect(runtime.isRunning).toBe(true);

      // Runtime-owned DDL: boot created the events table and its pulse_meta bookkeeping row.
      const eventsTable = await ctx.sql.unsafe(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'drizzle_pulse' AND c.relname = 'public_orders' AND c.relkind = 'r'`,
      );
      expect(eventsTable).toHaveLength(1);
      const metaRow = await ctx.sql.unsafe<{ epoch: string }[]>(
        `SELECT epoch FROM drizzle_pulse.pulse_meta WHERE table_name = 'public_orders'`,
      );
      expect(metaRow).toHaveLength(1);
      expect(runtime.getEpochForQuery('orders')).toBe(metaRow[0]?.epoch);

      await runtime.stop();
      expect(runtime.isRunning).toBe(false);
    } finally {
      await sourceSql.end();
      await teardownGuardScenario(ctx);
    }
  });

  test('(d) pulse-owned FOR TABLE publication: start() adds the registered source and un-pulses foreign members', async () => {
    const ctx = await setupGuardScenario('d');
    const publicationName = `guard_pub_d_${randomSuffix()}`;
    const slotName = `guard_slot_d_${randomSuffix()}`;
    const sourceSql = postgres(withQuietPostgresUrl(ctx.databaseUrl));

    try {
      await setReplicaIdentityFull(ctx.sql);
      await ctx.sql.unsafe('CREATE TABLE "users" ("id" serial PRIMARY KEY)');
      // A FOR TABLE publication missing the pulsed table but carrying an unregistered one.
      // pulse owns the publication: bootstrap() ADDs orders and un-pulses (DROPs) users.
      await ctx.sql.unsafe(`CREATE PUBLICATION ${publicationName} FOR TABLE "users"`);

      const registry = createPulseRegistry({ orders: pulse(orders).query() });
      const runtime = new PulseRuntime(registry, {
        databaseUrl: ctx.databaseUrl,
        sourceDb: drizzle({ client: sourceSql }),
        pull: true,
        wal: { publicationName, slotName },
        logLevel: LogLevel.Error,
      });

      await runtime.start();
      expect(runtime.isRunning).toBe(true);
      expect(await publicationMembers(ctx.sql, publicationName)).toEqual(['public.orders']);

      await runtime.stop();
      expect(runtime.isRunning).toBe(false);
    } finally {
      await sourceSql.end();
      await teardownGuardScenario(ctx);
    }
  });
});
