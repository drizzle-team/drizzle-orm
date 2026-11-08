#!/usr/bin/env bash
# Runs CI test shards: bash .github/ci/run-shard.sh <shard>[+<shard>...]
#
# Several shards joined with + run in one job, one after another: short shards share a job's setup (checkout,
# install, databases, build output) and a runner, instead of each taking one of a machine's few. Each runs in a
# subshell, as some cd elsewhere; all run, and the job fails if any did.
#
# Shared by every runner (GitHub-hosted and self-hosted). The workflow passes secrets and, for fork pull
# requests, SKIP_EXTERNAL_DB_TESTS=1 through the environment; the local database URLs below match the ports in
# compose/*.yml and can be overridden the same way.
set -euo pipefail

shards="${1:?usage: run-shard.sh <shard>[+<shard>...]}"
# Addresses of the databases compose/dockers.sh started: on CI their containers' own IPs (drizzle_addr), elsewhere
# the published ports (shifted by CI_PORT_OFFSET on a self-hosted runner instance).
# shellcheck source=compose/ports.sh
source "$(dirname "$0")/../../compose/ports.sh"
cd "$(dirname "$0")/../../integration-tests"

# On a self-hosted machine the Postgres, PostGIS and pgvector servers are shared, and this job's databases on them
# carry DRIZZLE_TEST_DB_PREFIX (compose/ports.sh); empty elsewhere.
: "${PG_CONNECTION_STRING:=postgres://postgres:postgres@$(drizzle_addr postgres postgres 5432 "$DRIZZLE_PORT_POSTGRES")/${DRIZZLE_TEST_DB_PREFIX}drizzle}"
: "${PG_HTTP_GATEWAY_URL:=http://$(drizzle_addr postgres-http-gateway postgres-http-gateway 8080 "$DRIZZLE_PORT_HTTP_GATEWAY")/query}"
: "${AWS_DATA_API_URL:=http://$(drizzle_addr aws-data-api aws-data-api 80 "$DRIZZLE_PORT_AWS_DATA_API")}"
: "${PG_VECTOR_CONNECTION_STRING:=postgres://postgres:postgres@$(drizzle_addr postgres-vector postgres-vector 5432 "$DRIZZLE_PORT_VECTOR")/${DRIZZLE_TEST_DB_PREFIX}drizzle}"
: "${PG_POSTGIS_CONNECTION_STRING:=postgres://postgres:postgres@$(drizzle_addr postgres-postgis postgres-postgis 5432 "$DRIZZLE_PORT_POSTGIS")/${DRIZZLE_TEST_DB_PREFIX}drizzle}"
: "${PG18_URL:=postgres://postgres:postgres@$(drizzle_addr postgres18 postgres 5432 "$DRIZZLE_PORT_POSTGRES18")/drizzle}"
: "${PG17_URL:=postgres://postgres:postgres@$(drizzle_addr postgres17 postgres 5432 "$DRIZZLE_PORT_POSTGRES17")/drizzle}"
: "${PG16_URL:=postgres://postgres:postgres@$(drizzle_addr postgres16 postgres 5432 "$DRIZZLE_PORT_POSTGRES16")/drizzle}"
: "${POSTGIS_URL:=postgres://postgres:postgres@$(drizzle_addr postgres-postgis postgres-postgis 5432 "$DRIZZLE_PORT_POSTGIS")/${DRIZZLE_TEST_DB_PREFIX}drizzle}"
: "${MYSQL_CONNECTION_STRING:=mysql://root:mysql@$(drizzle_addr mysql mysql 3306 "$DRIZZLE_PORT_MYSQL")/drizzle}"
# compose/planetscale.yml's simulator; is-config.test.ts (int:other) only builds a client from it.
: "${PLANETSCALE_CONNECTION_STRING:=http://root:planetscale@$(drizzle_addr planetscale planetscale-mysql 3900 "$DRIZZLE_PORT_PLANETSCALE")}"
# In memory, as in local runs: a database file costs an fsync per write, which on a runner whose work folder is a
# shared volume made the three libsql suites take ~15 minutes between them.
: "${LIBSQL_URL:=file::memory:?cache=shared}"
: "${COCKROACH_CONNECTION_STRING:=postgresql://root@$(drizzle_addr cockroach cockroach 26257 "$DRIZZLE_PORT_COCKROACH")/defaultdb?sslmode=disable}"
: "${MSSQL_CONNECTION_STRING:=mssql://SA:drizzle123PASSWORD!@$(drizzle_addr mssql mssql 1433 "$DRIZZLE_PORT_MSSQL")?encrypt=true&trustServerCertificate=true}"
: "${TEST_CONFIG_PATH_PREFIX:=./tests/cli/}"
# Dates in UTC, as on GitHub-hosted runners: drivers that send local time (tedious for SQL Server) put boundary
# values such as 9999-12-31T23:59:59.997Z out of the type's range on a machine ahead of UTC.
export TZ=UTC
export PG_CONNECTION_STRING PG_HTTP_GATEWAY_URL AWS_DATA_API_URL PG_VECTOR_CONNECTION_STRING PG_POSTGIS_CONNECTION_STRING \
	PG18_URL PG17_URL PG16_URL POSTGIS_URL MYSQL_CONNECTION_STRING PLANETSCALE_CONNECTION_STRING LIBSQL_URL \
	COCKROACH_CONNECTION_STRING MSSQL_CONNECTION_STRING TEST_CONFIG_PATH_PREFIX

# Per-job hosted databases (scripts/ci-databases.ts create) write their connection strings here.
if [[ -n "${RUNNER_TEMP:-}" && -f "$RUNNER_TEMP/ci-databases.env" ]]; then
	# shellcheck disable=SC1091
	source "$RUNNER_TEMP/ci-databases.env"
fi

external() { [[ -z "${SKIP_EXTERNAL_DB_TESTS:-}" ]]; }

set -x
run_shard() {
	local shard="$1"
	case "$shard" in
		# Uses local Postgres; hosted providers are excluded by the test config/script.
		int:postgres) pnpm --stream test:postgres ;;
		# Neon's proxy over a local Postgres (compose/neon.yml); the test setup switches the drivers to it for this host.
		# NEON_LOCAL=1 makes any request that is not for the local proxy throw. Files run one after another: the
		# local proxy is a debug build, and running them in parallel overloaded it (60 s hook timeouts).
		int:neon)
			NEON_LOCAL=1 NEON_LOCAL_PROXY_PORT="$DRIZZLE_PORT_NEON_PROXY" \
				NEON_CONNECTION_STRING=postgres://postgres:postgres@db.localtest.me:${DRIZZLE_PORT_NEON_POSTGRES}/main \
				NETLIFY_DB_URL=postgres://postgres:postgres@db.localtest.me:${DRIZZLE_PORT_NEON_POSTGRES}/main \
				pnpm --stream test:neon
			;;
		int:mysql) pnpm --stream test:mysql ;;
		int:tidb) if external; then pnpm --stream vitest --reporter=verbose --silent=false tests/mysql/tidb; fi ;;
		# Against this job's own PlanetScale HTTP API simulator over MySQL (compose/planetscale.yml).
		int:planetscale)
			pnpm --stream test:planetscale
			;;
		int:cockroach) pnpm --stream test:cockroach ;;
		int:cockroach-rqb) pnpm --stream test:cockroach-rqb ;;
		int:mssql) pnpm --stream vitest --reporter=verbose --silent=false run tests/mssql ;;
		int:sqlite) pnpm --stream test:sqlite ;;
		# Against this job's own Turso servers (compose/turso.yml), which take no auth token: one per concurrent test.
		int:turso-serverless)
			urls="" tokens=""
			local i port_var
			for i in 0 1 2 3 4; do
				port_var="DRIZZLE_PORT_TURSO$([ "$i" = 0 ] || echo "$i")"
				urls="${urls}http://$(drizzle_addr turso "turso$i" 8080 "${!port_var}");" tokens="${tokens}local;"
			done
			TURSODATABASE_REMOTE_URL="$urls" TURSODATABASE_REMOTE_TOKEN="$tokens" \
				pnpm --stream vitest --reporter=verbose --silent=false --test-timeout=200000 --hook-timeout=200000 \
				run tests/sqlite/tursodatabase-serverless.test.ts
			;;
		kit:other) cd ../drizzle-kit && pnpm --stream run test:other ;;
		# The commutativity suite runs once, in kit:postgres:commutativity, against the latest stable Postgres (18).
		kit:postgres) cd ../drizzle-kit && KIT_POSTGRES_SUITE=main pnpm --stream run test:postgres ;;
		kit:postgres18) cd ../drizzle-kit && KIT_POSTGRES_SUITE=main PG_VERSION=18 pnpm --stream run test:postgres ;;
		kit:postgres17) cd ../drizzle-kit && KIT_POSTGRES_SUITE=main PG_VERSION=17 pnpm --stream run test:postgres ;;
		kit:postgres16) cd ../drizzle-kit && KIT_POSTGRES_SUITE=main PG_VERSION=16 pnpm --stream run test:postgres ;;
		kit:postgres:commutativity)
			cd ../drizzle-kit && KIT_POSTGRES_SUITE=commutativity PG_VERSION=18 pnpm --stream vitest run postgres/commutativity
			;;
		# Three test files at once, each worker on a cockroach-many server of its own (tests/cockroach/mocks.ts picks it
		# by VITEST_POOL_ID; the setup drops every role, which belongs to the whole server). CockroachDB DDL mostly
		# waits on schema change jobs, not CPU: 218 s of tests this way, 309 s one file at a time.
		kit:cockroach)
			cd ../drizzle-kit
			local i port_var urls=""
			for i in 0 1 2; do
				port_var="DRIZZLE_PORT_COCKROACH_MANY$i"
				urls="${urls}postgresql://root@$(drizzle_addr cockroach-many "cockroach$i" 26257 "${!port_var}")/defaultdb?sslmode=disable;"
			done
			COCKROACH_CONNECTION_STRING="$urls" KIT_FILE_PARALLELISM=1 KIT_MAX_WORKERS=3 pnpm --stream run test:cockroach
			;;
		kit:mssql) cd ../drizzle-kit && pnpm --stream run test:mssql ;;
		validators) pnpm --stream vitest --reporter=verbose --silent=false run tests/validators ;;
		orm | seed) (cd "../drizzle-$shard" && pnpm --stream test --reporter=verbose --silent=false) ;;
		# bun test's default 5 s per test and hook is too little for a busy runner: a hook cut off between dropping and
		# recreating a schema fails every test after it.
		int:bun) bun test --timeout 60000 ./tests/bun/ ;;
		int:seeder) pnpm --stream test:seeder ;;
		int:imports) pnpm --stream test:imports ;;
		int:other) pnpm --stream test:other ;;
		*) echo "Unknown shard: $shard" >&2; exit 1 ;;
	esac
}

failed=()
IFS='+' read -ra shard_list <<<"$shards"
for shard in "${shard_list[@]}"; do
	echo "::group::shard $shard"
	# In the background and waited for, not in an if: a condition turns off set -e for all it runs, subshells too,
	# and a shard would go on after a failed command.
	run_shard "$shard" &
	if ! wait "$!"; then failed+=("$shard"); fi
	echo "::endgroup::"
done
if ((${#failed[@]})); then
	echo "::error::Failed shards: ${failed[*]}"
	exit 1
fi
