export type SubscribeRequest = {
  queryName: string;
  args: unknown;
};

export type SubscribeResponse<T> = {
  rows: T[];
  rangeStart: unknown | null;
  rangeEnd: unknown | null;
  // Opaque epoch:snapshot cursor token — echo it back verbatim on the next pull.
  snapshot: string;
  order: 'asc' | 'desc';
  limit: number | null;
  hasMore: boolean;
};

// Self-describing pull entry: the server holds no per-subscription state, so every pull
// carries the query identity + the client's current window. `key` is the client-chosen
// queryKey the response is keyed by; order/limit are NOT sent (server re-derives them from
// resolve()); rangeStart/rangeEnd only narrow the window; snapshot is the cursor token.
export type PullSubscriptionRequest = {
  key: string;
  queryName: string;
  args: unknown;
  rangeStart?: unknown | null;
  rangeEnd?: unknown | null;
  hasMore?: boolean;
  snapshot?: string;
};
export type PullRequest = {
  subscriptions?: PullSubscriptionRequest[];
};

// `cursor` is a PK pagination cursor — deliberately distinct from pull's epoch:snapshot token.
export type LoadMoreRequest = {
  queryName: string;
  args: unknown;
  rangeStart?: unknown | null;
  rangeEnd?: unknown | null;
  cursor?: unknown;
};

export type LoadMoreResponse<T> = {
  rows: T[];
  rangeStart: unknown | null;
  rangeEnd: unknown | null;
  hasMore: boolean;
};

export type PullIncrementalResponse<TEvent> = {
  reset?: false;
  events: TEvent[];
  rangeStart: unknown | null;
  rangeEnd: unknown | null;
  snapshot: string;
};

export type PullResetResponse<TRow, TEvent> = {
  reset: true;
  reason: string;
  events: TEvent[];
  rows: TRow[];
  rangeStart: unknown | null;
  rangeEnd: unknown | null;
  snapshot: string;
  order: 'asc' | 'desc';
  limit: number | null;
  hasMore: boolean;
};

export type PullResponse<TRow, TEvent> =
  | PullIncrementalResponse<TEvent>
  | PullResetResponse<TRow, TEvent>;

export type PullResponseError = {
  error: string;
};

export type PullResponseErrorResult = PullResponseError & {
  reset?: true;
  reason?: string;
};
