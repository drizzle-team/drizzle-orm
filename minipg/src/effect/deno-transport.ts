// The MinipgTransport namespace for Deno.
import { denoTransport } from '../deno.ts'
import * as Layer from 'effect/Layer'
import { MinipgTransport } from './MinipgTransport.ts'

export * from './MinipgTransport.ts'

/** Dials and cancels through Deno.connect. */
export const layer = Layer.succeed(MinipgTransport, denoTransport)
