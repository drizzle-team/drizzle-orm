import { comparePkValues, isPkComparable } from '../shared/pk-utils.js';
import type {
  LoadMoreResponse as ProtocolLoadMoreResponse,
  PullResponse as ProtocolPullResponse,
  SubscribeResponse as ProtocolSubscribeResponse,
  PullResponseErrorResult,
  PullSubscriptionRequest,
} from '../shared/protocol-types.js';
import type { PulseEvent } from '../shared/pulse-events.js';
import { RangedPulseMergeCore } from '../shared/ranged-merge-core.js';
import type { QueryDescriptor } from '../types.js';
import type { PullClient } from './create-client.js';
import type { PulseHttpTransport } from './transport.js';

export type {
  PulseDeleteEvent,
  PulseEvent,
  PulseInsertEvent,
  PulseUpdateEvent,
} from '../shared/pulse-events.js';

export interface PulseQueryState<TResult> {
  data: readonly TResult[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
}

export type CreatePulseQueryOptions<TResult extends Record<string, unknown> & { $pk: unknown }> = {
  onStateChange?: (state: PulseQueryState<TResult>) => void;
};

export class PulseQuery<TResult extends Record<string, unknown> & { $pk: unknown }> {
  private readonly onStateChange?: (state: PulseQueryState<TResult>) => void;
  private readonly transport: PulseHttpTransport;
  private readonly pullClient: PullClient;
  private readonly queryKey: string;

  private state: PulseQueryState<TResult> = {
    data: [],
    isLoading: true,
    isLoadingMore: false,
    hasMore: false,
    error: null,
  };

  private readonly core: RangedPulseMergeCore<TResult>;
  // Cursor token from the server; also the "subscribed" signal — empty until subscribe()
  // resolves. Echoed back verbatim on each pull.
  private snapshot = '';
  private destroyed = false;

  constructor(
    private readonly descriptor: QueryDescriptor<TResult>,
    options?: CreatePulseQueryOptions<TResult>,
  ) {
    this.onStateChange = options?.onStateChange;
    this.transport = descriptor.pullClient.transport;
    this.pullClient = descriptor.pullClient;
    this.queryKey = `${descriptor.queryName}:${JSON.stringify(descriptor.args)}:${Math.random().toString(36).slice(2, 10)}`;
    this.core = new RangedPulseMergeCore({
      order: 'asc',
      limit: null,
      rangeStart: null,
      rangeEnd: null,
    });
  }

  getState() {
    return this.state;
  }

  async subscribe() {
    try {
      const result = (await this.transport.subscribe({
        queryName: this.descriptor.queryName,
        args: this.descriptor.args,
      })) as ProtocolSubscribeResponse<TResult>;
      if (this.destroyed) {
        return;
      }

      this.core.order = result.order;
      this.core.limit = result.limit;
      this.core.rebuildFromRows(result.rows);
      this.core.rangeStart = isPkComparable(result.rangeStart) ? result.rangeStart : null;
      this.core.rangeEnd = isPkComparable(result.rangeEnd) ? result.rangeEnd : null;
      this.snapshot = result.snapshot;
      this.registerWithPullClient();

      this.setState({
        data: this.core.data,
        hasMore: result.hasMore,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      this.setState({
        error: normalizedError,
        isLoading: false,
      });
    }
  }

  async poll() {
    if (!this.snapshot) {
      return;
    }

    await this.pullClient.pollNow();
  }

  applyEvents(events: PulseEvent<TResult>[]) {
    const changed = this.core.applyEvents(events);
    if (changed) {
      this.setState({ data: this.core.data });
    }
  }

  async loadMore() {
    if (this.state.isLoadingMore || !this.snapshot) {
      return;
    }

    const visiblePks = this.state.data.map((row) => row.$pk).filter(isPkComparable);
    const cursor =
      this.core.order === 'desc'
        ? visiblePks.length > 0
          ? visiblePks.reduce((min, current) => (comparePkValues(current, min) < 0 ? current : min))
          : this.core.rangeStart
        : visiblePks.length > 0
          ? visiblePks.reduce((max, current) => (comparePkValues(current, max) > 0 ? current : max))
          : this.core.rangeEnd;

    if (cursor === null) {
      return;
    }

    this.setState({ isLoadingMore: true });

    try {
      const result = (await this.transport.loadMore({
        queryName: this.descriptor.queryName,
        args: this.descriptor.args,
        rangeStart: this.core.rangeStart,
        rangeEnd: this.core.rangeEnd,
        cursor,
      })) as ProtocolLoadMoreResponse<TResult>;
      if (this.destroyed) {
        return;
      }

      this.core.rangeStart = isPkComparable(result.rangeStart) ? result.rangeStart : null;
      this.core.rangeEnd = isPkComparable(result.rangeEnd) ? result.rangeEnd : null;
      this.setState({ hasMore: result.hasMore });

      const appended = this.core.appendRows(result.rows ?? []);
      if (appended) {
        this.setState({ data: this.core.data });
      }
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      this.setState({ error: normalizedError });
    } finally {
      this.setState({ isLoadingMore: false });
    }
  }

  destroy() {
    this.unregisterFromPullClient();
    this.destroyed = true;
  }

  private setState(next: Partial<PulseQueryState<TResult>>) {
    if (this.destroyed) {
      return;
    }

    this.state = { ...this.state, ...next };
    this.onStateChange?.(this.state);
  }

  private applyPullResult(
    result: ProtocolPullResponse<TResult, PulseEvent<TResult>> | PullResponseErrorResult,
  ) {
    // Error results (e.g. query_resolution_failed after an auth revoke) must not touch the
    // cursor — the next nudge/poll retries with the same token, so access restored later
    // resumes delivery instead of freezing the query.
    if ('error' in result) {
      this.setState({ error: new Error(result.error) });
      return;
    }
    if (result.reset === true) {
      this.core.order = result.order;
      this.core.limit = result.limit;
      this.core.rebuildFromRows(result.rows);
      this.snapshot = result.snapshot;
      this.core.rangeStart = isPkComparable(result.rangeStart) ? result.rangeStart : null;
      this.core.rangeEnd = isPkComparable(result.rangeEnd) ? result.rangeEnd : null;
      this.setState({
        data: this.core.data,
        hasMore: result.hasMore,
        isLoading: false,
        error: null,
      });
      return;
    }

    this.snapshot = result.snapshot;
    if (result.events.length > 0) {
      this.applyEvents(result.events);
    }
    this.core.rangeStart = isPkComparable(result.rangeStart) ? result.rangeStart : null;
    this.core.rangeEnd = isPkComparable(result.rangeEnd) ? result.rangeEnd : null;
    if (this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  // The self-describing pull entry (sans `key`): query identity + the client's current window.
  // order/limit are omitted — the server re-derives them from resolve().
  private buildPullEntry(): Omit<PullSubscriptionRequest, 'key'> | null {
    if (!this.snapshot) {
      return null;
    }
    return {
      queryName: this.descriptor.queryName,
      args: this.descriptor.args,
      rangeStart: this.core.rangeStart,
      rangeEnd: this.core.rangeEnd,
      hasMore: this.state.hasMore,
      snapshot: this.snapshot,
    };
  }

  private unregisterFromPullClient() {
    this.pullClient.unregister(this.queryKey);
  }

  private registerWithPullClient() {
    this.pullClient.register(this.queryKey, {
      getSubscriptionState: () => this.buildPullEntry(),
      applyPullResult: (result) => {
        this.applyPullResult(
          result as ProtocolPullResponse<TResult, PulseEvent<TResult>> | PullResponseErrorResult,
        );
      },
      onPullError: (error) => {
        this.setState({ error });
      },
    });
  }
}
