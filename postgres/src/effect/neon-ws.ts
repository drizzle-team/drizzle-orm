// The Effect entry point for Neon over its WebSocket proxy: `@drizzle-team/postgres/effect/neon-ws`. Its
// DrizzlePostgresClient is the same service as the TCP one, so code written against it runs unchanged.
import * as DrizzlePostgresClient from './neon-ws-client.ts';

export { DrizzlePostgresClient };
