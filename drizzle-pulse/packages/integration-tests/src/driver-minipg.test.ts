/**
 * Two integration proofs, standalone (keeps `test-harness.ts` single-driver rather than
 * parametrizing it).
 *
 * Coexistence: a plain node-postgres (`pg`) `Pool` — connectionString only, NO `types` override —
 * coexists with minipg-owned replication as a generic `sourceDb`. The old custom-`types` caveat
 * (needed so the deleted hand-rolled WAL normalizer's from-text codecs could consume
 * date/timestamp/point OIDs that pg's default parsers over-decoded) is dead: minipg's shape
 * bridge now decodes WAL rows, and a plain sourceDb never touches that path.
 *
 * TOAST carry-forward: an UPDATE that never touches a TOASTed column omits it from pgoutput's new tuple;
 * the existing old-under-new spread must still carry it forward intact, in both the persisted
 * events-table row and embedded `list()`.
 */

import { describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { pulse } from 'drizzle-pulse';
import { createPulseClient } from 'drizzle-pulse/client/embedded';
import {
  buildEventsTable,
  createPulseRegistry,
  LogLevel,
  PulseRuntime,
} from 'drizzle-pulse/server';
import { Pool } from 'pg';
import { pgDataTypesFixture } from './fixtures/pg-data-types/index.js';
import { pgDataTypeInsertValues } from './fixtures/pg-data-types/inventory.js';
import { pgDataTypes } from './fixtures/pg-data-types/schema.js';
import { createScenarioDb, waitFor } from './helpers/scenario.js';
import {
  createPulseRouterWithAuth,
  randomSuffix,
  subscribeClient,
  withQuietPostgresUrl,
} from './helpers/test-harness.js';

const allPgDataTypes = pulse(pgDataTypes).query(() => null);

function buildRegistry() {
  return createPulseRegistry({ allPgDataTypes });
}

async function setupScenario(label: string) {
  // The pg-data-types fixture needs a real migration folder, not a bare-DDL scaffold — scenario.ts
  // only owns database create/drop admin plumbing here (`ddl: null`).
  const scenario = await createScenarioDb(`pulse_driverminipg_${label}`, { ddl: null });

  const migrationPool = new Pool({ connectionString: withQuietPostgresUrl(scenario.databaseUrl) });
  try {
    await migrate(drizzle({ client: migrationPool }), {
      migrationsFolder: pgDataTypesFixture.migrationsPath,
    });
  } finally {
    await migrationPool.end();
  }

  // The point under test: a plain node-postgres Pool — connectionString only, no
  // `types` override. See module doc.
  const sourcePool = new Pool({ connectionString: withQuietPostgresUrl(scenario.databaseUrl) });
  const sourceDb: NodePgDatabase = drizzle({ client: sourcePool });

  const publicationName = `driverminipg_pub_${label}_${randomSuffix()}`;
  const slotName = `test_slot_driverminipg_${label}_${randomSuffix()}`;

  const registry = buildRegistry();
  const runtime = new PulseRuntime(registry, {
    databaseUrl: scenario.databaseUrl,
    sourceDb,
    pull: true,
    wal: { publicationName, slotName },
    logLevel: LogLevel.Error,
  });

  await runtime.start();
  const router = createPulseRouterWithAuth(runtime, { userId: null });

  return {
    scenario,
    sourcePool,
    sourceDb,
    publicationName,
    slotName,
    runtime,
    router,
  };
}

type Scenario = Awaited<ReturnType<typeof setupScenario>>;

async function teardownScenario(s: Scenario): Promise<void> {
  await s.runtime.stop();
  await s.sourcePool.query(`DROP PUBLICATION IF EXISTS "${s.publicationName}"`);
  await s.sourcePool.end();
  await s.scenario.drop();
}

describe('a plain pg sourceDb coexisting with minipg replication', () => {
  test('coexistence: embedded list() and an HTTP subscribe baseline both converge to source truth, including date/timestamp/point columns', async () => {
    const s = await setupScenario('coexist');
    try {
      const client = createPulseClient(s.runtime);
      const collection = await client.allPgDataTypes();
      expect(collection.list()).toEqual([]);

      const [inserted] = await s.sourceDb
        .insert(pgDataTypes)
        .values(pgDataTypeInsertValues)
        .returning({ id: pgDataTypes.id });
      const insertedId = inserted!.id;

      await waitFor(() => collection.list().length === 1);

      const [baselineRow] = await s.sourceDb
        .select()
        .from(pgDataTypes)
        .where(eq(pgDataTypes.id, insertedId));
      expect(collection.list()[0]).toEqual(baselineRow!);

      // Mutate exactly the columns the old raw-text-OID override used to special-case.
      const updatedDate = new Date('2025-02-03T00:00:00.000Z');
      const updatedTimestamp = new Date('2025-02-03T04:05:06.000Z');
      await s.sourceDb
        .update(pgDataTypes)
        .set({
          dateCol: updatedDate,
          timestampCol: updatedTimestamp,
          pointTupleCol: [11.5, 22.5],
        })
        .where(eq(pgDataTypes.id, insertedId));

      await waitFor(() => {
        const row = collection.list()[0] as { pointTupleCol?: number[] } | undefined;
        return row?.pointTupleCol?.[0] === 11.5;
      });

      const [updatedBaseline] = await s.sourceDb
        .select()
        .from(pgDataTypes)
        .where(eq(pgDataTypes.id, insertedId));
      expect(collection.list()[0]).toEqual(updatedBaseline!);

      // HTTP baseline decode (drizzle codecs, via sourceDb) === WAL decode (shape bridge) — one
      // stream, two decoders, same shape. The wire row additionally carries $pk (the HTTP
      // client's identity key); embedded rows don't.
      const subscribed = await subscribeClient(s.router, 'allPgDataTypes', {});
      expect(subscribed.rows[0]).toEqual({
        ...(collection.list()[0] as Record<string, unknown>),
        $pk: insertedId,
      });

      await s.sourceDb.delete(pgDataTypes).where(eq(pgDataTypes.id, insertedId));
      await waitFor(() => collection.list().length === 0);

      collection.dispose();
    } finally {
      await teardownScenario(s);
    }
  });

  test('a TOAST-omitted UPDATE column survives an unrelated-column update in both the events table and embedded list()', async () => {
    const s = await setupScenario('toast');
    try {
      const client = createPulseClient(s.runtime);
      const collection = await client.allPgDataTypes();

      // Random (incompressible) so TOAST can't inline-compress it away — must be pushed
      // out-of-line to actually exercise pgoutput's omitted-column carry-forward.
      const largeText = randomBytes(5000).toString('hex');
      const [inserted] = await s.sourceDb
        .insert(pgDataTypes)
        .values({ ...pgDataTypeInsertValues, textCol: largeText })
        .returning({ id: pgDataTypes.id });
      const insertedId = inserted!.id;

      await waitFor(() => collection.list().some((row) => row.id === insertedId));

      await s.sourceDb
        .update(pgDataTypes)
        .set({ integerCol: 42 })
        .where(eq(pgDataTypes.id, insertedId));

      await waitFor(() => {
        const row = collection.list().find((r) => r.id === insertedId) as
          | { integerCol?: number }
          | undefined;
        return row?.integerCol === 42;
      });

      const row = collection.list().find((r) => r.id === insertedId) as
        | { textCol?: string }
        | undefined;
      expect(row?.textCol).toBe(largeText);
      expect(row?.textCol?.length).toBe(largeText.length);

      const eventsTable = buildEventsTable(pgDataTypes);
      const eventsTableConfig = getTableConfig(eventsTable);
      const eventsIdent = `"${eventsTableConfig.schema ?? 'drizzle_pulse'}"."${eventsTableConfig.name}"`;
      const { rows: eventRows } = await s.sourcePool.query<{ text_col: string }>(
        `SELECT text_col FROM ${eventsIdent} WHERE id = $1 AND "$op" = 'update' ORDER BY "$snapshot" DESC LIMIT 1`,
        [insertedId],
      );
      expect(eventRows[0]?.text_col).toBe(largeText);
      expect(eventRows[0]?.text_col?.length).toBe(largeText.length);

      collection.dispose();
    } finally {
      await teardownScenario(s);
    }
  });
});
