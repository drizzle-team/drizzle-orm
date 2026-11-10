import { randomUUID } from 'node:crypto';
import type { PgTable } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { QueryDescriptor } from 'drizzle-pulse';
import { createPulseClient, PulseQuery } from 'drizzle-pulse/client';
import {
  type AnyQueries,
  LogLevel,
  type PulseAuthContext,
  type PulseRegistry,
  PulseRuntime,
} from 'drizzle-pulse/server';
import { createPulseHonoRouter as createServerRouter } from 'drizzle-pulse/server/hono';
import type { Hono } from 'hono';
import postgres from 'postgres';
import SuperJSON from 'superjson';
import { z } from 'zod';
import type { ProcessDbOperationsOptions } from './db-helpers.js';
import {
  eventsTableIdent,
  insertTestUser,
  processDbOperations,
  waitFor,
  waitForEventsForFixture,
  waitForProcessedEventsForFixture,
} from './db-helpers.js';

// Re-export shared helpers so downstream tests can import from one place
export {
  insertTestUser,
  processDbOperations,
  waitFor,
  waitForEventsForFixture,
  waitForProcessedEventsForFixture,
};

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_PREFIX = 'drizzle_pulse_test';

type PlainRecord = Record<string, unknown>;

export type HarnessEvent = {
  snapshot: number;
  pk: unknown;
  op: string;
  timestamp: string;
};

type FixtureTableMap = Record<string, unknown>;
type FixtureSchemaMap = Record<string, unknown>;

export type IntegrationTestFixture = {
  variantName: string;
  migrationsPath: string;
  eventsTable: PgTable;
  pulsedTables: PgTable[];
  cleanupTables: readonly string[];
  publicationName: string;
  tables: FixtureTableMap;
  schemas: FixtureSchemaMap;
};

type TestRuntime<TQueries extends AnyQueries> = PulseRuntime<TQueries> & {
  sourceSql: ReturnType<typeof postgres>;
};

/** Infer the harness runtime type from a concrete registry, for use in test variable declarations. */
export type RuntimeOf<TRegistry extends PulseRegistry<AnyQueries>> =
  TRegistry extends PulseRegistry<infer TQueries>
    ? PulseRuntime<TQueries> & { sourceSql: ReturnType<typeof postgres> }
    : never;

type DbEventOperation = PromiseLike<unknown>;
type DbEventResults<TOperations extends ReadonlyArray<DbEventOperation>> = {
  [TIndex in keyof TOperations]: Awaited<TOperations[TIndex]>;
};

export type HarnessDbOperation = DbEventOperation;
export type HarnessDbEventResults<TOperations extends ReadonlyArray<HarnessDbOperation>> =
  DbEventResults<TOperations>;
export type HarnessProcessDbOperations = <
  const TOperations extends ReadonlyArray<HarnessDbOperation>,
>(
  operations: TOperations,
  options?: ProcessDbOperationsOptions,
) => Promise<{ events: HarnessEvent[]; results: HarnessDbEventResults<TOperations> }>;
export type HarnessInitTestQuery = <T extends PulseRow>(
  descriptor: QueryDescriptor<T>,
) => Promise<PulseQuery<T>>;

const plainRecordSchema = z.record(z.string(), z.unknown());

const subscribeResponseSchema = z.object({
  rows: z.array(plainRecordSchema),
  rangeStart: z
    .number()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  rangeEnd: z
    .number()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  // epoch:snapshot cursor token.
  snapshot: z.string(),
});

const pullEventSchema = z.object({
  op: z.string(),
  pk: z.unknown(),
  row: plainRecordSchema.nullish().transform((value) => value ?? undefined),
  old_row: plainRecordSchema.nullish().transform((value) => value ?? undefined),
  matchesNew: z.boolean().optional(),
});

const pullResponseSchema = z.object({
  events: z.array(pullEventSchema).optional(),
  rangeStart: z
    .number()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  rangeEnd: z
    .number()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  // epoch:snapshot cursor token (both incremental and reset responses carry it).
  snapshot: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  reset: z.boolean().optional(),
  reason: z.string().optional(),
});

export function baseDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export function buildDatabaseUrl(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export function randomSuffix(): string {
  return randomUUID().replaceAll('-', '').slice(0, 10);
}

export function withQuietPostgresUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', '-c client_min_messages=warning');
  return url.toString();
}

export function createQuietPostgresClient(databaseUrl: string) {
  return postgres(withQuietPostgresUrl(databaseUrl));
}

async function ensureCleanTestDatabase(
  adminPool: ReturnType<typeof postgres>,
  databaseName: string,
): Promise<void> {
  await adminPool`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = ${databaseName}
      AND pid <> pg_backend_pid()
  `;

  await adminPool.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await adminPool.unsafe(`CREATE DATABASE "${databaseName}"`);
}

async function cleanupStaleTestSlots(adminPool: ReturnType<typeof postgres>): Promise<void> {
  const rows = await adminPool<Array<{ slot_name: string; active_pid: number | null }>>`
    SELECT slot_name, active_pid
    FROM pg_replication_slots
    WHERE slot_name LIKE 'test\\_%' ESCAPE '\\'
  `;

  for (const row of rows) {
    // Never touch active slots — they may belong to other workers/processes
    if (row.active_pid !== null) {
      continue;
    }

    await adminPool`SELECT pg_drop_replication_slot(${row.slot_name})`;
  }
}

async function applyFixtureMigrations(databaseUrl: string, migrationsPath: string): Promise<void> {
  const migrationClient = postgres(withQuietPostgresUrl(databaseUrl), { max: 1 });
  const migrationDb = drizzle({ client: migrationClient });

  try {
    await migrate(migrationDb, { migrationsFolder: migrationsPath });
  } finally {
    await migrationClient.end();
  }
}

async function waitForWalStartup(
  adminPool: ReturnType<typeof postgres>,
  slotName: string,
  runtimeStartupError: { current: Error | null },
  opts?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 50;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (runtimeStartupError.current) {
      throw runtimeStartupError.current;
    }

    const rows = await adminPool<Array<{ slot_name: string }>>`
      SELECT slot_name FROM pg_replication_slots WHERE slot_name = ${slotName}
    `;

    if (rows.length > 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollIntervalMs);
    });
  }

  throw new Error(`Timeout: WAL listener did not initialize slot ${slotName} in ${timeoutMs}ms`);
}

function createTestRuntime<TQueries extends AnyQueries>(
  databaseUrl: string,
  fixture: IntegrationTestFixture,
  registry: PulseRegistry<TQueries>,
): TestRuntime<TQueries> {
  const publicationName = fixture.publicationName;
  const slotName = `test_slot_${randomSuffix()}`;

  const sourceSql = createQuietPostgresClient(databaseUrl);
  const sourceDb = drizzle({ client: sourceSql });

  const runtime = new PulseRuntime(registry, {
    databaseUrl,
    sourceDb,
    pull: true,
    wal: { publicationName, slotName },
    logLevel: LogLevel.Error,
  });

  return Object.assign(runtime, { sourceSql });
}

function createPulseRouter(
  runtime: PulseRuntime<any>,
  auth: PulseAuthContext = { userId: null },
): Hono {
  return createServerRouter(runtime.handlers, auth);
}

export function createPulseRouterWithAuth(
  runtime: PulseRuntime<any>,
  auth: PulseAuthContext,
): Hono {
  return createPulseRouter(runtime, auth);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestSuiteResult<
  TFixture extends IntegrationTestFixture = IntegrationTestFixture,
  TQueries extends AnyQueries = any,
> = {
  runtime: TestRuntime<TQueries>;
  router: Hono;
  pool: ReturnType<typeof postgres>;
  db: PostgresJsDatabase;
  databaseUrl: string;
  publicationName: string;
  slotName: string;
  fixture: TFixture;
  processDbOperations: HarnessProcessDbOperations;
  initTestQuery: HarnessInitTestQuery;
  // Idempotent — the epoch-restart failure path (a test that tears down and re-establishes a
  // suite mid-file) can end up calling this twice on the same stale context, so a second call
  // must be a harmless no-op rather than a double-release error.
  teardown: () => Promise<void>;
  cleanupBetweenTests: () => Promise<void>;
};

export async function setupTestSuiteForFixture<
  TFixture extends IntegrationTestFixture,
  TQueries extends AnyQueries,
>(
  fixture: TFixture,
  registry: PulseRegistry<TQueries>,
): Promise<TestSuiteResult<TFixture, TQueries>> {
  const base = baseDatabaseUrl();
  const adminPool = createQuietPostgresClient(base);
  const databaseName = `${TEST_DATABASE_PREFIX}_${randomSuffix()}`;
  const runtimeStartupError = { current: null as Error | null };

  await cleanupStaleTestSlots(adminPool);
  await ensureCleanTestDatabase(adminPool, databaseName);

  const databaseUrl = buildDatabaseUrl(base, databaseName);
  const testPool = createQuietPostgresClient(databaseUrl);

  // Events tables (and their pulse_meta bookkeeping) are runtime-owned: the migrations set up
  // the source table + publication + replica identity, and runtime.start() below provisions
  // the events tables at boot.
  await applyFixtureMigrations(databaseUrl, fixture.migrationsPath);

  const runtime = createTestRuntime(databaseUrl, fixture, registry);

  void runtime.start().catch((error: unknown) => {
    const startupError = error instanceof Error ? error : new Error(String(error));
    runtimeStartupError.current = startupError;
    console.error(
      `[Integration Harness][${fixture.variantName}] Failed to start WAL listener:`,
      startupError,
    );
  });

  await waitForWalStartup(adminPool, runtime.slotName, runtimeStartupError);

  const dbSql = createQuietPostgresClient(databaseUrl);
  const db = drizzle({ client: dbSql });
  const router = createPulseRouter(runtime);
  const fetchImpl = createRouterFetchAdapter(router);

  let tornDown = false;
  let teardownPromise: Promise<void> | null = null;

  // A mid-teardown throw must leave teardown() retryable (not a permanent no-op), so the
  // idempotency latch is a memoized in-flight promise cleared on failure, not a boolean flipped
  // before any work runs.
  const teardown = (): Promise<void> => {
    teardownPromise ??= (async () => {
      await runtime.stop();
      await testPool.unsafe(`DROP PUBLICATION IF EXISTS ${runtime.publicationName}`);
      // The previous owning backend's active flag can lag its actual termination by a beat
      // (55006 object_in_use) — poll-retry like scenario.ts's drop() does.
      await waitFor(async () => {
        try {
          await adminPool`SELECT pg_drop_replication_slot(${runtime.slotName})`;
          return true;
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code === '42704') return true; // undefined_object — already gone
          if (code === '55006') return false; // object_in_use — walsender still attached, retry
          throw error;
        }
      }, 5000);

      await testPool.end();
      await runtime.sourceSql.end();
      await dbSql.end();

      await adminPool`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = ${databaseName}
          AND pid <> pg_backend_pid()
      `;
      await adminPool.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await adminPool.end();

      tornDown = true;
    })().catch((error: unknown) => {
      teardownPromise = null;
      throw error;
    });
    return teardownPromise;
  };

  const cleanupBetweenTests = async (): Promise<void> => {
    if (tornDown) {
      throw new Error('cleanupBetweenTests() called on a torn-down test suite context');
    }

    const eventsTable = eventsTableIdent(fixture);
    const tableList = fixture.cleanupTables.map((t) => `"${t}"`).join(', ');
    await testPool.unsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    await testPool.unsafe(`TRUNCATE TABLE ${eventsTable} RESTART IDENTITY`);
    await runtime.ensureBaselines();
  };

  async function processFixtureDbOperations<
    const TOperations extends ReadonlyArray<DbEventOperation>,
  >(
    operations: TOperations,
    options?: ProcessDbOperationsOptions,
  ): Promise<{ events: HarnessEvent[]; results: HarnessDbEventResults<TOperations> }> {
    return processDbOperations(fixture, testPool, operations, options);
  }

  async function initTestQuery<T extends PulseRow>(
    descriptor: QueryDescriptor<T>,
  ): Promise<PulseQuery<T>> {
    const client = createPulseClient<{
      [queryName: string]: (args?: Record<string, unknown>) => QueryDescriptor<T>;
    }>({ url: 'http://localhost', fetchImpl, pollIntervalMs: 0 });
    const descriptorFactory = client[descriptor.queryName];
    if (typeof descriptorFactory !== 'function') {
      throw new Error(`Missing client query factory for ${descriptor.queryName}`);
    }

    const query = new PulseQuery(descriptorFactory(descriptor.args));
    await query.subscribe();
    return query;
  }

  return {
    runtime,
    router,
    pool: testPool,
    db,
    databaseUrl,
    publicationName: runtime.publicationName,
    slotName: runtime.slotName,
    fixture,
    processDbOperations: processFixtureDbOperations,
    initTestQuery,
    teardown,
    cleanupBetweenTests,
  };
}

function parseSuperJsonResponse(raw: string): PlainRecord {
  const parsed = SuperJSON.parse(raw);
  return plainRecordSchema.parse(parsed);
}

export function createRouterFetchAdapter(router: Hono): typeof fetch {
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const path = url.pathname + url.search;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const headers = init?.headers ?? (input instanceof Request ? input.headers : {});
    const body = init?.body ?? (input instanceof Request ? await input.text() : undefined);

    return router.request(path, {
      method,
      headers,
      body,
    });
  };

  // Add preconnect method (no-op for test adapter, but required by fetch spec)
  Object.assign(fetchImpl, { preconnect: () => {} });

  return fetchImpl as typeof fetch;
}

// The stateless per-request pull identity: query + client window + cursor token. A subscribe
// or pull result is itself a valid cursor, so it can be fed straight back into pullClient().
export type PullCursor = {
  queryName: string;
  args: PlainRecord;
  rangeStart: number | null;
  rangeEnd: number | null;
  token: string;
};

// The token is `epoch:snapshot`; epoch is a uuid (no colon), snapshot is digits.
function parseSnapshotToken(token: string): number {
  const separator = token.indexOf(':');
  return separator >= 0 ? Number(token.slice(separator + 1)) : 0;
}

export async function subscribeClient(
  router: Hono,
  queryName: string,
  args: PlainRecord,
): Promise<
  PullCursor & {
    rows: PlainRecord[];
    // Parsed snapshot number, for assertions and waitForEventsForFixture.
    snapshot: number;
  }
> {
  const response = await router.request('/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queryName, args }),
  });

  if (!response.ok) {
    throw new Error(`subscribe failed with status ${response.status}`);
  }

  const raw = await response.text();
  const body = subscribeResponseSchema.parse(parseSuperJsonResponse(raw));

  return {
    queryName,
    args,
    rows: body.rows,
    rangeStart: body.rangeStart,
    rangeEnd: body.rangeEnd,
    token: body.snapshot,
    snapshot: parseSnapshotToken(body.snapshot),
  };
}

function parsePullEvents(value: unknown): Array<{
  op: string;
  pk: unknown;
  row?: PlainRecord;
  old_row?: PlainRecord;
  matchesNew?: boolean;
}> {
  return z.array(pullEventSchema).parse(value);
}

export async function pullClient(
  router: Hono,
  cursor: PullCursor,
): Promise<
  PullCursor & {
    events: Array<{
      op: string;
      pk: unknown;
      row?: PlainRecord;
      old_row?: PlainRecord;
      matchesNew?: boolean;
    }>;
    // Parsed snapshot number, for assertions and waitForEventsForFixture.
    snapshot: number;
    reset?: boolean;
    reason?: string;
  }
> {
  const response = await router.request('/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscriptions: [
        {
          key: 'k',
          queryName: cursor.queryName,
          args: cursor.args,
          rangeStart: cursor.rangeStart,
          rangeEnd: cursor.rangeEnd,
          snapshot: cursor.token,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`pull failed with status ${response.status}`);
  }

  const raw = await response.text();
  const envelope = parseSuperJsonResponse(raw);
  const resultMap = z.record(z.string(), pullResponseSchema).parse(envelope.results ?? {});
  const body = pullResponseSchema.parse(resultMap.k ?? { events: [] });

  const events =
    body.events === undefined && body.reset === true ? [] : parsePullEvents(body.events);
  // Both incremental and reset carry a token; fall back to the incoming one only if absent.
  const nextToken = body.snapshot ?? cursor.token;

  return {
    queryName: cursor.queryName,
    args: cursor.args,
    events,
    rangeStart: body.rangeStart,
    rangeEnd: body.rangeEnd,
    token: nextToken,
    snapshot: parseSnapshotToken(nextToken),
    reset: body.reset,
    reason: body.reason,
  };
}

export type PulseRow = Record<string, unknown> & { $pk: unknown };
