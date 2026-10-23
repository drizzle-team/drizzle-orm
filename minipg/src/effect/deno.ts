// The Effect entry point for Deno: its MinipgClient layers dial through Deno.connect.
// `@drizzle-team/minipg/effect` resolves here under the `deno` export condition.
import * as MinipgClient from './deno-client.ts';
import * as MinipgTransport from './deno-transport.ts';

export { MinipgClient, MinipgTransport };
