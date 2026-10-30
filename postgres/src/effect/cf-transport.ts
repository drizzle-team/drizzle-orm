// The DrizzlePostgresTransport namespace for Cloudflare Workers.
import { cfTransport } from '../cf.ts'
import * as Layer from 'effect/Layer'
import { DrizzlePostgresTransport } from './DrizzlePostgresTransport.ts'

export * from './DrizzlePostgresTransport.ts'

/** Dials and cancels through cloudflare:sockets. */
export const layer = Layer.succeed(DrizzlePostgresTransport, cfTransport)
