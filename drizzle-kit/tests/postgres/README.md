# Postgres tests

CI runs the Postgres tests once, on PGlite. A comparison of every test on PGlite and on Postgres 16, 17 and 18 gave the same results, so a run on each server adds nothing. Run that comparison again before you update PGlite or add a Postgres version to CI.

Some tests can exist only because Postgres versions behave differently. Name such a file `<name>.versions.test.ts`. With `PG_VERSION` set, vitest runs only these files, against the server of that version. To run them in CI, add the `kit:postgres16`, `kit:postgres17` and `kit:postgres18` shards to the test matrix in `.github/workflows/release-feature-branch.yaml`. `.github/ci/run-shard.sh` already has their commands.

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
