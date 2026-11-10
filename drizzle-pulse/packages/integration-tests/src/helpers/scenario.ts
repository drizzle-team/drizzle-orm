import postgres from 'postgres';
import {
  baseDatabaseUrl,
  buildDatabaseUrl,
  createQuietPostgresClient,
  randomSuffix,
  waitFor,
  withQuietPostgresUrl,
} from './test-harness.js';

export { waitFor };

/**
 * Bare orders table shared by the standalone suites — no publication, no replica identity, no
 * events schema. startup-guard/bootstrap/bootstrap-publication/pull-false assert self-
 * provisioning of those from exactly this precondition, so this DDL is a constant rather than
 * routed through the fixture migration runner (whose wal-setup migration provisions both up
 * front, defeating the self-provisioning preconditions).
 */
export const BARE_ORDERS_DDL = `
  CREATE TABLE "orders" (
    "id" serial PRIMARY KEY,
    "driver_id" integer,
    "status" text DEFAULT 'requested' NOT NULL,
    "price" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )
`;

export type ScenarioDb = {
  databaseName: string;
  databaseUrl: string;
  sql: ReturnType<typeof postgres>;
  drop: () => Promise<void>;
};

// Guards drop() against ever force-dropping a database this helper did not create.
const SCENARIO_SUFFIX_PATTERN = /_[0-9a-f]{10}$/;

export async function createScenarioDb(
  label: string,
  // `ddl: null` opts out of DDL application entirely — driver-minipg.test.ts owns its schema via
  // a real migration folder (not a bare-DDL fixture) applied through its own pg Pool afterward.
  opts: { ddl?: string | null } = {},
): Promise<ScenarioDb> {
  const base = baseDatabaseUrl();
  const databaseName = `${label}_${randomSuffix()}`;

  const bootstrap = postgres(withQuietPostgresUrl(base));
  try {
    await bootstrap`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${databaseName}
        AND pid <> pg_backend_pid()
    `;
    await bootstrap.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await bootstrap.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }

  const databaseUrl = buildDatabaseUrl(base, databaseName);
  const sql = createQuietPostgresClient(databaseUrl);
  if (opts.ddl !== null) {
    await sql.unsafe(opts.ddl ?? BARE_ORDERS_DDL);
  }

  const drop = async (): Promise<void> => {
    if (!SCENARIO_SUFFIX_PATTERN.test(databaseName)) {
      throw new Error(
        `refusing to drop database "${databaseName}" — name does not match the scenario random-suffix pattern`,
      );
    }

    // Close the scenario client before terminating backends/dropping the database.
    await sql.end();

    const admin = postgres(withQuietPostgresUrl(base));
    try {
      const slots = await admin<Array<{ slot_name: string }>>`
        SELECT slot_name FROM pg_replication_slots WHERE database = ${databaseName}
      `;

      // Bounded-retry force-drop, never a drain-wait — DROP DATABASE is not blocked by inactive
      // durable slots, and waiting for them to self-clear burns the wait's full timeout.
      for (const { slot_name } of slots) {
        await waitFor(
          async () => {
            try {
              await admin`SELECT pg_drop_replication_slot(${slot_name})`;
              return true;
            } catch (error) {
              const code = (error as { code?: string }).code;
              if (code === '42704') return true; // undefined_object — already gone
              if (code === '55006') return false; // object_in_use — walsender still attached, retry
              throw error;
            }
          },
          3000,
          300,
        );
      }

      await admin`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = ${databaseName}
          AND pid <> pg_backend_pid()
      `;
      await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
    } finally {
      await admin.end();
    }
  };

  return { databaseName, databaseUrl, sql, drop };
}
