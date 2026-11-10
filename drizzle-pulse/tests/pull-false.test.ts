/**
 * Integration proof: `pull: false` runtimes provision and write zero events-table
 * infrastructure while embedded collections and stateless events subscriptions stay fully
 * live over the WAL tap — and their replication slot is temporary with a
 * randomized suffix so a crashed process can never leak WAL-retaining slot state.
 * REPLICA IDENTITY FULL and the publication are both self-provisioned, same as pull:true.
 * Each scenario builds its own standalone database (bare — no pre-existing publication) so
 * bootstrap()'s self-provisioning of the WAL prerequisites is exercised, and tears itself
 * down in a `finally` block.
 */

import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pulse } from 'drizzle-pulse';
import { createPulseClient, createPulseEvents } from 'drizzle-pulse/client/embedded';
import { createPulseRegistry, LogLevel, PulseRuntime } from 'drizzle-pulse/server';
import postgres from 'postgres';
import { orders, ordersByStatusArgsSchema } from './fixtures/minimal-orders/schema.js';
import { createScenarioDb, waitFor } from './helpers/scenario.js';
import { withQuietPostgresUrl } from './helpers/test-harness.js';

const ordersByStatus = pulse(orders)
  .args(ordersByStatusArgsSchema)
  .order('asc')
  .query((ctx) => ctx.query({ status: ctx.args.status }));

function buildRegistry() {
  return createPulseRegistry({ ordersByStatus });
}

async function setupPullFalseScenario(label: string) {
  const scenario = await createScenarioDb(`pulse_pullfalse_${label}`);
  // Deliberately absent: the publication — bootstrap() still self-provisions it under
  // pull:false (embedded needs WAL), along with REPLICA IDENTITY FULL on each source.
  const publicationName = `pullfalse_pub_${label}`;
  const slotName = `pullfalse_slot_${label}`;
  const sourceSql = postgres(withQuietPostgresUrl(scenario.databaseUrl));

  const registry = buildRegistry();
  const runtime = new PulseRuntime(registry, {
    databaseUrl: scenario.databaseUrl,
    sourceDb: drizzle({ client: sourceSql }),
    pull: false,
    wal: { publicationName, slotName },
    logLevel: LogLevel.Error,
  });

  return {
    databaseName: scenario.databaseName,
    sql: scenario.sql,
    sourceSql,
    publicationName,
    slotName,
    runtime,
    drop: scenario.drop,
  };
}

type PullFalseScenario = Awaited<ReturnType<typeof setupPullFalseScenario>>;

async function teardownScenario(
  s: PullFalseScenario,
  opts: { alreadyStopped?: boolean } = {},
): Promise<void> {
  if (!opts.alreadyStopped) {
    await s.runtime.stop();
  }
  await s.sourceSql.end();
  await s.drop();
}

async function eventsSchemaRelationCount(sql: PullFalseScenario['sql']): Promise<number> {
  const rows = await sql.unsafe(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'drizzle_pulse'`,
  );
  return rows.length;
}

describe('pull: false — embedded-only runtime writes nothing to events tables', () => {
  test('provisioning: zero events-schema relations; publication self-provisioned, REPLICA IDENTITY forced to FULL', async () => {
    const s = await setupPullFalseScenario('provision');
    try {
      await s.runtime.start();
      expect(s.runtime.isRunning).toBe(true);

      expect(await eventsSchemaRelationCount(s.sql)).toBe(0);

      const members = await s.sql.unsafe<{ tablename: string }[]>(
        `SELECT tablename FROM pg_publication_tables WHERE pubname = $1`,
        [s.publicationName],
      );
      expect(members.map((row) => row.tablename)).toEqual(['orders']);

      const replicaIdentity = await s.sql.unsafe<{ relreplident: string }[]>(
        `SELECT relreplident FROM pg_class WHERE relname = 'orders'`,
      );
      expect(replicaIdentity[0]?.relreplident).toBe('f');
    } finally {
      await teardownScenario(s);
    }
  });

  test('runtime.handlers throws, naming pull, on an embedded-only runtime', async () => {
    const s = await setupPullFalseScenario('handlers');
    try {
      await s.runtime.start();
      expect(() => s.runtime.handlers).toThrow(/pull/i);
    } finally {
      await teardownScenario(s);
    }
  });

  test('slot hygiene: a temporary, randomized-suffix slot while running; gone after stop', async () => {
    const s = await setupPullFalseScenario('slot');
    try {
      await s.runtime.start();

      const slots = await s.sql.unsafe<{ slot_name: string; temporary: boolean }[]>(
        `SELECT slot_name, temporary FROM pg_replication_slots WHERE slot_name LIKE $1`,
        [`${s.slotName}\\_%`],
      );
      expect(slots).toHaveLength(1);
      expect(slots[0]?.slot_name).not.toBe(s.slotName);
      expect(slots[0]?.temporary).toBe(true);

      await s.runtime.stop();

      await waitFor(async () => {
        const remaining = await s.sql.unsafe(
          `SELECT 1 FROM pg_replication_slots WHERE slot_name LIKE $1`,
          [`${s.slotName}\\_%`],
        );
        return remaining.length === 0;
      });
    } finally {
      await teardownScenario(s, { alreadyStopped: true });
    }
  });

  test('embedded collection convergence + stateless events delivery, live over the WAL tap with no events tables', async () => {
    const s = await setupPullFalseScenario('live');
    try {
      await s.runtime.start();

      // The delete below is gated on the collection's WHERE evaluated against the full old
      // tuple — bootstrap() must have forced FULL for that evaluation to see `status`.
      const replicaIdentity = await s.sql.unsafe<{ relreplident: string }[]>(
        `SELECT relreplident FROM pg_class WHERE relname = 'orders'`,
      );
      expect(replicaIdentity[0]?.relreplident).toBe('f');

      const client = createPulseClient(s.runtime);
      const events = createPulseEvents(s.runtime);

      const collectionPromise = client.ordersByStatus({ status: 'accepted' });
      const eventLog: Array<{ op: string; lsn: string }> = [];
      const unsub = events.ordersByStatus({ status: 'accepted' }, (event, lsn) => {
        eventLog.push({ op: event.op, lsn });
      });

      const collection = await collectionPromise;

      await s.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      await waitFor(() => collection.list().length === 1 && eventLog.length === 1);
      expect(eventLog[0]?.op).toBe('insert');
      expect(eventLog[0]?.lsn).toMatch(/^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/);

      const insertedId = collection.list()[0]?.id as number;

      await s.sql.unsafe(`UPDATE "orders" SET status = 'completed' WHERE id = $1`, [insertedId]);
      await waitFor(() => collection.list().length === 0 && eventLog.length === 2);
      expect(eventLog[1]?.op).toBe('update');

      await s.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 20)`,
      );
      await waitFor(() => collection.list().length === 1 && eventLog.length === 3);
      expect(eventLog[2]?.op).toBe('insert');
      const secondId = collection.list()[0]?.id as number;

      await s.sql.unsafe(`DELETE FROM "orders" WHERE id = $1`, [secondId]);
      await waitFor(() => collection.list().length === 0 && eventLog.length === 4);
      expect(eventLog[3]?.op).toBe('delete');

      // No events-table infrastructure appeared as a side effect of the insert/update/delete
      // cycle above — persistence stayed off for the entire lifecycle, not just at boot.
      expect(await eventsSchemaRelationCount(s.sql)).toBe(0);

      unsub();
      collection.dispose();
    } finally {
      await teardownScenario(s);
    }
  });

  test('wire-shape pin: the pull:false delete event is exactly { op, old_row, pk } with a full old_row, and updates carry matchesNew with no old-match flag', async () => {
    const s = await setupPullFalseScenario('wireshape');
    try {
      await s.runtime.start();

      const events = createPulseEvents(s.runtime);
      const captured: unknown[] = [];
      const unsub = events.ordersByStatus({ status: 'accepted' }, (event) => {
        captured.push(event);
      });

      await s.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      await waitFor(() => captured.length === 1);
      const insertEvent = captured[0] as Record<string, unknown>;
      expect(Object.keys(insertEvent).sort()).toEqual(['op', 'pk', 'row']);
      const insertedId = insertEvent.pk as number;

      await s.sql.unsafe(`UPDATE "orders" SET price = 20 WHERE id = $1`, [insertedId]);
      await waitFor(() => captured.length === 2);
      const updateEvent = captured[1] as Record<string, unknown>;
      expect(updateEvent).toHaveProperty('matchesNew');
      expect(updateEvent).not.toHaveProperty('matchesOld');

      // REPLICA IDENTITY FULL means the delete's old_row carries the query's full projected
      // row, same as under pull:true. Any future field addition/removal on this shape must
      // consciously edit this pin.
      await s.sql.unsafe(`DELETE FROM "orders" WHERE id = $1`, [insertedId]);
      await waitFor(() => captured.length === 3);
      const deleteEvent = captured[2] as Record<string, unknown>;
      expect(Object.keys(deleteEvent).sort()).toEqual(['old_row', 'op', 'pk']);
      expect(deleteEvent.pk).toBe(insertedId);
      const oldRow = deleteEvent.old_row as Record<string, unknown>;
      expect(Object.keys(oldRow).sort()).toEqual([
        'createdAt',
        'driverId',
        'id',
        'price',
        'status',
      ]);
      expect(oldRow.id).toBe(insertedId);
      expect(oldRow.status).toBe('accepted');
      expect(oldRow.price).toBe(20);

      unsub();
    } finally {
      await teardownScenario(s);
    }
  });

  test('mid-run reconnect: walsender kill re-converges a live embedded collection on a fresh temporary slot', async () => {
    const s = await setupPullFalseScenario('reconnect');
    let terminalError: Error | null = null;
    s.runtime.onTerminalError((error) => {
      terminalError = error;
    });

    try {
      await s.runtime.start();

      const client = createPulseClient(s.runtime);
      const collection = await client.ordersByStatus({ status: 'accepted' });

      await s.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (1, 'accepted', 10)`,
      );
      await waitFor(() => collection.list().length === 1);

      // Locate the active temp slot (randomized-suffix, never the base slotName) and its
      // walsender backend.
      const before = await s.sql.unsafe<{ slot_name: string; active_pid: number | null }[]>(
        `SELECT slot_name, active_pid FROM pg_replication_slots WHERE slot_name LIKE $1`,
        [`${s.slotName}\\_%`],
      );
      expect(before).toHaveLength(1);
      const killedSlotName = before[0]?.slot_name;
      const activePid = before[0]?.active_pid;
      expect(activePid).not.toBeNull();

      // Terminate only — do NOT drop. The temporary slot vanishes with its backend once the
      // reconnect creates a fresh one; dropping it ourselves would be redundant and could
      // race the server's own cleanup.
      await s.sql.unsafe(`SELECT pg_terminate_backend($1)`, [activePid ?? null]);

      // Downtime write while disconnected, before the reconnect lands.
      await s.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (2, 'accepted', 20)`,
      );

      // First reconnect lands ~1-2s after the edge (the driver's base backoff plus jitter).
      await waitFor(async () => {
        const rows = await s.sql.unsafe<{ slot_name: string }[]>(
          `SELECT slot_name FROM pg_replication_slots WHERE slot_name LIKE $1`,
          [`${s.slotName}\\_%`],
        );
        return rows.length > 0 && rows[0]?.slot_name !== killedSlotName;
      }, 10000);

      // Gapless rebaseline: both orders present, including the downtime row — proving the
      // rebaseline read the fresh slot's exported snapshot, not just a resumed stream.
      await waitFor(() => collection.list().length === 2, 10000);
      expect(new Set(collection.list().map((row) => row.driverId))).toEqual(new Set([1, 2]));

      expect(terminalError).toBeNull();

      // Post-recovery liveness: the pipeline keeps delivering after the reconnect settles.
      await s.sql.unsafe(
        `INSERT INTO "orders" (driver_id, status, price) VALUES (3, 'accepted', 30)`,
      );
      await waitFor(() => collection.list().length === 3);

      collection.dispose();
    } finally {
      await teardownScenario(s);
    }
  });
});
