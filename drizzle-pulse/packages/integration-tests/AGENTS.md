# AGENTS.md — packages/integration-tests

## Role

Live PostgreSQL + WAL integration coverage for the Pulse SDK runtime. These tests validate subscribe, pull, load-more, fetch-adapter, event-merging, embedded-collection, runtime self-provisioning (bootstrap), and WAL-reconnect resilience behavior against a real database and logical replication slot.

## Entry Points

- `bun test`
- shared harness: `src/helpers/test-harness.ts`

## File Map

| File | Purpose |
|------|---------|
| `src/helpers/test-harness.ts` | suite setup/teardown, fixture-local helper binding, router fetch adapter, and typed subscribe/pull helpers |
| `src/helpers/db-helpers.ts` | shared DB mutation/event helpers used by the harness |
| `src/client-state.test.ts` | client-state behavior through `PulseQuery` and `initTestQuery()` |
| `src/runtime-contracts.test.ts` | lower-level subscribe/pull/load-more/reset protocol coverage |
| `src/property.test.ts` | property-based WAL/state validation via `fast-check` |
| `src/router-fetch-adapter.test.ts` | verifies `createRouterFetchAdapter()` and selected `PulseQuery` integration paths |
| `src/embedded-collection.test.ts` | embedded client (`drizzle-pulse/client/embedded`) tap-direct `PulseCollection` behavior via the WAL tap + LSN watermark handshake (lsn tokens, same-transaction-same-lsn, `.limit()` rejection), lifecycle, and PG data-type normalization |
| `src/pulse-events.test.ts` | `createPulseEvents` (`drizzle-pulse/client/embedded`) stateless per-event subscription: typed insert/update/delete delivery, commit order + lsn, no-baseline, WHERE filtering, unsubscribe/`runtime.stop()` teardown, sync `.limit()`/`.transform()` rejection |
| `src/consistency-oracle.test.ts` | Consistency oracle: deterministic mid-baseline concurrent insert/update/delete races plus a 15-run randomized property comparing embedded `list()`, an HTTP `PulseQuery` pull, and a direct SQL SELECT against the same runtime |
| `src/bootstrap.test.ts` | runtime self-provisioning: events-schema/`pulse_meta` creation, DDL-hash recreate + epoch rotation, orphan sweep |
| `src/bootstrap-publication.test.ts` | publication create/membership-diff and `REPLICA IDENTITY` handling |
| `src/reconnect-rebaseline.test.ts` | embedded-collection rebaseline behavior across a real WAL reconnect edge (dropped walsender socket) and under a slow baseline read that holds the stream closed — same watermark/baseline handshake as initial load |
| `src/fixtures/` | fixture variants, source-table migrations (events tables are runtime-provisioned, not migrated) |

## Harness Lifecycle

```text
beforeAll
  → const suite = await setupTestSuiteForFixture(fixture, registry)
    → creates a fresh, isolated database
    → applies fixture migrations
    → creates runtime via new PulseRuntime(...)
    → void runtime.start(), then waits for the slot to report active
    → runtime provisions baseline snapshots

beforeEach
  → await suite.cleanupBetweenTests()
    → truncates fixture tables and the events table
    → runtime.ensureBaselines()

afterAll
  → await suite.teardown()
    → idempotent: stops the runtime, drops the slot/publication, drops the database
```

Each test file's `beforeAll` creates one fresh suite context, reused by every test in that file; nothing is shared or counted across files.

## Key Helpers

- `setupTestSuiteForFixture(fixture, registry)` → returns a suite context carrying `runtime`, `router`, `pool`, `db`, `databaseUrl`, `publicationName`, `slotName`, `fixture`, `processDbOperations`, `initTestQuery`, plus the lifecycle methods `teardown()` and `cleanupBetweenTests()`
- `waitForEventsForFixture(fixture, pool, sinceSnapshot, expectedCount, opts?)` → polls events table until enough non-snapshot events arrive
- `createRouterFetchAdapter(router)` → wraps `router.request()` as a fetch-compatible function with `preconnect()`
- `subscribeClient(router, queryName, args)` → typed `/subscribe` helper
- `pullClient(router, cursor)` → typed `/pull` helper with reset handling; `cursor` is the `PullCursor` returned by `subscribeClient` or a prior `pullClient` call
- `processDbOperations(operations)` from the suite context is the preferred fixture-local mutation helper in tests
- `processDbOperations(fixture, pool, operations)`, `insertTestUser(...)`, `waitFor(...)` are shared helpers from `db-helpers.ts`
- `initTestQuery(descriptor)` creates a `PulseQuery` runtime against the fixture router and subscribes it for state-focused tests

## Query / Client Pattern

- Tests build registries with the same `pulse(table)` + `createPulseRegistry` API as production and pass them into `setupTestSuiteForFixture(...)`
- Client-state assertions should prefer `PulseQuery` / `initTestQuery(...)` over hand-rolled merge logic
- `router.request()` is enough for most endpoint tests; use `createRouterFetchAdapter()` when a real fetch implementation is needed
- Prefer fixture-local `processDbOperations(...)` in test files so fixture/pool plumbing stays inside the harness

## Known Behaviors

- `price` is a number
- Empty subscribe can return `snapshot: 0` with `rangeStart/rangeEnd = null`
- Snapshot rows in the events table trigger `{ reset: true, reason: 'snapshot' }` on pull
- Each test needing valid `orders.driver_id` should create a unique user first
- WAL startup is asynchronous; wait for slot readiness instead of sleeping
- `runtime.start()` resolves once the stream is open and rejects if the first connect fails

## Anti-Patterns (DO NOT)

- ❌ Hardcode publication or slot names
- ❌ Use fixed sleeps for WAL propagation; use `waitForEventsForFixture(...)`
- ❌ Reintroduce manual `_pkMap` merge assertions where `PulseQuery` already covers the production path
- ❌ Weaken test assertions just to make runtime changes pass
