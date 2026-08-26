#!/usr/bin/env bash
set -euo pipefail

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
  cid="$(docker ps -q --filter "label=com.docker.compose.service=$service" | head -n 1)"
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
    postgres)             wait_tcp 127.0.0.1 55433 "postgres" ;;
    postgres-http-gateway) wait_tcp 127.0.0.1 8080  "postgres-http-gateway" ;;
    postgres-postgis)     wait_tcp 127.0.0.1 54322 "postgres" ;;
    postgres-vector)      wait_tcp 127.0.0.1 54321 "postgres" ;;
    postgres18)           wait_tcp 127.0.0.1 54325 "postgres" ;;
    postgres17)           wait_tcp 127.0.0.1 54324 "postgres" ;;
    postgres16)           wait_tcp 127.0.0.1 54323 "postgres" ;;
    mariadb)              wait_tcp 127.0.0.1 33306 "mariadb" ;;
    mysql)                wait_tcp 127.0.0.1 3306  "mysql"; wait_till_ready mysql "mysql" ;;
    singlestore)          wait_tcp 127.0.0.1 33307 "singlestore" ;;
    singlestore-many)
      # loop through 5 ports (33307–33311)
      for i in $(seq 3308 3311); do
        wait_tcp 127.0.0.1 "$i" "singlestore-$((i-3308))"
      done
      ;;
    mssql)                wait_tcp 127.0.0.1 1433  "mssql" ;;
    cockroach)            wait_tcp 127.0.0.1 26257 "cockroach" ;;
    cockroach-many)
      for i in $(seq 26260 26262); do
        wait_tcp 127.0.0.1 "$i" "cockroach-$((i-26260))"
      done
      ;;
    neon)                 wait_tcp 127.0.0.1 5446  "neon-serverless" ;;
    *) echo "Unknown db '$db'" >&2; exit 1 ;;
  esac
done
