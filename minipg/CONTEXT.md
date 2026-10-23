# minipg

A PostgreSQL driver for queries, with a single connection or a pool, and a separate replication and CDC layer.

## Language

### Entry points

**Async entry point**:
The promise-based API: `connect`, `createPool`, `Connection` and `Pool`.
_Avoid_: classic API, promise driver

**Effect entry point**:
The API for Effect applications, built on the same pool and connections as the async entry point.
_Avoid_: Effect driver, Effect wrapper

**Transport**:
The runtime-specific code that opens the socket to the server and sends cancel requests (Node, Cloudflare, Deno, Neon WebSocket).
_Avoid_: adapter, socket layer

### Running several queries

**Pipeline**:
Several queries sent back to back on one connection without waiting for each reply. Each query commits on its own, so a failure affects only that query.
_Avoid_: batch (for this meaning), multiplex

**Batch**:
A pipeline inside one transaction. All the queries commit together or none of them do.
_Avoid_: bulk, transaction group

**Parallel**:
Several queries fanned out over separate pool connections, so the server runs them at the same time.
_Avoid_: concurrent, fan-out

### Canceling queries

**Canceled query**:
A query that timed out or whose abort signal fired while it was running on the server. The driver asks the server to stop it.
_Avoid_: head (outside the connection code), aborted query

**Late cancel**:
A cancel request that reaches the server after the canceled query has ended, so that it stops a later query in the same pipeline. That later query fails and is rolled back.
_Avoid_: stray cancel, collateral cancel, misdirected cancel
