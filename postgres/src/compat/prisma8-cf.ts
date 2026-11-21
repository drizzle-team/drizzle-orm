// `@drizzle-team/postgres/compat-prisma8` for Cloudflare Workers: connections dial through cloudflare:sockets.
// Requires the `nodejs_compat` compatibility flag, like ../cf.ts.
import '../cf.ts'; // registers the workerd transport
export * from './prisma8.ts';
