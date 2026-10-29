// Drizzle Postgres — a small, pure-TypeScript PostgreSQL driver: plain SQL strings + params,
// named prepared statements, pluggable result modes, single connection or pool.
// No template tags, no LISTEN/NOTIFY, no COPY.
//
// This is the Node/Bun entry: it registers the node:net/tls transport as the default (so
// connect({ host, port }) works with no socket), then re-exports the runtime-agnostic core. The cf and
// Deno entries register their own transports, so they never pull in node:net/tls.
//
// The package root picks its file by export condition (package.json): `workerd` -> ./cf.ts,
// `deno` -> ./deno.ts, `node` / `bun` -> this file. There is NO default: a target with no TCP
// (browser, edge-light) fails to resolve the root at build time instead of failing at connect.
import { registerDefaultTransport } from './connection.ts';
import { nodeCancel, nodeTransport } from './transport-node.ts';

registerDefaultTransport(nodeTransport, nodeCancel);

export * from './core.ts';
