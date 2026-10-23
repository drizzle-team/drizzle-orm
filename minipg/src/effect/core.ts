// The Effect entry point without a transport: its MinipgClient layers need a MinipgTransport in context.
// Provide one with `Layer.succeed(MinipgTransport.MinipgTransport, transport)` or a runtime's
// `MinipgTransport.layer`, or pass a pool from another entry point to `MinipgClient.layerFromPool`.
import * as MinipgClient from './core-client.ts'
import * as MinipgTransport from './MinipgTransport.ts'

export { MinipgClient, MinipgTransport }
