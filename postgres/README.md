# @drizzle-team/postgres

> [!WARNING]
> Internal Drizzle Team package. Not supported for outside use. Breaking changes can land
> without notice.

A minimal, dependency-free PostgreSQL driver for Node, Bun, Deno, and Cloudflare Workers. It
covers the wire protocol directly and ships as ESM only, with 20 subpath entry points for
each supported runtime and adapter.

## Install

```bash
pnpm add @drizzle-team/postgres
```

```bash
npm install @drizzle-team/postgres
```

```bash
bun add @drizzle-team/postgres
```

## Usage

The example below queries a local cluster. From a checkout of this repo, provision one with:

```bash
bun run test:setup
```

That starts Postgres on `127.0.0.1:54329` with a `testdb` database and a seeded table `t`. It uses
local PostgreSQL binaries when `initdb`/`pg_ctl` are on PATH and a Docker container otherwise (force
either with `DRIZZLE_POSTGRES_PG_MODE=native|docker`; remove the container with `docker rm -f postgres-test-pg`).
Any other Postgres works too — point the config below at it.

```js
import { connect } from '@drizzle-team/postgres'

const db = await connect({
  host: '127.0.0.1',
  port: 54329,
  user: 'postgres',
  password: 'postgres',
  database: 'testdb',
})

const result = await db.query('select id, name, n8, amount from t order by id')
console.log(result.rows)

await db.end()
```

`n8` (bigint) comes back as a native JS `BigInt`, and `amount` (numeric) comes back as a
string, since both types can exceed the range a JS number can represent without losing
precision. `int8: 'string'` in the config returns bigint as its exact digits instead (what `pg`
returns), and `int8: 'number'` as a JS number, lossy above 2^53.

Built-in array columns (`int4[]`, `text[]`, `jsonb[]`, `timestamptz[]`, …) decode to JS
arrays, with each element following the scalar rules above — so `int8[]` yields `BigInt`s
and `numeric[]` yields exact strings. Arrays whose element type has a per-database OID
(`enum[]`, `domain[]`, composite arrays) can't be recognised from the wire OID alone and
still arrive as the raw `{…}` literal; declare a `shape` for those. To opt back out for a
given type, override its array OID in `types` (e.g. `types: { 1007: (b) => b.toString() }`).

## Canceling queries

`timeout` (milliseconds) and `signal` (an `AbortSignal`) cancel a query on a pooled connection: from
`createPool`, `pool.acquire()`, `pool.connect()` or a `pool.transaction()` callback. The pool opens a
second connection to the server and sends a CancelRequest on it, because the protocol accepts a cancel
only as the first packet of a new connection. That connection dials the IP address of the session, so
DNS cannot send the cancel to another server. With a `socket` factory, it dials `host`, because that
socket can lead to a proxy or a bastion host. If the query has ended before the cancel is written,
nothing is sent. The type of a `pool.transaction()` callback argument is plain `Connection`, so that
`transaction()` works on a `Pool | Connection` value.

```js
import { createPool } from '@drizzle-team/postgres'

const pool = createPool({ host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'testdb' })
await pool.query('select pg_sleep(10)', [], { timeout: 1000 }) // rejects with code QUERY_TIMEOUT
```

A single connection from `connect()` cannot cancel. Its types do not accept `timeout` or `signal`, and
a query that passes them anyway rejects before anything is sent, with code `CANCEL_NEEDS_POOL`. An early
`break` out of `stream()` or `copyTo()` cancels the query on a pooled connection. On a single connection,
and inside a transaction, the driver reads the rest of the result and drops it.

The HTTP clients (`/http`, `/neon-http`, `/aurora`) accept `timeout` and `signal` on every client. They
stop the client from waiting for the response. The service decides whether the query stops.

## Runtimes

The root import picks its TCP transport from the runtime, so the same line works everywhere:

| Runtime | `@drizzle-team/postgres` resolves to | Transport |
|---|---|---|
| Node, Bun | the Node entry | `node:net` / `node:tls` |
| Deno | the Deno entry | `Deno.connect` / `Deno.startTls` |
| Cloudflare Workers | the Workers entry | `cloudflare:sockets` (needs `nodejs_compat`) |

TLS works differently on Deno and Workers. Both runtimes always verify the server certificate, so
`sslmode=require` fails against a self-signed certificate, and `rejectUnauthorized: false` has no
effect. Deno reads only `ssl.ca` and `ssl.servername` and ignores the other `ssl` options, such as
`key` and `cert`. Workers ignore all `ssl` options. Neither runtime supports
`channel_binding=require`.

The choice is made once, by the `exports` conditions in `package.json`, when the module is
resolved or bundled. There is no fallback on purpose: a target with no TCP (a browser bundle, the
Vercel Edge runtime) fails to resolve the root import at build time. Use
`@drizzle-team/postgres/http`, `/neon-http`, `/neon-ws` or `/pglite` there.

To force a transport, or when a bundler does not apply runtime conditions, import the explicit
entry: `@drizzle-team/postgres/node`, `/cf` or `/deno`. Each exposes the same API as the root.
`/core` has no transport at all; pass `config.transport` or `config.socket`.

## PGlite

`@drizzle-team/postgres/pglite` runs the driver against an in-process [PGlite](https://pglite.dev), with no
server and no socket in between:

```ts
import { PGlite } from '@electric-sql/pglite'
import { createPool } from '@drizzle-team/postgres/pglite'

const pg = await PGlite.create()
const pool = createPool(pg)
```

The driver writes the wire protocol straight into PGlite, so named statements, pipelining and transactions
work as they do against a server. A point lookup by a named statement takes about 6 µs.

PGlite is one Postgres backend with one session, and the entry adapts to that:

- A pool has one connection (`max` must be 1). Queries share it, and wait behind a transaction.
- One pool or connection per PGlite instance: a second one fails while the first is open.
- Settings such as `applicationName` and `options` (`-c search_path=…`) are applied when the connection
  opens. `user` and `database` are the instance's own.
- Closing the connection ends its session as a disconnect would: an open transaction rolls back, and
  `DISCARD ALL` drops prepared statements, temporary tables and session settings, including settings made
  directly on the instance.
- `pg.query()` and `pg.transaction()` on the same instance stay out of the driver's transactions, and the
  driver's statements stay out of theirs. Calling one from inside the other's transaction waits forever.
- A running statement can't be interrupted. Canceling a query closes the connection once its turn comes.

## Effect

`@drizzle-team/postgres/effect` implements Effect's `SqlClient` on top of the Drizzle Postgres pool, and its layers
include the transport of each runtime. See [src/effect/README.md](src/effect/README.md) for
setup, runtimes and examples.

## Kysely

`@drizzle-team/postgres/compat-kysely` gives Kysely's own `PostgresDialect` a pool to drive:

```ts
import { Kysely, PostgresDialect } from 'kysely'
import { createPool, Cursor } from '@drizzle-team/postgres/compat-kysely'

const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool: createPool(process.env.DATABASE_URL), cursor: Cursor }),
})
```

Rows decode as Kysely's types expect: objects, and `int8` as a string unless the config sets `int8`.

Kysely compiles a query to the same SQL text every time, so each distinct text gets a server-side statement
name: Postgres parses and plans it once per connection, not on every execution. `createPool(config, { autoName:
false })` turns that off. Each distinct SQL stays prepared on the connections that ran it, with no limit, so an
app that builds SQL with varying text (`IN` lists of every length, inlined values) may prefer it off. It is
off by default where the pool doesn't use named statements (`pool.prepare` is false): behind a transaction
pooler, or with `prepare: false`.

Kysely checks out a connection for every query. This pool doesn't: a standalone query is a shared
pool query, pipelined with other callers' queries on the least-loaded connection. A connection is
held from `begin` to the end of a transaction, for `.stream()` (`cursor: Cursor` is needed for it), and
for Kysely's `'cancel query'` and `'kill session'` abort strategies, so they signal the right backend.

`db.connection()` gets no connection of its own: its callback's queries are shared queries like any
other. Put session state (`SET`, temporary tables, session advisory locks) in a transaction or in the
pool config (`options: '-c search_path=app'`). For the same reason `onCreateConnection` and
`onReserveConnection` run once per Kysely checkout, not once per connection.

## Prisma

`@drizzle-team/postgres/compat-prisma7` is a drop-in for `@prisma/adapter-pg`:

```ts
import { PrismaClient } from './generated/prisma/client'
import { PrismaPg } from '@drizzle-team/postgres/compat-prisma7'

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })
```

Results, column types and errors match `@prisma/adapter-pg` 7.10.1. Prisma starts every transaction through
the adapter, so statements outside one are shared pool queries, pipelined with other callers' queries on the
least-loaded connection, and a transaction holds a connection of its own. `PrismaPg` takes a connection string
or a pool config, not a pool: the pool it creates decodes values the way Prisma expects.

`@drizzle-team/postgres/compat-prisma8` gives Prisma 8's Postgres client a pool to bind to:

```ts
import postgres from '@prisma/orm-postgres/runtime'
import { createPool } from '@drizzle-team/postgres/compat-prisma8'

const db = postgres({ contract, binding: { kind: 'pgPool', pool: createPool(process.env.DATABASE_URL) } })
```

Every value decodes to the server's text, which Prisma 8's codecs read, and every session starts with
Prisma's settings (`DateStyle=ISO`, `lc_monetary=C`). Prisma checks a connection out for each statement;
this pool runs those statements as shared queries and holds a connection from `BEGIN` to the end of a
transaction. Cursors are not supported: Prisma reads the rows in one piece instead.
