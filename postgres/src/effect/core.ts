// The Effect entry point without a transport: its DrizzlePostgresClient layers need a DrizzlePostgresTransport in context.
// Provide one with `Layer.succeed(DrizzlePostgresTransport.DrizzlePostgresTransport, transport)` or a runtime's
// `DrizzlePostgresTransport.layer`, or pass a pool from another entry point to `DrizzlePostgresClient.layerFromPool`.
import * as DrizzlePostgresClient from './core-client.ts'
import * as DrizzlePostgresTransport from './DrizzlePostgresTransport.ts'

export { DrizzlePostgresClient, DrizzlePostgresTransport }
