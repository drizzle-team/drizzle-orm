/**
 * Integration proof: runtime-owned events-table DDL. PulseRuntime.provision() (the same
 * bootstrap path start() runs, minus the replication stream) creates/recreates events tables
 * and their pulse_meta bookkeeping against real Postgres, rotating an epoch on every recreate
 * and sweeping orphans. Each scenario builds its own healthy standalone database per the
 * test-isolation convention and tears itself down in a finally block.
 */

import { describe, expect, spyOn, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseRegistry, LogLevel, PulseRuntime } from 'drizzle-pulse/server';
import postgres from 'postgres';
import { orders } from './fixtures/minimal-orders/schema.js';
import { createScenarioDb, waitFor } from './helpers/scenario.js';
import { withQuietPostgresUrl } from './helpers/test-harness.js';

async function setupHealthyScenario(label: string, logLevel: LogLevel = LogLevel.Error) {
  const scenario = await createScenarioDb(`pulse_bootstrap_${label}`);
  await scenario.sql.unsafe('ALTER TABLE "orders" REPLICA IDENTITY FULL');
  await scenario.sql.unsafe(`CREATE PUBLICATION bootstrap_pub_${label} FOR ALL TABLES`);

  const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));
  const registry = createPulseRegistry({ orders: pulse(orders).query() });
  const runtime = new PulseRuntime(registry, {
    databaseUrl: scenario.databaseUrl,
    sourceDb: drizzle({ client: sourceSql }),
    pull: true,
    wal: { publicationName: `bootstrap_pub_${label}`, slotName: `bootstrap_slot_${label}` },
    logLevel,
  });

  return {
    databaseName: scenario.databaseName,
    databaseUrl: scenario.databaseUrl,
    sql: scenario.sql,
    sourceSql,
    runtime,
    drop: scenario.drop,
  };
}

type HealthyScenario = Awaited<ReturnType<typeof setupHealthyScenario>>;

async function teardownScenario(scenario: HealthyScenario): Promise<void> {
  await scenario.sourceSql.end();
  await scenario.drop();
}

async function metaEpoch(sql: HealthyScenario['sql']): Promise<string | undefined> {
  const rows = await sql.unsafe<{ epoch: string }[]>(
    `SELECT epoch FROM drizzle_pulse.pulse_meta WHERE table_name = 'public_orders'`,
  );
  return rows[0]?.epoch;
}

// Poll-retry a slot drop (cloned from slot-recovery.test.ts): the previous owning backend's
// "active" flag can lag its actual termination by a beat, so a single attempt can spuriously
// hit 55006 (object_in_use). Bootstrap scenarios never created a persistent slot before (only
// provision() was exercised) — a full start() does, and the DDL-divergence scenario must drop it or leak against the
// shared container's 4-slot budget.
async function dropSlotWithRetry(sql: HealthyScenario['sql'], slotName: string): Promise<void> {
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

async function streamLastLsn(
  sql: HealthyScenario['sql'],
  slotName: string,
): Promise<string | undefined> {
  const rows = await sql.unsafe<{ last_lsn: string }[]>(
    `SELECT last_lsn FROM drizzle_pulse.pulse_stream WHERE slot_name = $1`,
    [slotName],
  );
  return rows[0]?.last_lsn;
}

// Numeric value of an LSN string ("hi/lo", hex) for monotonic comparison.
function lsnValue(lsn: string): bigint {
  const [hi, lo] = lsn.split('/');
  return (BigInt(`0x${hi}`) << 32n) | BigInt(`0x${lo}`);
}

async function snapshotRowCount(sql: HealthyScenario['sql']): Promise<number> {
  const rows = await sql.unsafe(
    `SELECT 1 FROM drizzle_pulse.public_orders WHERE "$op" = 'snapshot'`,
  );
  return rows.length;
}

async function nonSnapshotEventCount(sql: HealthyScenario['sql']): Promise<number> {
  const rows = await sql.unsafe(
    `SELECT 1 FROM drizzle_pulse.public_orders WHERE "$op" <> 'snapshot'`,
  );
  return rows.length;
}

// DISCOVERY (see slot-resume.test.ts for the full empirical trail against unmodified
// pulse-runtime.ts + minipg): the resume check in the runtime's session options compares the
// persisted pulse_stream.last_lsn watermark (a commit's own record LSN) against the slot's
// confirmed_flush_lsn (the transaction's end LSN, always strictly greater after a normal ack) —
// unreachable via ordinary stop/restart once any commit has landed. Seeding the watermark to the
// observed confirmed_flush_lsn reproduces the precondition deterministically, isolating the
// bootstrap()-level DDL-divergence recreate this test targets from the separate (and here
// irrelevant) question of whether the slot itself gets recreated. No production code changes.
async function seedContinuousWatermark(
  sql: HealthyScenario['sql'],
  slotName: string,
): Promise<string> {
  const rows = await sql.unsafe<{ confirmed_flush_lsn: string | null }[]>(
    `SELECT confirmed_flush_lsn FROM pg_replication_slots WHERE slot_name = $1`,
    [slotName],
  );
  const confirmedFlushLsn = rows[0]?.confirmed_flush_lsn;
  if (!confirmedFlushLsn) {
    throw new Error(`no confirmed_flush_lsn found for slot '${slotName}'`);
  }
  await sql.unsafe(`UPDATE drizzle_pulse.pulse_stream SET last_lsn = $2 WHERE slot_name = $1`, [
    slotName,
    confirmedFlushLsn,
  ]);
  return confirmedFlushLsn;
}

// Clones setupHealthyScenario's runtime construction against the SAME database/publication/slot
// (derived deterministically from `label`) — a second boot targeting the first scenario's
// database, not a second scenario.
function buildSecondRuntime(
  databaseUrl: string,
  label: string,
  logLevel: LogLevel = LogLevel.Error,
) {
  const sourceSql = postgres(withQuietPostgresUrl(databaseUrl));
  const registry = createPulseRegistry({ orders: pulse(orders).query() });
  const runtime = new PulseRuntime(registry, {
    databaseUrl,
    sourceDb: drizzle({ client: sourceSql }),
    pull: true,
    wal: { publicationName: `bootstrap_pub_${label}`, slotName: `bootstrap_slot_${label}` },
    logLevel,
  });
  return { runtime, sourceSql };
}

describe('runtime-owned events-table bootstrap', () => {
  test('fresh provision() creates the schema, events table, and a pulse_meta row', async () => {
    const s = await setupHealthyScenario('fresh');
    try {
      await s.runtime.provision();

      const table = await s.sql.unsafe(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'drizzle_pulse' AND c.relname = 'public_orders' AND c.relkind = 'r'`,
      );
      expect(table).toHaveLength(1);

      const meta = await s.sql.unsafe<{ ddl_hash: string; epoch: string }[]>(
        `SELECT ddl_hash, epoch FROM drizzle_pulse.pulse_meta WHERE table_name = 'public_orders'`,
      );
      expect(meta).toHaveLength(1);
      expect(meta[0]?.ddl_hash).toBeTruthy();
      expect(s.runtime.getEpochForQuery('orders')).toBe(meta[0]?.epoch);
    } finally {
      await teardownScenario(s);
    }
  });

  test('second provision() is a no-op: the epoch stays stable', async () => {
    const s = await setupHealthyScenario('noop');
    try {
      await s.runtime.provision();
      const firstEpoch = s.runtime.getEpochForQuery('orders');
      const firstDbEpoch = await metaEpoch(s.sql);

      await s.runtime.provision();
      expect(s.runtime.getEpochForQuery('orders')).toBe(firstEpoch);
      expect(await metaEpoch(s.sql)).toBe(firstDbEpoch);
    } finally {
      await teardownScenario(s);
    }
  });

  test('a diverged DDL hash triggers recreate and rotates the epoch', async () => {
    const s = await setupHealthyScenario('rotate');
    try {
      await s.runtime.provision();
      const firstEpoch = s.runtime.getEpochForQuery('orders');
      expect(firstEpoch).toBeTruthy();

      // Simulate a shape change without redefining the source table: corrupt the stored hash
      // so it no longer matches the freshly rendered DDL.
      await s.sql.unsafe(
        `UPDATE drizzle_pulse.pulse_meta SET ddl_hash = 'stale' WHERE table_name = 'public_orders'`,
      );

      await s.runtime.provision();
      const secondEpoch = s.runtime.getEpochForQuery('orders');
      expect(secondEpoch).toBeTruthy();
      expect(secondEpoch).not.toBe(firstEpoch);
      expect(await metaEpoch(s.sql)).toBe(secondEpoch);
    } finally {
      await teardownScenario(s);
    }
  });

  test('orphan sweep drops meta-registered tables and warns (only) about unmanaged ones', async () => {
    const s = await setupHealthyScenario('orphan', LogLevel.Info);
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await s.runtime.provision();

      // A meta-registered orphan (a table + pulse_meta row for a source no longer registered)
      // and an unmanaged physical table (no pulse_meta row) sharing the events schema.
      await s.sql.unsafe('CREATE TABLE drizzle_pulse.public_ghost ("id" integer)');
      await s.sql.unsafe(
        `INSERT INTO drizzle_pulse.pulse_meta (table_name, ddl_hash, epoch) VALUES ('public_ghost', 'h', gen_random_uuid())`,
      );
      await s.sql.unsafe('CREATE TABLE drizzle_pulse.stray ("id" integer)');

      warnSpy.mockClear();
      await s.runtime.provision();

      const ghostTable = await s.sql.unsafe(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'drizzle_pulse' AND c.relname = 'public_ghost'`,
      );
      expect(ghostTable).toHaveLength(0);
      const ghostMeta = await s.sql.unsafe(
        `SELECT 1 FROM drizzle_pulse.pulse_meta WHERE table_name = 'public_ghost'`,
      );
      expect(ghostMeta).toHaveLength(0);

      // Unmanaged table is left untouched, but warned about.
      const strayTable = await s.sql.unsafe(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'drizzle_pulse' AND c.relname = 'stray'`,
      );
      expect(strayTable).toHaveLength(1);
      const warnedStray = warnSpy.mock.calls.some((call) => String(call[0]).includes('stray'));
      expect(warnedStray).toBe(true);

      // The registered events table survives the sweep.
      const ordersTable = await s.sql.unsafe(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'drizzle_pulse' AND c.relname = 'public_orders'`,
      );
      expect(ordersTable).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
      await teardownScenario(s);
    }
  });

  test('DDL divergence at boot with an intact slot: start() recreates, reseeds via ensureBaselines, resumes the slot, and streams', async () => {
    const label = 'g6full';
    const s = await setupHealthyScenario(label);
    const slotName = `bootstrap_slot_${label}`;

    let epoch1: string | undefined;
    let lsn1: string | undefined;

    try {
      try {
        // Full boot: bootstrap() provisions, then start() opens the replication stream and
        // creates the persistent slot (unlike the provision()-only tests above, which never
        // open a replication stream).
        await s.runtime.start();

        await s.sql.unsafe(
          `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
        );
        await waitFor(async () => (await nonSnapshotEventCount(s.sql)) >= 1);

        epoch1 = await metaEpoch(s.sql);
        expect(epoch1).toBeDefined();
        lsn1 = await streamLastLsn(s.sql, slotName);
        expect(lsn1).toBeDefined();
      } finally {
        // Clean stop — the pull:true slot is persistent and survives it, intact.
        await s.runtime.stop();
      }

      // Corrupt the stored hash exactly as the divergence test above does, forcing bootstrap()
      // to recreate the events table and rotate the epoch on the next boot.
      await s.sql.unsafe(
        `UPDATE drizzle_pulse.pulse_meta SET ddl_hash = 'stale' WHERE table_name = 'public_orders'`,
      );

      // See seedContinuousWatermark's DISCOVERY comment: closes the structural
      // watermark-vs-confirmed_flush gap so the runtime's resume check actually holds — this
      // test's "slot resumed, not recreated" assertion needs the real resume branch, isolated
      // from the bootstrap()-level recreate it targets.
      lsn1 = await seedContinuousWatermark(s.sql, slotName);

      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const second = buildSecondRuntime(s.databaseUrl, label);
      try {
        await second.runtime.start();

        // Epoch rotated exactly once by bootstrap()'s DDL-divergence recreate.
        const epoch2 = await metaEpoch(s.sql);
        expect(epoch2).toBeDefined();
        expect(epoch2).not.toBe(epoch1);
        expect(second.runtime.getEpochForQuery('orders')).toBe(epoch2);

        // The recreated table holds ensureBaselines' snapshot seed and none of the
        // pre-divergence event rows (TRUNCATEd by bootstrap()'s recreate).
        expect(await snapshotRowCount(s.sql)).toBeGreaterThanOrEqual(1);
        expect(await nonSnapshotEventCount(s.sql)).toBe(0);

        // The slot itself was resumed, not recreated: a recreated durable slot's reconnect log
        // (asserted absent here) fires unconditionally on that path, and a recreate would rebase
        // pulse_stream onto a fresh consistentPoint. Resume instead keeps the floor continuous
        // from the seeded watermark — it never regresses below it. The exact-value pin
        // over-specified: this scenario's publication is FOR ALL TABLES, so ingestCommit's own
        // writes to the published drizzle_pulse bookkeeping tables (and the pre-boot
        // ddl_hash/watermark UPDATEs) are themselves commits past the watermark that the resumed
        // stream continually advances the floor over — the floor is legitimately in motion, not
        // pinnable to one byte position, and the pre-START_REPLICATION probe round-trip only
        // shifts which position an instant sees.
        expect(
          errorSpy.mock.calls.some((call: unknown[]) => String(call[0]).includes('recreated')),
        ).toBe(false);
        expect(lsnValue((await streamLastLsn(s.sql, slotName))!)).toBeGreaterThanOrEqual(
          lsnValue(lsn1!),
        );

        // The pipeline is live end-to-end on the recreated events table.
        await s.sql.unsafe(
          `INSERT INTO "orders" (driver_id, status, price) VALUES (2, 'accepted', 20)`,
        );
        await waitFor(async () => (await nonSnapshotEventCount(s.sql)) >= 1);
      } finally {
        errorSpy.mockRestore();
        await second.runtime.stop();
        await second.sourceSql.end();
      }
    } finally {
      await dropSlotWithRetry(s.sql, slotName).catch(() => {});
      await teardownScenario(s);
    }
  });
});
