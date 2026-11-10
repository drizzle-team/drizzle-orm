import { sql } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import type { HarnessEvent } from './test-harness.js';

type PostgresClient = ReturnType<typeof postgres>;

type FixtureWithEventsTable = {
  eventsTable: PgTable;
};

type DbEventOperation = PromiseLike<unknown>;
type DbEventResults<TOperations extends ReadonlyArray<DbEventOperation>> = {
  [TIndex in keyof TOperations]: Awaited<TOperations[TIndex]>;
};

export type ProcessDbOperationsOptions = {
  mode?: 'sequential' | 'concurrent';
};

/** The single home for the quoted `"schema"."table"` events-table identifier (was copied 4x). */
export function eventsTableIdent(fixture: FixtureWithEventsTable): string {
  const eventsTableConfig = getTableConfig(fixture.eventsTable);
  return `"${eventsTableConfig.schema ?? 'public'}"."${eventsTableConfig.name}"`;
}

async function getCurrentSnapshotForFixture(
  fixture: FixtureWithEventsTable,
  pool: PostgresClient,
): Promise<number> {
  const rows = await pool.unsafe<Array<{ max_snapshot: string }>>(
    `SELECT COALESCE(MAX("$snapshot"), 0)::text AS max_snapshot FROM ${eventsTableIdent(fixture)}`,
  );
  return Number(rows[0]?.max_snapshot ?? '0');
}

export type WaitForEventsPredicate = 'rowCount' | 'maxSnapshot';

export type WaitForEventsOptions = {
  predicate?: WaitForEventsPredicate;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

const WAIT_FOR_EVENTS_DEFAULT_TIMEOUT_MS: Record<WaitForEventsPredicate, number> = {
  rowCount: 5000,
  maxSnapshot: 15000,
};

/**
 * The one events-table poller, merging `rowCount` (row count vs. expectedCount) and
 * `maxSnapshot` (max `$snapshot` vs. sinceSnapshot + expectedCount) predicates.
 *
 * `maxSnapshot` probes with an UNFILTERED max-snapshot query rather than deriving the max from
 * the filtered row fetch below — baseline `$op='snapshot'` rows consume snapshot numbers without
 * ever satisfying the `$op <> 'snapshot'` filter, so a filtered-only probe hangs forever.
 */
export async function waitForEvents(
  fixture: FixtureWithEventsTable,
  pool: PostgresClient,
  sinceSnapshot: number,
  expectedCount: number,
  opts?: WaitForEventsOptions,
): Promise<HarnessEvent[]> {
  const predicate = opts?.predicate ?? 'rowCount';
  const timeoutMs = opts?.timeoutMs ?? WAIT_FOR_EVENTS_DEFAULT_TIMEOUT_MS[predicate];
  const pollIntervalMs = opts?.pollIntervalMs ?? 50;
  const eventsTable = eventsTableIdent(fixture);
  const start = Date.now();

  const fetchFilteredRows = () =>
    pool.unsafe<HarnessEvent[]>(
      `
        SELECT "$snapshot"::int AS snapshot, id AS pk, "$op" AS op, "$timestamp"::text AS timestamp
        FROM ${eventsTable}
        WHERE "$snapshot" > $1
          AND "$op" <> 'snapshot'
        ORDER BY "$snapshot" ASC
      `,
      [sinceSnapshot],
    );

  if (predicate === 'rowCount') {
    while (Date.now() - start < timeoutMs) {
      const rows = await fetchFilteredRows();

      if (rows.length >= expectedCount) {
        return rows;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, pollIntervalMs);
      });
    }

    const rows = await pool.unsafe<Array<{ count: string }>>(
      `
        SELECT COUNT(*)::text AS count
        FROM ${eventsTable}
        WHERE "$snapshot" > $1
          AND "$op" <> 'snapshot'
      `,
      [sinceSnapshot],
    );
    const actual = Number(rows[0]?.count ?? '0');
    throw new Error(
      `Timeout: expected ${expectedCount} events after snapshot ${sinceSnapshot}, got ${actual} in ${timeoutMs}ms`,
    );
  }

  const targetSnapshot = sinceSnapshot + expectedCount;

  while (Date.now() - start < timeoutMs) {
    const currentSnapshot = await getCurrentSnapshotForFixture(fixture, pool);

    if (currentSnapshot >= targetSnapshot) {
      const rows = await fetchFilteredRows();
      return rows;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollIntervalMs);
    });
  }

  const actualSnapshot = await getCurrentSnapshotForFixture(fixture, pool);

  throw new Error(
    `Timeout: expected snapshot to reach at least ${targetSnapshot} after ${expectedCount} processed events, got ${actualSnapshot} in ${timeoutMs}ms`,
  );
}

/** Legacy row-count-predicate poller, now a thin delegation to {@link waitForEvents}. */
export async function waitForEventsForFixture(
  fixture: FixtureWithEventsTable,
  pool: PostgresClient,
  sinceSnapshot: number,
  expectedCount: number,
  opts?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<HarnessEvent[]> {
  return waitForEvents(fixture, pool, sinceSnapshot, expectedCount, {
    ...opts,
    predicate: 'rowCount',
  });
}

/** Legacy max-snapshot-predicate poller, now a thin delegation to {@link waitForEvents}. */
export async function waitForProcessedEventsForFixture(
  fixture: FixtureWithEventsTable,
  pool: PostgresClient,
  sinceSnapshot: number,
  expectedEventCount: number,
  opts?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<HarnessEvent[]> {
  return waitForEvents(fixture, pool, sinceSnapshot, expectedEventCount, {
    ...opts,
    predicate: 'maxSnapshot',
  });
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 8000,
  pollIntervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollIntervalMs);
    });
  }
}

export async function processDbOperations<
  const TOperations extends ReadonlyArray<DbEventOperation>,
>(
  fixture: FixtureWithEventsTable,
  pool: PostgresClient,
  operations: TOperations,
  options?: ProcessDbOperationsOptions,
): Promise<{ events: HarnessEvent[]; results: DbEventResults<TOperations> }> {
  if (operations.length === 0) {
    return { events: [], results: [] as DbEventResults<TOperations> };
  }

  const sinceSnapshot = await getCurrentSnapshotForFixture(fixture, pool);
  const collectedResults: unknown[] = [];

  if (options?.mode === 'concurrent') {
    const results = await Promise.all(operations);
    for (const [index, result] of results.entries()) {
      collectedResults[index] = result;
    }
  } else {
    for (const [index, operation] of operations.entries()) {
      collectedResults[index] = await operation;
    }
  }

  const results = collectedResults as DbEventResults<TOperations>;

  const events = await waitForProcessedEventsForFixture(
    fixture,
    pool,
    sinceSnapshot,
    operations.length,
  );

  return { events, results };
}

/**
 * Insert a test user via Drizzle raw SQL.
 *
 * Replaces the `pg`-backed `insertTestUser` from the fixture helpers
 * module, keeping the same contract: creates a user with the given
 * username + `'test123'` password hash and returns `{ id, username }`.
 */
export async function insertTestUser(
  db: PostgresJsDatabase,
  username: string,
): Promise<{ id: number; username: string }> {
  const result = await db.execute<{ id: number; username: string }>(
    sql`INSERT INTO "users" (username, password_hash) VALUES (${username}, 'test123') RETURNING id, username`,
  );

  const row = result[0];
  if (!row) {
    throw new Error('insertTestUser did not return a row');
  }
  return row;
}
