# A late cancel is documented and marked

A cancel request stops whatever the backend runs when the request arrives. If the canceled query ends first, the request can stop a later query that was already pipelined behind it. Drizzle Postgres cannot prevent this, because those queries are already on the wire and the protocol has no way to target one query. Drizzle Postgres documents this late cancel. It also marks the error. If the canceled query ended without 57014, the first query behind it that fails with 57014 keeps its `PgError` and gets `isLateCancel: true`, plus a hint that the query was rolled back and can run again. A confirmed cancel does not rule this out: the confirmation and the end of the query arrive on different sockets, so their order does not show the order on the server. After the mark, the cancel counts as used, and the connection is reused without waiting for the confirmation.

Other drivers leave the same gap. postgres.js and tokio-postgres document it. pgjdbc, Npgsql and asyncpg only hold new queries while a cancel is pending, as Drizzle Postgres already does.

## Considered options

- Do not pipeline behind a query that has a `timeout` or a `signal`. The Effect entry point passes a signal with every query, so this would turn off pipelining for all Effect users.
- Retry the stopped query. The retry runs after the queries that were behind it on the wire, so writes can land in a different order and give wrong data with no error.
- Close the connection when a pipelined query is canceled, as pgx and the node-postgres pipeline mode do. Every query behind it then fails, instead of one.

## Consequences

- The Effect entry point still maps the error to `StatementTimeoutError`, which keeps the SQLSTATE table of `@effect/sql-pg`. The `cause` carries `isLateCancel`.
- A `statement_timeout` or a `pg_cancel_backend` from another session that stops the same query in the same window is also marked. The hint says that a late cancel most likely stopped the query.
- The server message is not checked, because the server translates it when `lc_messages` is not English.
