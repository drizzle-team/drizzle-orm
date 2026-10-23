// The MinipgTransport namespace for Cloudflare Workers.
import { cfTransport } from '../cf.ts'
import * as Layer from 'effect/Layer'
import { MinipgTransport } from './MinipgTransport.ts'

export * from './MinipgTransport.ts'

/** Dials and cancels through cloudflare:sockets. */
export const layer = Layer.succeed(MinipgTransport, cfTransport)
