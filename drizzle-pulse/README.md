# drizzle-pulse

Type-safe realtime SDK for Drizzle ORM — server-defined queries streaming live PostgreSQL changes over WAL to in-process consumers: live collections and CDC event streams.

## Install

`drizzle-orm` must resolve from its `rc5` dist-tag. The `latest` tag does not satisfy the declared range, and the public `rc.4` build has no `./postgres/*` subpaths this package imports.

The PostgreSQL driver comes with `drizzle-orm`. `drizzle-pulse/embedded` imports it from `drizzle-orm/postgres` and `drizzle-orm/postgres/cdc`.

```bash
npm install drizzle-pulse
```

`drizzle-pulse` declares peer dependencies your app must also install — see the [Compatibility](#compatibility) table below for exact ranges. At minimum:

```bash
npm install drizzle-orm@rc5 zod @drizzle-team/postgres
```

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

Then open live collections and CDC event streams with [`drizzle-pulse/embedded`](#drizzle-pulseembedded).

## `drizzle-pulse`

The root entrypoint owns the collection: `pulse(table)` wraps a Drizzle table into a `PulseTable`, exported once from your schema file.

- `pulse(table)` — returns a `PulseTable` wrapping `table`; construct unconditionally, at schema-definition time
- `PulseTable` — the collection; call `.query(fn?)` to derive a query (`.query()` for match-all, `.query(fn)` to seed a where-clause)

## `drizzle-pulse/embedded`

The entrypoint for apps that consume Pulse in-process. `createRuntime(config)` creates the runtime. `runtime.client` opens live collections, and `runtime.events` opens CDC event streams:

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
- `runtime.client.<query>(args)` returns a live `PulseCollection`. `list()` returns the current filtered set synchronously, and the rows are exactly the selected columns. `onChange(cb)` and `onError(cb)` register listeners. `dispose()` stops the collection. Each decoded WAL commit is applied as it streams in, and the collection rebaselines after a reconnect. Each call creates an independent collection, so create it once and keep it.
- `runtime.events.<query>(args, callback)` opens a CDC event stream and returns an unsubscribe function. The callback gets `(event, lsn)` in WAL commit order, at least once. Use `(event.pk, lsn)` as the idempotency key.
- `runtime.provision()` — the split-role deploy step: provisions replication prerequisites under an elevated role without opening WAL (see "Provisioning & privileges" below). Refuses to run on a started runtime.
- `runtime.onFatalError(cb)` — fires once replication gives up permanently; the runtime stops itself right after.
- No events tables exist in this mode, and the replication slot is temporary, named from the configured `slotName` plus an underscore and an eight-character random suffix — a crashed process can't leak WAL-retaining slot state. Postgres truncates slot names at 63 bytes, so `slotName` is capped at 54 characters here to leave room for the suffix; a longer name rejects `start()`.

### Provisioning & privileges

By default the app's own role owns its tables and can `CREATE`, so `runtime.start()` self-provisions everything on first boot and no-ops on later boots. A failed self-provisioning statement throws with the exact statement and the grant it most likely needs (e.g. *ownership of `public.orders`*, *the database `CREATE` privilege*).

For split-role deploys where the app role is deliberately unprivileged, call `runtime.provision()` once from a migration/deploy step under an elevated role — it runs the same bootstrap without opening the WAL stream, and the app's later `start()` then no-ops the DDL. The provisioning role needs ownership of each pulsed source table, the database `CREATE` privilege, and (once it exists) ownership of the publication; the WAL streaming connection additionally needs the `REPLICATION` attribute.

## Compatibility

| Dependency | Range | Notes |
|---|---|---|
| `drizzle-orm` | `^1.0.0-rc.4` | Needs a build whose exports include `./postgres/*`, which the `rc5` dist-tag provides and the `latest` tag does not |
| `zod` | `^4.0.0` | |
| `@drizzle-team/postgres` | `>=0.4.0` | Declared peer. The runtime uses the copy of the driver that comes with `drizzle-orm` |
| `react` | `>=18.0.0` | Optional — only required for `drizzle-pulse/client/react` |
| `hono` | `^4.6.0` | Optional — only required for `drizzle-pulse/server/hono` |
| `node` | `>=20` | |
| PostgreSQL | `16` | Requires `wal_level=logical` |

## Guardrails

- Live collections and CDC event streams are in-process only. Queries built with `.transform()` or `.limit()` cannot be opened, and opening one throws.
