// The Effect entry point for an in-process PGlite: `@drizzle-team/postgres/effect/pglite`. Its DrizzlePostgresClient
// is the same service as the TCP one, so code written against it runs unchanged.
import * as DrizzlePostgresClient from './pglite-client.ts';

export { DrizzlePostgresClient };
