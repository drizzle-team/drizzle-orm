// The DrizzlePostgresTransport namespace for Node and Bun.
import * as Layer from 'effect/Layer';
import { nodeCancel, nodeTransport } from '../transport-node.ts';
import { DrizzlePostgresTransport } from './DrizzlePostgresTransport.ts';

export * from './DrizzlePostgresTransport.ts';

/** Dials with node:net and node:tls, and cancels with an out-of-band CancelRequest. */
export const layer = Layer.succeed(DrizzlePostgresTransport, { connect: nodeTransport, cancel: nodeCancel });
