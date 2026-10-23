// The Effect entry point for Cloudflare Workers: its MinipgClient layers dial through cloudflare:sockets.
// `@drizzle-team/minipg/effect` resolves here under the `workerd` export condition. Requires the
// `nodejs_compat` compatibility flag, like ../cf.ts.
import * as MinipgClient from './cf-client.ts'
import * as MinipgTransport from './cf-transport.ts'

export { MinipgClient, MinipgTransport }
