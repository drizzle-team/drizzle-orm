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

: "${CI_PORT_OFFSET:=0}"
export CI_PORT_OFFSET
if [ "$CI_PORT_OFFSET" -eq 0 ]; then
	export DRIZZLE_COMPOSE_SUFFIX=''
else
	export DRIZZLE_COMPOSE_SUFFIX="-offset${CI_PORT_OFFSET}"
fi

# Each call's index is its position in the list below; append new ports at the end, so others keep theirs.
_port() {
	if [ "$CI_PORT_OFFSET" -eq 0 ]; then echo "$1"; else echo $((20000 + CI_PORT_OFFSET + $2)); fi
}

export DRIZZLE_PORT_POSTGRES="$(_port 55433 0)"
export DRIZZLE_PORT_POSTGRES16="$(_port 54323 1)"
export DRIZZLE_PORT_POSTGRES17="$(_port 54324 2)"
export DRIZZLE_PORT_POSTGRES18="$(_port 54325 3)"
export DRIZZLE_PORT_POSTGIS="$(_port 54322 4)"
export DRIZZLE_PORT_VECTOR="$(_port 54321 5)"
export DRIZZLE_PORT_HTTP_GATEWAY="$(_port 8080 6)"
export DRIZZLE_PORT_AWS_DATA_API="$(_port 8081 7)"
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
