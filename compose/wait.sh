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
  cid="$(docker ps -q --filter "label=com.docker.compose.service=$service" --filter "label=com.docker.compose.project=$(drizzle_project "$service")" | head -n 1)"
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

# Docker's port forwarding accepts a connection on the published port as soon as the container starts, before the
# database inside listens (always so for CI runners that reach a shared Docker through its socket), so a port check
# from here proves nothing about the server. This waits until every published port of the dialect's containers is in
# LISTEN inside the container's own network namespace: database images listen on TCP only for the final server,
# after their init scripts ran against a socket-only one.
# A container's /proc/net/<table>: through the image's own cat, or busybox's in the container's network namespace
# for images without one. Empty when the table does not exist (tcp6 with IPv6 off).
proc_net() {
  docker exec "$1" cat "/proc/net/$2" 2>/dev/null \
    || docker run --rm --network "container:$1" busybox:1.37 cat "/proc/net/$2" 2>/dev/null || true
}

wait_listening() {
  dialect="$1"; tries="${2:-180}"
  project="$(drizzle_project "$dialect")"
  for cid in $(docker ps -q --filter "label=com.docker.compose.project=$project"); do
    name="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$cid")"
    for port in $(docker port "$cid" | sed -n 's#^\([0-9]*\)/tcp.*#\1#p' | sort -u); do
      hex="$(printf '%04X' "$port")"
      for i in $(seq 1 "$tries"); do
        tcp="$(proc_net "$cid" tcp; proc_net "$cid" tcp6)"
        if awk -v p=":$hex" '$2 ~ p"$" && $4 == "0A" { found = 1 } END { exit !found }' <<<"$tcp"; then
          echo "$name listens on $port in its container"
          continue 2
        fi
        sleep 1
      done
      echo "Timed out waiting for $name to listen on $port" >&2
      return 1
    done
  done
}

# Waits for a line in a compose service's log.
wait_log() {
  dialect="$1"; service="$2"; pattern="$3"; tries="${4:-180}"
  cid="$(docker ps -q --filter "label=com.docker.compose.project=$(drizzle_project "$dialect")" --filter "label=com.docker.compose.service=$service" | head -n 1)"
  for i in $(seq 1 "$tries"); do
    # Not `docker logs | grep -q`: grep exits at the first match, docker logs then fails writing to the closed pipe,
    # and with pipefail a found line reads as not found.
    if grep -q "$pattern" <<<"$(docker logs "$cid" 2>&1)"; then echo "$service: $pattern"; return 0; fi
    sleep 1
  done
  echo "Timed out waiting for '$pattern' in $service's log" >&2
  return 1
}

for db in "$@"; do
  case "$db" in
    postgres)             wait_tcp 127.0.0.1 "$DRIZZLE_PORT_POSTGRES" "postgres" ;;
    postgres-http-gateway) wait_tcp 127.0.0.1 "$DRIZZLE_PORT_HTTP_GATEWAY" "postgres-http-gateway" ;;
    aws-data-api)         wait_tcp 127.0.0.1 "$DRIZZLE_PORT_AWS_DATA_API" "aws-data-api" ;;
    neon)                 wait_tcp 127.0.0.1 "$DRIZZLE_PORT_NEON_PROXY" "neon-proxy" ;;
    # The simulator answers before MySQL does; MySQL's own port is not published, so its log tells: its final
    # server (after the init scripts' socket-only one) reports port 3306.
    planetscale)          wait_tcp 127.0.0.1 "$DRIZZLE_PORT_PLANETSCALE" "planetscale"; wait_log planetscale planetscale-mysql "ready for connections.*port: 3306" ;;
    turso)
      for port in "$DRIZZLE_PORT_TURSO" "$DRIZZLE_PORT_TURSO1" "$DRIZZLE_PORT_TURSO2" "$DRIZZLE_PORT_TURSO3" "$DRIZZLE_PORT_TURSO4"; do
        wait_tcp 127.0.0.1 "$port" "turso"
      done
      ;;
    postgres-postgis)     wait_tcp 127.0.0.1 "$DRIZZLE_PORT_POSTGIS" "postgres" ;;
    postgres-vector)      wait_tcp 127.0.0.1 "$DRIZZLE_PORT_VECTOR" "postgres" ;;
    pulse)                wait_tcp 127.0.0.1 "$DRIZZLE_PORT_PULSE" "pulse" ;;
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
    # SQL Server listens a moment before it has recovered its system databases; logins fail until then.
    mssql)
      wait_tcp 127.0.0.1 "$DRIZZLE_PORT_MSSQL" "mssql"
      # The shared server of a self-hosted machine runs for days, and its log is capped (compose/mssql.yml), so the
      # line from its start rotates out: a query tells instead.
      if drizzle_is_shared mssql; then node compose/mssql.mjs ready; else wait_log mssql mssql "Recovery is complete"; fi
      ;;
    cockroach)            wait_tcp 127.0.0.1 "$DRIZZLE_PORT_COCKROACH" "cockroach" ;;
    cockroach-many)
      for i in 0 1 2; do
        port_var="DRIZZLE_PORT_COCKROACH_MANY$i"
        wait_tcp 127.0.0.1 "${!port_var}" "cockroach-$i"
      done
      ;;
    *) echo "Unknown db '$db'" >&2; exit 1 ;;
  esac
  wait_listening "$db"
done
