# AGENTS.md — packages/drizzle-pulse

## Role

Type-safe Pulse SDK shared by server, client, React, and embedded layers.

- root side: `pulse`, `PulseTable` — the collection entity, exported once per table from schema files
- server side: `PulseBuilder` (seeded via `PulseTable.query(fn?)`), `createPulseRegistry`, `PulseRuntime`, the transport-agnostic request handler (SDK), and the events-table machinery (`buildEventsTable` resolver + internal DDL renderer + `bootstrap`/`provision`)
- server/hono side: `createPulseHonoRouter` — an optional Hono wrapper over the SDK on the `./server/hono` subpath
- embedded-entrypoint side: `createRuntime` — the `./embedded` subpath's embedded-only factory (registry + `pull: false` runtime wired internally over the app's `sourceDb`)
- client side: `createPulseClient`, `PulseQuery` (over a pluggable transport)
- React side: `usePulseQuery`
- embedded side: `createPulseClient` (in-process, tap-direct, runtime-backed), `PulseCollection` facade, `createPulseEvents` (stateless per-event subscription)

## Package Name

`drizzle-pulse` — workspace package with built `dist/` exports.

## Dependencies

`superjson` is the only hard `dependency`; `@drizzle-team/minipg` is a **required peer**. It is
value-reached only from the `./server` and `./embedded` entrypoints (replication + admin pool,
via `pulse-runtime.ts`/`pulse-store.ts`); client entrypoints (`./client`, `./client/react`,
`./client/embedded`) never reach it on a value-import path (enforced by the platform-imports
purity test).

`hono` and `react` are **optional peer dependencies**: `hono` is needed only to mount the
`./server/hono` Hono wrapper (the SDK handler itself is transport-agnostic), `react` only for
`./client/react`. `drizzle-orm` and `zod` are required peers.

## Source Layout

| Path | Purpose |
|------|---------|
| `src/index.ts` | root barrel: `pulse`, `PulseTable`, `QueryDescriptor` (values) plus the `PulseBuilder`/`ColumnOperators`/`WhereCondition` **types** only (`PulseBuilder` so an exported builder's declaration is nameable — TS2742) — the full protocol/wire/query type family lives on `./server` instead |
| `src/types.ts` | shared public types such as `QueryDescriptor`, `ResolvedPulseQuery`, `WhereClause`, `PullResponse`, `LoadMoreResponse`, `PulseAuthContext`, `PulseWireEvent` (a `PulseEvent<Record<string, unknown>>` alias) |
| `src/pulse-table.ts` | collection entity: `pulse(table)` → `PulseTable`; lazy PK validation at `.query()` time; value-imports `drizzle-orm/pg-core` (`getTableConfig`) — the sole client-unreachable pg-core exemption in the purity test |
| `src/shared/` | protocol request/response types, filter AST helpers, PK utilities, `pulse-merge-core.ts` (merge state machine reused by HTTP `PulseQuery` and embedded `PulseCollection`; keys rows by out-of-band pks — rebuild entries + each event's `pk` field — so rows carry no identity property; the ranged/HTTP subclass derives entry pks from wire rows' `$pk`) |
| `src/embedded/index.ts` | embedded-only factory: `createRuntime({ queries, databaseUrl, sourceDb, wal?, logLevel?, telemetry? })` → `{ client, events, start, stop, provision, onFatalError }`; wires `createPulseRegistry` + a `pull: false` `PulseRuntime` internally and delegates the lifecycle straight through |
| `src/client/create-client.ts` | proxy-based typed HTTP client + `PullClient` (batched auto-poll, default 1s, `pollIntervalMs: 0` disables) |
| `src/client/transport.ts` | `createHttpTransport` (fetch+superjson) + the `PulseHttpTransport` inferred type — the HTTP client's single transport |
| `src/client/pulse-query.ts` | framework-agnostic subscribe/poll/load-more state machine (`PulseQuery`); `destroy()` stops polling — the client holds no server-side state to release |
| `src/client/superjson.ts` | response deserialization helper |
| `src/client/react/use-pulse-query.ts` | `usePulseQuery` wrapper around `PulseQuery` |
| `src/client/embedded/index.ts` | in-process embedded client: `createPulseClient(runtime)` → `PulseCollection` facade (`list`/`onChange`/`onError`/`dispose`) fed tap-direct — a full-set `PulseMergeCore` rebuilt from `runtime.readCollectionBaseline` and kept live by the runtime tap (`subscribeTap`), converged through an LSN watermark handshake (no events table, no wire protocol); re-exports `createPulseEvents` |
| `src/client/embedded/tap-events.ts` | `buildTapEvent(payload, query)`: the single WAL-tap-payload → `PulseEvent` builder shared by collections and `createPulseEvents` (WHERE-filters every op against the full old/new rows; the event's `pk` comes from the unprojected row and rows carry no `$pk`; an update leaving the filter is delivered with an empty row; value-imports only `shared/`) |
| `src/client/embedded/events.ts` | `createPulseEvents(runtime)` → stateless per-event subscription: WHERE-filtered events with `matchesNew` on updates, `(event, lsn)` callback, no baseline, no merge core, no per-subscription error surface |
| `src/server/pulse-builder.ts` | immutable query builder (`.columns/.args/.order/.limit/.transform/.query`), seeded by `PulseTable.query(fn?)` |
| `src/server/pulse-registry.ts` | registry finalization + `$client` phantom contract; queries must be `.query()` builder chains — a bare `PulseTable` is a compile-time type error via `AnyPulseBuilders`, not a runtime rejection; defensive composite-PK re-check |
| `src/server/pulse-projection.ts` | projection/response-shaping helpers split out to preserve platform purity for the embedded client entrypoint |
| `src/server/events-table-resolver.ts` | convention resolver: synthesizes the events `PgTable` (`<schema>_<table>`, `_` escaped to `__`) from a source table by cloning each column via its public `toBuilder()` |
| `src/server/events-table-ddl.ts` | internal `emitEventsTableDdl`: renders the recreate DDL (`CREATE SCHEMA`/`DROP TABLE`/`CREATE TABLE`) strictly from the resolver's output; `bootstrap()` hashes its text to detect divergence (not a public export) |
| `src/server/cursor.ts` | opaque cursor tokens `"<epoch>:<snapshot>"` — `formatCursor`/`parseCursor`; epoch rotates on events-table recreate so stale tokens are detectable |
| `src/server/pulse-sql.ts` | query compilation / row predicate evaluation |
| `src/server/sdk.ts` | `PulseRequestHandler` — the transport-agnostic SDK core: subscribe/pull/loadMore, cursor-token mint/validate, `DEFAULT_PULL_EVENT_LIMIT` overflow→reset. Stateless: auth re-resolved per pull, no subscription registry |
| `src/server/hono.ts` | `createPulseHonoRouter` — optional Hono wrapper over the SDK's three routes (`/subscribe`, `/pull`, `/load-more`); superjson-encoded responses; `./server/hono` subpath |
| `src/server/pulse-runtime.ts` | `PulseRuntime` assembly, `PulseRuntimeConfig` (publication/slot default `drizzle_pulse`, `pull` (boolean or an object carrying `eventsSchema` and `eventLimit`), `logLevel`, `telemetry`), `bootstrap()` self-provisioning + `provision()`, WAL listener lifecycle |
| `src/server/pulse-store.ts` | `PulseStore` — events-table reads/writes over the pulse-owned pool |
| `src/__tests__/` | runtime/unit tests for SDK internals |

## Provisioning (bootstrap / provision)

The runtime **self-provisions all its infrastructure** — the app no longer migrates events
tables. `PulseRuntime.bootstrap()` runs inside one transaction under a per-events-schema
advisory lock and: asserts `wal_level=logical` (the one precondition it can't fix), creates/diffs
the publication (independent of pull mode), creates the events schema + `pulse_meta` bookkeeping,
creates/recreates each events table whose rendered-DDL sha256 diverges (rotating its epoch), and
sweeps orphans. In both pull modes it sets `REPLICA IDENTITY FULL` on each source and resets it
to `DEFAULT` on un-pulse — every update/delete decodes from its full WAL old tuple, and the
runtime never reads old-row data back from the source tables. `start()` runs it then opens WAL;
`provision()` runs it and returns (split-role deploys). Failed DDL throws naming the exact
statement and the grant it most likely needs. See
[`../../docs/events-table-convention.md`](../../docs/events-table-convention.md) sections 5–8.

## Contract Flow

```text
Schema (root barrel):
  pulse(table)
    → PulseTable (unconditional construction; no PK validation yet)

Server (derive queries outside the schema file):
  collection.query(fn?)
    → PulseBuilder (lazy PK validation here) → .args().order().limit().query(...)

  createPulseRegistry({ queryName })
    → queries must be .query() builder chains — a bare PulseTable is a compile-time type
      error via AnyPulseBuilders; defensive composite-PK re-check

  new PulseRuntime(registry, config)
    → resolves each source table's events table via buildEventsTable (no hand-declared
      events tables)
    → start() runs bootstrap() (self-provision), then connects WAL
    → provision() runs bootstrap() only (no WAL) — for elevated-role deploy steps

  runtime.handlers → transport-agnostic SDK (subscribe/pull/loadMore)
  createPulseHonoRouter(runtime.handlers)  [optional Hono wrapper, ./server/hono]

Client:
  createPulseClient<PulseClient>({ url }) → QueryDescriptor<TResult>
  new PulseQuery(descriptor, { onStateChange }) → subscribe / poll / loadMore

React:
  usePulseQuery(descriptor) → { data, isLoading, isLoadingMore, hasMore, error, loadMore, refetch }

Embedded entrypoint (./embedded — embedded-only apps):
  createRuntime({ queries: { queryName }, databaseUrl, sourceDb, wal?, logLevel?, telemetry? })
    → createPulseRegistry + new PulseRuntime(registry, { pull: false, ... }) wired internally
    → { client, events } = the two embedded surfaces below over that runtime
    → start() / stop() / provision() / onFatalError() delegate straight to the runtime

Embedded (in-process, tap-direct):
  createPulseClient(runtime).queryName(args?, { auth? })
    → watermark handshake: tap subscribe (buffering) → runtime.readCollectionBaseline
      → rebuild PulseMergeCore from (pk, row) entries → drain buffered payloads at-or-above
      the watermark → live
    → PulseCollection: list() / onChange() / onError() / dispose(); rows are exactly the
      selected columns — no $pk, identity lives in the merge core's entries + event.pk

  createPulseEvents(runtime).queryName(args?, callback, { auth? })  // or (callback, options?)
    → WAL tap: inserts WHERE-filtered; updates/deletes WHERE-filtered when the old tuple is
      fully evaluable, else delivered with an empty row (event.pk carries the identity) for
      membership correctness — no baseline/state
    → returns an unsubscribe function
    → callback(event: PulseEvent<TRow>, lsn: string) in WAL commit order, at-least-once
      (a disconnect between tap emit and slot ack replays the commit on reconnect; no
      baseline/dedup here — consumers should key idempotency off (event.pk, lsn))
```

## Runtime Notes

- `PulseQuery` is the canonical merge engine used by tests and `usePulseQuery` (HTTP-only); the embedded client owns a full-set `PulseMergeCore` directly and never constructs a `PulseQuery` — the HTTP client is the only `PulseQuery` consumer
- The server is **stateless**: no per-subscription server state, no `unsubscribe`, no TTL/idle sweep; auth is re-resolved per pull
- Cursor tokens are opaque `"<epoch>:<snapshot>"`; a pull echoes its token, the handler compares its epoch to the current one. A recreate rotates the epoch → stale tokens reset (rebaseline). A pull exceeding `pull.eventLimit` (default 1000) also resets.
- Every migration that changes a pulsed table's shape recreates its events table and thus resets that table's subscribers (accepted design)
- range tracking uses PK boundaries (`rangeStart`, `rangeEnd`) plus a monotonic `snapshot`; SuperJSON crosses the server/client boundary

## Public Imports

```ts
// drizzle-pulse (root)
pulse, PulseTable
QueryDescriptor
type PulseBuilder, ColumnOperators, WhereCondition

// drizzle-pulse/server
PulseRuntime, LogLevel, type PulseRuntimeConfig, type PulseRuntimeWalConfig
createPulseRegistry, PulseRegistry
PulseBuilder, type AnyPulseBuilder, AnyQueries
buildEventsTable, getEventsTableName, DEFAULT_EVENTS_SCHEMA
buildSelectQuery
PulseStore
serializeResponse
applyColumnFilter, type PulseClientContract, PulseQueryContext, WithPk, ColumnsSelection, ...
type PulseAuthContext, ResolvedPulseQuery, WhereClause
type PulseWireEvent
type SubscribeRequest, SubscribeResponse, PullRequest, PullSubscriptionRequest
type PullResponse, PullIncrementalResponse, PullResetResponse, PullResponseError, PullResponseErrorResult
type LoadMoreRequest, LoadMoreResponse

// drizzle-pulse/server/hono
createPulseHonoRouter, type PulseHonoHandlers

// drizzle-pulse/client
createPulseClient
PulseQuery
deserializeResponse
type CreatePulseQueryOptions, PulseQueryState, PulseEvent, PulseInsertEvent, PulseUpdateEvent, PulseDeleteEvent

// drizzle-pulse/client/react
usePulseQuery
type UsePulseQueryResult

// drizzle-pulse/client/embedded
createPulseClient
PulseCollection
createPulseEvents
type EmbeddedPulseClient, PulseCollectionOptions, PulseCollectionChange, PulseRow
type EmbeddedPulseEvents, PulseEventsCallback, PulseEventsOptions

// drizzle-pulse/embedded
createRuntime, LogLevel, PulseCollection
type EmbeddedRuntime, EmbeddedRuntimeConfig, PulseRuntimeWalConfig, PulseSourceDb, TelemetryEvent
type PulseBuilder, AnyPulseBuilders
type EmbeddedPulseClient, EmbeddedPulseEvents
type PulseCollectionOptions, PulseCollectionChange, PulseRow
type PulseEventsCallback, PulseEventsOptions
type PulseEvent, PulseInsertEvent, PulseUpdateEvent, PulseDeleteEvent
type PulseAuthContext
```

`buildEventsTable` moved off the root (its only cross-package consumer, drizzle-kit, is gone) and
is now server-only. The kit-era `PulseTable` recognition helpers and its drizzle `entityKind`
brand were deleted entirely (the cross-package recognition contract they supported has no
remaining consumer).

## Import Rules

- Internal source imports require explicit `.js` extensions
- Keep server-only code out of the `client`, `client/react`, and `client/embedded` entrypoints (the embedded client reaches the runtime through `import type` edges only)
- `src/embedded/` is a server-side entrypoint (value-imports `pulse-runtime` and `@drizzle-team/minipg`) — never add it to platform-imports.test.ts's `ENTRY_POINTS`, and never import it from client codepaths
- If `PulseQuery`, the transport interface, or protocol types change, update the SDK handler, both transports, and client consumers together

## DO NOT

- ❌ Import server modules from client/runtime codepaths
- ❌ Change merge/event semantics in `PulseQuery` without updating integration coverage
- ❌ Forget that `usePulseQuery` is a thin wrapper over `PulseQuery`; the embedded `PulseCollection` is a separate tap-direct implementation over `PulseMergeCore` (not a `PulseQuery` wrapper) — do not reintroduce that coupling
- ❌ Add a merge-core or collection import to `client/embedded/events.ts` — `createPulseEvents` must stay stateless
- ❌ Re-export `buildEventsTable` / the DDL renderer from the root or client entrypoints — they are server-only and pull in `drizzle-orm/pg-core`
