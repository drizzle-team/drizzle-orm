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
	 * slot's exported snapshot on the admin connection. Row scoping there relies on the query's
	 * WHERE, not on sourceDb-session RLS.
	 */
	sourceDb: PulseSourceDb;
	wal?: PulseRuntimeWalConfig;
	logLevel?: LogLevel;
	/**
	 * Fired once per (table, op) group of each transaction the runtime applies, and once per
	 * collection on rebaseline.
	 */
	telemetry?: (event: TelemetryEvent) => void;
}

export interface EmbeddedRuntime<TQueries extends AnyPulseBuilders> {
	/** Opens a live collection for a query. */
	client: EmbeddedPulseClient<TQueries>;
	/** Opens a CDC event stream for a query. */
	events: EmbeddedPulseEvents<TQueries>;
	/**
	 * Sets REPLICA IDENTITY FULL on the source tables, adds them to the publication and opens
	 * the replication stream. It never removes tables from the publication.
	 */
	start(): Promise<void>;
	stop(): Promise<void>;
	/**
	 * Provisions the replication objects without opening the stream, for a deploy step that
	 * runs with an elevated role. It also drops the tables that are no longer registered from
	 * the publication and resets their replica identity to DEFAULT.
	 */
	provision(): Promise<void>;
	/** Fires once replication gives up permanently (reconnect attempts exhausted). */
	onFatalError(listener: (error: Error) => void): () => void;
}

/**
 * Embedded-only pulse: live collections and CDC event streams served in-process over the WAL
 * tap, with no HTTP pull protocol and no events-table storage.
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

// Provisioning never reads the source database. This placeholder makes a future read fail loudly.
const unusedSourceDb = new Proxy({}, {
	get() {
		throw new Error('provision() does not read the source database');
	},
}) as PulseSourceDb;

/**
 * Does the same as `runtime.provision()`, but needs no runtime and no `sourceDb`. Use it in a
 * deploy step with the same `queries` and `wal` as the runtime.
 */
export async function provision<TQueries extends AnyPulseBuilders>(config: {
	queries: TQueries;
	databaseUrl: string;
	wal?: PulseRuntimeWalConfig;
}): Promise<void> {
	const runtime = new PulseRuntime(createPulseRegistry(config.queries), {
		databaseUrl: config.databaseUrl,
		sourceDb: unusedSourceDb,
		pull: false,
		wal: config.wal,
	});
	await runtime.provision();
}

export {
	type EmbeddedPulseClient,
	type EmbeddedPulseEvents,
	PulseCollection,
	type PulseCollectionChange,
	type PulseEventsCallback,
	type PulseEventsOptions,
	type PulseRow,
} from '../client/embedded/index.js';
export type {
	PulseDeleteEvent,
	PulseEvent,
	PulseInsertEvent,
	PulseUpdateEvent,
} from '../client/embedded/pulse-events.js';
export type { PulseBuilder } from '../server/pulse-builder.js';
export type { AnyPulseBuilders } from '../server/pulse-registry.js';
export { LogLevel, type PulseRuntimeWalConfig, type TelemetryEvent } from '../server/pulse-runtime.js';
export type { PulseSourceDb } from '../server/pulse-sql.js';
