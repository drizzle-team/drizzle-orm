// The Effect entry point for Node and Bun: its DrizzlePostgresClient layers dial with node:net and node:tls.
// `@drizzle-team/postgres/effect` picks its file by export condition, as the package root does:
// `workerd` -> ./cf.ts, `deno` -> ./deno.ts, `node` / `bun` -> this file, and no default.
import * as DrizzlePostgresClient from './node-client.ts';
import * as DrizzlePostgresTransport from './node-transport.ts';

export { DrizzlePostgresClient, DrizzlePostgresTransport };
