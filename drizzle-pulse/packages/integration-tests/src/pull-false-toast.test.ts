/**
 * Integration proof for pull:false TOAST carry-forward: an UPDATE that never touches a
 * TOASTed column omits it from pgoutput's new tuple — the old-under-new spread over the
 * REPLICA IDENTITY FULL old tuple must carry it forward, a WHERE evaluated against that
 * spread row must still work, and a same-commit UPDATE+DELETE must converge. Own
 * scenario-local database + table (a TOASTable `note` column that the shared minimal-orders
 * fixture doesn't carry) — mirrors pull-false.test.ts's scenario discipline (bare DDL, no
 * publication/replica-identity setup, temp-slot teardown drain).
 */

import { describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { decimal, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createSelectSchema } from 'drizzle-orm/zod';
import { pulse } from 'drizzle-pulse';
import { createPulseClient } from 'drizzle-pulse/client/embedded';
import { createPulseRegistry, LogLevel, PulseRuntime } from 'drizzle-pulse/server';
import postgres from 'postgres';
import { createScenarioDb, waitFor } from './helpers/scenario.js';
import { withQuietPostgresUrl } from './helpers/test-harness.js';

const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  status: text('status').notNull(),
  price: decimal('price', { mode: 'number' }).notNull(),
  note: text('note').notNull(),
});

const orderSchema = createSelectSchema(orders);

const ordersByStatus = pulse(orders)
  .args(orderSchema.pick({ status: true }))
  .order('asc')
  .query((ctx) => ctx.query({ status: ctx.args.status }));

const ordersByNote = pulse(orders)
  .args(orderSchema.pick({ note: true }))
  .order('asc')
  .query((ctx) => ctx.query({ note: ctx.args.note }));

function buildRegistry() {
  return createPulseRegistry({ ordersByStatus, ordersByNote });
}

// This suite's own TOASTable `note` column — the shared minimal-orders fixture doesn't carry
// one, and a bare-DDL scenario (no publication/replica-identity) is required for the pull:false
// self-provisioning precondition.
const LOCAL_ORDERS_DDL = `
  CREATE TABLE "orders" (
    "id" serial PRIMARY KEY,
    "status" text NOT NULL,
    "price" numeric NOT NULL,
    "note" text NOT NULL
  )
`;

async function setupScenario(label: string) {
  const scenario = await createScenarioDb(`pulse_toastfalse_${label}`, { ddl: LOCAL_ORDERS_DDL });
  // Deliberately absent: the publication — bootstrap() self-provisions it under pull:false,
  // along with REPLICA IDENTITY FULL (the source of every old tuple the tap decodes).
  const publicationName = `toastfalse_pub_${label}`;
  const slotName = `toastfalse_slot_${label}`;
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
    sql: scenario.sql,
    sourceSql,
    publicationName,
    slotName,
    runtime,
    drop: scenario.drop,
  };
}

type Scenario = Awaited<ReturnType<typeof setupScenario>>;

async function teardownScenario(s: Scenario): Promise<void> {
  await s.runtime.stop();
  await s.sourceSql.end();
  await s.drop();
}

async function eventsSchemaRelationCount(sql: Scenario['sql']): Promise<number> {
  const rows = await sql.unsafe(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'drizzle_pulse'`,
  );
  return rows.length;
}

// Incompressible so TOAST can't inline-compress it away — must be pushed out-of-line to
// actually exercise pgoutput's omitted-column carry-forward (driver-minipg.test.ts idiom).
function toastableValue(): string {
  return randomBytes(5000).toString('hex');
}

describe('pull: false — TOAST-omitted column carry-forward', () => {
  test('carry-forward: an unrelated-column update does not drop the TOAST-omitted column', async () => {
    const s = await setupScenario('carry');
    try {
      await s.runtime.start();

      // The carry-forward below rides on the FULL old tuple — prove bootstrap() forced it.
      const replicaIdentity = await s.sql.unsafe<{ relreplident: string }[]>(
        `SELECT relreplident FROM pg_class WHERE relname = 'orders'`,
      );
      expect(replicaIdentity[0]?.relreplident).toBe('f');

      const client = createPulseClient(s.runtime);
      const collection = await client.ordersByStatus({ status: 'accepted' });

      const note = toastableValue();
      await s.sql.unsafe(`INSERT INTO "orders" (status, price, note) VALUES ('accepted', 10, $1)`, [
        note,
      ]);
      await waitFor(() => collection.list().length === 1);
      const insertedId = collection.list()[0]?.id as number;

      await s.sql.unsafe(`UPDATE "orders" SET price = 20 WHERE id = $1`, [insertedId]);
      await waitFor(() => {
        const row = collection.list()[0] as { price?: number } | undefined;
        return row?.price === 20;
      });

      const row = collection.list()[0] as { note?: string } | undefined;
      expect(row?.note).toBe(note);
      expect(row?.note?.length).toBe(note.length);

      expect(await eventsSchemaRelationCount(s.sql)).toBe(0);

      collection.dispose();
    } finally {
      await teardownScenario(s);
    }
  });

  test('WHERE on the TOASTed column: membership survives an unrelated-column update, and leaves when the filtered column itself changes', async () => {
    const s = await setupScenario('filter');
    try {
      await s.runtime.start();

      const client = createPulseClient(s.runtime);
      const note = toastableValue();
      const collection = await client.ordersByNote({ note });

      await s.sql.unsafe(
        `INSERT INTO "orders" (status, price, note) VALUES ('requested', 10, $1)`,
        [note],
      );
      await waitFor(() => collection.list().length === 1);
      const insertedId = collection.list()[0]?.id as number;

      // Without the carry-forward the omitted `note` evaluates as non-matching (filter-ast
      // treats a missing column as non-matching) and the pk-stable update would evict the row
      // via membership even though `note` never changed.
      await s.sql.unsafe(`UPDATE "orders" SET price = 20 WHERE id = $1`, [insertedId]);
      await waitFor(() => {
        const row = collection.list()[0] as { price?: number } | undefined;
        return row?.price === 20;
      });
      expect(collection.list()).toHaveLength(1);

      // Changing the filtered column itself still leaves — the new tuple genuinely carries the
      // non-matching value, no fill involved.
      const otherNote = toastableValue();
      await s.sql.unsafe(`UPDATE "orders" SET note = $1 WHERE id = $2`, [otherNote, insertedId]);
      await waitFor(() => collection.list().length === 0);

      expect(await eventsSchemaRelationCount(s.sql)).toBe(0);

      collection.dispose();
    } finally {
      await teardownScenario(s);
    }
  });

  test('a same-commit UPDATE+DELETE of a TOAST-carrying row converges', async () => {
    const s = await setupScenario('samecommit');
    try {
      await s.runtime.start();

      const client = createPulseClient(s.runtime);
      const collection = await client.ordersByStatus({ status: 'accepted' });

      const note = toastableValue();
      await s.sql.unsafe(`INSERT INTO "orders" (status, price, note) VALUES ('accepted', 10, $1)`, [
        note,
      ]);
      await waitFor(() => collection.list().length === 1);
      const insertedId = collection.list()[0]?.id as number;

      // Both changes arrive in one commit batch: the update's row and the delete's gate both
      // decode from their own WAL old tuples — no source-table read happens, so the row being
      // long gone in SQL by decode time cannot matter. sql.begin() reserves one connection for
      // both statements (postgres.js rejects a bare pooled BEGIN outside
      // sql.begin()/sql.reserved()).
      await s.sql.begin(async (tx) => {
        await tx.unsafe(`UPDATE "orders" SET price = 30 WHERE id = $1`, [insertedId]);
        await tx.unsafe(`DELETE FROM "orders" WHERE id = $1`, [insertedId]);
      });

      await waitFor(() => collection.list().length === 0);

      expect(await eventsSchemaRelationCount(s.sql)).toBe(0);

      collection.dispose();
    } finally {
      await teardownScenario(s);
    }
  });
});
