#!/usr/bin/env bash
# Host ports of the test databases, shared by compose/*.yml (as ${DRIZZLE_PORT_*:-default}), compose/dockers.sh,
# compose/wait.sh and .github/ci/run-shard.sh. Source it; do not run it.
#
# Unset CI_PORT_OFFSET (local runs, GitHub-hosted runners) gives the documented default ports. A self-hosted
# runner instance sets it to 100 x its slot (.github/actions/runner-slot), and DRIZZLE_COMPOSE_SUFFIX then names
# its own compose projects, so jobs side by side on one machine each get their own containers. Its ports are not
# the defaults shifted: they are 20000 + offset + the port's index below, so every slot (1-99) gets its own block
# of 100 in 20100-29999. That range stays below Linux's ephemeral ports (32768-60999), which the defaults are in:
# runners that share Docker's network namespace (host networking) open outgoing connections from that range, and
# one of them holding a published port's number fails the next container that publishes it.
#
# Some servers are shared on a self-hosted machine instead (DRIZZLE_SHARED_DIALECTS): one long-lived container for
# all runner instances, on ports 20000 + index (the block no slot uses), never torn down by a job. Each job works
# in databases of its own on it, named with DRIZZLE_TEST_DB_PREFIX, which compose/dockers.sh creates and the test
# instrumentation recreates (integration-tests/tests/pg/instrumentation.ts testDatabase). It saves every job
# creating and initializing those containers: 20-35 s with all runners asking one Docker at once.

: "${CI_PORT_OFFSET:=0}"
export CI_PORT_OFFSET
if [ "$CI_PORT_OFFSET" -eq 0 ]; then
	export DRIZZLE_COMPOSE_SUFFIX=''
	export DRIZZLE_TEST_DB_PREFIX=''
else
	export DRIZZLE_COMPOSE_SUFFIX="-offset${CI_PORT_OFFSET}"
	export DRIZZLE_TEST_DB_PREFIX="s$((CI_PORT_OFFSET / 100))_"
fi

# Servers whose tests keep to databases of their own. Not the postgres16/17/18 servers: drizzle-kit's tests drop
# every role on those, and roles belong to the whole server.
DRIZZLE_SHARED_DIALECTS=(postgres postgres-postgis postgres-vector postgres-http-gateway aws-data-api)

drizzle_is_shared() {
	[ "$CI_PORT_OFFSET" -ne 0 ] || return 1
	local d
	for d in "${DRIZZLE_SHARED_DIALECTS[@]}"; do [ "$d" = "$1" ] && return 0; done
	return 1
}

# The compose project of a dialect: shared servers have one name per machine, the others one per runner instance.
drizzle_project() {
	if drizzle_is_shared "$1"; then echo "drizzle-shared-$1"; else echo "drizzle-$1${DRIZZLE_COMPOSE_SUFFIX}"; fi
}

# Each call's index is its position in the list below; append new ports at the end, so others keep theirs.
# A third argument, shared, puts the port in the shared servers' block.
_port() {
	if [ "$CI_PORT_OFFSET" -eq 0 ]; then echo "$1"
	elif [ "${3:-}" = shared ]; then echo $((20000 + $2))
	else echo $((20000 + CI_PORT_OFFSET + $2)); fi
}

export DRIZZLE_PORT_POSTGRES="$(_port 55433 0 shared)"
export DRIZZLE_PORT_POSTGRES16="$(_port 54323 1)"
export DRIZZLE_PORT_POSTGRES17="$(_port 54324 2)"
export DRIZZLE_PORT_POSTGRES18="$(_port 54325 3)"
export DRIZZLE_PORT_POSTGIS="$(_port 54322 4 shared)"
export DRIZZLE_PORT_VECTOR="$(_port 54321 5 shared)"
export DRIZZLE_PORT_HTTP_GATEWAY="$(_port 8080 6 shared)"
export DRIZZLE_PORT_AWS_DATA_API="$(_port 8081 7 shared)"
export DRIZZLE_PORT_NEON_PROXY="$(_port 4444 8)"
export DRIZZLE_PORT_NEON_POSTGRES="$(_port 54327 9)"
export DRIZZLE_PORT_TURSO="$(_port 8090 10)"
export DRIZZLE_PORT_MYSQL="$(_port 3306 11)"
export DRIZZLE_PORT_MARIADB="$(_port 33306 12)"
export DRIZZLE_PORT_SINGLESTORE="$(_port 33307 13)"
export DRIZZLE_PORT_SINGLESTORE_MANY0="$(_port 3308 14)"
export DRIZZLE_PORT_SINGLESTORE_MANY1="$(_port 3309 15)"
export DRIZZLE_PORT_SINGLESTORE_MANY2="$(_port 3310 16)"
export DRIZZLE_PORT_SINGLESTORE_MANY3="$(_port 3311 17)"
export DRIZZLE_PORT_MSSQL="$(_port 1433 18)"
export DRIZZLE_PORT_COCKROACH="$(_port 26257 19)"
export DRIZZLE_PORT_COCKROACH_CONSOLE="$(_port 18080 20)"
export DRIZZLE_PORT_COCKROACH_MANY0="$(_port 26260 21)"
export DRIZZLE_PORT_COCKROACH_MANY1="$(_port 26261 22)"
export DRIZZLE_PORT_COCKROACH_MANY2="$(_port 26262 23)"
export DRIZZLE_PORT_COCKROACH_MANY0_CONSOLE="$(_port 18081 24)"
export DRIZZLE_PORT_COCKROACH_MANY1_CONSOLE="$(_port 18082 25)"
export DRIZZLE_PORT_COCKROACH_MANY2_CONSOLE="$(_port 18083 26)"
export DRIZZLE_PORT_TURSO1="$(_port 8091 27)"
export DRIZZLE_PORT_TURSO2="$(_port 8092 28)"
export DRIZZLE_PORT_TURSO3="$(_port 8093 29)"
export DRIZZLE_PORT_TURSO4="$(_port 8094 30)"
