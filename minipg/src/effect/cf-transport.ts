// The MinipgTransport namespace for Cloudflare Workers.
import * as Layer from 'effect/Layer';
import { cfTransport } from '../cf.ts';
import { MinipgTransport } from './MinipgTransport.ts';

export * from './MinipgTransport.ts';

/** Dials and cancels through cloudflare:sockets. */
export const layer = Layer.succeed(MinipgTransport, cfTransport);
