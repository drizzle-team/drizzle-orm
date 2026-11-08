#!/usr/bin/env bash
# Host ports of the test databases, shared by compose/*.yml (as ${DRIZZLE_PORT_*:-default}), compose/dockers.sh,
# compose/wait.sh and .github/ci/run-shard.sh. Source it; do not run it.
#
# CI_PORT_OFFSET shifts every port, and DRIZZLE_COMPOSE_SUFFIX names a separate set of compose projects, so
# several CI jobs on one machine (the instances of a self-hosted runner) each get their own containers. Unset
# (local runs, GitHub-hosted runners), the ports are the documented defaults. Offsets are multiples of 100,
# which keeps every port distinct from the others' shifted ones.

: "${CI_PORT_OFFSET:=0}"
export CI_PORT_OFFSET
if [ "$CI_PORT_OFFSET" -eq 0 ]; then
	export DRIZZLE_COMPOSE_SUFFIX=''
else
	export DRIZZLE_COMPOSE_SUFFIX="-offset${CI_PORT_OFFSET}"
fi

_port() { echo $(($1 + CI_PORT_OFFSET)); }

export DRIZZLE_PORT_POSTGRES="$(_port 55433)"
export DRIZZLE_PORT_POSTGRES16="$(_port 54323)"
export DRIZZLE_PORT_POSTGRES17="$(_port 54324)"
export DRIZZLE_PORT_POSTGRES18="$(_port 54325)"
export DRIZZLE_PORT_POSTGIS="$(_port 54322)"
export DRIZZLE_PORT_VECTOR="$(_port 54321)"
export DRIZZLE_PORT_HTTP_GATEWAY="$(_port 8080)"
export DRIZZLE_PORT_AWS_DATA_API="$(_port 8081)"
export DRIZZLE_PORT_NEON_PROXY="$(_port 4444)"
export DRIZZLE_PORT_NEON_POSTGRES="$(_port 54327)"
export DRIZZLE_PORT_TURSO="$(_port 8090)"
export DRIZZLE_PORT_MYSQL="$(_port 3306)"
export DRIZZLE_PORT_MARIADB="$(_port 33306)"
export DRIZZLE_PORT_SINGLESTORE="$(_port 33307)"
export DRIZZLE_PORT_SINGLESTORE_MANY0="$(_port 3308)"
export DRIZZLE_PORT_SINGLESTORE_MANY1="$(_port 3309)"
export DRIZZLE_PORT_SINGLESTORE_MANY2="$(_port 3310)"
export DRIZZLE_PORT_SINGLESTORE_MANY3="$(_port 3311)"
export DRIZZLE_PORT_MSSQL="$(_port 1433)"
export DRIZZLE_PORT_COCKROACH="$(_port 26257)"
export DRIZZLE_PORT_COCKROACH_CONSOLE="$(_port 18080)"
export DRIZZLE_PORT_COCKROACH_MANY0="$(_port 26260)"
export DRIZZLE_PORT_COCKROACH_MANY1="$(_port 26261)"
export DRIZZLE_PORT_COCKROACH_MANY2="$(_port 26262)"
export DRIZZLE_PORT_COCKROACH_MANY0_CONSOLE="$(_port 18081)"
export DRIZZLE_PORT_COCKROACH_MANY1_CONSOLE="$(_port 18082)"
export DRIZZLE_PORT_COCKROACH_MANY2_CONSOLE="$(_port 18083)"
