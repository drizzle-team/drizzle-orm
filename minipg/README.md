# @drizzle-team/minipg

> [!WARNING]
> Internal Drizzle Team package. Not supported for outside use. Breaking changes can land
> without notice.

A minimal, dependency-free PostgreSQL driver for Node, Bun, Deno, and Cloudflare Workers. It
covers the wire protocol directly and ships as ESM only, with 18 subpath entry points for
each supported runtime and adapter.

## Install

```bash
pnpm add @drizzle-team/minipg
```

```bash
npm install @drizzle-team/minipg
```

```bash
bun add @drizzle-team/minipg
```

## Usage

The example below queries a local cluster. From a checkout of this repo, provision one with:

```bash
bun run test:setup
```

That starts Postgres on `127.0.0.1:54329` with a `testdb` database and a seeded table `t`. It uses
local PostgreSQL binaries when `initdb`/`pg_ctl` are on PATH and a Docker container otherwise (force
either with `MINIPG_PG_MODE=native|docker`; remove the container with `docker rm -f minipg-test-pg`).
Any other Postgres works too — point the config below at it.

```js
import { connect } from '@drizzle-team/minipg'

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
precision.

Built-in array columns (`int4[]`, `text[]`, `jsonb[]`, `timestamptz[]`, …) decode to JS
arrays, with each element following the scalar rules above — so `int8[]` yields `BigInt`s
and `numeric[]` yields exact strings. Arrays whose element type has a per-database OID
(`enum[]`, `domain[]`, composite arrays) can't be recognised from the wire OID alone and
still arrive as the raw `{…}` literal; declare a `shape` for those. To opt back out for a
given type, override its array OID in `types` (e.g. `types: { 1007: (b) => b.toString() }`).

## Runtimes

The root import picks its TCP transport from the runtime, so the same line works everywhere:

| Runtime | `@drizzle-team/minipg` resolves to | Transport |
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
`@drizzle-team/minipg/http`, `/neon-http` or `/neon-ws` there.

To force a transport, or when a bundler does not apply runtime conditions, import the explicit
entry: `@drizzle-team/minipg/node`, `/cf` or `/deno`. Each exposes the same API as the root.
`/core` has no transport at all; pass `config.transport` or `config.socket`.

## Effect

`@drizzle-team/minipg/effect` implements Effect's `SqlClient` on top of the minipg pool, and its layers
include the transport of each runtime. See [src/effect/README.md](src/effect/README.md) for
setup, runtimes and examples.
