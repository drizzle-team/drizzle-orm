# Postgres tests

CI runs the Postgres tests on PGlite, and again on each supported Postgres server (16, 17 and 18). On a server, only the test files named `*.versions.test.ts` run. The other files give the same result on every version, so they run once, on PGlite.

If a test file uses `prepareTestDatabase`, or reads `PG_VERSION`, name it `<name>.versions.test.ts`. Otherwise, name it `<name>.test.ts`.

To run the versioned files against one server, start that server and PostGIS from the repository root:

```sh
bash compose/dockers.sh up postgres16 postgres-postgis
```

Then run the tests from `drizzle-kit`:

```sh
PG_VERSION=16 PG16_URL=postgres://postgres:postgres@localhost:54323/drizzle \
  POSTGIS_URL=postgres://postgres:postgres@localhost:54322/drizzle pnpm vitest run ./postgres/
```

For Postgres 17 or 18, use `postgres17` and `PG17_URL` (port 54324), or `postgres18` and `PG18_URL` (port 54325).
