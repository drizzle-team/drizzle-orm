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
# Mode is auto-detected: local binaries when `initdb` and `pg_ctl` are on PATH, otherwise Docker, which starts the
# monorepo's compose image postgres through compose/dockers.sh: the server drizzle-orm's own tests use, where this
# suite keeps to its own databases. Force one with DRIZZLE_POSTGRES_PG_MODE=native|docker.
#
# `bun test --parallel=N` gives every worker a database of its own on this server, seeded the same way
# (test/helpers/worker-db.ts).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PGDATA="$HERE/.pgdata"
PGPORT=54329
SOCK=/tmp/postgres_sock
export PGPASSWORD=postgres

MODE="${DRIZZLE_POSTGRES_PG_MODE:-auto}"

if [ "$MODE" = auto ]; then
  if command -v initdb >/dev/null 2>&1 && command -v pg_ctl >/dev/null 2>&1; then MODE=native; else MODE=docker; fi
fi

# ---- seeding of the native cluster; compose/postgres/driver-fixtures.sql seeds the docker one the same way ----
psql_run() { # $1 = database; SQL on stdin
  psql "host=127.0.0.1 port=$PGPORT user=postgres dbname=$1" -v ON_ERROR_STOP=1
}

seed_cluster() {
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
  printf 'postgres\n' > /tmp/postgres_pw
  initdb -D "$PGDATA" -U postgres --auth-host=scram-sha-256 --auth-local=trust --pwfile=/tmp/postgres_pw >/dev/null

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
  # A query whose planner cost passes 500000 is compiled with JIT. The first compile loads LLVM, which
  # takes several seconds on a CI runner, so a test with a large query waits that long for its first row.
  cat >> "$PGDATA/postgresql.conf" <<EOF
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
wal_level = logical
jit = off
EOF

  pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $SOCK -c listen_addresses=127.0.0.1" -l "$PGDATA/server.log" -w start
  seed_cluster
  seed_fixtures
}

# ---------------------------------------------------------------------------------- docker container
# The monorepo's compose image postgres (compose/postgres.yml) has what this cluster has: TLS, the md5user and
# scramuser roles, logical WAL, testdb with the fixture table t, and this port besides its own. compose/dockers.sh
# starts it, seeds it and puts its certificate at $PGDATA/server.crt.
setup_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "no local PostgreSQL binaries (initdb/pg_ctl) and no docker — install either one" >&2; exit 1; }
  local root
  root="$(cd "$HERE/../.." && pwd)"
  [ -f "$root/compose/dockers.sh" ] || {
    echo "compose/dockers.sh not found next to postgres/: docker mode runs from the monorepo" >&2; exit 1; }
  (cd "$root" && bash compose/dockers.sh up postgres)
}

case "$MODE" in
  native) setup_native ;;
  docker) setup_docker ;;
  *) echo "DRIZZLE_POSTGRES_PG_MODE must be auto, native or docker (got '$MODE')" >&2; exit 1 ;;
esac

echo "PG READY on 127.0.0.1:$PGPORT via $MODE (db=testdb user=postgres pw=postgres; md5user/md5pw; scramuser/scrampw)"
[ "$MODE" = docker ] && echo "  stop it with: bash compose/dockers.sh down postgres (from the monorepo root)"
exit 0
