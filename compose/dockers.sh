#!/usr/bin/env bash
set -euo pipefail

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
  docker compose -p "drizzle-${dialect}" -f "compose/${file}" "$@"
}

_up_one() {
  local dialect="$1"
  _compose "$dialect" up -d --wait --wait-timeout 120
  bash compose/wait.sh "$dialect"
}

_down_one() {
  local dialect="$1"
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
  local dialect
  for dialect in "$@"; do
    _up_one "$dialect"
  done
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
  up    [<dialect> ...]   Start dialect(s) via docker compose, then gate on compose/wait.sh.
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
