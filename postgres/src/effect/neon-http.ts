// The Effect entry point for Neon's SQL-over-HTTP endpoint: `@drizzle-team/postgres/effect/neon-http`. Its
// DrizzlePostgresHttpClient is the same service as the gateway's, so code written against it runs on either.
import * as DrizzlePostgresHttpClient from './neon-http-client.ts';

export { DrizzlePostgresHttpClient };
