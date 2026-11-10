/**
 * Integration proof: bootstrap() self-provisions the publication for both pull modes.
 * PulseRuntime.provision() (the same bootstrap path start() runs, minus the replication stream)
 * creates the publication owning exactly the registered sources and keeps its membership in
 * sync (adding new sources, un-pulsing removed ones). REPLICA IDENTITY handling is mode-
 * independent: FULL is forced on every registered source, restored after drift, and reset to
 * DEFAULT on un-pulse. Each scenario builds its own standalone database and drops it in a
 * finally block, so the publication/schema it creates go with the database.
 */

import { describe, expect, test } from 'bun:test';
import { integer, pgTable, serial } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseRegistry, LogLevel, PulseRuntime } from 'drizzle-pulse/server';
import postgres from 'postgres';
import { orders } from './fixtures/minimal-orders/schema.js';
import { BARE_ORDERS_DDL, createScenarioDb } from './helpers/scenario.js';
import { withQuietPostgresUrl } from './helpers/test-harness.js';

// A second pulsable source, used to prove membership add/drop against a FOR TABLE publication.
const extras = pgTable('extras', { id: serial('id').primaryKey(), n: integer('n') });

const BARE_ORDERS_AND_EXTRAS_DDL = `
  ${BARE_ORDERS_DDL};
  CREATE TABLE "extras" ("id" serial PRIMARY KEY, "n" integer);
`;

type Scenario = {
  databaseName: string;
  databaseUrl: string;
  sql: ReturnType<typeof postgres>;
  sourceSql: ReturnType<typeof postgres>;
  drop: () => Promise<void>;
};

// Creates a fresh database with the orders + extras source tables but NO publication and NO
// replica identity — bootstrap() must self-provision both.
async function setupBareScenario(label: string): Promise<Scenario> {
  const scenario = await createScenarioDb(`pulse_pub_${label}`, {
    ddl: BARE_ORDERS_AND_EXTRAS_DDL,
  });
  const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));
  return {
    databaseName: scenario.databaseName,
    databaseUrl: scenario.databaseUrl,
    sql: scenario.sql,
    sourceSql,
    drop: scenario.drop,
  };
}

function makeRuntime(s: Scenario, label: string, tables: 'orders' | 'both', pull = true) {
  const registry =
    tables === 'both'
      ? createPulseRegistry({ orders: pulse(orders).query(), extras: pulse(extras).query() })
      : createPulseRegistry({ orders: pulse(orders).query() });
  return new PulseRuntime(registry, {
    databaseUrl: s.databaseUrl,
    sourceDb: drizzle({ client: s.sourceSql }),
    pull,
    wal: { publicationName: `pulse_pub_${label}`, slotName: `pulse_slot_${label}` },
    logLevel: LogLevel.Error,
  });
}

async function teardown(s: Scenario): Promise<void> {
  await s.sourceSql.end();
  await s.drop();
}

async function members(sql: Scenario['sql'], pubName: string): Promise<string[]> {
  const rows = await sql.unsafe<{ qualified: string }[]>(
    `SELECT schemaname || '.' || tablename AS qualified FROM pg_publication_tables WHERE pubname = $1 ORDER BY qualified`,
    [pubName],
  );
  return rows.map((row) => row.qualified);
}

async function replicaIdentity(sql: Scenario['sql'], table: string): Promise<string | undefined> {
  const rows = await sql.unsafe<{ relreplident: string }[]>(
    `SELECT c.relreplident FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = $1`,
    [table],
  );
  return rows[0]?.relreplident;
}

describe('bootstrap: publication + replica identity self-provisioning', () => {
  test('fresh provision() creates the publication with exact membership and RI FULL', async () => {
    const s = await setupBareScenario('fresh');
    const pubName = 'pulse_pub_fresh';
    try {
      await makeRuntime(s, 'fresh', 'orders').provision();

      const pub = await s.sql.unsafe<{ puballtables: boolean; ops: string }[]>(
        `SELECT puballtables,
                (pubinsert::text || pubupdate::text || pubdelete::text) AS ops
         FROM pg_publication WHERE pubname = $1`,
        [pubName],
      );
      expect(pub).toHaveLength(1);
      expect(pub[0]?.puballtables).toBe(false);
      // insert + update + delete all published, truncate not.
      expect(pub[0]?.ops).toBe('truetruetrue');

      expect(await members(s.sql, pubName)).toEqual(['public.orders']);
      expect(await replicaIdentity(s.sql, 'orders')).toBe('f');
      // extras is registered by no runtime here, so it is left at the default identity.
      expect(await replicaIdentity(s.sql, 'extras')).not.toBe('f');
    } finally {
      await teardown(s);
    }
  });

  test('second provision() is idempotent: membership and RI unchanged', async () => {
    const s = await setupBareScenario('idem');
    const pubName = 'pulse_pub_idem';
    try {
      const runtime = makeRuntime(s, 'idem', 'orders');
      await runtime.provision();
      const firstEpoch = runtime.getEpochForQuery('orders');
      const firstRel = await s.sql.unsafe(
        `SELECT prrelid FROM pg_publication_rel r JOIN pg_publication p ON p.oid = r.prpubid WHERE p.pubname = $1 ORDER BY prrelid`,
        [pubName],
      );

      await runtime.provision();

      expect(runtime.getEpochForQuery('orders')).toBe(firstEpoch);
      expect(await members(s.sql, pubName)).toEqual(['public.orders']);
      expect(await replicaIdentity(s.sql, 'orders')).toBe('f');
      const secondRel = await s.sql.unsafe(
        `SELECT prrelid FROM pg_publication_rel r JOIN pg_publication p ON p.oid = r.prpubid WHERE p.pubname = $1 ORDER BY prrelid`,
        [pubName],
      );
      expect(secondRel).toEqual(firstRel);
    } finally {
      await teardown(s);
    }
  });

  test('un-pulse: dropping a source removes membership, resets RI, and orphan-drops the events table', async () => {
    const s = await setupBareScenario('unpulse');
    const pubName = 'pulse_pub_unpulse';
    try {
      await makeRuntime(s, 'unpulse', 'both').provision();
      expect(await members(s.sql, pubName)).toEqual(['public.extras', 'public.orders']);
      expect(await replicaIdentity(s.sql, 'extras')).toBe('f');
      const extrasEventsBefore = await s.sql.unsafe(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'drizzle_pulse' AND c.relname = 'public_extras'`,
      );
      expect(extrasEventsBefore).toHaveLength(1);

      // A second runtime registering only orders should un-pulse extras.
      await makeRuntime(s, 'unpulse', 'orders').provision();

      expect(await members(s.sql, pubName)).toEqual(['public.orders']);
      expect(await replicaIdentity(s.sql, 'orders')).toBe('f');
      expect(await replicaIdentity(s.sql, 'extras')).not.toBe('f');

      const extrasEventsAfter = await s.sql.unsafe(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'drizzle_pulse' AND c.relname = 'public_extras'`,
      );
      expect(extrasEventsAfter).toHaveLength(0);
      const extrasMeta = await s.sql.unsafe(
        `SELECT 1 FROM drizzle_pulse.pulse_meta WHERE table_name = 'public_extras'`,
      );
      expect(extrasMeta).toHaveLength(0);
    } finally {
      await teardown(s);
    }
  });

  test('FOR ALL TABLES publication: provision() leaves membership alone and succeeds', async () => {
    const s = await setupBareScenario('allt');
    const pubName = 'pulse_pub_allt';
    try {
      await s.sql.unsafe(`CREATE PUBLICATION ${pubName} FOR ALL TABLES`);

      const runtime = makeRuntime(s, 'allt', 'orders');
      await runtime.provision();

      const pub = await s.sql.unsafe<{ puballtables: boolean }[]>(
        `SELECT puballtables FROM pg_publication WHERE pubname = $1`,
        [pubName],
      );
      // Membership is implicit for FOR ALL TABLES — pulse must not run ALTER PUBLICATION
      // against it (which would fail). It stays FOR ALL TABLES and orders is a member.
      expect(pub[0]?.puballtables).toBe(true);
      expect(await members(s.sql, pubName)).toContain('public.orders');
      // RI is still forced on the registered source.
      expect(await replicaIdentity(s.sql, 'orders')).toBe('f');
      // Events table still provisioned.
      expect(runtime.getEpochForQuery('orders')).toBeTruthy();
    } finally {
      await teardown(s);
    }
  });

  test('RI drift: manually resetting to DEFAULT is restored to FULL on next provision()', async () => {
    const s = await setupBareScenario('drift');
    try {
      const runtime = makeRuntime(s, 'drift', 'orders');
      await runtime.provision();
      expect(await replicaIdentity(s.sql, 'orders')).toBe('f');

      await s.sql.unsafe('ALTER TABLE "orders" REPLICA IDENTITY DEFAULT');
      expect(await replicaIdentity(s.sql, 'orders')).not.toBe('f');

      await runtime.provision();
      expect(await replicaIdentity(s.sql, 'orders')).toBe('f');
    } finally {
      await teardown(s);
    }
  });

  test('pull:false: provision() forces FULL and restores drift, same as pull:true', async () => {
    const s = await setupBareScenario('falsedrift');
    try {
      const runtime = makeRuntime(s, 'falsedrift', 'orders', false);
      await runtime.provision();
      expect(await replicaIdentity(s.sql, 'orders')).toBe('f');

      await s.sql.unsafe('ALTER TABLE "orders" REPLICA IDENTITY DEFAULT');
      await runtime.provision();
      expect(await replicaIdentity(s.sql, 'orders')).toBe('f');
    } finally {
      await teardown(s);
    }
  });

  test('provision() converts REPLICA IDENTITY NOTHING and USING INDEX to FULL', async () => {
    const s = await setupBareScenario('identconv');
    try {
      await s.sql.unsafe('ALTER TABLE "orders" REPLICA IDENTITY NOTHING');
      await makeRuntime(s, 'identconv', 'orders', false).provision();
      expect(await replicaIdentity(s.sql, 'orders')).toBe('f');

      await s.sql.unsafe('CREATE UNIQUE INDEX "orders_status_uq" ON "orders" ("status")');
      await s.sql.unsafe('ALTER TABLE "orders" REPLICA IDENTITY USING INDEX "orders_status_uq"');
      await makeRuntime(s, 'identconv2', 'orders', false).provision();
      expect(await replicaIdentity(s.sql, 'orders')).toBe('f');
    } finally {
      await teardown(s);
    }
  });
});
