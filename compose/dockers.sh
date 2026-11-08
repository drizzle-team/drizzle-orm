#!/usr/bin/env bash
set -euo pipefail

# Host ports and project names; CI_PORT_OFFSET gives a self-hosted runner instance its own set.
# shellcheck source=compose/ports.sh
source "$(dirname "${BASH_SOURCE[0]}")/ports.sh"

ALL_DIALECTS=(
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
    *)
      echo "Unknown dialect '$1'. Valid dialects: ${ALL_DIALECTS[*]}" >&2
      return 1
      ;;
  esac
}

_compose() {
  local dialect="$1"; shift
  local file
  file="$(_resolve_compose_file "$dialect")"
  docker compose -p "$(drizzle_project "$dialect")" -f "compose/${file}" "$@"
}

_up_one() {
  local dialect="$1"
  if drizzle_is_shared "$dialect"; then
    _up_shared "$dialect"
    return
  fi
  # A CI runner slot (CI_PORT_OFFSET set) first removes what a canceled or killed job on the same slot left
  # behind: its containers keep the ports. Never locally, where the default projects hold a developer's data.
  if [ "$CI_PORT_OFFSET" -ne 0 ]; then
    _compose "$dialect" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  # Readiness is compose/wait.sh's probe from the host, not `up --wait`: some images' own healthchecks call
  # tools they do not ship (nc in cockroach and azure-sql-edge), so those containers never report healthy.
  _compose "$dialect" up -d
  bash compose/wait.sh "$dialect"
}

# A server all runner instances share (compose/ports.sh): started by the first job that needs it and left running.
# `up -d` leaves a running container as it is, so for every later job this is a check, not a start. Jobs that
# start it at the same moment race to create the container; the losers' `up` fails and their retry finds it.
_up_shared() {
  local dialect="$1" attempt
  for attempt in 1 2 3 4 5; do
    _compose "$dialect" up -d --no-recreate >/dev/null 2>&1 && break
    [ "$attempt" -eq 5 ] && { _compose "$dialect" up -d --no-recreate; return 1; }
    sleep $((attempt * 2))
  done
  bash compose/wait.sh "$dialect"
  _recreate_job_database "$dialect"
}

# This job's database on a shared Postgres server, the one run-shard.sh's connection strings name: dropped and
# created, so the job starts from an empty one whatever the slot's last job left. The PostGIS server's comes from
# its template_postgis, with the extensions its image installs.
_recreate_job_database() {
  local dialect="$1" template="" cid db attempt err
  case "$dialect" in
    postgres|postgres-vector) ;;
    postgres-postgis) template=" template template_postgis" ;;
    *) return 0 ;;
  esac
  db="${DRIZZLE_TEST_DB_PREFIX}drizzle"
  err="$(mktemp)"
  cid="$(docker ps -q --filter "label=com.docker.compose.project=$(drizzle_project "$dialect")" | head -n 1)"
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    # 55006 (object_in_use): other jobs copying the same template at that moment; it clears in milliseconds.
    if docker exec "$cid" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
      -c "drop database if exists \"$db\" with (force)" -c "create database \"$db\"$template" 2>"$err"; then
      echo "$dialect: database $db recreated"
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

_down_one() {
  local dialect="$1"
  # Shared servers stay up for the next job; its database is recreated when that job starts.
  if drizzle_is_shared "$dialect"; then return 0; fi
  _compose "$dialect" down -v
}

_ps_one() {
  local dialect="$1"
  _compose "$dialect" ps
}

_validate_all() {
  local dialect
  for dialect in "$@"; do
    _resolve_compose_file "$dialect" >/dev/null
  done
}

cmd_up() {
  if [ "$#" -eq 0 ]; then
    set -- "${ALL_DIALECTS[@]}"
  else
    _validate_all "$@"
  fi
  # Dialects start in parallel; up returns once every one is healthy, and fails if any did not come up.
  local dialect pids=() failed=0
  for dialect in "$@"; do
    _up_one "$dialect" &
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
    set -- "${ALL_DIALECTS[@]}"
  else
    _validate_all "$@"
  fi
  local dialect
  for dialect in "$@"; do
    _down_one "$dialect"
  done
}

cmd_ps() {
  if [ "$#" -eq 0 ]; then
    set -- "${ALL_DIALECTS[@]}"
  else
    _validate_all "$@"
  fi
  local dialect
  for dialect in "$@"; do
    _ps_one "$dialect"
  done
}

cmd_logs() {
  if [ "$#" -ne 1 ]; then
    echo "Usage: bash compose/dockers.sh logs <dialect>" >&2
    return 1
  fi
  _validate_all "$1"
  _compose "$1" logs --tail=200 -f
}

cmd_wait() {
  if [ "$#" -lt 1 ]; then
    echo "Usage: bash compose/dockers.sh wait <dialect> [<dialect> ...]" >&2
    return 1
  fi
  bash compose/wait.sh "$@"
}

cmd_help() {
  cat <<EOF
Usage: bash compose/dockers.sh <subcommand> [<dialect> ...]

Subcommands:
  up    [<dialect> ...]   Start dialect(s) in parallel via docker compose, then gate on compose/wait.sh.
                          With no args, starts every supported dialect.
  down  [<dialect> ...]   Tear down dialect(s) with 'down -v' (volumes wiped).
                          With no args, tears down every supported dialect.
  ps    [<dialect> ...]   Show containers for dialect(s). No args -> all.
  logs  <dialect>         Tail logs for one dialect (docker compose logs --tail=200 -f).
  wait  <dialect> ...     Probe TCP readiness via compose/wait.sh.
  help                    Show this message.

Each invocation passes -p drizzle-<dialect> so projects do not collide.

Valid dialects: ${ALL_DIALECTS[*]}

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
