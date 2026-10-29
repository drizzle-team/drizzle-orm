// The DrizzlePostgresTransport namespace for Cloudflare Workers.
import * as Layer from 'effect/Layer';
import { cfTransport } from '../cf.ts';
import { DrizzlePostgresTransport } from './DrizzlePostgresTransport.ts';

export * from './DrizzlePostgresTransport.ts';

/** Dials and cancels through cloudflare:sockets. */
export const layer = Layer.succeed(DrizzlePostgresTransport, cfTransport);
