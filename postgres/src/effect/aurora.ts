// The Effect entry point for the Aurora Data API: `@drizzle-team/postgres/effect/aurora`. Its DrizzleAuroraClient is
// a SqlClient with transactions, so `sql` statements and withTransaction work as they do over a connection.
import * as DrizzleAuroraClient from './DrizzleAuroraClient.ts';

export { DrizzleAuroraClient };
