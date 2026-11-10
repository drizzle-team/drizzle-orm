import {
  createPulseClient,
  createPulseEvents,
  type EmbeddedPulseClient,
  type EmbeddedPulseEvents,
} from '../client/embedded/index.js';
import { type AnyPulseBuilders, createPulseRegistry } from '../server/pulse-registry.js';
import {
  type LogLevel,
  PulseRuntime,
  type PulseRuntimeWalConfig,
  type TelemetryEvent,
} from '../server/pulse-runtime.js';
import type { PulseSourceDb } from '../server/pulse-sql.js';

export interface EmbeddedRuntimeConfig<TQueries extends AnyPulseBuilders> {
  /** The `pulse(table)` query builders to serve, keyed by query name. */
  queries: TQueries;
  /** Must have `wal_level=logical`. The admin pool and the replication stream connect here. */
  databaseUrl: string;
  /**
   * The app's own drizzle connection; collection baseline reads run on it to keep its session
   * context (RLS, search_path) — except post-reconnect rebaselines, which read the recreated
   * slot's exported snapshot on the admin connection. Row scoping there relies on the
   * resolve-time auth-scoped WHERE, not on sourceDb-session RLS.
   */
  sourceDb: PulseSourceDb;
  wal?: PulseRuntimeWalConfig;
  logLevel?: LogLevel;
  /** Fired once per (table, op) group of each transaction the runtime applies */
  telemetry?: (event: TelemetryEvent) => void;
}

export interface EmbeddedRuntime<TQueries extends AnyPulseBuilders> {
  client: EmbeddedPulseClient<TQueries>;
  events: EmbeddedPulseEvents<TQueries>;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Provisions replication prerequisites without opening WAL — for elevated-role deploy steps. */
  provision(): Promise<void>;
  /** Fires once replication gives up permanently (reconnect attempts exhausted). */
  onFatalError(listener: (error: Error) => void): () => void;
}

/**
 * Embedded-only pulse: collections and event subscriptions served in-process over the WAL tap,
 * with no HTTP pull protocol and no events-table storage. The registry and the `pull: false`
 * runtime are wired internally.
 */
export function createRuntime<TQueries extends AnyPulseBuilders>(
  config: EmbeddedRuntimeConfig<TQueries>,
): EmbeddedRuntime<TQueries> {
  const runtime = new PulseRuntime(createPulseRegistry(config.queries), {
    databaseUrl: config.databaseUrl,
    sourceDb: config.sourceDb,
    pull: false,
    wal: config.wal,
    logLevel: config.logLevel,
    telemetry: config.telemetry,
  });

  return {
    client: createPulseClient(runtime),
    events: createPulseEvents(runtime),
    start: () => runtime.start(),
    stop: () => runtime.stop(),
    provision: () => runtime.provision(),
    onFatalError: (listener) => runtime.onTerminalError(listener),
  };
}

export {
  type EmbeddedPulseClient,
  type EmbeddedPulseEvents,
  PulseCollection,
  type PulseCollectionChange,
  type PulseCollectionOptions,
  type PulseEventsCallback,
  type PulseEventsOptions,
  type PulseRow,
} from '../client/embedded/index.js';
export type { PulseBuilder } from '../server/pulse-builder.js';
export type { AnyPulseBuilders } from '../server/pulse-registry.js';
export {
  LogLevel,
  type PulseRuntimeWalConfig,
  type TelemetryEvent,
} from '../server/pulse-runtime.js';
export type { PulseSourceDb } from '../server/pulse-sql.js';
export type {
  PulseDeleteEvent,
  PulseEvent,
  PulseInsertEvent,
  PulseUpdateEvent,
} from '../shared/pulse-events.js';
export type { PulseAuthContext } from '../types.js';
