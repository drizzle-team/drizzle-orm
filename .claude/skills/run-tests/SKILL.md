---
name: run-tests
description: How to run, set up, or debug the drizzle-orm monorepo test suite — picking the right `pnpm test:*` target, ensuring `drizzle-kit/.env` exists, and bringing up the right Docker DBs via `bash compose/dockers.sh up` before any test that touches a database. Use this skill whenever the user asks to run tests, says "tests are failing" or "tests hang", asks why a `_CONNECTION_STRING` is undefined, asks how to start a postgres/mysql/cockroach/mssql/singlestore container for tests, mentions `compose/dockers.sh` or `compose/wait.sh`, or is about to invoke `pnpm test`, `pnpm test:postgres`, `pnpm test:mysql`, `pnpm test:cockroach`, `pnpm test:mssql`, `pnpm test:singlestore`, `pnpm test:other`, `vitest`, etc. — even if they don't explicitly say "skill" or "how to". Most failures here are environmental (missing `.env`, DB not running on the canonical port, wrong dialect started); follow this workflow first instead of debugging the test code.
---

# Running tests in drizzle-orm

This monorepo's tests fall into two buckets: **unit-style** (no DB, run anywhere) and **DB-backed** (need a real Postgres / MySQL / MariaDB / CockroachDB / MSSQL / SingleStore on a specific port). The DB-backed ones read connection-string env vars from `drizzle-kit/.env`, which itself maps to ports owned by `compose/*.yml`. If any of those three layers is missing — env file, DB container, port match — the test fails with a confusing error (most often `connect ECONNREFUSED` or `process.env.X is not set`). This skill is the fast path through the setup so the user doesn't waste time debugging environment instead of code.

## Workflow (always run in this order)

### 1. Ensure `drizzle-kit/.env` exists

The committed template is `drizzle-kit/.env.example`; the real file `drizzle-kit/.env` is gitignored and needs to exist for `dotenv/config` (loaded by `tests/{mariadb,mysql,singlestore}/pull.test.ts` and Vitest's built-in dotenv loader) to populate `process.env`.

```bash
[ -f drizzle-kit/.env ] || cp drizzle-kit/.env.example drizzle-kit/.env
```

Skip if `drizzle-kit/.env` already exists — never overwrite the user's local edits. If a test still says `process.env.X is not set` after this, look in `drizzle-kit/.env.example` to see whether the variable is even defined there; if not, the test is reading a key the example doesn't ship and that's a real bug.

### 2. Identify the test target and which DB(s) it needs

Pick the right script. Most users want one of these:

| Command | Cwd | Needs DB? | Compose dialect(s) | Env vars consumed |
|---|---|---|---|---|
| `pnpm --filter drizzle-kit test` | repo root | no | — | (TEST_CONFIG_PATH_PREFIX) |
| `pnpm --filter drizzle-kit test:types` | repo root | no | — | — |
| `pnpm --filter drizzle-kit test:postgres` | repo root | yes (PGlite by default) | none required; **set `PG_VERSION=16\|17\|18`** to use real postgres → then need `postgres16` / `postgres17` / `postgres18`; postgis subset → `postgres-postgis` | `PG_VERSION`, `PG16_URL`, `PG17_URL`, `PG18_URL`, `POSTGIS_URL` |
| `pnpm --filter drizzle-kit test:other` | repo root | yes (mysql subset) | `mysql` | `MYSQL_CONNECTION_STRING` |
| `pnpm --filter drizzle-kit test:cockroach` | repo root | yes | `cockroach` (or `cockroach-many` for `;`-separated multi-URL parallelism) | `COCKROACH_CONNECTION_STRING` |
| `pnpm --filter drizzle-kit test:mssql` | repo root | yes | `mssql` | `MSSQL_CONNECTION_STRING` |
| `pnpm --filter drizzle-kit test:singlestore` | repo root | yes | `singlestore` (see overload below) | `MYSQL_CONNECTION_STRING` |
| `pnpm --filter drizzle-orm test` | repo root | no | — | — |
| `pnpm --filter drizzle-orm test:types` | repo root | no | — | — |
| `pnpm --filter drizzle-seed test` | repo root | no | — | — |
| `pnpm --filter eslint-plugin-drizzle test` | repo root | no | — | — |
| `pnpm --filter integration-tests test:postgres` | repo root | yes | `postgres` (canonical compose port 55433) | `PG_CONNECTION_STRING` (NB: integration-tests has its own `.env`, not drizzle-kit's) |
| `pnpm --filter integration-tests test:mysql` | repo root | yes | `mysql` | `MYSQL_CONNECTION_STRING` |

Notes:
- `drizzle-kit test:postgres` runs against PGlite (in-process) **unless** `PG_VERSION` is set. If the user wants to test against real Postgres (e.g., to repro a production-only behavior), set `PG_VERSION=18` (or 17/16) AND have the matching `postgres18` dialect running.
- `drizzle-kit test:other` mixes pure-vitest sqlite/`other` tests with mysql tests — only the mysql portion needs Docker.
- `integration-tests` is a separate package with a separate `.env` (`integration-tests/.env`) and different port conventions — do not confuse the two .env files.

### 3. SingleStore overload — important footgun

`drizzle-kit/tests/singlestore/mocks.ts` reads **`MYSQL_CONNECTION_STRING`**, not a separate `SINGLESTORE_CONNECTION_STRING`. So when running `test:singlestore`, the user must:

- Comment the MySQL line in `drizzle-kit/.env`
- Uncomment the SingleStore line that points at `mysql://root:singlestore@127.0.0.1:33307/`

The `.env.example` documents this in a comment block. Don't try to "fix" this in the test code — the overload is intentional and documented as out-of-scope in the `.env.example` header. If the user is running `test:mysql` and `test:singlestore` back-to-back, remind them about the swap.

### 4. Bring up the DBs via `compose/dockers.sh`

Always use `compose/dockers.sh` — never let test mocks spin up Docker via `dockerode`, and never invent ad-hoc `docker run` commands. The script is the single source of truth for "which port is which dialect on", and each compose YAML carries the canonical healthcheck. Spawned subagents must be told this explicitly because they don't see this skill by default.

```bash
# Start exactly the dialects the test needs:
bash compose/dockers.sh up <dialect> [<dialect>...]

# Examples:
bash compose/dockers.sh up postgres                    # for PG_CONNECTION_STRING tests
bash compose/dockers.sh up postgres18                  # for PG_VERSION=18 ./postgres/ tests
bash compose/dockers.sh up mysql                       # for test:other (mysql subset) or test:mysql
bash compose/dockers.sh up cockroach                   # for test:cockroach
bash compose/dockers.sh up mssql                       # for test:mssql
bash compose/dockers.sh up singlestore                 # for test:singlestore (after .env swap)
bash compose/dockers.sh up postgres mysql cockroach    # multiple dialects in one go

# No-args = bring up every supported dialect (postgres, postgres16/17/18, postgres-postgis,
# postgres-vector, mysql, mariadb, cockroach, cockroach-many, mssql, singlestore, singlestore-many).
# Heavy on macOS — ~10GB RAM peak. Prefer naming the dialects you actually need.
bash compose/dockers.sh up
```

The `up` subcommand runs `docker compose ... up -d --wait --wait-timeout 120` and then `bash compose/wait.sh <dialect>` so the script returns only after the host-side TCP probe succeeds. **Tests are safe to launch immediately after the script returns.** No `sleep` loops needed.

If `bash compose/dockers.sh up <dialect>` reports `Unknown dialect '...'`, the dialect name is wrong; the script prints the valid list. Common mistakes: `postgres-15` (doesn't exist — only 16/17/18), `singlestore2` (use `singlestore-many`).

### 5. Run the test

After `dockers.sh up` returns:

```bash
pnpm --filter <package> <script>     # e.g., pnpm --filter drizzle-kit test:cockroach
```

Run from the repo root with `--filter`; this respects pnpm workspaces and avoids cwd bugs. Internally each package's test:* script invokes `vitest run`, which auto-loads `.env` files from the package directory.

### 6. Tear down (optional)

```bash
bash compose/dockers.sh down <dialect>     # one dialect, wipes its volumes
bash compose/dockers.sh down               # all dialects
```

`down` uses `-v` to wipe volumes — test DBs are ephemeral and `mocks.ts` `clear()` recreates the schema each run, so persistent volumes have no value here. Leaving DBs running between iterations is fine and the common workflow during active development.

## Common failure patterns and the fix

| Symptom | Likely cause | Fix |
|---|---|---|
| `process.env.PG18_URL is not set` (or any `_URL`/`_CONNECTION_STRING`) | `drizzle-kit/.env` missing or env var commented out | Run step 1; check the line is uncommented in `drizzle-kit/.env` |
| `connect ECONNREFUSED 127.0.0.1:55433` (or any port) | DB container not running, or running on the wrong port | `bash compose/dockers.sh up <dialect>`; if it's already up, check `bash compose/dockers.sh ps <dialect>` shows it healthy on the expected port |
| Tests hang after starting | Older `dockers.sh` was inline `docker run` with mismatched ports — `git pull` first; the new dispatcher gates on `wait.sh` | `git status` to confirm `compose/dockers.sh` is the dispatcher form, not the old inline form |
| Singlestore tests connect to MySQL | `MYSQL_CONNECTION_STRING` still points at mysql:3306 | Swap the env var per step 3 (singlestore overload) |
| `port is already allocated` from `compose up` | Previous container left bound | `bash compose/dockers.sh down <dialect>` then re-up; or `docker ps` to find the stray container |
| `EACCES`/permission errors writing tests/postgres/tmp | Stale tmp dir owned by docker | `rm -rf drizzle-kit/tests/<dialect>/tmp/` and re-run |

## Quick reference: dialect → port → image

| Dialect | Port | Image | Compose file |
|---|---|---|---|
| postgres | 55433 | postgres:17-alpine | compose/postgres.yml |
| postgres16 | 54323 | pgvector/pgvector:pg16 | compose/postgres16.yml |
| postgres17 | 54324 | pgvector/pgvector:pg17 | compose/postgres17.yml |
| postgres18 | 54325 | pgvector/pgvector:pg18 | compose/postgres18.yml |
| postgres-postgis | 54322 | postgis/postgis:16-3.4 | compose/postgres-postgis.yml |
| postgres-vector | 54321 | pgvector/pgvector:pg16 | compose/postgres-vector.yml |
| mysql | 3306 | mysql:8 | compose/mysql.yml |
| mariadb | 33306 | mariadb:11.8 | compose/mariadb.yml |
| cockroach | 26257 | cockroachdb/cockroach:v25.2.0 | compose/cockroach.yml |
| cockroach-many | 26260–26262 | (3× cockroach) | compose/cockroach-many.yml |
| mssql | 1433 | mcr.microsoft.com/azure-sql-edge | compose/mssql.yml |
| singlestore | 33307 | singlestoredb-dev:0.2.67 | compose/singlestore.yml |
| singlestore-many | 3308–3311 | (4× singlestoredb-dev) | compose/singlestore-many.yml |

For the connection-string format that pairs with each port, copy the matching line from `drizzle-kit/.env.example` — it's the source of truth and tracks every port/credential change.
