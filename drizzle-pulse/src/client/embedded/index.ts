import type { AnyPulseBuilders } from '../../server/pulse-registry.js';
import type {
  BaselineSnapshot,
  PendingWalEvent,
  PulseRuntime,
} from '../../server/pulse-runtime.js';
import type { PulseClientContract } from '../../server/pulse-types.js';
import { compareLsn } from '../../shared/lsn.js';
import { projectEmbeddedRows } from '../../shared/projection.js';
import type { PulseEvent } from '../../shared/pulse-events.js';
import { PulseMergeCore } from '../../shared/pulse-merge-core.js';
import { getQualifiedTableName } from '../../shared/qualified-table-name.js';
import type { PulseAuthContext, QueryDescriptor } from '../../types.js';
import { buildTapEvent, type TapRow } from './tap-events.js';

export type { EmbeddedPulseEvents, PulseEventsCallback, PulseEventsOptions } from './events.js';
export { createPulseEvents } from './events.js';

// ---------------------------------------------------------------------------
// Public type surface
// ---------------------------------------------------------------------------

export interface PulseCollectionOptions {
  auth?: PulseAuthContext;
}

export interface PulseCollectionChange<T> {
  events: readonly PulseEvent<T>[];
  state: readonly T[];
  lsn: string;
}

export type PulseRow<C> =
  C extends Promise<infer P> ? PulseRow<P> : C extends PulseCollection<infer R> ? R : never;

export type EmbeddedPulseClient<TQueries extends AnyPulseBuilders> = {
  [K in keyof PulseClientContract<TQueries>]: PulseClientContract<TQueries>[K] extends (
    ...args: infer A
  ) => QueryDescriptor<infer R>
    ? // R is the wire contract shape and includes $pk (QueryDescriptor is created with
      // WithPk<TResult>). Embedded rows carry no $pk — identity lives in the merge core's
      // entries and in each event's pk field — so the wire-only key is stripped here.
      (
        ...args: [...A, options?: PulseCollectionOptions]
      ) => Promise<PulseCollection<Omit<R, '$pk'>>>
    : never;
};

type AnyRow = TapRow;

// ---------------------------------------------------------------------------
// PulseCollection — a full-set merge core fed tap-direct (no HTTP wire protocol).
// ---------------------------------------------------------------------------

export class PulseCollection<TRow> {
  private disposed = false;
  private readonly onChangeListeners = new Set<(change: PulseCollectionChange<TRow>) => void>();
  private readonly onErrorListeners = new Set<(error: Error) => void>();

  /** @internal */
  constructor(
    private readonly core: PulseMergeCore<TRow & Record<string, unknown>>,
    private readonly teardown: () => void = () => {},
  ) {}

  /** @internal */
  get isDisposed(): boolean {
    return this.disposed;
  }

  list(): readonly TRow[] {
    return this.core.data as readonly TRow[];
  }

  onChange(listener: (change: PulseCollectionChange<TRow>) => void): () => void {
    this.onChangeListeners.add(listener);
    return () => this.onChangeListeners.delete(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.onErrorListeners.add(listener);
    return () => this.onErrorListeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teardown();
  }

  /** @internal fed by the tap-direct handshake whenever applying events mutates state. */
  fireOnChange(events: readonly PulseEvent<TRow>[], lsn: string): void {
    // An in-flight rebaseline can resolve after dispose(); its per-payload drain must not
    // escape into a disposed collection's listeners.
    if (this.disposed) return;
    const change: PulseCollectionChange<TRow> = {
      events,
      state: this.core.data as readonly TRow[],
      lsn,
    };
    for (const listener of this.onChangeListeners) {
      try {
        listener(change);
      } catch (e) {
        console.error('[PulseCollection] onChange error:', e);
      }
    }
  }

  /** @internal fed on rebaseline failure (post-reconnect) and on runtime terminal error. */
  fireOnError(error: Error): void {
    if (this.disposed) return;
    for (const listener of this.onErrorListeners) {
      try {
        listener(error);
      } catch (e) {
        console.error('[PulseCollection] onError error:', e);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// createPulseClient factory
// ---------------------------------------------------------------------------

export function createPulseClient<TQueries extends AnyPulseBuilders>(
  runtime: PulseRuntime<TQueries>,
): EmbeddedPulseClient<TQueries> {
  return new Proxy({} as EmbeddedPulseClient<TQueries>, {
    get(_target, prop: string | symbol) {
      if (typeof prop !== 'string') return undefined;
      // Returning a function for `then` makes the proxy an accidental thenable:
      // `await client` / `Promise.resolve(client)` would invoke `then(resolve, reject)`,
      // which resolves to the "Unknown query" rejection of an ignored promise instead of
      // settling the awaiting promise — a silent hang rather than a throw.
      if (prop === 'then') return undefined;
      // async so every failure — unknown query, stopped runtime, args validation inside
      // resolve() — surfaces as a rejection of the returned promise, never a sync throw.
      return async (...callArgs: unknown[]) => {
        const pulseQuery = runtime.registry.getPulseQuery(prop);
        if (!pulseQuery) throw new Error(`Unknown query: "${prop}"`);
        if (!runtime.isRunning)
          throw new Error('PulseCollection can only be created after runtime.start()');
        if (pulseQuery.hasTransform)
          throw new Error('Queries with .transform() are not supported in the embedded client');
        if (pulseQuery.limit !== null)
          throw new Error('Queries with .limit() are not supported in the embedded client');

        // Split the optional trailing PulseCollectionOptions from query args.
        // Args queries: (queryArgs, options?) — options is callArgs[1].
        // No-args queries: (options?) — options is callArgs[0].
        let rawArgs: unknown;
        let options: PulseCollectionOptions | undefined;

        if (pulseQuery.argsSchema !== null) {
          rawArgs = callArgs[0];
          options = callArgs[1] as PulseCollectionOptions | undefined;
        } else {
          rawArgs = {};
          options = callArgs[0] as PulseCollectionOptions | undefined;
        }

        const auth: PulseAuthContext = options?.auth ?? { userId: null };
        // resolve() validates args and yields the source table + auth-scoped WHERE — the
        // same gate must scope both the baseline read and every tapped event below.
        const query = runtime.registry.resolve(prop, rawArgs, auth);
        const tableKey = getQualifiedTableName(query.table);

        const core = new PulseMergeCore<AnyRow>({ order: query.order });

        // Tap-direct handshake state: while `baselining` is up, tapped events are buffered
        // instead of applied so nothing committed during the baseline SELECT is lost or
        // double-applied — the buffer is drained afterward against the read watermark.
        let baselining = true;
        let buffer: Array<{ event: PendingWalEvent; lsn: string }> = [];
        let collection!: PulseCollection<AnyRow>;
        // Last baseline's position: everything at-or-below it is already in the collection, so an
        // event carrying an older lsn is a replay, not news. Load-bearing when a reconnect resumes
        // an intact slot — the server restarts the stream at the slot's confirmed_flush, which is
        // behind this position, and re-delivers every commit made while the socket was down.
        let watermarkFloor: string | null = null;

        function applyEvent(walEvent: PendingWalEvent, lsn: string): void {
          const event = buildTapEvent(walEvent, query);
          if (!event) return;
          const mutated = core.applyEvents([event]);
          if (mutated) collection.fireOnChange([event], lsn);
        }

        function handleTapEvent(walEvent: PendingWalEvent, lsn: string): void {
          if (baselining) {
            buffer.push({ event: walEvent, lsn });
            return;
          }
          if (watermarkFloor !== null && compareLsn(lsn, watermarkFloor) < 0) return;
          applyEvent(walEvent, lsn);
        }

        // Same handshake for the initial load AND every rebaseline (reconnect): subscribe
        // first (buffering), read the baseline + watermark, rebuild state, then drain the
        // buffer. A payload at-or-above the watermark is applied; below-watermark payloads
        // are guaranteed already present in the baseline. At-or-above (not strictly greater)
        // is required because a commit written exactly at the watermark position was
        // necessarily written at-or-after the watermark read — strict greater-than would risk
        // dropping a commit landing exactly there. Any baseline/tap overlap this admits is
        // absorbed by the merge core's pk dedup, making the handshake exactly-once.
        //
        // A reconnect rebaseline runs while the stream is closed, so its buffer is empty and the
        // watermark filter is inert — the snapshot IS the stream's start position. The buffering
        // machinery below therefore only does real work on the initial mid-run load.
        //
        // `baselining`/`buffer` are shared closure state, so overlapping invocations (a
        // reconnect racing the initial load, or reconnect flapping) must not both act on them:
        // the generation token lets a superseded handshake detect it lost the race and
        // abandon its (possibly stale) results instead of rebuilding over/under a newer
        // handshake's state. Returns `null` when superseded — the caller must not treat that
        // as "no watermark", only as "a newer handshake owns the collection now".
        let handshakeGen = 0;
        async function runHandshake(
          snapshot?: BaselineSnapshot | null,
          recovered?: boolean,
        ): Promise<string | null> {
          const gen = ++handshakeGen;
          baselining = true;
          buffer = [];
          let baseline: { rows: Record<string, unknown>[]; watermark: string };
          try {
            baseline = await runtime.readCollectionBaseline(query, snapshot, recovered);
          } catch (err) {
            // A rejected rebaseline must not leave the collection permanently latched into
            // buffering: only reset when this handshake still owns the state (a newer
            // handshake that has since started owns the reset itself).
            if (gen === handshakeGen) {
              baselining = false;
              buffer = [];
            }
            throw err;
          }
          if (gen !== handshakeGen) return null;
          core.rebuild(projectEmbeddedRows(baseline.rows, query));
          const pending = buffer;
          buffer = [];
          baselining = false;
          watermarkFloor = baseline.watermark;
          for (const { event, lsn } of pending) {
            if (compareLsn(lsn, baseline.watermark) < 0) continue;
            applyEvent(event, lsn);
          }
          return baseline.watermark;
        }

        const unsubs: Array<() => void> = [];
        collection = new PulseCollection(core, () => {
          for (const unsub of unsubs) unsub();
        });

        unsubs.push(runtime.subscribeTap(tableKey, handleTapEvent));
        unsubs.push(
          runtime.onReconnect((snapshot) => {
            // Returning this promise (rather than firing it and forgetting) lets the
            // replication loop's reconnect round actually await every listener's handshake.
            return (async () => {
              try {
                const watermark = await runHandshake(snapshot, true);
                if (watermark === null) return; // superseded by a newer reconnect handshake
                if (collection.isDisposed) return;
                collection.fireOnChange([], watermark);
              } catch (err) {
                if (collection.isDisposed) return;
                collection.fireOnError(err instanceof Error ? err : new Error(String(err)));
              }
            })();
          }),
        );
        unsubs.push(runtime.onTerminalError((error) => collection.fireOnError(error)));
        unsubs.push(runtime.onStop(() => collection.dispose()));

        // Initial load via the watermark handshake; init failures reject the factory promise
        // (not onError — there is no collection to report to yet).
        let initError: unknown;
        try {
          await runHandshake();
        } catch (err) {
          initError = err;
        }
        if (collection.isDisposed) {
          throw new Error('PulseCollection was disposed before the initial sync completed');
        }
        if (initError !== undefined) {
          collection.dispose();
          throw initError instanceof Error ? initError : new Error(String(initError));
        }
        return collection;
      };
    },
  });
}
