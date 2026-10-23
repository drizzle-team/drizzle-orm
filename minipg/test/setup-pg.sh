#!/usr/bin/env bash
# Provision the cluster the integration suite expects, either with LOCAL PostgreSQL binaries or in a
# DOCKER container. Both paths produce the same thing, because the tests only see the outside of it:
#
#   127.0.0.1:54329   testdb   postgres/postgres (superuser)
#   md5user/md5pw     — authenticates with MD5   (auth.test.ts, out-of-scope.test.ts)
#   scramuser/scrampw — authenticates with SCRAM (auth.test.ts)
#   TLS on, self-signed CN=localhost, cert readable at test/.pgdata/server.crt (SERVER_CA_PATH in
#     test/helpers/db.ts — tls-ssl.test.ts and security.test.ts load it as their CA)
#   wal_level=logical  (replication.test.ts)
#   table t, 3 fixture rows (query/results.test.ts and friends)
#
# Mode is auto-detected: local binaries when `initdb` and `pg_ctl` are on PATH, otherwise Docker.
# Force one with MINIPG_PG_MODE=native|docker. Docker knobs: MINIPG_PG_IMAGE, MINIPG_PG_CONTAINER.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PGDATA="$HERE/.pgdata"
PGPORT=54329
SOCK=/tmp/minipg_sock
export PGPASSWORD=postgres

MODE="${MINIPG_PG_MODE:-auto}"
IMAGE="${MINIPG_PG_IMAGE:-postgres:16}"
CONTAINER="${MINIPG_PG_CONTAINER:-minipg-test-pg}"
PSQL_MODE=host # 'container' when the host has no psql (docker mode only)

if [ "$MODE" = auto ]; then
  if command -v initdb >/dev/null 2>&1 && command -v pg_ctl >/dev/null 2>&1; then MODE=native; else MODE=docker; fi
fi

# ---- seeding: ONE definition of the roles/database/fixtures, run identically by both modes ----
psql_run() { # $1 = database; SQL on stdin
  if [ "$PSQL_MODE" = host ]; then
    psql "host=127.0.0.1 port=$PGPORT user=postgres dbname=$1" -v ON_ERROR_STOP=1
  else
    docker exec -i "$CONTAINER" psql -U postgres -d "$1" -v ON_ERROR_STOP=1
  fi
}

seed_cluster() {
  # CREATE DATABASE is conditional: the docker image already made testdb from POSTGRES_DB.
  psql_run postgres <<'SQL'
SET password_encryption='md5';
CREATE ROLE md5user LOGIN PASSWORD 'md5pw';
SET password_encryption='scram-sha-256';
CREATE ROLE scramuser LOGIN PASSWORD 'scrampw';
SELECT 'CREATE DATABASE testdb OWNER postgres' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='testdb') \gexec
SQL
}

seed_fixtures() {
  psql_run testdb <<'SQL'
DROP TABLE IF EXISTS t;
CREATE TABLE t(id serial primary key, name text, n8 bigint, amount numeric, ok bool, data jsonb, blob bytea);
INSERT INTO t(name,n8,amount,ok,data,blob) VALUES
 ('alice', 9007199254740993, 1234.56, true, '{"a":1}', '\xdeadbeef'),
 ('bob',   42,               0.1,     false,'[1,2,3]', '\x00ff'),
 (NULL,    NULL,             NULL,    NULL, NULL,      NULL);
SQL
}

# ---------------------------------------------------------------- native (local PostgreSQL binaries)
setup_native() {
  pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$PGDATA"; mkdir -p "$SOCK"
  printf 'postgres\n' > /tmp/minipg_pw
  initdb -D "$PGDATA" -U postgres --auth-host=scram-sha-256 --auth-local=trust --pwfile=/tmp/minipg_pw >/dev/null

  cat > "$PGDATA/pg_hba.conf" <<EOF
local   all all                trust
host    all md5user 127.0.0.1/32 md5
host    all md5user ::1/128      md5
host    all all     127.0.0.1/32 scram-sha-256
host    all all     ::1/128      scram-sha-256
EOF

  # self-signed server cert so the TLS suite can do a real handshake (CN=localhost)
  openssl req -new -x509 -days 3650 -nodes -text -subj "/CN=localhost" \
    -out "$PGDATA/server.crt" -keyout "$PGDATA/server.key" >/dev/null 2>&1
  chmod 600 "$PGDATA/server.key"
  cat >> "$PGDATA/postgresql.conf" <<EOF
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
wal_level = logical
EOF

  pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $SOCK -c listen_addresses=127.0.0.1" -l "$PGDATA/server.log" -w start
  seed_cluster
  seed_fixtures
}

# ---------------------------------------------------------------------------------- docker container
wait_ready() { # the image bootstraps on a unix socket first, so poll TCP — that is what the tests use
  for _ in $(seq 1 60); do
    docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -p 5432 -U postgres >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "postgres in container '$CONTAINER' never became ready; last log lines:" >&2
  docker logs --tail 30 "$CONTAINER" >&2
  return 1
}

setup_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "no local PostgreSQL binaries (initdb/pg_ctl) and no docker — install either one" >&2; exit 1; }
  command -v psql >/dev/null 2>&1 || PSQL_MODE=container

  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$PGDATA"; mkdir -p "$PGDATA" # host side holds only the CA copy the TLS tests read

  docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=testdb \
    -p "127.0.0.1:$PGPORT:5432" "$IMAGE" >/dev/null
  wait_ready

  local D=/var/lib/postgresql/data
  # Generated INSIDE the container, unlike the native path: postgres rejects a key file it does not own
  # whose mode is looser than 0600, and a bind-mounted host file arrives owned by the host's uid.
  docker exec "$CONTAINER" sh -c "openssl req -new -x509 -days 3650 -nodes -text -subj '/CN=localhost' \
    -out $D/server.crt -keyout $D/server.key >/dev/null 2>&1 \
    && chmod 600 $D/server.key && chown postgres:postgres $D/server.crt $D/server.key"

  # Connections arrive from the DOCKER GATEWAY address, never 127.0.0.1, so the native file's /32 rules
  # would reject every one of them. Same auth methods and same per-role split, wider CIDR.
  docker exec -i "$CONTAINER" sh -c "cat > $D/pg_hba.conf && chown postgres:postgres $D/pg_hba.conf" <<'EOF'
local   all all               trust
host    all md5user 0.0.0.0/0 md5
host    all md5user ::0/0     md5
host    all all     0.0.0.0/0 scram-sha-256
host    all all     ::0/0     scram-sha-256
EOF

  # ALTER SYSTEM rather than appending to postgresql.conf: the image owns that file, and .auto.conf
  # survives the restart these settings need.
  docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
ALTER SYSTEM SET ssl = 'on';
ALTER SYSTEM SET ssl_cert_file = 'server.crt';
ALTER SYSTEM SET ssl_key_file = 'server.key';
ALTER SYSTEM SET wal_level = 'logical';
SQL
  docker restart "$CONTAINER" >/dev/null
  wait_ready

  # the TLS suite loads this as its CA (the self-signed cert is its own issuer)
  docker cp "$CONTAINER:$D/server.crt" "$PGDATA/server.crt" >/dev/null
  seed_cluster
  seed_fixtures
}

case "$MODE" in
  native) setup_native ;;
  docker) setup_docker ;;
  *) echo "MINIPG_PG_MODE must be auto, native or docker (got '$MODE')" >&2; exit 1 ;;
esac

echo "PG READY on 127.0.0.1:$PGPORT via $MODE (db=testdb user=postgres pw=postgres; md5user/md5pw; scramuser/scrampw)"
[ "$MODE" = docker ] && echo "  container '$CONTAINER' — remove it with: docker rm -f $CONTAINER"
exit 0
