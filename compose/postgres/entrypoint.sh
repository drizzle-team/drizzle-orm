#!/usr/bin/env bash
# Puts the TLS certificate and the client authentication file that the Drizzle Postgres driver's suite (postgres/)
# needs where Postgres reads them, then starts Postgres through the image's own entrypoint with the arguments of the
# compose file. compose/dockers.sh makes the certificate on the host (the alpine image has no openssl) and mounts it
# at /drizzle-tls. The copies are made here: Postgres rejects a key file it does not own, or whose mode is looser
# than 0600, and a bind-mounted host file arrives owned by the host's user.
set -euo pipefail

mkdir -p /etc/drizzle
cp /drizzle-tls/server.crt /drizzle-tls/server.key /drizzle/pg_hba.conf /etc/drizzle/
chown postgres:postgres /etc/drizzle/server.crt /etc/drizzle/server.key /etc/drizzle/pg_hba.conf
chmod 600 /etc/drizzle/server.key

exec docker-entrypoint.sh "$@"
