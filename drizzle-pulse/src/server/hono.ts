import { Hono } from 'hono';
import type { LoadMoreRequest, PullRequest, SubscribeRequest } from '../shared/protocol-types.js';
import type { PulseAuthContext } from '../types.js';
import type { PulseRequestHandler } from './sdk.js';
import { serializeResponse } from './superjson-utils.js';

// The three transport entry points the router drives. Structural so callers can pass a
// full PulseRequestHandler or any equivalent SDK surface.
export type PulseHonoHandlers = Pick<PulseRequestHandler, 'subscribe' | 'pull' | 'loadMore'>;

// Thin Hono wrapper over the SDK: plain-JSON request in, superjson-encoded {status, body}
// out. The stateless protocol has exactly these three paths.
export function createPulseHonoRouter(
  handlers: PulseHonoHandlers,
  auth: PulseAuthContext = { userId: null },
): Hono {
  const router = new Hono();

  const toResponse = (body: unknown, status: number) =>
    new Response(serializeResponse(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  router.post('/subscribe', async (c) => {
    const request = (await c.req.json()) as SubscribeRequest;
    const result = await handlers.subscribe(request, auth);
    return toResponse(result.body, result.status);
  });

  router.post('/pull', async (c) => {
    const request = (await c.req.json()) as PullRequest;
    const result = await handlers.pull(request, auth);
    return toResponse(result.body, result.status);
  });

  router.post('/load-more', async (c) => {
    const request = (await c.req.json()) as LoadMoreRequest;
    const result = await handlers.loadMore(request, auth);
    return toResponse(result.body, result.status);
  });

  return router;
}
