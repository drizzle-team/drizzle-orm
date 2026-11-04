# Drizzle Postgres for Effect

`@drizzle-team/postgres/effect` implements Effect's `SqlClient` on top of the Drizzle Postgres pool. Effect
core then gives you statement spans, transactions, savepoints and typed `SqlError`s. It needs
`effect` 4.0.x as a peer dependency.

## Quick start

```ts
import { Effect, Redacted } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect'

const Database = DrizzlePostgresClient.layer({ url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb') })

const program = Effect.gen(function* () {
  const sql = yield* SqlClient
  return yield* sql<{ id: number; name: string }>`select id, name from t where id = ${1}`
})

const rows = await Effect.runPromise(program.pipe(Effect.provide(Database)))
console.log(rows)
```

`DrizzlePostgresClient.layer` provides both `DrizzlePostgresClient` and `SqlClient`. It opens the pool when it is
built and ends the pool when its scope closes. It already includes the transport of the runtime
that you import it for.

## Runtimes

`@drizzle-team/postgres/effect` picks its entry with the same `exports` conditions as the root
import, so the code above runs unchanged on every runtime. It has no fallback either:

| Runtime | `@drizzle-team/postgres/effect` resolves to | The pool dials with |
|---|---|---|
| Node, Bun | `/effect/node` | `node:net` / `node:tls` |
| Deno | `/effect/deno` | `Deno.connect` / `Deno.startTls` |
| Cloudflare Workers | `/effect/cf` | `cloudflare:sockets` (needs `nodejs_compat`) |

To force a runtime, or when a bundler applies no runtime conditions, import the entry from the
table directly.

`/effect/core` has the same `DrizzlePostgresClient`, but its `layer`, `layerConfig` and `make` need a
`DrizzlePostgresTransport` in context. Each runtime entry exports its own as `DrizzlePostgresTransport.layer`, and
`Layer.succeed(DrizzlePostgresTransport.DrizzlePostgresTransport, { connect, cancel })` provides a custom one:

```ts
import { Effect, Layer, Redacted } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect/core'
import { DrizzlePostgresTransport } from '@drizzle-team/postgres/effect'

const Database = DrizzlePostgresClient.layer({ url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb') })
  .pipe(Layer.provide(DrizzlePostgresTransport.layer))

await Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`select 1`
}).pipe(Effect.provide(Database)))
```

A custom transport has a `connect(config, signal)` function that resolves to a connected socket.
If `config.ssl` is set, the socket must already be TLS-negotiated, because the connection does not
negotiate TLS itself. When `signal` aborts, `connect` must destroy the socket. A transport can also
have a `cancel(config, key, isQueryRunning)` function. Without it, a canceled query closes its
connection. `cancel` opens a new connection to the server and writes a CancelRequest on it. It must
call `isQueryRunning()` just before the write and skip the write if it returns false. False means
that the query has ended, and the request would stop a later query. `config.address` holds the IP
address of the server, from the `remoteAddress` of the socket that `connect` returned. If it is
set, dial it instead of `config.host`. It is missing when that socket has no `remoteAddress`. This
transport dials plain TCP, so it refuses `ssl`, and it sends no cancel requests:

```ts
import net from 'node:net'
import { Effect, Layer, Redacted } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient, DrizzlePostgresTransport } from '@drizzle-team/postgres/effect/core'

const PlainTcp = Layer.succeed(DrizzlePostgresTransport.DrizzlePostgresTransport, {
  connect: (config, signal) => new Promise((resolve, reject) => {
    if (config.ssl) return reject(new Error('PlainTcp does not support TLS. Remove ssl from the config.'))
    const socket = net.connect({ host: config.host, port: config.port }, () => resolve(socket))
    socket.once('error', reject)
    signal.addEventListener('abort', () => socket.destroy(), { once: true })
  }),
})

const Database = DrizzlePostgresClient.layer({ url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb') })
  .pipe(Layer.provide(PlainTcp))

await Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`select 1`
}).pipe(Effect.provide(Database)))
```

You can also use `DrizzlePostgresClient.layerFromPool` to reuse an existing pool - see [Reusing an existing pool](#reusing-an-existing-pool) below.

## Settings from Effect Config

`DrizzlePostgresClient.layerConfig` takes the same settings as `DrizzlePostgresClient.layer`, and each one can be a
`Config`. The values are
read from the current `ConfigProvider` when the layer is built; by default that is the environment.
A missing or invalid value fails the layer with a `ConfigError`:

```ts
import { Config, ConfigProvider, Effect, Layer } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect'

const Database = DrizzlePostgresClient.layerConfig({
  url: Config.Redacted('DATABASE_URL'),
  maxConnections: Config.Int('PG_MAX_CONNECTIONS'),
})

// A fixed provider for this example. Without it, the values come from the environment.
const Environment = ConfigProvider.layer(ConfigProvider.fromUnknown({
  DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:54329/testdb',
  PG_MAX_CONNECTIONS: '5',
}))

await Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`select 1`
}).pipe(Effect.provide(Database.pipe(Layer.provide(Environment)))))
```

## Reusing an existing pool

`DrizzlePostgresClient.layerFromPool` builds the client over a pool that you already have, for example the
pool of an app that also uses the async entry point. Both entry points then share its connections.
The layer needs no transport, because the pool already has one, and the pool stays open when the
layer's scope closes:

```ts
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { createPool } from '@drizzle-team/postgres'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect/core'

const pool = createPool('postgres://postgres:postgres@127.0.0.1:54329/testdb')

const rows = await Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient
  return yield* sql`select count(*)::int as n from t`
}).pipe(Effect.provide(DrizzlePostgresClient.layerFromPool(pool))))

console.log(rows, (await pool.query('select 1')).rows)
await pool.end()
```

`DrizzlePostgresClient.fromPool({ acquire })` is the Effect form, with the same shape as `PgClient.fromPool`.
`acquire` is an Effect that yields the pool and runs in the client's scope. With
`Effect.acquireRelease`, the pool ends when that scope closes; with `Effect.succeed(pool)`, the pool
stays open. Pipe the client into `DrizzlePostgresClient.layerFrom` to get a layer:

```ts
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { createPool } from '@drizzle-team/postgres'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect/core'

// The pool ends when the layer's scope closes.
const Database = DrizzlePostgresClient.fromPool({
  acquire: Effect.acquireRelease(
    Effect.sync(() => createPool('postgres://postgres:postgres@127.0.0.1:54329/testdb')),
    (pool) => Effect.promise(() => pool.end()),
  ),
}).pipe(DrizzlePostgresClient.layerFrom)

const rows = await Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient
  return yield* sql`select 1 as n`
}).pipe(Effect.provide(Database)))
console.log(rows)
```

## Creating the client in an Effect

`DrizzlePostgresClient.make` returns the client as a scoped Effect, without a layer. The pool ends when the
scope closes. Like `@effect/sql-pg`, it needs `Reactivity` in context:

```ts
import { Effect, Redacted } from 'effect'
import * as Reactivity from 'effect/reactivity/Reactivity'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect'

const n = await Effect.runPromise(Effect.gen(function* () {
  const client = yield* DrizzlePostgresClient.make({ url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb') })
  const [row] = yield* client<{ n: number }>`select 1 as n`
  return row!.n
}).pipe(Effect.scoped, Effect.provide(Reactivity.layer)))

console.log(n) // 1
```

## Queries with Drizzle Postgres's options

`client.query`, where `client` is the `DrizzlePostgresClient` service, runs one statement with Drizzle Postgres's own options: `mode` picks the row format, a
`shape` declares the column types, and `name` makes it a named prepared statement:

```ts
import { Effect, Redacted } from 'effect'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect'

const Database = DrizzlePostgresClient.layer({ url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb') })

await Effect.runPromise(Effect.gen(function* () {
  const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
  const arrays = yield* client.query('select id, name from t where id = $1', [1])
  const objects = yield* client.query('select id, name from t where id = $1', [1], { mode: 'object' })
  const typed = yield* client.query('select id, name from t where id = $1', [1], {
    shape: { id: 'int4', name: 'text' },
    name: 'find_t_by_id',
  })
  console.log(arrays.rows, objects.rows, typed.rows)
}).pipe(Effect.provide(Database)))
```

## Transactions, Batch, Pipeline and Parallel

```ts
import { Effect, Redacted } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect'

const Database = DrizzlePostgresClient.layer({ url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb') })

const program = Effect.gen(function* () {
  const sql = yield* SqlClient
  const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
  const count = sql`select count(*)::int as n from t`

  // One transaction on one connection. The options apply to the outermost transaction only.
  yield* client.withTransaction(count, { isolation: 'repeatable read', readOnly: true })

  // Batch: one transaction, every statement pipelined, all or nothing.
  yield* client.batch([count, count])

  // Pipeline: one connection, no transaction, each statement commits on its own.
  yield* client.pipeline([count, count])

  // Parallel: separate pool connections, so the server runs the statements at the same time.
  yield* Effect.all([count, count], { concurrency: 'unbounded' })
})

await Effect.runPromise(program.pipe(Effect.provide(Database)))
```

Interrupting a statement cancels it on the server. In a Pipeline, only the statement at the head
gets the cancel request. A statement that waits behind it still runs on the server and can
commit, so do not rely on an interrupt to undo writes in a Pipeline. Inside a transaction, the
interrupt rolls the whole transaction back.

A cancel request can arrive at the server after its statement has already ended. The request then
stops the next statement in the Pipeline. The stopped statement fails with SQLSTATE 57014, and the
server rolls it back. The error is a `StatementTimeoutError` whose `cause` is a `PgError` with
`isLateCancel: true`, and you can run the statement again.

## Bulk writes and json

`bulkInsert` and `bulkUpdate` send many rows as arrays in one statement, and `copyMany` loads them
with COPY, which is the fastest path. Each one takes the table, the column types and the rows, as
arrays or objects. `client.json` binds a value as `jsonb`. Inside `withTransaction`, all of
them run on the transaction's connection:

```ts
import { Effect, Redacted } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect'

const Database = DrizzlePostgresClient.layer({ url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb') })
const columns = { id: 'int4', name: 'text' } as const

const rows = await Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient
  const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
  return yield* Effect.gen(function* () {
    yield* sql`create temp table items (id int4 primary key, name text, meta jsonb) on commit drop`
    yield* client.bulkInsert('items', columns, [[1, 'a'], [2, 'b']])
    yield* client.copyMany('items', columns, [[3, 'c'], [4, 'd']])
    yield* client.bulkUpdate('items', columns, [{ id: 1, name: 'A' }], { by: 'id' })
    yield* sql`update items set meta = ${client.json({ tags: ['new'] })} where id = 2`
    return yield* sql`select id, name, meta from items order by id`
  }).pipe(client.withTransaction)
}).pipe(Effect.provide(Database)))

console.log(rows)
```

## Streams, cursors and COPY

`sql.stream` streams rows with backpressure. `DrizzlePostgresClient` also has `cursor`, which returns row
batches from a server-side cursor on its own connection, `copyFrom`, which takes a `Stream`, and
`copyTo`, which returns one. Closing a stream early stops the work on the server:

```ts
import { Effect, Redacted, Stream } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect'

const Database = DrizzlePostgresClient.layer({ url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb') })

await Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient
  const client = yield* DrizzlePostgresClient.DrizzlePostgresClient

  // The first 3 rows; the server stops the rest of the query.
  const first = yield* sql`select g from generate_series(1, 1000000) g`.stream.pipe(Stream.take(3), Stream.runCollect)

  // COPY ... TO STDOUT as raw bytes, here in the text format.
  const text = yield* client.copyTo('copy (select g from generate_series(1, 3) g) to stdout')
    .pipe(Stream.decodeText(), Stream.mkString)

  // COPY ... FROM STDIN from a Stream, on the transaction's connection.
  const copied = yield* Effect.gen(function* () {
    yield* sql`create temp table copied (g int4) on commit drop`
    yield* client.copyFrom('copy copied from stdin', Stream.make('1\n', '2\n', '3\n'))
    return yield* sql`select count(*)::int as n from copied`
  }).pipe(client.withTransaction)

  console.log(first, JSON.stringify(text), copied)
}).pipe(Effect.provide(Database)))
```

```ts
import { Effect, Redacted, Stream } from 'effect'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect'

const Database = DrizzlePostgresClient.layer({ url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb') })

const batches = await Effect.runPromise(Effect.gen(function* () {
  const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
  return yield* client.cursor({ sql: 'select g from generate_series(1, 10) g', fetchSize: 4 }).pipe(Stream.runCollect)
}).pipe(Effect.provide(Database)))

console.log(batches.map((rows) => rows.length)) // [4, 4, 2]
```

Inside `withTransaction`, every method runs on the transaction's connection, except `cursor`,
which always uses a connection of its own.

## Errors

A failed statement fails with a `SqlError`. Its `reason` follows the SQLSTATE table of
`@effect/sql-pg`, for example `UniqueViolation`, `ConstraintError`, `SqlSyntaxError`,
`DeadlockError`, `SerializationError` or `StatementTimeoutError`, and its `cause` is Drizzle Postgres's
`PgError`:

```ts
import { Effect, Redacted } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect'

const Database = DrizzlePostgresClient.layer({ url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb') })

const error = await Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient
  return yield* sql`select * from no_such_table`.pipe(Effect.flip)
}).pipe(Effect.provide(Database)))

console.log(error.reason._tag) // 'SqlSyntaxError', from SQLSTATE 42P01
```

## Spans

Effect core creates one span per statement with `db.system.name`, `db.namespace`,
`server.address`, `server.port` and `driver: "drizzle-postgres"`. With `metrics: true`, each statement
span also gets Drizzle Postgres's timings and sizes: queue wait, time to first byte, download, decode,
total, bytes sent and received, the row count, and whether a cached prepared statement was reused. The spans of `query`, `bulkInsert`,
`bulkUpdate`, `copyMany` and `copyFrom` get them too. `copyTo`, `cursor` and `sql` streams have
no timings. With the option off, the driver collects no timings.

```ts
import { Effect, Redacted } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '@drizzle-team/postgres/effect'

const Database = DrizzlePostgresClient.layer({
  url: Redacted.make('postgres://postgres:postgres@127.0.0.1:54329/testdb'),
  metrics: true,
})

await Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`select 1`
}).pipe(Effect.provide(Database)))
```

> [!WARNING]
> A pool that you create with the `otel()` or `sentry()` plugins and pass to `layerFromPool`
> produces two spans per query: one from the plugin and one from Effect. Remove one of them.

## Moving from @effect/sql-pg

Code written against `SqlClient` moves by swapping one layer:

```diff
- PgClient.layer({ url, maxConnections: 10 })
+ DrizzlePostgresClient.layer({ url, maxConnections: 10 })
```

| | `PgClient` (`@effect/sql-pg`) | `DrizzlePostgresClient` |
|---|---|---|
| `LISTEN` and `NOTIFY` | `listen` and `notify` | Not available |
| `interval` columns | An interval object | The Postgres text, such as `'1 day 02:00:00'` |
| Runtimes | Node, through `pg` | Node, Bun, Deno and Cloudflare Workers |
| Extras | | `query` with Drizzle Postgres's modes, `batch`, `pipeline`, `bulkInsert`, `bulkUpdate`, `copyMany`, `copyFrom`, `copyTo`, `cursor`, and `metrics` on spans |
