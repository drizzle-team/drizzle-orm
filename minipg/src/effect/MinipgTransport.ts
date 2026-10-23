// The service that tells MinipgClient how to dial and cancel. Each runtime entry exports a `layer` that
// provides it; `Layer.succeed(MinipgTransport, transport)` provides a custom one.
import * as Context from 'effect/Context';
import type { Transport } from '../types.ts';

/** How the pools of MinipgClient dial the server and cancel a running query. */
export interface MinipgTransport extends Transport {}

export const MinipgTransport = Context.Service<MinipgTransport>('@drizzle-team/minipg/MinipgTransport');
