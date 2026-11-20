// The DrizzlePostgresTransport namespace for Deno.
import * as Layer from 'effect/Layer';
import { denoTransport } from '../deno.ts';
import { DrizzlePostgresTransport } from './DrizzlePostgresTransport.ts';

export * from './DrizzlePostgresTransport.ts';

/** Dials and cancels through Deno.connect. */
export const layer = Layer.succeed(DrizzlePostgresTransport, denoTransport);
