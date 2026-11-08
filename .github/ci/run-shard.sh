#!/usr/bin/env bash
# Runs one CI test shard: bash .github/ci/run-shard.sh <shard>
#
# Shared by every runner (GitHub-hosted and self-hosted). The workflow passes secrets and, for fork pull
# requests, SKIP_EXTERNAL_DB_TESTS=1 through the environment; the local database URLs below match the ports in
# compose/*.yml and can be overridden the same way.
set -euo pipefail

shard="${1:?usage: run-shard.sh <shard>}"
cd "$(dirname "$0")/../../integration-tests"

: "${PG_CONNECTION_STRING:=postgres://postgres:postgres@localhost:55433/drizzle}"
: "${PG_HTTP_GATEWAY_URL:=http://localhost:8080/query}"
: "${AWS_DATA_API_URL:=http://localhost:8081}"
: "${PG_VECTOR_CONNECTION_STRING:=postgres://postgres:postgres@localhost:54321/drizzle}"
: "${PG_POSTGIS_CONNECTION_STRING:=postgres://postgres:postgres@localhost:54322/drizzle}"
: "${PG18_URL:=postgres://postgres:postgres@localhost:54325/drizzle}"
: "${PG17_URL:=postgres://postgres:postgres@localhost:54324/drizzle}"
: "${PG16_URL:=postgres://postgres:postgres@localhost:54323/drizzle}"
: "${POSTGIS_URL:=postgres://postgres:postgres@localhost:54322/drizzle}"
: "${MYSQL_CONNECTION_STRING:=mysql://root:mysql@localhost:3306/drizzle}"
: "${LIBSQL_URL:=file:local.db}"
: "${SINGLESTORE_CONNECTION_STRING:=singlestore://root:singlestore@localhost:33307/}"
: "${SINGLESTORE_MANY_CONNECTION_STRING:=singlestore://root:singlestore@localhost:3308/;singlestore://root:singlestore@localhost:3309/;singlestore://root:singlestore@localhost:3310/;singlestore://root:singlestore@localhost:3311/}"
: "${COCKROACH_CONNECTION_STRING:=postgresql://root@127.0.0.1:26257/defaultdb?sslmode=disable}"
: "${MSSQL_CONNECTION_STRING:=mssql://SA:drizzle123PASSWORD!@localhost:1433?encrypt=true&trustServerCertificate=true}"
: "${TEST_CONFIG_PATH_PREFIX:=./tests/cli/}"
export PG_CONNECTION_STRING PG_HTTP_GATEWAY_URL AWS_DATA_API_URL PG_VECTOR_CONNECTION_STRING PG_POSTGIS_CONNECTION_STRING \
	PG18_URL PG17_URL PG16_URL POSTGIS_URL MYSQL_CONNECTION_STRING LIBSQL_URL SINGLESTORE_CONNECTION_STRING \
	SINGLESTORE_MANY_CONNECTION_STRING COCKROACH_CONNECTION_STRING MSSQL_CONNECTION_STRING TEST_CONFIG_PATH_PREFIX

# Per-job hosted databases (scripts/ci-databases.ts create) write their connection strings here.
if [[ -n "${RUNNER_TEMP:-}" && -f "$RUNNER_TEMP/ci-databases.env" ]]; then
	# shellcheck disable=SC1091
	source "$RUNNER_TEMP/ci-databases.env"
fi

external() { [[ -z "${SKIP_EXTERNAL_DB_TESTS:-}" ]]; }

set -x
case "$shard" in
	int:singlestore) pnpm --stream vitest --reporter=verbose --silent=false run ./singlestore/singlestore-prefixed.test.ts ./singlestore/singlestore-custom.test.ts ;;
	int:singlestore-core) pnpm --stream vitest --reporter=verbose --silent=false run ./singlestore/singlestore.test.ts ;;
	int:singlestore-proxy) pnpm --stream vitest --reporter=verbose --silent=false run ./singlestore/singlestore-proxy.test.ts ;;
	# Uses local Postgres; hosted providers are excluded by the test config/script.
	int:postgres) pnpm --stream test:postgres ;;
	# Neon's proxy over a local Postgres (compose/neon.yml); the test setup switches the drivers to it for this host.
	# NEON_LOCAL=1 makes any request that is not for the local proxy throw. Files run one after another: the
	# local proxy is a debug build, and running them in parallel overloaded it (60 s hook timeouts).
	int:neon)
		NEON_LOCAL=1 \
			NEON_CONNECTION_STRING=postgres://postgres:postgres@db.localtest.me:5432/main \
			NETLIFY_DB_URL=postgres://postgres:postgres@db.localtest.me:5432/main \
			pnpm --stream test:neon
		;;
	int:mysql) pnpm --stream test:mysql ;;
	int:tidb) if external; then pnpm --stream vitest --reporter=verbose --silent=false tests/mysql/tidb; fi ;;
	int:planetscale) if external; then pnpm --stream test:planetscale; fi ;;
	int:cockroach) pnpm --stream test:cockroach ;;
	int:cockroach-rqb) pnpm --stream test:cockroach-rqb ;;
	int:mssql) pnpm --stream vitest --reporter=verbose --silent=false run tests/mssql ;;
	int:sqlite) pnpm --stream test:sqlite ;;
	int:turso-serverless)
		if external; then
			pnpm --stream vitest --reporter=verbose --silent=false --test-timeout=200000 --hook-timeout=200000 run tests/sqlite/tursodatabase-serverless.test.ts
		fi
		;;
	kit:other) cd ../drizzle-kit && pnpm --stream run test:other ;;
	kit:postgres) cd ../drizzle-kit && pnpm --stream run test:postgres ;;
	kit:postgres18) cd ../drizzle-kit && PG_VERSION=18 pnpm --stream run test:postgres ;;
	kit:postgres17) cd ../drizzle-kit && PG_VERSION=17 pnpm --stream run test:postgres ;;
	kit:postgres16) cd ../drizzle-kit && PG_VERSION=16 pnpm --stream run test:postgres ;;
	kit:cockroach) cd ../drizzle-kit && pnpm --stream run test:cockroach ;;
	kit:mssql) cd ../drizzle-kit && pnpm --stream run test:mssql ;;
	validators) pnpm --stream vitest --reporter=verbose --silent=false run tests/validators ;;
	orm | seed) (cd "../drizzle-$shard" && pnpm --stream test --reporter=verbose --silent=false) ;;
	int:bun) bun test ./tests/bun/ ;;
	int:seeder) pnpm --stream test:seeder ;;
	int:imports) pnpm --stream test:imports ;;
	int:other) pnpm --stream test:other ;;
	*) echo "Unknown shard: $shard" >&2; exit 1 ;;
esac
