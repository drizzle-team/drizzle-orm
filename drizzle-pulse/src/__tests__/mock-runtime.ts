import { getColumns } from 'drizzle-orm';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { createPulseRegistry } from '../server/pulse-registry.js';
import {
  type LogLevel,
  type PendingWalEvent,
  PulseRuntime,
  type TapListener,
} from '../server/pulse-runtime.js';
import type { PulseSourceDb } from '../server/pulse-sql.js';
import type { PulseRegistryQuery, ResolvedPulseQuery } from '../types.js';

// Shared inline fixtures (no DB required) — used by embedded-collection.test.ts and
// resilience.test.ts, which mock the same PulseSourceDb/registry/resolved-query shapes
// but build different runtime wrappers around them.

export const ordersTable = pgTable('orders', {
  id: serial('id').primaryKey(),
  status: text('status').notNull(),
  price: integer('price'),
});

export const ordersColumns = getColumns(ordersTable);

export function makeMockSourceDb(rows: Record<string, unknown>[] = []): PulseSourceDb {
  const dynamicQuery: any = Object.assign(Promise.resolve(rows), {
    $dynamic() {
      return dynamicQuery;
    },
    orderBy() {
      return dynamicQuery;
    },
    limit(n: number) {
      return Promise.resolve(rows.slice(0, n));
    },
  });
  return {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                $dynamic() {
                  return dynamicQuery;
                },
              };
            },
          };
        },
      };
    },
  } as unknown as PulseSourceDb;
}

export function makeResolvedQuery(overrides: Partial<ResolvedPulseQuery> = {}): ResolvedPulseQuery {
  return {
    table: ordersTable,
    pkColumn: ordersColumns.id,
    columns: ordersColumns,
    selectedColumns: ordersColumns,
    allowedColumnNames: new Set(Object.keys(ordersColumns)),
    order: 'asc',
    limit: null,
    argsSchema: null,
    where: null,
    hasTransform: false,
    transformRows: async (rows) => rows,
    ...overrides,
  };
}

export function makeRegistryStub(overrides: Partial<PulseRegistryQuery> = {}): PulseRegistryQuery {
  return {
    table: ordersTable,
    pkColumn: ordersColumns.id,
    columns: ordersColumns,
    selectedColumns: ordersColumns,
    allowedColumnNames: new Set(Object.keys(ordersColumns)),
    order: 'asc',
    limit: null,
    argsSchema: null,
    queryFn: null,
    hasTransform: false,
    transformRows: async (rows) => rows,
    ...overrides,
  };
}

export interface MockRuntimeOptions {
  isRunning?: boolean;
  hasTransform?: boolean;
  limit?: number | null;
  baselineRows?: Record<string, unknown>[];
  watermark?: string;
  where?: ResolvedPulseQuery['where'];
}

// Shared mock runtime for createPulseClient/createPulseEvents tests — deliberately has no
// `handlers` property: the tap-direct embedded path must not need the SDK/wire-protocol
// surface. Tests override individual methods (registry, onStop, etc.) post-
// construction the same way they reassign subscribeTap.
export function makeMockRuntime(opts: MockRuntimeOptions = {}) {
  const registryStub = makeRegistryStub({
    hasTransform: opts.hasTransform ?? false,
    limit: opts.limit ?? null,
  });
  const resolved = makeResolvedQuery({ limit: opts.limit ?? null, where: opts.where ?? null });

  // Stand-in for PulseRuntime's in-process tap registry. `emitTap` mirrors the runtime's
  // per-event fan-out so tests drive events the same way the WAL loop would, building the
  // PendingWalEvent the embedded modules consume.
  const tapListeners = new Map<string, Set<TapListener>>();
  const subscribeTap = (key: string, listener: TapListener): (() => void) => {
    let set = tapListeners.get(key);
    if (!set) {
      set = new Set();
      tapListeners.set(key, set);
    }
    const listeners = set;
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const emitTap = (
    tableQualifiedName: string,
    op: PendingWalEvent['op'],
    row: Record<string, unknown>,
    oldRow: Record<string, unknown> | null,
    lsn: string,
  ): void => {
    const [schema, table] = tableQualifiedName.split('.') as [string, string];
    // Cast: op/oldRow arrive as independent parameters so a test can emit any combination,
    // including the ones PendingWalEvent's op-discriminated shape forbids.
    const event = {
      eventsTable: ordersTable,
      pkKey: 'id',
      pkValue: (row as { id?: unknown }).id ?? (oldRow as { id?: unknown } | null)?.id,
      op,
      row,
      oldRow,
      tableQualifiedName,
      schema,
      table,
    } as PendingWalEvent;
    for (const listener of tapListeners.get(tableQualifiedName) ?? []) listener(event, lsn);
  };

  return {
    isRunning: opts.isRunning ?? true,
    subscribeTap,
    emitTap,
    readCollectionBaseline: async () => ({
      rows: opts.baselineRows ?? [],
      watermark: opts.watermark ?? '0/100',
    }),
    registry: {
      getPulseQuery: (): PulseRegistryQuery | undefined => registryStub,
      resolve: () => resolved,
    },
    onReconnect: (_listener: () => void) => () => {},
    onStop: (_listener: () => void) => () => {},
    onTerminalError: (_listener: (error: Error) => void) => () => {},
  };
}

// PulseRuntime carries private state, so no structural mock can satisfy its class type.
// This is the one deliberate cast that hands the mock to the embedded factories — tests
// keep the mock's own (fully typed) shape everywhere else.
export function asRuntime(mock: ReturnType<typeof makeMockRuntime>): PulseRuntime<any> {
  return mock as unknown as PulseRuntime<any>;
}

// Construct a real PulseRuntime with an empty registry (no DB required).
export function makePulseRuntime(
  opts: {
    databaseUrl?: string;
    sourceDb?: PulseSourceDb;
    pull?: boolean | { eventsSchema?: string; eventLimit?: number };
    logLevel?: LogLevel;
  } = {},
): PulseRuntime<any> {
  return new PulseRuntime(createPulseRegistry({}), {
    databaseUrl: opts.databaseUrl ?? 'postgresql://user:pass@localhost/test',
    sourceDb: opts.sourceDb ?? ({} as PulseSourceDb),
    pull: opts.pull ?? true,
    wal: { publicationName: 'test_pub', slotName: 'test_slot' },
    logLevel: opts.logLevel,
  });
}
