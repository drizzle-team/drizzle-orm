import type {
  LoadMoreRequest,
  LoadMoreResponse,
  PullResponse,
  PullResponseErrorResult,
  PullSubscriptionRequest,
  SubscribeRequest,
  SubscribeResponse,
} from '../shared/protocol-types.js';
import type { PulseEvent } from '../shared/pulse-events.js';
import { deserializeResponse } from './superjson.js';

type TransportRow = Record<string, unknown> & { $pk: unknown };
export type PullResultMap = Record<
  string,
  PullResponse<TransportRow, PulseEvent<TransportRow>> | PullResponseErrorResult
>;

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

async function postJson(fetchImpl: Fetch, url: string, body: unknown): Promise<string> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Request to ${url} failed: ${response.status}`);
  }
  return response.text();
}

/** HTTP transport: the fetch+superjson call sites the React/HTTP client drives. */
export function createHttpTransport(url: string, fetchImpl: Fetch) {
  return {
    async subscribe(request: SubscribeRequest): Promise<SubscribeResponse<TransportRow>> {
      return deserializeResponse(await postJson(fetchImpl, `${url}/subscribe`, request));
    },
    async pull(entries: PullSubscriptionRequest[]): Promise<PullResultMap> {
      const { results } = deserializeResponse<{ results: PullResultMap }>(
        await postJson(fetchImpl, `${url}/pull`, { subscriptions: entries }),
      );
      return results;
    },
    async loadMore(request: LoadMoreRequest): Promise<LoadMoreResponse<TransportRow>> {
      return deserializeResponse(await postJson(fetchImpl, `${url}/load-more`, request));
    },
  };
}

export type PulseHttpTransport = ReturnType<typeof createHttpTransport>;
