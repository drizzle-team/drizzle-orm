import type { Simplify } from 'drizzle-orm';
import type { AnyPulseBuilder, AnyPulseBuilders } from '../../server/pulse-registry.js';
import type { PulseRuntime } from '../../server/pulse-runtime.js';
import { buildWhereClausePredicate } from '../../shared/drizzle-utils.js';
import { getQualifiedTableName } from '../../shared/qualified-table-name.js';
import type { PulseEvent } from './pulse-events.js';
import { buildTapEvent, type TapRow } from './tap-events.js';

// Must stay free of merge-core/collection value imports: there is no baseline and
// no state to reconcile here, only a WHERE-filtered tap. Value imports limited to ./tap-events.js,
// src/shared and bare drizzle-orm. platform-imports.test.ts enforces purity across the embedded graph.

/** The names of the queries that a live collection or a CDC event stream can open. */
export type EmbeddedQueryName<TQueries extends AnyPulseBuilders> = {
	[K in keyof TQueries]: TQueries[K]['_']['flags']['transformed'] extends true ? never
		: TQueries[K]['_']['flags']['limited'] extends true ? never
		: K;
}[keyof TQueries];

export type EmbeddedRow<TQuery extends AnyPulseBuilder> = Simplify<TQuery['_']['result']>;

/**
 * Called with each event in WAL commit order.
 *
 * A disconnect between the delivery and the slot acknowledge can deliver the same commit
 * again after the reconnect, so use `(pk, lsn)` as an idempotency key for side effects.
 *
 * In embedded mode each reconnect takes a new temporary replication slot. Changes committed
 * while the connection was down are not delivered, and `onResync` fires instead.
 */
export type PulseEventsCallback<TRow> = (event: PulseEvent<TRow>, lsn: string) => void;

export interface PulseEventsOptions {
	/**
	 * Fires after a reconnect when the changes committed during the outage were not delivered.
	 * Reload any state that you build from the events.
	 */
	onResync?: () => void;
	/** Fires when replication fails permanently. The CDC event stream is closed after this call. */
	onError?: (error: Error) => void;
}

export type EmbeddedPulseEvents<TQueries extends AnyPulseBuilders> = {
	[K in EmbeddedQueryName<TQueries>]: [keyof TQueries[K]['_']['argsInput']] extends [never] ? (
			callback: PulseEventsCallback<EmbeddedRow<TQueries[K]>>,
			options?: PulseEventsOptions,
		) => () => void
		: (
			args: TQueries[K]['_']['argsInput'],
			callback: PulseEventsCallback<EmbeddedRow<TQueries[K]>>,
			options?: PulseEventsOptions,
		) => () => void;
};

// ---------------------------------------------------------------------------
// createPulseEvents factory — stateless, per-event WAL subscription.
// ---------------------------------------------------------------------------

export function createPulseEvents<TQueries extends AnyPulseBuilders>(
	runtime: PulseRuntime<TQueries>,
): EmbeddedPulseEvents<TQueries> {
	return new Proxy({} as EmbeddedPulseEvents<TQueries>, {
		get(_target, prop: string | symbol) {
			if (typeof prop !== 'string') return undefined;
			if (prop === 'then') return undefined;
			// Synchronous: materialization failures (unknown query, stopped runtime, .transform()/
			// .limit() rejections, args validation inside resolve()) throw immediately — there is
			// no baseline to await, so nothing here is asynchronous.
			return (...callArgs: unknown[]): () => void => {
				const pulseQuery = runtime.registry.getPulseQuery(prop);
				if (!pulseQuery) throw new Error(`Unknown query: "${prop}"`);
				if (!runtime.isRunning) {
					throw new Error('A CDC event stream can only be opened after runtime.start()');
				}
				if (pulseQuery.hasTransform) {
					throw new Error('Live collections and CDC event streams do not support queries with .transform()');
				}
				if (pulseQuery.limit !== null) {
					throw new Error('Live collections and CDC event streams do not support queries with .limit()');
				}

				// Split (rawArgs?, callback, options?) the same way collections split (rawArgs?, options?).
				let rawArgs: unknown;
				let callback: PulseEventsCallback<TapRow>;
				let options: PulseEventsOptions | undefined;

				if (pulseQuery.argsSchema !== null) {
					rawArgs = callArgs[0];
					callback = callArgs[1] as PulseEventsCallback<TapRow>;
					options = callArgs[2] as PulseEventsOptions | undefined;
				} else {
					rawArgs = {};
					callback = callArgs[0] as PulseEventsCallback<TapRow>;
					options = callArgs[1] as PulseEventsOptions | undefined;
				}

				if (typeof callback !== 'function') {
					throw new Error(
						`The CDC event stream for query "${prop}" needs a callback function, but got ${typeof callback}`,
					);
				}

				// resolve() validates the args and yields the WHERE that buildTapEvent evaluates on
				// both sides of every change.
				const query = runtime.registry.resolve(prop, rawArgs, { userId: null });
				// The stream never builds SQL, so this call only rejects a WHERE on a column outside
				// `.columns()`, with the error that a live collection gives when it opens.
				buildWhereClausePredicate(query.where, query.columns, query.allowedColumnNames);
				const tableKey = getQualifiedTableName(query.table);

				// The WAL listener processes pgoutput messages sequentially and the emitter dispatches
				// synchronously off that, so subscription-time delivery is already commit order — no
				// reordering buffer needed (unlike the collections' baseline/watermark handshake).
				const tapUnsub = runtime.subscribeTap(tableKey, (walEvent, lsn) => {
					const event = buildTapEvent(walEvent, query);
					if (!event) return;
					callback(event, lsn);
				});

				const unsubs = [tapUnsub];
				const onResync = options?.onResync;
				if (onResync) {
					unsubs.push(runtime.onReconnect((snapshot) => {
						// A null snapshot means the slot resumed and replays the outage, so nothing is lost.
						if (snapshot !== null) onResync();
					}));
				}
				const onError = options?.onError;
				if (onError) unsubs.push(runtime.onTerminalError((error) => onError(error)));

				let detached = false;
				const detach = (): void => {
					if (detached) return;
					detached = true;
					for (const unsub of unsubs) unsub();
				};
				unsubs.push(runtime.onStop(() => detach()));

				return detach;
			};
		},
	});
}
