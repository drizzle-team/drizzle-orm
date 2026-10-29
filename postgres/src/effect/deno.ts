// The Effect entry point for Deno: its DrizzlePostgresClient layers dial through Deno.connect.
// `@drizzle-team/postgres/effect` resolves here under the `deno` export condition.
import * as DrizzlePostgresClient from './deno-client.ts'
import * as DrizzlePostgresTransport from './deno-transport.ts'

export { DrizzlePostgresClient, DrizzlePostgresTransport }
