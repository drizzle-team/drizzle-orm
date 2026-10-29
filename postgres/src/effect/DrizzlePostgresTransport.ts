// The service that tells DrizzlePostgresClient how to dial and cancel. Each runtime entry exports a `layer` that
// provides it; `Layer.succeed(DrizzlePostgresTransport, transport)` provides a custom one.
import * as Context from 'effect/Context';
import type { Transport } from '../types.ts';

/** How the pools of DrizzlePostgresClient dial the server and cancel a running query. */
export interface DrizzlePostgresTransport extends Transport {}

export const DrizzlePostgresTransport = Context.Service<DrizzlePostgresTransport>(
	'@drizzle-team/postgres/DrizzlePostgresTransport',
);
