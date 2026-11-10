#!/usr/bin/env bash
set -euo pipefail

# Host ports and project names; CI_PORT_OFFSET gives a self-hosted runner instance its own set.
# shellcheck source=compose/ports.sh
source "$(dirname "${BASH_SOURCE[0]}")/ports.sh"

ALL_IMAGES=(
  postgres
  postgres16
  postgres17
  postgres18
  postgres-postgis
  postgres-vector
  mysql
  mariadb
  cockroach
  cockroach-many
  mssql
  singlestore
  singlestore-many
  postgres-http-gateway
  aws-data-api
  neon
  turso
  planetscale
  upstash
)

_resolve_compose_file() {
  case "$1" in
    postgres)         echo "postgres.yml" ;;
    postgres16)       echo "postgres16.yml" ;;
    postgres17)       echo "postgres17.yml" ;;
    postgres18)       echo "postgres18.yml" ;;
    postgres-postgis) echo "postgres-postgis.yml" ;;
    postgres-vector)  echo "postgres-vector.yml" ;;
    mysql)            echo "mysql.yml" ;;
    mariadb)          echo "mariadb.yml" ;;
    cockroach)        echo "cockroach.yml" ;;
    cockroach-many)   echo "cockroach-many.yml" ;;
    mssql)            echo "mssql.yml" ;;
    singlestore)      echo "singlestore.yml" ;;
    singlestore-many) echo "singlestore-many.yml" ;;
    postgres-http-gateway) echo "postgres-http-gateway.yml" ;;
    aws-data-api)     echo "aws-data-api.yml" ;;
    neon)             echo "neon.yml" ;;
    turso)            echo "turso.yml" ;;
    planetscale)      echo "planetscale.yml" ;;
    upstash)          echo "upstash.yml" ;;
    *)
      echo "Unknown image '$1'. Valid images: ${ALL_IMAGES[*]}" >&2
      return 1
      ;;
  esac
}

_compose() {
  local image="$1"; shift
  local file
  file="$(_resolve_compose_file "$image")"
  docker compose -p "$(drizzle_project "$image")" -f "compose/${file}" "$@"
}

_up_one() {
  local image="$1"
  if drizzle_is_shared "$image"; then
    _up_shared "$image"
    return
  fi
  # A CI runner slot (CI_PORT_OFFSET set) first removes what a canceled or killed job on the same slot left
  # behind: its containers keep the ports. Never locally, where the default projects hold a developer's data.
  if [ "$CI_PORT_OFFSET" -ne 0 ]; then
    _compose "$image" down -v --remove-orphans --timeout 0 >/dev/null 2>&1 || true
  fi
  # Readiness is compose/wait.sh's probe from the host, not `up --wait`: some images' own healthchecks call
  # tools they do not ship (nc in cockroach and azure-sql-edge), so those containers never report healthy.
  _compose "$image" up -d
  bash compose/wait.sh "$image"
}

# A server all runner instances share (compose/ports.sh): started by the first job that needs it and left running.
# `up -d` leaves a running container as it is, so for every later job this is a check, not a start. Jobs that
# start it at the same moment race to create the container; the losers' `up` fails and their retry finds it.
_up_shared() {
  local image="$1" attempt
  for attempt in 1 2 3 4 5; do
    _compose "$image" up -d --no-recreate >/dev/null 2>&1 && break
    [ "$attempt" -eq 5 ] && { _compose "$image" up -d --no-recreate; return 1; }
    sleep $((attempt * 2))
  done
  bash compose/wait.sh "$image"
  _recreate_job_database "$image"
}

# This job's database on a shared Postgres server, the one run-shard.sh's connection strings name: dropped and
# created, so the job starts from an empty one whatever the slot's last job left. The PostGIS server's comes from
# its template_postgis, with the extensions its image installs.
_recreate_job_database() {
  local image="$1" template="" cid db attempt err
  case "$image" in
    postgres|postgres-vector) ;;
    postgres-postgis) template=" template template_postgis" ;;
    *) return 0 ;;
  esac
  db="${DRIZZLE_TEST_DB_PREFIX}drizzle"
  err="$(mktemp)"
  cid="$(docker ps -q --filter "label=com.docker.compose.project=$(drizzle_project "$image")" | head -n 1)"
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    # 55006 (object_in_use): other jobs copying the same template at that moment; it clears in milliseconds.
    if docker exec "$cid" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
      -c "drop database if exists \"$db\" with (force)" -c "create database \"$db\"$template" 2>"$err"; then
      echo "$image: database $db recreated"
      rm -f "$err"
      return 0
    fi
    grep -q "being accessed by other users" "$err" || { cat "$err" >&2; rm -f "$err"; return 1; }
    sleep 0.$attempt
  done
  cat "$err" >&2
  rm -f "$err"
  return 1
}

# This job's databases on a shared Postgres server: the main one and those the tests created, all named with
# DRIZZLE_TEST_DB_PREFIX. Dropped when the job ends, as the server keeps its data in memory.
_drop_job_databases() {
  local image="$1" cid db
  if [ "$image" = mssql ]; then
    # Its tests drop their databases when they finish; this catches those a failed or killed file left.
    node compose/mssql.mjs drop-prefixed "$DRIZZLE_TEST_DB_PREFIX" || true
    return 0
  fi
  case "$image" in postgres|postgres-vector|postgres-postgis) ;; *) return 0 ;; esac
  cid="$(docker ps -q --filter "label=com.docker.compose.project=$(drizzle_project "$image")" | head -n 1)"
  [ -n "$cid" ] || return 0
  for db in $(docker exec "$cid" psql -U postgres -d postgres -Atc \
    "select datname from pg_database where starts_with(datname, '${DRIZZLE_TEST_DB_PREFIX}')"); do
    docker exec "$cid" psql -U postgres -d postgres -q -c "drop database if exists \"$db\" with (force)" || true
  done
}

_down_one() {
  local image="$1"
  # Shared servers stay up for the next job; only this job's databases go.
  if drizzle_is_shared "$image"; then
    _drop_job_databases "$image"
    return 0
  fi
  # No grace period: the data is throwaway, in memory. SQL Server and CockroachDB took Docker's default 10 s to stop,
  # which every job using them waited at its end.
  _compose "$image" down -v --timeout 0
}

_ps_one() {
  local image="$1"
  _compose "$image" ps
}

_validate_all() {
  local image
  for image in "$@"; do
    _resolve_compose_file "$image" >/dev/null
  done
}

cmd_up() {
  if [ "$#" -eq 0 ]; then
    set -- "${ALL_IMAGES[@]}"
  else
    _validate_all "$@"
  fi
  # Images start in parallel; up returns once every one is healthy, and fails if any did not come up.
  local image pids=() failed=0
  for image in "$@"; do
    _up_one "$image" &
    pids+=("$!")
  done
  local pid
  for pid in "${pids[@]}"; do
    wait "$pid" || failed=1
  done
  return "$failed"
}

cmd_down() {
  if [ "$#" -eq 0 ]; then
    set -- "${ALL_IMAGES[@]}"
  else
    _validate_all "$@"
  fi
  local image
  for image in "$@"; do
    _down_one "$image"
  done
}

cmd_ps() {
  if [ "$#" -eq 0 ]; then
    set -- "${ALL_IMAGES[@]}"
  else
    _validate_all "$@"
  fi
  local image
  for image in "$@"; do
    _ps_one "$image"
  done
}

cmd_logs() {
  if [ "$#" -ne 1 ]; then
    echo "Usage: bash compose/dockers.sh logs <image>" >&2
    return 1
  fi
  _validate_all "$1"
  _compose "$1" logs --tail=200 -f
}

# The last lines of each container's log, for a CI job that failed.
cmd_logs_dump() {
  _validate_all "$@"
  local image
  for image in "$@"; do
    echo "::group::$image logs"
    _compose "$image" logs --tail=300 --no-color --timestamps || true
    echo "::endgroup::"
  done
}

cmd_wait() {
  if [ "$#" -lt 1 ]; then
    echo "Usage: bash compose/dockers.sh wait <image> [<image> ...]" >&2
    return 1
  fi
  bash compose/wait.sh "$@"
}

cmd_help() {
  cat <<EOF
Usage: bash compose/dockers.sh <subcommand> [<image> ...]

Subcommands:
  up    [<image> ...]     Start image(s) in parallel via docker compose, then gate on compose/wait.sh.
                          With no args, starts every supported image.
  down  [<image> ...]     Tear down image(s) with 'down -v' (volumes wiped).
                          With no args, tears down every supported image.
  ps    [<image> ...]     Show containers for image(s). No args -> all.
  logs  <image>           Tail logs for one image (docker compose logs --tail=200 -f).
  logs-dump <image> ...   Print the last 300 log lines of each image's containers and exit (CI failures).
  wait  <image> ...       Probe TCP readiness via compose/wait.sh.
  help                    Show this message.

Each invocation passes -p drizzle-<image> so projects do not collide.

Valid images: ${ALL_IMAGES[*]}

Examples:
  bash compose/dockers.sh up postgres mysql
  bash compose/dockers.sh down
  bash compose/dockers.sh logs mariadb
EOF
}

main() {
  local cmd
  local args=()
  if [ "$#" -eq 0 ]; then
    cmd=up
  else
    cmd="$1"; shift
    args=("$@")
  fi

  case "$cmd" in
    up)               cmd_up ${args[@]+"${args[@]}"} ;;
    down)             cmd_down ${args[@]+"${args[@]}"} ;;
    ps)               cmd_ps ${args[@]+"${args[@]}"} ;;
    logs)             cmd_logs ${args[@]+"${args[@]}"} ;;
    logs-dump)        cmd_logs_dump ${args[@]+"${args[@]}"} ;;
    wait)             cmd_wait ${args[@]+"${args[@]}"} ;;
    help|-h|--help)   cmd_help ;;
    *)
      echo "Unknown subcommand '$cmd'." >&2
      cmd_help >&2
      return 1
      ;;
  esac
}

main "$@"
