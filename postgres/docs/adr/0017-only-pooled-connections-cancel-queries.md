# Only pooled connections cancel queries

The protocol accepts a CancelRequest only as the first packet of a new connection to the server. A cancel therefore needs a second connection for every canceled query. A pool already opens and owns connections, so a pooled connection keeps the cancel: `timeout` and `signal` open a fresh socket and send the CancelRequest on it. A single connection from `connect()` is one connection to the server, and it offers no cancel features. Its types reject `timeout` and `signal`. A query that passes them anyway rejects before anything is sent, with code `CANCEL_NEEDS_POOL`. An early close of `stream()` or `copyTo()` on a single connection reads the rest of the result and drops it.

The cancel socket of a pooled connection dials the IP address of the session, so DNS cannot send the cancel to another server. TLS still checks the certificate against the host name. Just before the CancelRequest is written, the connection checks that the canceled query still runs. If the query has ended, nothing is sent, because the request would stop a later query. Bun 1.4.4 does both of these checks.

## Considered options

- Keep a cancel connection next to each single connection: a second session that runs `pg_cancel_backend(pid)`. It doubles the connections to the server, and it still stops whatever the backend runs, so it has the same late-cancel risk as a CancelRequest.
- The same cancel connection behind a pooler. A transaction pooler such as PgBouncer sends its own process id and secret key in BackendKeyData, and it routes a CancelRequest to the right backend by that key. `pg_cancel_backend` takes a real backend pid, which the client does not know there, and a backend pid can serve another client between two transactions.

## Consequences

- `connect()` returns `Connection<{ pooled: false }>`. Pool paths return `Connection<{ pooled: true }>`. Plain `Connection` accepts both, so code that takes either kind keeps compiling, and the runtime check covers it.
- A transport `cancel` receives `isQueryRunning` and calls it on the open cancel socket, just before the write.
- With a `socket` factory, the cancel socket dials `host`. Such a socket can lead to a proxy or a bastion host, so its peer address is not the server.
- On Workers the cancel socket keeps the host name. `cloudflare:sockets` checks the certificate against the name it dials, and workerd rejects a separate server name.
- The HTTP clients (`/http`, `/neon-http`, `/aurora`) are unchanged. `timeout` and `signal` stop the client from waiting, and the service decides whether the query stops.
- The late-cancel rules of ADR 0016 stay. The Effect client runs on a pool, so it keeps its cancel.
