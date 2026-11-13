# drizzle-pulse

Drizzle Pulse streams row changes from PostgreSQL to consumers that subscribe to server-defined queries. It reads the changes from the PostgreSQL write-ahead log (WAL).

Drizzle Pulse needs Node.js 20 or newer and PostgreSQL with `wal_level` set to `logical`.

## Install

Install the package and its peer dependencies:

```bash
npm install drizzle-pulse drizzle-orm@rc
```

The package declares these peer dependencies:

1. `drizzle-orm`, version `^1.0.0-rc.6`. The PostgreSQL driver comes with it.
2. `react`, version `>=18.0.0`. This peer dependency is optional. Install it only to use `drizzle-pulse/client/react`.
3. `hono`, version `^4.6.0`. This peer dependency is optional. Install it only to use `drizzle-pulse/server/hono`.

Query arguments take a schema from any library that implements [Standard Schema](https://standardschema.dev), for example zod, Valibot or ArkType. The schema must validate synchronously.

To use your own Drizzle Postgres pool, from `drizzle-orm/postgres` or `@drizzle-team/postgres`, pass it as the optional `client` option of `createRuntime()` in place of `databaseUrl`.

## Documentation

The Realtime section of the Drizzle docs describes `drizzle-pulse` and `drizzle-pulse/embedded`: https://orm.drizzle.team/docs/realtime-overview

## Entrypoints without a stability promise

These entrypoints have no stability promise and no documentation. They can change in any 0.x release:

1. `drizzle-pulse/server`
2. `drizzle-pulse/server/hono`
3. `drizzle-pulse/client`
4. `drizzle-pulse/client/react`
5. `drizzle-pulse/client/embedded`

Pin the exact version of `drizzle-pulse` if your code imports one of them.
