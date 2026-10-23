// The Effect entry point for Node and Bun: its MinipgClient layers dial with node:net and node:tls.
// `@drizzle-team/minipg/effect` picks its file by export condition, as the package root does:
// `workerd` -> ./cf.ts, `deno` -> ./deno.ts, `node` / `bun` -> this file, and no default.
import * as MinipgClient from './node-client.ts'
import * as MinipgTransport from './node-transport.ts'

export { MinipgClient, MinipgTransport }
