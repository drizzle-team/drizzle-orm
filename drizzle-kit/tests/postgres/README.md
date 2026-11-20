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

## Benchmarks

`ddl-diff-bench.test.ts` times `ddlDiff` on generated schemas. Each table has a serial primary key, 20 columns with defaults, a timestamp, two indexes and a foreign key to the previous table. It times three cases: an empty state to the full schema, the schema to an identical copy, and the schema to a copy with one column type changed in every table.

It is skipped unless `DDL_DIFF_BENCH=1`, so normal runs and CI only report it as skipped. Run it from `drizzle-kit`:

```sh
DDL_DIFF_BENCH=1 pnpm vitest run tests/postgres/ddl-diff-bench.test.ts
```

It prints the median time of each case for 100, 200 and 400 tables. Options:

- `DDL_DIFF_BENCH_TABLES=100,1000` sets the table counts.
- `DDL_DIFF_BENCH_RUNS=10` sets the runs per case (5 by default).
- `DDL_DIFF_PROFILE=ddl-diff.cpuprofile` also writes a CPU profile of one "empty -> full" diff of the largest size. Open it in Chrome DevTools (Performance tab) or in VS Code.

Compare times between runs on the same machine only.
