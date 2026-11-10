# drizzle-pulse

Type-safe Pulse SDK for Drizzle ORM — server-defined queries that stream live PostgreSQL changes (via WAL logical replication) to remote clients over HTTP polling, or directly in-process as live in-memory collections. One query definition, one merge implementation, two consumption paths.

## Install

`drizzle-orm` must resolve from its `rc5` dist-tag. The `latest` tag does not satisfy the declared range, and the public `rc.4` build has no `./postgres/*` subpaths this package imports.

The PostgreSQL driver is `@drizzle-team/minipg`. The server entrypoints, `drizzle-pulse/server` and `drizzle-pulse/embedded`, import its `@drizzle-team/minipg/cdc` subpath. The client entrypoints, `drizzle-pulse/client`, `drizzle-pulse/client/react`, and `drizzle-pulse/client/embedded`, never load the driver.

```bash
npm install drizzle-pulse
```

`drizzle-pulse` declares peer dependencies your app must also install — see the [Compatibility](#compatibility) table below for exact ranges. At minimum:

```bash
npm install drizzle-orm@rc5 zod @drizzle-team/minipg
```

`react` is only required if you use the [`drizzle-pulse/client/react`](#drizzle-pulseclientreact) entrypoint.

## 60-second quickstart

**Schema** — export a `pulse(table)` collection once per table, alongside its source table:

```ts
// schema.ts
import { pulse } from 'drizzle-pulse';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  status: text('status').notNull(),
});

export const ordersCollection = pulse(orders);
```

**Server** — derive queries from the collection, register them, and expose over WAL:

```ts
// server.ts
import { createPulseRegistry, PulseRuntime } from 'drizzle-pulse/server';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ordersCollection } from './schema.js';

const activeOrders = ordersCollection
  .query() // convention-resolved events table — see "Events tables" below
  .order('asc')
  .query((ctx) => ctx.query({ status: 'active' }));

const registry = createPulseRegistry({ activeOrders });

const sourceDb = drizzle({ client: postgres(process.env.DATABASE_URL!) });

const runtime = new PulseRuntime(registry, {
  databaseUrl: process.env.DATABASE_URL!, // must have wal_level=logical
  sourceDb,
  pull: true,
});

await runtime.start(); // self-provisions its infrastructure (publication, REPLICA IDENTITY
// FULL, events tables) inside one transaction on first boot — see "Events tables" below

// wire runtime.handlers.subscribe / .pull / .loadMore into your HTTP router, or mount the
// optional first-party Hono router — see "drizzle-pulse/server/hono" below
```

**Client** — poll the server over HTTP with `createPulseClient`:

```ts
// client.ts
import { createPulseClient } from 'drizzle-pulse/client';

const client = createPulseClient<{
  activeOrders: (args?: Record<string, unknown>) => import('drizzle-pulse').QueryDescriptor<Order>;
}>({
  url: 'https://api.example.com',
});

const query = client.activeOrders();
// consume `query` with `PulseQuery` (framework-agnostic) or `usePulseQuery` (React) — see below
```

## `drizzle-pulse`

The root entrypoint owns the collection: `pulse(table)` wraps a Drizzle table into a `PulseTable`, exported once from your schema file.

- `pulse(table)` — returns a `PulseTable` wrapping `table`; construct unconditionally, at schema-definition time
- `PulseTable` — the collection; call `.query(fn?)` to derive a query (`.query()` for match-all, `.query(fn)` to seed a where-clause)

## `drizzle-pulse/server`

Derive queries from collections outside the schema file, register them, and expose a WAL-fed runtime that serves subscribe/pull requests.

- `PulseBuilder` — fluent builder returned by `.query()`: `.columns()`, `.args(zodSchema)`, `.query(ctx => WhereClause)`, `.order()`, `.limit()`, `.transform()`
- Queries that read `ctx.args` in their `queryFn` MUST chain `.args(zodSchema)` first. Without a schema, `ctx.args` is always `{}` at runtime (the registry never forwards unvalidated client input as args) — reading `ctx.args` on a schemaless query silently sees no fields rather than attacker-controlled data.
- `.columns()` must be called before `.transform()` in the chain — calling it after throws, rather than silently discarding the transform.
- `createPulseRegistry(queries)` — collects builders into a `PulseRegistry`; queries must be `.query()` builder chains — passing a bare `PulseTable` is a compile-time type error via the `AnyPulseBuilders` constraint, not a runtime rejection
- `new PulseRuntime(registry, config)` — call `.start()` to self-provision infrastructure and connect WAL, `runtime.handlers.{subscribe,pull,loadMore}` to serve requests
- `PulseRuntime` — WAL listener + request handlers; `.start()` / `.stop()`. The server is stateless: each pull re-resolves auth and validates its own opaque cursor token, so there's no per-subscription server state, no TTL, and no `unsubscribe` — a client simply stops pulling.
- `PulseRuntime.provision()` — runs the same infrastructure bootstrap as `.start()` without opening the WAL stream, for split-role deploys (see "Provisioning & privileges" below)
- `config` also accepts a `telemetry` callback, fired for every applied batch; the full contract is documented in [`drizzle-pulse/embedded`](#drizzle-pulseembedded) below

```ts
import { pulse } from 'drizzle-pulse';
import { createPulseRegistry, PulseRuntime } from 'drizzle-pulse/server';

const ordersByStatus = pulse(orders)
  .query()
  .args(z.object({ status: z.string() }))
  .order('desc')
  .query((ctx) => ctx.query({ status: ctx.args.status }));

const registry = createPulseRegistry({ ordersByStatus });
const runtime = new PulseRuntime(registry, { databaseUrl, sourceDb, pull: true }); // publication/slot default to 'drizzle_pulse'
await runtime.start();
```

### Events tables

Every pulsed source table gets a matching **events table** — WAL changes are persisted there and replayed to clients. Events tables are runtime-owned infrastructure, resolved entirely by convention (no hand-declared Drizzle table, no drizzle-kit migration):

- **Location:** `<eventsSchema>.<sourceSchema>_<sourceTable>`, with each component's `_` doubled to `__` before joining — `eventsSchema` defaults to `'drizzle_pulse'` (override via `pull.eventsSchema`)
- **Self-provisioning:** `runtime.start()` provisions everything itself inside one advisory-locked transaction — creates the events schema, the events tables and their `pulse_meta` bookkeeping, the publication (plus membership diff), and sets `REPLICA IDENTITY FULL` on each registered source (resetting it to `DEFAULT` on un-pulse). Full old tuples are what every update/delete decodes from, in both pull modes — the runtime never reads old-row data back from your tables. An events table is recreated when the sha256 of its rendered DDL diverges (a source-column change), which rotates a per-table epoch so stale client cursors reset. `wal_level = logical` is the one precondition the runtime can't fix — it stays a fail-fast assert.

**WHERE gating for updates/deletes:** every delivery surface (the HTTP pull protocol, embedded collections, `createPulseEvents`) evaluates the query's `WHERE` against both the old and new row (the full old tuple makes that always possible). An event neither side matches is suppressed, and a delivered update includes each side only when that side matches — the out-of-scope side ships redacted (pk-only on the HTTP wire, an empty object on the embedded feed with the pk on the event) — so a subscriber can maintain membership without ever receiving column data its `WHERE` does not admit.

See [`docs/events-table-convention.md`](../../docs/events-table-convention.md) for the full name-derivation, column-mapping, and bootstrap contract.

### `drizzle.config` — exclude the pulse schema

drizzle-kit does not manage the pulse events schema, so keep it out of your `push`/`pull`. kit's `schemaFilter` is an allowlist of schemas it manages (default `['public']`): make sure your pulse events schema — `'drizzle_pulse'` by default, or your configured `eventsSchema` — is not in it, so kit never tries to drop pulse-owned tables.

```ts
// drizzle.config.ts
export default defineConfig({
  // ...
  schemaFilter: ['public'], // omits 'drizzle_pulse' — pulse owns that schema
});
```

### Provisioning & privileges

By default the app's own role owns its tables and can `CREATE`, so `runtime.start()` self-provisions everything on first boot and no-ops on later boots. A failed self-provisioning statement throws with the exact statement and the grant it most likely needs (e.g. *ownership of `public.orders`*, *the database `CREATE` privilege*).

For split-role deploys where the app role is deliberately unprivileged, call `runtime.provision()` once from a migration/deploy step under an elevated role — it runs the same bootstrap without opening the WAL stream, and the app's later `start()` then no-ops the DDL. The provisioning role needs ownership of each pulsed source table, the database `CREATE` privilege, and (once it exists) ownership of the publication; the WAL streaming connection additionally needs the `REPLICATION` attribute.

## `drizzle-pulse/server/hono`

`runtime.handlers` is a transport-agnostic SDK — plug its `subscribe`/`pull`/`loadMore` methods into any HTTP framework. For Hono, the optional first-party router wraps them (superjson-encoded responses over three POST routes: `/subscribe`, `/pull`, `/load-more`):

```ts
import { createPulseHonoRouter } from 'drizzle-pulse/server/hono';

const router = createPulseHonoRouter(runtime.handlers, { userId: null }); // Hono instance
app.route('/pulse', router);
```

`hono` is an optional peer dependency — only installed if you mount this router.

## `drizzle-pulse/embedded`

The embedded-only entrypoint, for apps that consume pulse entirely in-process and never serve the HTTP pull protocol. `createRuntime(config)` wires the registry and a `pull: false` runtime internally, so the only knobs left are the ones that matter in this mode — no `pull`, no separate registry or client factories:

```ts
import { pulse } from 'drizzle-pulse';
import { createRuntime } from 'drizzle-pulse/embedded';

const ordersByStatus = pulse(orders)
  .args(z.object({ status: z.string() }))
  .query((ctx) => ctx.query({ status: ctx.args.status }));

const runtime = createRuntime({
  queries: { ordersByStatus },
  databaseUrl: process.env.DATABASE_URL!, // must have wal_level=logical
  sourceDb, // the app's own drizzle connection
});
await runtime.start(); // self-provisions publication + REPLICA IDENTITY FULL, then opens WAL

const collection = await runtime.client.ordersByStatus({ status: 'active' });
collection.list(); // synchronous current filtered set
collection.onChange(({ events, state }) => { /* ... */ });

const unsub = runtime.events.ordersByStatus({ status: 'active' }, (event, lsn) => { /* ... */ });

unsub();
collection.dispose();
await runtime.stop();
```

- `config` — `queries` (the `pulse(table)` builders, keyed by query name), `databaseUrl`, `sourceDb`, plus optional `wal: { publicationName?, slotName? }`, `logLevel`, and `telemetry`. `sourceDb` is the app's own drizzle connection: collection baseline reads run on it, keeping its session context (RLS, `search_path`). Post-reconnect rebaselines read the recreated slot's exported snapshot on the admin connection instead, where row scoping is each query's resolve-time auth-scoped `WHERE` (pass `{ auth }` in the trailing options).
- `telemetry(event)` — fires once per `(table, op)` group of each transaction the runtime applies, with `{ schema, table, op, rowCount, committedAt, appliedAt, commitLsn }`; `rowCount` is the number of row events in the group; both stamps are epoch microseconds, so `appliedAt - committedAt` is the sync latency in microseconds (`committedAt` is the database host's commit clock, `appliedAt` this process's clock taken once the whole commit batch is visible to collections — cross-host skew can make individual deltas negative); invoked asynchronously after the batch is applied and acked, so it never delays replication; a throwing callback is logged and never disrupts replication; `op` and `rowCount` count WAL events as the database emitted them, so a pk-changing UPDATE reports one update; a reconnect additionally fires one event per collection with `op: 'rebaseline'`, `rowCount` set to the recovered row count and `commitLsn` set to the baseline watermark the stream resumes from — `committedAt` equals `appliedAt` there, since recovered rows have no single commit time; a table served by two collections reports two rebaseline events, one per collection.
- `runtime.client` / `runtime.events` — the same surfaces `drizzle-pulse/client/embedded` builds from a full `PulseRuntime` (see below).
- `runtime.provision()` — the split-role deploy step: provisions replication prerequisites under an elevated role without opening WAL (see "Provisioning & privileges" above). Refuses to run on a started runtime.
- `runtime.onFatalError(cb)` — fires once replication gives up permanently; the runtime stops itself right after.
- No events tables exist in this mode, and the replication slot is temporary, named from the configured `slotName` plus an underscore and an eight-character random suffix — a crashed process can't leak WAL-retaining slot state. Postgres truncates slot names at 63 bytes, so `slotName` is capped at 54 characters here to leave room for the suffix; a longer name rejects `start()`.

## `drizzle-pulse/client`

The framework-agnostic HTTP polling client. `createPulseClient` returns a typed proxy of query-descriptor factories; wrap a descriptor in `PulseQuery` to subscribe and poll (~1s by default, configurable via `pollIntervalMs`).

```ts
import { createPulseClient, PulseQuery } from 'drizzle-pulse/client';

const client = createPulseClient<MyClientContract>({ url: 'https://api.example.com' });

const query = new PulseQuery(client.ordersByStatus({ status: 'active' }));
await query.subscribe();
query.getState(); // { data, isLoading, isLoadingMore, hasMore, error }
```

## `drizzle-pulse/client/react`

A React hook wrapping `PulseQuery` with automatic subscribe/cleanup on mount/unmount.

```tsx
import { usePulseQuery } from 'drizzle-pulse/client/react';
import { createPulseClient } from 'drizzle-pulse/client';

const client = createPulseClient<MyClientContract>({ url: 'https://api.example.com' });

function OrdersList() {
  const { data, isLoading, error, loadMore, hasMore } = usePulseQuery(
    client.ordersByStatus({ status: 'active' }),
  );

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data.map((order) => (
        <li key={order.$pk as string}>{order.status}</li>
      ))}
      {hasMore && <button onClick={loadMore}>Load more</button>}
    </ul>
  );
}
```

## `drizzle-pulse/client/embedded`

For server-side consumers that live in the same process as a full `PulseRuntime` — typically a `pull: true` runtime that serves HTTP clients and also feeds in-process taps. `createPulseClient(runtime)` returns live, WAL-fed `PulseCollection`s with no HTTP round trip; `createPulseEvents(runtime)` returns stateless per-event subscriptions. (For embedded-only apps, prefer [`drizzle-pulse/embedded`](#drizzle-pulseembedded), which builds the runtime for you and exposes these same two surfaces as `runtime.client` / `runtime.events`.)

```ts
import { createPulseClient, createPulseEvents } from 'drizzle-pulse/client/embedded';

const client = createPulseClient(runtime); // same PulseRuntime from drizzle-pulse/server

const collection = await client.ordersByStatus({ status: 'active' });

collection.list(); // synchronous current filtered set — rows are exactly the selected columns
const offChange = collection.onChange(({ events, state, lsn }) => {
  console.log('changed:', events, 'now:', state);
});
const offError = collection.onError((error) => {
  console.error('collection error:', error);
});

collection.dispose(); // stop the collection when done

const events = createPulseEvents(runtime);
const unsub = events.ordersByStatus({ status: 'active' }, (event, lsn) => {
  // WAL commit order, at-least-once — key idempotency off (event.pk, lsn)
});
unsub();
```

Updates are push-shaped: each decoded WAL commit is applied to the collection as it streams in (and the collection rebaselines on reconnect) — there is no polling interval. Every event carries the row's primary key as `event.pk`; collection rows themselves carry no synthetic identity field.

`drizzle-pulse/client` and `drizzle-pulse/client/embedded` are two import-path-selected flavors of the same `createPulseClient` concept: pick `/client` for remote/browser consumers over HTTP, or `/client/embedded` for in-process server-side consumers with synchronous live data.

## Compatibility

| Dependency | Range | Notes |
|---|---|---|
| `drizzle-orm` | `^1.0.0-rc.4` | Needs a build whose exports include `./postgres/*`, which the `rc5` dist-tag provides and the `latest` tag does not |
| `zod` | `^4.0.0` | |
| `@drizzle-team/minipg` | `>=0.4.0` | The PostgreSQL driver. The runtime consumes its `@drizzle-team/minipg/cdc` subpath |
| `react` | `>=18.0.0` | Optional — only required for `drizzle-pulse/client/react` |
| `hono` | `^4.6.0` | Optional — only required for `drizzle-pulse/server/hono` |
| `node` | `>=20` | |
| PostgreSQL | `16` | Requires `wal_level=logical` |

## Transport & guardrails

- **Transport:** HTTP polling only (`drizzle-pulse/client`, `drizzle-pulse/client/react`) — no SSE or WebSocket transport.
- **Embedded collections** (`drizzle-pulse/client/embedded`, `drizzle-pulse/embedded`) are in-process only: no `.transform()` and no `.limit()` (both throw at materialization — transforms and pagination stay HTTP-only), and no dedupe (each call creates an independent collection — create once, hold, `dispose()`).
