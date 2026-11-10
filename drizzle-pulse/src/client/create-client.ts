import type { PullSubscriptionRequest } from '../shared/protocol-types.js';
import { QueryDescriptor } from '../types.js';
import { createHttpTransport, type PulseHttpTransport } from './transport.js';

// The self-describing per-query pull state; `key` is injected by the PullClient from the
// registration key, so a handle only supplies the query identity + its current window.
type PullSubscription = Omit<PullSubscriptionRequest, 'key'>;

type PullSubscriberHandle = {
  getSubscriptionState: () => PullSubscription | null;
  applyPullResult: (result: unknown) => void;
  onPullError: (error: Error) => void;
};

// Batches the live queries registered against one client into a single /pull over an
// interval. The network hop itself lives in the transport; this only coordinates batching.
export class PullClient {
  private readonly handles = new Map<string, PullSubscriberHandle>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    readonly transport: PulseHttpTransport,
    private readonly pollIntervalMs = 1000,
  ) {}

  register(key: string, handle: PullSubscriberHandle) {
    this.handles.set(key, handle);
    this.ensureTimer();
  }

  unregister(key: string) {
    this.handles.delete(key);
    this.clearTimerIfIdle();
  }

  async pollNow() {
    if (this.inFlight) {
      return this.inFlight;
    }

    // Each entry is keyed by the client-side registration key; the batched /pull response is
    // keyed by that same key so results route back without any server subscription id.
    const subscriptions: PullSubscriptionRequest[] = [];
    for (const [key, handle] of this.handles) {
      const state = handle.getSubscriptionState();
      if (!state) {
        continue;
      }

      subscriptions.push({ key, ...state });
    }

    if (subscriptions.length === 0) {
      return;
    }

    this.inFlight = (async () => {
      try {
        const results = await this.transport.pull(subscriptions);
        for (const subscription of subscriptions) {
          const handle = this.handles.get(subscription.key);
          const pullResult = results[subscription.key];
          if (!handle || pullResult === undefined) {
            continue;
          }

          try {
            handle.applyPullResult(pullResult);
          } catch (error) {
            // Per-handle isolation: one query's apply failure must not error siblings.
            handle.onPullError(error instanceof Error ? error : new Error(String(error)));
          }
        }
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        for (const handle of this.handles.values()) {
          handle.onPullError(normalizedError);
        }
      } finally {
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }

  private ensureTimer() {
    if (this.timer !== null || this.handles.size === 0 || this.pollIntervalMs <= 0) {
      return;
    }

    this.timer = setInterval(() => {
      void this.pollNow();
    }, this.pollIntervalMs);
  }

  private clearTimerIfIdle() {
    if (this.timer !== null && this.handles.size === 0) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Creates a type-safe client proxy for calling pulse queries.
 * TClient is typically `PulseClientContract<...>` from the server's `typeof drizzlePulse.$client`.
 * At runtime, returns a Proxy that constructs QueryDescriptor objects.
 */
export function createPulseClient<TClient>(config: {
  url: string;
  fetchImpl?: typeof fetch;
  /** Background auto-poll interval in ms (default 1000). Set to 0 to disable auto-polling and drive `poll()` manually. */
  pollIntervalMs?: number;
}): TClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const transport = createHttpTransport(config.url, fetchImpl);
  const pullClient = new PullClient(transport, config.pollIntervalMs);

  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        return (args?: Record<string, unknown>) =>
          new QueryDescriptor(prop, args ?? {}, config.url, pullClient);
      },
    },
  ) as TClient;
}
