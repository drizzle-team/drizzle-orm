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
    postgres)             wait_tcp 127.0.0.1 55433 "postgres" ;;
    postgres-postgis)     wait_tcp 127.0.0.1 54322 "postgres" ;;
    mysql)                wait_tcp 127.0.0.1 3306  "mysql" ;;
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
    *) echo "Unknown db '$db'";;
  esac
done
