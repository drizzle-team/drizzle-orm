import type { AnyPulseBuilders } from '../../server/pulse-registry.js';
import type { PulseRuntime } from '../../server/pulse-runtime.js';
import type { PulseClientContract } from '../../server/pulse-types.js';
import type { PulseEvent } from '../../shared/pulse-events.js';
import { getQualifiedTableName } from '../../shared/qualified-table-name.js';
import type { PulseAuthContext, QueryDescriptor } from '../../types.js';
import { buildTapEvent, type TapRow } from './tap-events.js';

// Must stay free of merge-core/collection value imports: there is no baseline and
// no state to reconcile here, only a WHERE-filtered tap. Value imports limited to ./tap-events.js
// and bare drizzle-orm; platform-imports.test.ts enforces purity across the embedded graph.

/**
 * Called with each tapped event in WAL commit order. Delivery is **at-least-once**: a
 * disconnect between the tap emit and the replication slot's per-message acknowledge replays
 * the same commit again after reconnect, and this surface has no baseline/dedup to absorb it
 * (unlike `PulseCollection`, which dedups the replay via its merge core's pk map). Consumers
 * with side effects keyed off `lsn` should treat `(pk, lsn)` — or `lsn` alone for single-event
 * transactions — as an idempotency key.
 */
export type PulseEventsCallback<TRow> = (event: PulseEvent<TRow>, lsn: string) => void;

export interface PulseEventsOptions {
  auth?: PulseAuthContext;
}

export type EmbeddedPulseEvents<TQueries extends AnyPulseBuilders> = {
  [K in keyof PulseClientContract<TQueries>]: PulseClientContract<TQueries>[K] extends (
    ...args: infer A
  ) => QueryDescriptor<infer R>
    ? A extends []
      ? (callback: PulseEventsCallback<Omit<R, '$pk'>>, options?: PulseEventsOptions) => () => void
      : (
          ...args: [
            ...A,
            callback: PulseEventsCallback<Omit<R, '$pk'>>,
            options?: PulseEventsOptions,
          ]
        ) => () => void
    : never;
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
      return (...callArgs: unknown[]): (() => void) => {
        const pulseQuery = runtime.registry.getPulseQuery(prop);
        if (!pulseQuery) throw new Error(`Unknown query: "${prop}"`);
        if (!runtime.isRunning)
          throw new Error('PulseEvents subscription can only be created after runtime.start()');
        if (pulseQuery.hasTransform)
          throw new Error('Queries with .transform() are not supported in the embedded client');
        if (pulseQuery.limit !== null)
          throw new Error('Queries with .limit() are not supported in the embedded client');

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
            `createPulseEvents: expected a callback function, got ${typeof callback}`,
          );
        }

        const auth: PulseAuthContext = options?.auth ?? { userId: null };
        // resolve() validates args and yields the auth-scoped WHERE. buildTapEvent always gates
        // inserts on it; updates/deletes are gated too when the old tuple is fully evaluable
        // (RID FULL, or pull:true), otherwise delivered with an empty row — the event's pk
        // carries the identity — so membership stays correct without leaking out-of-scope
        // column data (see tap-events.ts).
        const query = runtime.registry.resolve(prop, rawArgs, auth);
        const tableKey = getQualifiedTableName(query.table);

        // The WAL listener processes pgoutput messages sequentially and the emitter dispatches
        // synchronously off that, so subscription-time delivery is already commit order — no
        // reordering buffer needed (unlike the collections' baseline/watermark handshake).
        const tapUnsub = runtime.subscribeTap(tableKey, (walEvent, lsn) => {
          const event = buildTapEvent(walEvent, query);
          if (!event) return;
          callback(event, lsn);
        });

        let detached = false;
        const detach = (): void => {
          if (detached) return;
          detached = true;
          tapUnsub();
          stopUnsub();
        };
        const stopUnsub = runtime.onStop(() => detach());

        return detach;
      };
    },
  });
}
