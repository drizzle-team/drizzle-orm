// The Effect entry point for Cloudflare Workers: its DrizzlePostgresClient layers dial through cloudflare:sockets.
// `@drizzle-team/postgres/effect` resolves here under the `workerd` export condition. Requires the
// `nodejs_compat` compatibility flag, like ../cf.ts.
import * as DrizzlePostgresClient from './cf-client.ts';
import * as DrizzlePostgresTransport from './cf-transport.ts';

export { DrizzlePostgresClient, DrizzlePostgresTransport };
