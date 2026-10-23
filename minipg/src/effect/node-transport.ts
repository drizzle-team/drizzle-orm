// The MinipgTransport namespace for Node and Bun.
import * as Layer from 'effect/Layer';
import { nodeCancel, nodeTransport } from '../transport-node.ts';
import { MinipgTransport } from './MinipgTransport.ts';

export * from './MinipgTransport.ts';

/** Dials with node:net and node:tls, and cancels with an out-of-band CancelRequest. */
export const layer = Layer.succeed(MinipgTransport, { connect: nodeTransport, cancel: nodeCancel });
