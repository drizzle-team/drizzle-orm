// The Effect entry point for the httpostgres gateway: `@drizzle-team/postgres/effect/http`. Its
// DrizzlePostgresHttpClient is the same service as Neon HTTP's, so code written against it runs on either.
import * as DrizzlePostgresHttpClient from './http-client.ts';

export { DrizzlePostgresHttpClient };
