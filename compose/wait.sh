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

for db in "$@"; do
  case "$db" in
    postgres)     wait_tcp 127.0.0.1 55433 "postgres" ;;
    mysql)        wait_tcp 127.0.0.1 33306 "mysql" ;;
    singlestore)  wait_tcp 127.0.0.1 33307 "singlestore" ;;
    mssql)        wait_tcp 127.0.0.1 1433  "mssql" ;;
    cockroach)    wait_tcp 127.0.0.1 26257 "cockroach" ;;
    neon)         wait_tcp 127.0.0.1 5445  "neon-serverless" ;;
    *) echo "Unknown db '$db'"; exit 1 ;;
  esac
done
