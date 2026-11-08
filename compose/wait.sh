#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=compose/ports.sh
source "$(dirname "${BASH_SOURCE[0]}")/ports.sh"

wait_tcp() {
  host="$1"; port="$2"; name="$3"; tries="${4:-120}"
  for i in $(seq 1 "$tries"); do
    if nc -z "$host" "$port" >/dev/null 2>&1; then
      echo "$name is up on $host:$port"
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for $name on $host:$port" >&2
  return 1
}

wait_till_ready() {
  service="$1"; name="$2"; tries="${3:-120}"
  cid="$(docker ps -q --filter "label=com.docker.compose.service=$service" --filter "label=com.docker.compose.project=drizzle-${service}${DRIZZLE_COMPOSE_SUFFIX}" | head -n 1)"
  if [ -z "$cid" ]; then
    echo "No running container for compose service '$service'; skipping healthcheck wait" >&2
    return 0
  fi
  for i in $(seq 1 "$tries"); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo unknown)"
    case "$status" in
      healthy)      echo "$name is healthy"; return 0 ;;
      none|unknown) echo "$name has no healthcheck; relying on the port check" >&2; return 0 ;;
    esac
    sleep 1
  done
  echo "Timed out waiting for $name to become healthy" >&2
  return 1
}

for db in "$@"; do
  case "$db" in
    postgres)             wait_tcp 127.0.0.1 "$DRIZZLE_PORT_POSTGRES" "postgres" ;;
    postgres-http-gateway) wait_tcp 127.0.0.1 "$DRIZZLE_PORT_HTTP_GATEWAY" "postgres-http-gateway" ;;
    aws-data-api)         wait_tcp 127.0.0.1 "$DRIZZLE_PORT_AWS_DATA_API" "aws-data-api" ;;
    neon)                 wait_tcp 127.0.0.1 "$DRIZZLE_PORT_NEON_PROXY" "neon-proxy" ;;
    postgres-postgis)     wait_tcp 127.0.0.1 "$DRIZZLE_PORT_POSTGIS" "postgres" ;;
    postgres-vector)      wait_tcp 127.0.0.1 "$DRIZZLE_PORT_VECTOR" "postgres" ;;
    postgres18)           wait_tcp 127.0.0.1 "$DRIZZLE_PORT_POSTGRES18" "postgres" ;;
    postgres17)           wait_tcp 127.0.0.1 "$DRIZZLE_PORT_POSTGRES17" "postgres" ;;
    postgres16)           wait_tcp 127.0.0.1 "$DRIZZLE_PORT_POSTGRES16" "postgres" ;;
    mariadb)              wait_tcp 127.0.0.1 "$DRIZZLE_PORT_MARIADB" "mariadb" ;;
    mysql)                wait_tcp 127.0.0.1 "$DRIZZLE_PORT_MYSQL" "mysql"; wait_till_ready mysql "mysql" ;;
    singlestore)          wait_tcp 127.0.0.1 "$DRIZZLE_PORT_SINGLESTORE" "singlestore" ;;
    singlestore-many)
      # loop through 5 ports (33307–33311)
      for i in 0 1 2 3; do
        port_var="DRIZZLE_PORT_SINGLESTORE_MANY$i"
        wait_tcp 127.0.0.1 "${!port_var}" "singlestore-$i"
      done
      ;;
    mssql)                wait_tcp 127.0.0.1 "$DRIZZLE_PORT_MSSQL" "mssql" ;;
    cockroach)            wait_tcp 127.0.0.1 "$DRIZZLE_PORT_COCKROACH" "cockroach" ;;
    cockroach-many)
      for i in 0 1 2; do
        port_var="DRIZZLE_PORT_COCKROACH_MANY$i"
        wait_tcp 127.0.0.1 "${!port_var}" "cockroach-$i"
      done
      ;;
    *) echo "Unknown db '$db'" >&2; exit 1 ;;
  esac
done
