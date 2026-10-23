# minipg — Master Test Plan

## Philosophy & Goals

minipg is a small, dependency-free PostgreSQL driver, and a small driver is precisely the kind of code that earns trust only through layered, adversarial testing. This master plan is built on a single organizing belief: **correctness comes first, and everything else (ergonomics, performance, surface area) is negotiable only after correctness is proven.** A database driver sits on the critical path of every byte a user's application reads or writes; a silent decode error, an off-by-one in the wire framer, or a connection that wedges under contention is not a cosmetic defect — it is data corruption or an outage. The plan therefore treats every behavioral claim as a falsifiable hypothesis with a test attached.

The testing strategy is deliberately **layered**, because no single technique catches every class of defect:

- **Unit tests** pin the pure, deterministic core: the wire-protocol writers (`W.*`), the frame parser, the row/field decoders, and the parameter encoders. These run with no database at all, are byte-exact against golden fixtures, and form the fast inner loop that must stay green on every save. They are where we encode the *exact* contract of the protocol implementation in `protocol.ts` and `codec.ts`.
- **Integration tests** exercise the driver against a *real* PostgreSQL server across a version matrix (PG 14–17). These prove that what we *think* we send is what PostgreSQL actually accepts, and that what PostgreSQL sends back is decoded faithfully. Round-trip fidelity (INSERT then SELECT, value-identical) is the backbone assertion.
- **Property and fuzz tests** attack the spaces between the examples. Encoders and decoders must be *total* over their input domains; the frame parser must reassemble correct results regardless of how the TCP stream is chopped into chunks. Property testing (fast-check is the recommended tool) generates the adversarial inputs a human would never think to write, and has already surfaced two source-derived defects worth flagging at the top of this plan: `Parser.push` has no negative/minimum length guard (a negative length field yields a non-advancing offset and an infinite-loop/desync), and `W.bind` has no 65535 16-bit parameter-count guard.
- **Chaos tests** assert liveness and settlement under failure. Connections drop, backends are killed mid-query, pools are drained while waiters are queued. The governing invariant is blunt: **every terminal event must settle** — every promise either resolves or rejects, and the driver never leaks a hung waiter or a half-open connection.
- **Performance tests** guard against regression, not for vanity numbers. They live in a separate benchmark harness with baseline-banded thresholds so they measure trend, not noise, and they are explicitly *not* gating correctness.

This is not a plan assembled from first principles in a vacuum. It is **grounded in 22 domain plans derived from the analysis of 1,175 real issues** mined from the `postgres.js` and `node-postgres` issue trackers — the two most battle-tested PostgreSQL drivers in the JavaScript ecosystem. Every footgun those communities hit over a decade (timezone shifts in temporal decoding, prototype pollution via object-mode rows, silent plaintext fallback in TLS negotiation, transaction state leaking across pool checkouts, COPY hanging the connection) is mapped to a concrete test or an explicit out-of-scope guard here. Where minipg deliberately does *less* than its forebears — text-only result decoding, extended-protocol-only query path, raw-string temporal types — the plan converts those decisions into **guard tests** that assert the boundary on purpose, so a future "improvement" cannot silently change behavior without a test going red.

The goal, stated plainly: a contributor should be able to change any line of `connection.ts`, `codec.ts`, `protocol.ts`, `auth.ts`, or `pool.ts` and have the test suite tell them, quickly and unambiguously, whether they broke a contract — and if minipg ever grows a new feature, the roadmap `[todo:feature]` markers throughout these plans already describe the test that must accompany it.

## Tooling & Conventions

**Runner.** Tests use `bun:test` as the primary runner (Bun is minipg's primary runtime). Node.js is covered as a smoke-parity target since the driver is built on the portable `net`/`tls`/`crypto` surface.

**Layout.** Tests live under a `test/` tree organized by domain, mirroring the section structure of this plan (one directory or file group per domain key below). Pure unit tests sit alongside their target module's contract; integration tests are grouped so they can share PG fixtures.

**Tags.** Every test carries a priority tag and a type tag:
- Priority: `p0` (correctness-critical, must never be skipped), `p1` (important coverage), `p2` (edge/nice-to-have).
- Type: `unit`, `integration`, `property`, `chaos`, `perf`.
These tags drive selective runs (e.g. `p0 && unit` for the fast pre-commit loop, full matrix in CI).

**PG fixtures & version matrix.** Integration tests run against **ephemeral PostgreSQL instances**. The preferred path is Docker-based containers across the **PG 14–17** matrix; when Docker is unavailable the harness falls back to a local `pg_ctl`-managed cluster with per-worker ports. Each test worker gets its own port to allow parallelism.

**Isolation strategy.** Because minipg permits only a single in-flight query per connection, transaction-rollback isolation is awkward; the recommended strategy is **schema-per-suite** isolation — each suite provisions its own schema (and/or database) and tears it down, avoiding cross-test bleed without fighting the single-in-flight constraint.

**Golden / wire-capture.** Protocol-level tests assert **byte-exact** output against committed golden fixtures, and a wire-capture facility records real client↔server byte exchanges so decoder/encoder changes are diffable against captured truth.

**Coverage gates.** Coverage is tracked with gates that focus on the correctness-critical core (`protocol.ts`, `codec.ts`, `connection.ts`, `auth.ts`, `pool.ts`); the gate is a floor that ratchets up, never down.

**CI.** CI runs the full tagged matrix (all PG versions × Bun primary + Node smoke), enforces coverage gates, and applies a **flaky-test policy**: a test that flakes is quarantined and fixed, never silently retried into green.

## Test Suite Map

| Domain | Scope | Est. Cases | Headline |
|---|---|---|---|
| `harness` | domain test plan | 46 | Foundation test-harness plan for minipg: bun:test runner, ephemeral pg_ctl fixtures with per-worker ports, schema-per-suite isolation (recommended over txn-rollback due to single-in-flight-per-connection), typed connect/queryArray helpers, data factories, PG 14-17 matrix (Docker down -> local pg_ctl), tags/CI/coverage/flaky policy, and golden-file/wire-capture infra; ~46 cases across 13 groups. |
| `protocol-unit` | domain test plan | 72 | Byte-exact golden tests for every W.* writer, chunk-boundary/fuzz Parser tests, parseRowDescription/parseDataRow NULL+empty+zero-col cases, and encodeParam/decoder-map units — all pure no-DB, grounded in protocol.ts and codec.ts. |
| `property-fuzz` | domain test plan | 38 | Property/fuzz plan covering INSERT->SELECT round-trip invariants across types, encoder/decoder totality, and the chunking-invariant framer; fast-check recommended, with two source-derived defects flagged: Parser.push has no negative/min length guard (negative length field -> non-advancing off -> infinite-loop/desync) and W.bind has no 65535 16-bit param-count guard. |
| `concurrency-chaos` | domain test plan | 44 | Concurrency & Chaos plan: FIFO serialization, interleaved query+stream, pool contention/self-heal, and the "every terminal event settles" chaos invariant — grounded in connection.ts fatal()/processQueue and pool.ts, flagging two real footgun bugs (Pool.end() leaves waiters hanging; idle LIFO) and 5 todo:feature cancel/timeout/abort specs. |
| `perf` | domain test plan | 49 | Separate Bun benchmark harness (bench/) for throughput/latency/memory with baseline-banded, non-flaky regression thresholds; grounded in minipg's array-shift queue, Buffer.concat parser accumulation, per-row makeRow/decoderFor cost, static OID decoders (no introspection reload), and no per-query stack capture — with roadmap maxResultSize/timing-hooks/binary-result as pending benches. |
| `security` | domain test plan | 51 | 8 groups / 51 cases: param-boundary injection, NUL handling, prototype-pollution-safe object keys, secret redaction, SASLprep+SCRAM hardening, TLS fail-closed, identifier-escape helpers (todo), and out-of-scope guards — grounded in source, with 3 likely real findings (object-mode plain {} pollution, enumerable cfg.password, ssl:true=rejectUnauthorized:false). |
| `connection-config` | domain test plan | 44 | Connection & Config plan (partial): object-only config — defaults/PG* env/default-user/startup params (application_name, client_encoding=UTF8) and connect-lifecycle errors are impl; URL/connection-string parsing, unix sockets, multi-host, custom streams, and options/search_path forwarding are todo/guard. |
| `tls-ssl` | domain test plan | 44 | TLS/SSL plan (partial scope): 14 groups, 44 cases grounded in connection.ts startSSL() — covers ssl true/'require'/object coercion, SSLRequest framing + single-byte S/N read footgun, the silent plaintext fallback bug when an ssl OBJECT meets an N reply, rejectUnauthorized/self-signed, custom CA + client-cert (incl. non-enumerable key spread guard), SNI/servername with the IP-not-forwarded gap, malformed-PEM crash guard, and roadmap todos for connection-string sslmode, verify-ca/full, prefer fallback, direct-TLS/ALPN, PGSSL* env, and credential refresh. |
| `auth` | domain test plan | 44 | Authentication test plan: cleartext/md5/SCRAM happy paths + unit-level SCRAM state-machine guards (nonce mismatch, signature tamper, iteration cap), 28P01 surfacing without crashes, SASLprep/Unicode parity, mechanism negotiation, and pending roadmap specs (iteration-floor gap accepting i=1, channel binding -PLUS, async/.pgpass/cert/GSSAPI creds) with out-of-scope trust/peer guards. |
| `query-protocol` | domain test plan | 58 | Plan for extended-protocol-only Query Protocol domain: minipg sends P/D/B/E/S per query (no simple-query path, no pipelining, text-only Bind result format, Execute maxRows=0), so multi-statement strings hard-error 42601, empty/whitespace/comment-only resolve as EmptyQueryResponse (command:null), and NoData vs RowDescription separate no-row-set from empty-rows; 58 cases across 14 groups covering byte-layout units, parser chunk-reassembly, error/Sync recovery, FIFO queueing, NUL/identifier fidelity, out-of-scope guards (COPY hangs, no event-emitter, psql meta 42601), and roadmap pendings (binary result format, timeout/cancel, portal fetch). |
| `parameters` | domain test plan | 58 | Parameters & Binding plan grounded in codec.ts/connection.ts/protocol.ts: 11 groups, 58 cases covering verbatim transmission, NULL/undefined→NULL, scalar/bigint/Date/Buffer encoding, the JS-array→JSON footgun (= ANY does NOT work), server-side count mismatch & the i16(32768) RangeError limit, NUL-byte guards, type inference/casts, and roadmap pendings. |
| `prepared-statements` | domain test plan | 44 | Prepared-statements plan grounded in minipg's per-connection cache (Parse/Describe/Bind/Execute), covering named parse-once/bind-many, silent Close+re-Parse on same-name/different-SQL, unnamed-statement no-accumulation, type inference, cache-invalidation footguns (DDL/DEALLOCATE/already-exists), pool per-connection isolation, plus roadmap todos (describe-only, prepare-without-execute, deallocate API, prepare:false/simple, binary results). |
| `results` | domain test plan | 55 | Result Modes & Metadata plan: 12 groups / ~55 cases covering array/object/buffer/raw shapes, rightmost-wins duplicate-column collapse, NULL cells in every mode, columns metadata (names-only; rich field descriptors are todo:feature), empty-set keeps columns, command-tag/rowCount semantics for SELECT/INSERT/UPDATE/DELETE/DDL/DO, RETURNING, and guards for unsupported multi-statement/transform/map/binary. |
| `types-core` | domain test plan | 58 | Core scalar data-type round-trip/NULL/decode plan: 11 groups, 58 cases grounded in codec.ts's OID decoder map (int8/numeric/money/uuid string-default, asNumber for int2/4/float, asBool, asBytea) plus config.types overrides; flags BigInt/Uint8Array-encode, client_encoding, and array-element decode as todo:feature gaps. |
| `types-temporal-json` | domain test plan | 58 | Plan for Temporal & JSON types: minipg decodes all temporal types as raw strings (sidestepping the TZ-shift/off-by-one bug class as guard tests) and JSON via JSON.parse with single-stringify param encoding; 58 cases across 16 groups covering string-passthrough baselines, Date param encoding, json object/array/scalar/null binding, bigint-in-json precision loss, double-encoding footguns, decoder overrides, plus roadmap [todo] Date/Temporal decoders. |
| `types-advanced` | domain test plan | 78 | Planned 78 cases across 14 groups for advanced data types (arrays, ranges, composites, enum, domain, network, geometric, hstore, custom registration, all-types round-trip matrix), splitting each into the current asString/JSON.stringify baseline contract grounded in src/codec.ts (only bool/bytea/int2/int4/oid/float4/float8/json/jsonb decoders registered; everything else falls back to UTF-8 string, and JS arrays/objects encode as JSON not PG literals) versus [todo:feature] opt-in per-OID decoders/serializers. |
| `errors-notices` | domain test plan | 44 | Errors & Notices plan: 11 groups / 44 cases grounding PgError field contract, full SQLSTATE coverage, promise-only catchable propagation, and post-error recovery — flags 3 key deviations (name 'PgError' not 'DatabaseError', .position stays string, uncatchable type-parser throw outside onData try/catch) and that NoticeResponse is silently dropped; tags notice-surfacing/SQLSTATE-constants/.cause/stack-at-callsite as todo:feature. |
| `transactions` | domain test plan | 46 | Transactions plan (partial/roadmap): 11 groups, ~46 cases over raw BEGIN/COMMIT/ROLLBACK on dedicated pool.connect() clients, 25P02 aborted-state, savepoints, isolation/locking/deadlocks, autocommit, commit visibility, plus the two central minipg footguns — no ReadyForQuery tx-status tracking (connection.ts:151 ignores I/T/E) and no pool-release rollback/DISCARD reset (pool.ts:38), causing tx and GUC leakage across checkouts — with begin() sugar and session-reset as [todo]. |
| `cancellation-timeouts` | domain test plan | 38 | Connect timeout is the only implemented bound; per-query timeout/AbortSignal/CancelRequest are todo (backendKey captured but unused), with three grounded footguns: stream early-break never cancels server-side, idle-in-tx FATAL loses SQLSTATE 25P03, and end() can leave an in-flight query promise hanging. |
| `pool` | domain test plan | 58 | Pool plan: 14 groups / ~58 cases grounding lazy-open+FIFO-waiter+eviction+drain on src/pool.ts, flagging 4 real source footguns (no double-release guard, waiters silently dropped at end(), refill() open-failure wedges waiters, immediate Connection.end() = no true drain) plus roadmap pending specs for timeout/min/idle-reap/lifetime/session-reset/events. |
| `streaming` | domain test plan | 46 | Streaming plan for minipg's stream() async-iterator: 9 groups / ~46 cases covering all-mode iteration, real TCP pause/resume hysteresis (HWM default 200, resume below HWM/2), the early-break-drains-everything footgun (no protocol cancel), mid-stream/backend-kill error rejection, empty/large(1e6) bounded-memory, queue interleaving + named-statement reuse, plus guards for absent cursor/Readable APIs and roadmap CancelRequest/AbortSignal/binary-format/simple-query pendings. |
| `out-of-scope` | domain test plan | 33 | Guards for absent surfaces (no sql`` tag, LISTEN/NOTIFY & Notice frames swallowed, COPY/replication unsupported) plus Bun-primary/Node-smoke runtime parity over a pure net/tls/crypto surface. Key footgun: COPY FROM STDIN hangs because connection.ts handle() drops the CopyInResponse 'G' frame in its default branch and never replies, so no ReadyForQuery arrives; COPY TO STDOUT instead resolves empty. |
| **Total** | **22 domains** | **1106** | Master coverage across the minipg surface |


## Coverage Critique, Sequencing & Priority Matrix

_Meta-review across all 22 section plans for the minipg PostgreSQL driver, checked against the original gap analysis (`coverage_gaps_test_suite_priorities.md`). The corpus is strong: ~1,106 estimated cases (≈1,220 distinct bracketed `[Px]` items once multi-case bullets are counted), every section is source-grounded to `src/connection.ts`/`codec.ts`/`protocol.ts`/`auth.ts`/`pool.ts`, and several of the gap analysis's flagged self-inconsistencies were already corrected in-plan. This document grades remaining coverage holes, fixes a build order, and points out where domains must share fixtures rather than re-derive contracts._

---

### Gaps — what the plan still misses vs the gap analysis

The gap analysis demanded six classes of "mandatory but issue-thin" behavior. Status after reading every section:

| Mandatory behavior (gap analysis) | Status in plan | Verdict |
|---|---|---|
| All-common-types round-trip matrix | `types-advanced` added an explicit "ALL-COMMON-TYPES round-trip matrix (smoke)" group (one case per OID, decoder + string-default + NULL + `=ANY` array) | **Closed** |
| NULL-in-every-position, per type | matrix group + `property-fuzz` NULL round-trip + `results` NULL-across-all-modes | **Mostly closed** |
| Positive extended-protocol baseline | `query-protocol` P,D,B,E,S single-write byte-order test + reply-order test; `harness` golden wire-capture | **Closed** |
| Plain CRUD invariants | only as `rowCount`/RETURNING side effects (`results`, `transactions`) | **Partial — see additions** |
| binary↔text equivalence | binary result format is unimplemented; appears only as scattered `todo:feature` skips | **Open (roadmap), under-specified** |
| Network types (inet/cidr/macaddr/macaddr8) | `types-advanced` added a "Network types (the MISSING family)" group | **Closed** |
| `money` scalar | `types-core` added OID 790 string-fallback | **Closed** |
| `time` (no tz) | `types-temporal-json` added OID 1083 baseline | **Closed** |
| `name` scalar | `types-core` added OID 19 | **Closed** |

**Concrete additions still required:**

1. **`tsvector` / `tsquery` stored-column decode + round-trip.** Still only appears as a `to_tsquery($1)` *parameter context* (parameters/prepared). Add to `types-advanced`: `SELECT $1::tsvector` and a stored `tsvector` column → raw-string fallback baseline + NULL + `tsquery` round-trip.
2. **Remaining absent scalar OIDs.** Add raw-string-fallback baselines (decode + NULL) for: `xml` (142), `"char"` (18, distinct from `char(n)`/`bpchar`), `pg_lsn` (3220), `xid`/`xid8`/`txid_snapshot`, `int2vector` (22), `bit`/`varbit` explicit width round-trip (today `bit` is a sub-item of the bool section; `varbit` is absent). One parametrized table covers all of them cheaply.
3. **Plain CRUD observation invariants.** Add a tiny `crud` group (fits in `results` or a new file): `INSERT → SELECT sees it`, `UPDATE n → SELECT shows new values`, `DELETE → SELECT gone`, asserting *observed data*, not just the command tag/`rowCount`. The gap analysis explicitly called this out; it is currently only implied by transaction and rowCount tests.
4. **Multi-row ordering/completeness invariant.** Add one parametrized case: "N rows in → N rows out, same `ORDER BY` order, no dedup/no fabrication" across row counts {0, 1, N, large(≥5000)}. Currently split between `results` (ordering) and `streaming` (order) but never asserted as a single completeness invariant over a count sweep.
5. **Binary↔text equivalence matrix (as a single roadmap suite).** Binary result format is correctly out-of-reach today (Bind hardcodes text), but the pending specs are scattered one-per-section. Consolidate into ONE `todo:feature` matrix (one case per common OID: `numeric, bool, bytea, date, int4/8, timestamp, array`) so when binary lands it is a single guarantee, matching the all-types text matrix.
6. **`money`/locale and SQL_ASCII encoding** are noted but un-pinned: add `SET lc_monetary` pin for the `money` string assertion and keep the `client_encoding` non-UTF8 path as the existing `types-core` roadmap todo.

**Domains the gap analysis ranked but that have NO dedicated section file (coverage is distributed — flag for an owner):**
- **`lifecycle-reconnect`** (gap-analysis P0, 207 issues): no file; behaviors are scattered across `concurrency-chaos` (settlement invariant, socket-kill, `end()`), `pool` (dead-conn eviction/refill), `connection-config` (connect settles), `cancellation-timeouts` (`end()`-hangs-in-flight footgun). The "every terminal event settles" invariant is re-derived ≥6 times. Needs a single owner + shared helper (see De-dup).
- **`api-ergonomics`** (gap-analysis P1): no file; promise-vs-callback, `instanceof Connection/Pool`, result destructuring contract, dynamic-SQL-is-caller's-job are spread across `results`, `out-of-scope`, `errors-notices`. Acceptable but un-owned.
- **`runtime-portability` bundler matrix / `build-native` install matrix**: deliberately excluded from the in-process suite (correct per gap analysis — these need a CI build-and-import matrix). `out-of-scope` covers Bun+Node parity + pure-net/tls/crypto audit; `harness` covers the PG service matrix. The webpack/Vite/Deno-edge bundler lane is genuinely absent — note it as an explicit non-goal, not an oversight.
- **`perf`** is correctly a *separate band-based harness* (`bench/`), not boolean pass/fail — keep it out of the gating suite.

---

### Priority matrix (P0/P1/P2 case counts per domain)

Counts are bracketed `[Px]` items per section (multi-assertion bullets count once); stated per-section estimates in the last column. Build order is top-to-bottom within each phase.

| Domain (section file) | P0 | P1 | P2 | stated est | Build phase |
|---|---:|---:|---:|---:|:--|
| harness | 12 | 17 | 22 | 46 | **0** |
| protocol-unit | 41 | 23 | 12 | 72 | **1** |
| connection-config | 11 | 20 | 21 | 44 | **1** |
| auth | 13 | 20 | 13 | 44 | **1** |
| query-protocol | 22 | 30 | 17 | 58 | **1** |
| parameters | 17 | 27 | 21 | 58 | **1** |
| results | 20 | 21 | 15 | 55 | **1** |
| errors-notices | 18 | 19 | 11 | 44 | **1** |
| prepared-statements | 8 | 24 | 15 | 44 | **1** |
| transactions | 14 | 24 | 15 | 46 | **1** |
| pool | 20 | 27 | 21 | 58 | **1** |
| concurrency-chaos | 16 | 25 | 12 | 44 | **1** (lifecycle/settlement core) |
| types-core | 26 | 32 | 17 | 58 | **2** |
| types-temporal-json | 19 | 26 | 17 | 58 | **2** |
| types-advanced | 27 | 36 | 25 | 78 | **2** |
| property-fuzz | 15 | 17 | 11 | 38 | **2** |
| tls-ssl | 15 | 20 | 17 | 44 | **2** |
| security | 15 | 25 | 10 | 51 | **2** |
| streaming | 14 | 21 | 13 | 46 | **2** |
| cancellation-timeouts | 12 | 19 | 8 | 38 | **3** |
| out-of-scope | 8 | 13 | 10 | 33 | **3** |
| perf (separate `bench/`) | 9 | 21 | 19 | 49 | **3** (non-gating) |
| **TOTAL** | **372** | **507** | **342** | **1106** | |

P0 reading: the 372 P0 cases ARE the foundation + max-severity floor. `protocol-unit` (41 P0, pure/no-DB) and `types-core` (26 P0) carry the most P0 weight; build them early because they are cheap (no server / one server) and anchor every downstream value assertion.

---

### Phased build roadmap

**Phase 0 — Harness (blocks everything).** Build `plan_harness` first: `bun:test` runner + `bunfig` preload, the `startPg()` ephemeral-cluster fixture (local `pg_ctl`, unique port per worker, NOT 5432; Docker is the optional multi-version lane since Docker is down), schema-per-suite isolation, the typed `testConnect`/`testPool`/`queryArray` helpers, the shared assertion helpers (`expectPgError(code)`, `expectRejectsClosed`, `expectNumericString` for the int8/numeric-as-string footgun), `seedCore`/factories, and the golden wire-capture harness. Rationale: zero functional tests can run without the fixture + helpers, and the shared error-shape/settlement helpers must exist before any P0 functional section so the cross-cutting invariants aren't re-implemented 22 times.

**Phase 1 — P0 functional core (the data + lifecycle contract).** In order: `protocol-unit` (pure byte/parse/codec goldens + the parser never-throws fuzz — no DB, fastest feedback, anchors framing) → `connection-config` + `auth` (the connect gate: defaults/env/precedence, cleartext/md5/SCRAM, settle-never-hang) → `query-protocol` (extended-only P/D/B/E/S sequence, empty/NoData/CommandComplete, multi-statement 42601, FIFO) → `parameters` (the Bind path, NULL/bigint/JS-array footgun, count mismatch, NUL guard) → `results` (the `{rows,columns,rowCount,command}` contract, 4 modes, duplicate-collapse, NULL cells) → `errors-notices` (PgError shape, SQLSTATE, "every error is a promise rejection, never uncatchable") → `prepared-statements` (per-conn cache, reuse/re-parse, poisoning guards) → `transactions` (commit/rollback/25P02/savepoints/connection-reuse hazard) → `pool` (lazy open, max bound, FIFO waiters, dead-conn refill, `end()` settles) → `concurrency-chaos` (single-conn FIFO serialization, the socket-kill **settlement invariant**, `Pool.end()` parked-waiter hang bug). Rationale: this is exactly the gap-analysis P0 set (connection→auth→query-protocol→parameters→results→errors→prepared→transactions→pooling→lifecycle); each layer is a hard contract every later section assumes. Build the no-DB `protocol-unit` first for the tightest loop, then the live-server core.

**Phase 2 — Types + property/fuzz + the connection gates with regression history.** `types-core` → `types-temporal-json` → `types-advanced` (includes the new all-types matrix + the gap additions: tsvector/xml/pg_lsn/"char"/bit-varbit, network family). Then `property-fuzz` (round-trip invariants + framing chunking-invariance + the negative-length/`>65535`-param footgun probes) once the value contracts are pinned. Then `tls-ssl` + `security` (connection gates with the heaviest config-coercion regression history; security depends on the param-injection and prototype-pollution surfaces being live) and `streaming` (backpressure pause/resume, cancel-drain). Rationale: types are the #1 silent-corruption surface but depend on a working query/result core; property tests generalize the Phase-1 example-based contracts; TLS/security/streaming are higher-severity but lower-criticality sub-states that ride on the core.

**Phase 3 — Chaos/perf/roadmap todos.** `cancellation-timeouts` (mostly `todo:feature` — connect-timeout is the only impl; CancelRequest/AbortSignal/query-timeout pending) and `out-of-scope` guards (LISTEN/NOTIFY-ignored, COPY-FROM-STDIN-hang footgun, runtime parity). Run `perf` as the separate non-gating `bench/` harness with committed baselines. Rationale: these are either pending-feature placeholders, intentional-absence guards, or relative/flaky measurements — none should gate the PR fast lane; they belong in the nightly/bench lane.

---

### De-dup & overlap notes

The single biggest efficiency win is consolidating cross-cutting contracts into shared fixtures/helpers (the gap analysis warned each would otherwise be asserted subtly differently per section):

- **Settlement / "every terminal event settles a promise, never an uncaught crash"** — re-derived in `errors-notices`, `concurrency-chaos`, `auth`, `tls-ssl`, `connection-config`, `pool`, `streaming`, `cancellation-timeouts`. Make ONE harness assertion (`expectAllSettled(promises)` + the in-flight-and-queued-all-reject-on-socket-kill helper) and import it; do not re-write `fatal()`/`Promise.allSettled` drains in eight files. This is the de-facto `lifecycle-reconnect` domain — give it one owner.
- **NUL byte (0x00) contract** — asserted in `parameters`, `query-protocol`, `types-core`, `protocol-unit`, `security`, `streaming`. Define ONE contract in the harness and reference it: text/varchar 0x00 → deterministic client-side throw; bytea 0x00 → round-trips (binary path); query-text 0x00 → `guardNul` client reject; object/JSON path → escaped to ` `, wire-safe. One `nulCases` fixture + `expectNulRejected` helper.
- **bigint default = STRING** — `types-core` (int8→string), `types-temporal-json` (bigint-in-json precision loss), `parameters` (BigInt→`String()`), `results` (BIGINT as string). One shared `expectNumericString` matcher (already proposed in harness) + one canonical statement of the default; the opt-in `config.types` BigInt path tested once and referenced.
- **Timezone / DateStyle** — spans `types-temporal-json`, `connection-config` (startup params), `pool` (per-conn SET), `results`. The string-passthrough invariant only holds if the host-`TZ`/session-`TimeZone`/`DateStyle` pins are identical everywhere. Share one `withServerSettings({TimeZone, DateStyle, bytea_output:'hex', extra_float_digits:3})` fixture + the `TZ`-subprocess helper; don't re-pin per section.
- **Simple-vs-extended routing / multi-statement 42601** — guarded in `query-protocol`, `parameters`, `transactions`, `results`, `prepared-statements`, `streaming`, `security`. One `expectMultiStatementRejected` helper asserting SQLSTATE 42601 (not message text); reference from all.
- **Pooled session-state leakage (SET/GUC/search_path/RLS)** — `pool` (LEAK GUARD), `transactions` (GUC-LEAKAGE GUARD), `security` (RLS `SET LOCAL` todo), `connection-config`. Both a correctness and a security boundary. Test the reset-on-checkin contract ONCE (it currently leaks — no reset in `pool.release()`); the three other sections reference the same fixture and assert their angle.
- **Type-parser registry scoping (no cross-contamination)** — `types-advanced` (`buildDecoders` returns a new map), `types-core`, `types-temporal-json`, `results`, `errors-notices` (throwing decoder). One shared "register override on conn A, assert conn B + `defaultDecoders` unmutated" fixture.
- **Backpressure pause/resume** — `streaming` (primary), `concurrency-chaos`, `perf`. Share the `socket.pause/resume` spy + HWM-hysteresis helper so the assertion (pause at `buf>HWM`, resume at `<HWM/2`) is written once.
- **Mock/stub TCP server** — needed by `concurrency-chaos`, `cancellation-timeouts`, `tls-ssl`, `connection-config`, `errors-notices`, `security`, `protocol-unit`-adjacent. Build ONE configurable raw `net.Server` (accept-then-silent, SSLRequest→`N`/junk byte, byte-at-a-time writes, truncated/garbage frames, out-of-order `1`/`2`/`A`/`N` with no active query, `57P01`, mid-query `destroy()`). This is a Phase-0 harness asset, not a per-section re-build.
- **Out-of-scope guards (`sql\`\``, LISTEN/NOTIFY, COPY)** — duplicated across `harness`, `out-of-scope`, `query-protocol`, `pool`, `streaming`, `transactions`, `parameters`. Keep the authoritative versions in `out-of-scope` and have other sections reference, not re-assert, the absence.


## Test Harness & Infrastructure — scope: implemented

This domain is the foundation that every other test section depends on: it provisions PostgreSQL, isolates tests, exposes typed `connect()`/`queryArray` helpers, and defines tagging, CI, coverage and golden-file conventions. minipg has no test runner today — `package.json` only ships `bun test/smoke.ts` (a single hand-rolled script using `node:assert`, 15 inline checks) plus a manual `test/setup-pg.sh` that `initdb`s a throwaway cluster on port `54329`, writes a custom `pg_hba.conf` (trust local, md5 for `md5user`, scram for everyone else), creates `testdb` + table `t`, and prints a readiness line. The driver itself reads env (`PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`) in `Connection` constructor, defaults port 5432, `ssl:false`, `connectTimeout:30000`, and uses `bun`/`node:net`/`node:tls`. The plan migrates to `bun:test` (`describe/test/expect`), turns `setup-pg.sh` into a programmatic fixture with a unique port per worker, recommends a single isolation strategy, and adds version-matrix + golden-wire infrastructure. Because Docker is currently down, the default path must be local `pg_ctl`; Docker is the optional multi-version lane.

### Test groups

#### Runner & config bootstrap
- [P0][unit][impl] `bun:test` discovers `test/**/*.test.ts`; a no-op `expect(true).toBe(true)` spec runs green via `bun test` (replaces `bun test/smoke.ts` entrypoint). Assert exit code 0 and TAP/console summary present.
- [P0][unit][impl] Global `preload`/setup module (configured in `bunfig.toml [test] preload`) runs exactly once before any suite and exposes the chosen connection base config; assert the preload ran (side-effect flag) and `process.env.PGPORT` resolves to the ephemeral cluster's port, not 5432.
- [P1][unit][impl] `tsconfig`/`@types/bun` wired so `expect`, `describe`, `test`, `beforeAll/afterAll` typecheck (`bun run typecheck` clean); guards against the current setup where only `node:assert` is used.
- [P2][unit][impl] Runner honors `--timeout` and a per-test default timeout (e.g. 30s) so a hung connect (driver default `connectTimeout` 30000ms) cannot wedge CI indefinitely.

#### Ephemeral PostgreSQL fixture (initdb / pg_ctl)
- [P0][integration][impl] `startPg()` helper: `initdb` into a temp `PGDATA` under the OS temp dir (not repo `test/.pgdata`), starts `pg_ctl -w` on a free port, returns `{port, host, dataDir, stop()}`; assert a `connect()` to it succeeds and `select 1` returns `[[1]]`.
- [P0][integration][impl] Unique port per worker: when started concurrently (simulate 2 fixtures), each binds a distinct free port and a distinct `PGDATA`/socket dir; assert both accept connections simultaneously and neither sees the other's data.
- [P0][integration][impl] Teardown: `stop()` does `pg_ctl stop -m immediate` and `rm -rf` the data dir; assert process is gone (connect now rejects with `ECONNREFUSED`/`connection terminated`) and no temp dir leaks. Registered in `afterAll` so a failing assertion still cleans up.
- [P1][integration][impl] Reuse-existing-server mode: if `PGTEST_EXTERNAL=1` (or `PGPORT` points at a live server), skip `initdb` and run against the external cluster; assert helper detects readiness via a connect-retry loop instead of spawning.
- [P1][chaos][impl] Readiness poll: helper retries connect for N attempts while `pg_ctl` is still opening the socket; assert it does NOT return before the server answers `select 1` (guards against race where `pg_ctl -w` returns but auth roles aren't created yet).
- [P1][integration][impl] `pg_hba.conf` is generated to support the auth matrix exactly like `setup-pg.sh` (local trust; `md5user`→md5; default→scram-sha-256) and `password_encryption` toggled per-role at creation; assert md5user authenticates via MD5 path and scramuser via SCRAM (`AuthenticationSASL`).
- [P2][chaos][impl] `initdb`/`pg_ctl` not on PATH → helper throws a clear, actionable error ("install postgresql or set PG_BIN") rather than a raw spawn ENOENT.
- [P2][integration][impl] Server log captured to fixture dir and surfaced on fixture-start failure (so CI shows the `server.log` tail when startup fails).

#### Per-test isolation strategy (RECOMMENDATION: schema-per-suite + truncate-per-test, with txn-rollback opt-in)
- [P0][integration][impl] RECOMMENDED baseline: one shared cluster + one shared `testdb`; each suite creates a uniquely-named `SCHEMA` (`set search_path`) in `beforeAll`, drops it `afterAll`; assert two suites with same-named table do not collide. Rationale below.
- [P0][integration][impl] Per-test cleanup: `beforeEach` truncates/recreates suite tables (or wraps factory inserts); assert test B does not see rows inserted by test A in the same suite.
- [P1][integration][impl] Opt-in txn-rollback isolation helper `withRollback(fn)`: checks out a dedicated `pool.connect()` client, `BEGIN`, runs `fn(client)`, always `ROLLBACK`; assert mutations are invisible afterward. NOTE the footgun: minipg has ONE query in flight per connection, so the rolled-back work MUST use the same checked-out `client`, never `pool.query` (which acquires a different connection) — assert a guard/test demonstrating this pitfall.
- [P1][integration][impl] DDL-in-rollback caveat: assert txn-rollback isolation still works for DDL (CREATE TABLE inside BEGIN/ROLLBACK) since PG DDL is transactional — documents why rollback can replace truncate for some suites.
- [P2][integration][impl] db-per-suite alternative path (`CREATE DATABASE`/`DROP DATABASE`) exists for suites needing server-level settings (e.g. `password_encryption`, role-scoped GUCs); assert it works but is marked slower (used sparingly).

> Recommendation rationale: schema-per-suite gives strong isolation without the cost of `CREATE DATABASE` per test, and avoids txn-rollback's incompatibility with the driver's single-in-flight-per-connection model (a pool-based test that opens a transaction on one connection but queries on another would deadlock/leak). Reserve txn-rollback for single-connection read-heavy suites via the explicit `withRollback` helper.

#### Typed connect helper & assertion helpers
- [P0][unit][impl] `testConnect(overrides?)` returns a `Connection` bound to the ephemeral cluster base config and auto-registers `conn.end()` in `afterEach`; assert no socket handles leak between tests (track open handles count).
- [P0][unit][impl] `testPool(overrides?)` returns a `Pool` with auto `end()` registration; assert `pool.size`/`idleCount` return to a clean state and `end()` is idempotent-safe across teardown.
- [P0][unit][impl] `queryArray(conn, sql, params)` helper → returns `rows` as `unknown[][]` (mode 'array') with typed generic; assert it round-trips `select $1::int` → `[[7]]`. Mirror `queryObject`, `queryBuffer`, `queryRaw` helpers, each asserting the result mode shape from `makeRow`.
- [P1][unit][impl] `expectPgError(promise, code)` assertion helper: rejects-with-`PgError`-and-SQLSTATE matcher; assert it catches `42P01` on `select from missing_table` and FAILS clearly when a non-PgError is thrown.
- [P1][unit][impl] `expectRejectsClosed(promise)` helper for the "connection is closed" / "connection terminated unexpectedly" paths (driver throws plain `Error`, not `PgError`); assert message matching is stable.
- [P2][unit][impl] Decimal/bigint assertion helper acknowledging minipg keeps int8/numeric as STRING — `expectNumericString(val, '1234.56')` — to stop authors writing `expect(v).toBe(1234.56)` (a known footgun, since amount/n8 are strings per `defaultDecoders`).

#### Data factories & seeders
- [P0][unit][impl] `seedCore(conn)` recreates the canonical `t(id serial, name text, n8 bigint, amount numeric, ok bool, data jsonb, blob bytea)` with the same 3 rows as `setup-pg.sh` (alice/bob/NULL-row incl. `\x00ff` bytea); assert seed is idempotent (drop-if-exists then create) and row count = 3.
- [P0][unit][impl] Factory `makeRows(n, overrides)` bulk-inserts via a single parameterized multi-VALUES (or `generate_series`) statement; assert inserting 1000 rows then `select count(*)` = 1000 and respects param NUL-guard (no `\x00` text params).
- [P1][unit][impl] Edge-value factory dataset: empty string, multi-byte UTF-8 (emoji), max int8 `9223372036854775807`, negative numeric, `'NaN'::numeric`, large jsonb, empty array `'{}'`; assert each decodes to the documented JS type and survives round-trip.
- [P2][unit][impl] NULL-heavy factory row (all nullable columns NULL) used to exercise `makeRow` null branch across all 4 modes; assert array/object → `null`, buffer → `null` cell, raw → single Buffer.

#### PG version matrix (14/15/16/17)
- [P1][integration][impl] Matrix driver param `PG_VERSIONS` (default = locally available `pg_ctl`); each version spins its own ephemeral cluster; assert `select version()` major matches the requested version and the full P0 suite passes on each.
- [P1][integration][impl] Docker lane: when `docker info` succeeds, run matrix via `postgres:14/15/16/17` containers (mapped to free host ports); assert lane is SKIPPED (not failed) with a logged reason when Docker is unavailable (it currently is down).
- [P2][integration][impl] Single-version fallback: with neither Docker nor multiple `pg_ctl` versions, run against the one local server and mark the matrix as `partial` (assert the suite reports which versions were actually exercised).

#### Test tagging & grouping
- [P1][unit][impl] Priority tags p0/p1/p2 and type tags unit/integration/property/chaos/perf encoded as `describe` name prefixes or `test.each`/filter; assert `bun test --test-name-pattern '\[p0\]'` selects only p0 specs (count matches).
- [P1][unit][impl] perf and chaos suites are gated behind env (`RUN_PERF=1`, `RUN_CHAOS=1`) and `test.skipIf`; assert they are skipped by default in CI's fast lane and run in the nightly lane.
- [P2][unit][impl] property-test lane (fast-check or similar) wired but quarantined behind a tag; assert at least one property spec (e.g. param encode/decode round-trip) registers and is runnable.

#### CI (GitHub Actions service matrix)
- [P1][integration][todo:feature] `.github/workflows/test.yml` with a `strategy.matrix.pg: [14,15,16,17]` using the `postgres` service container (or apt `pg_ctl`), runs `bun install` + `bun test`; assert workflow lint (actionlint) passes and each matrix cell sets `PGPORT`/healthcheck before tests.
- [P2][integration][todo:feature] CI caches bun deps and uploads `server.log` + coverage artifact on failure; assert artifact paths exist in workflow definition.
- [P2][chaos][todo:feature] CI fast lane (unit+p0 integration on one PG version) vs nightly lane (full matrix + perf + chaos); assert PR runs only the fast lane.

#### Coverage gates
- [P2][unit][todo:feature] `bun test --coverage` produces lcov; gate at a threshold (e.g. ≥85% lines on `src/`), failing CI below it; assert config exists and threshold is enforced (a deliberately-removed branch drops coverage and fails the gate).
- [P2][unit][todo:feature] Coverage excludes generated/golden fixtures and counts all of `src/connection.ts` (the protocol core); assert `pool.ts`/`codec.ts`/`auth.ts` appear in the report.

#### Flaky-test policy
- [P2][chaos][todo:feature] Retry-and-quarantine convention: known-flaky specs tagged `[flaky]` get bounded retries (`bun test --rerun-each`/custom wrapper) and are reported separately; assert a deliberately-flaky timing test is retried, not silently green.
- [P2][chaos][impl] Determinism guard: tests must not depend on wall-clock/row-order without `ORDER BY` — a lint/spec asserts seeded queries that check row order include `ORDER BY` (smoke.ts relies on `order by id`; encode this as policy).

#### Golden-file & wire-capture infrastructure
- [P1][integration][impl] Wire-capture harness: a fake/proxy server (or socket tee) records the exact bytes minipg writes for a query (Parse/Describe/Bind/Execute/Sync sequence from `startTask`); assert captured frames match a checked-in golden hex fixture (byte-exact) for `select $1::int` with one param.
- [P1][unit][impl] Golden snapshot for startup packet: `W.startup` includes `user`, `database`, `application_name`, `client_encoding=UTF8`; assert against golden bytes (guards protocol regressions independent of a live server).
- [P1][integration][impl] Prepared-statement golden: first call emits Parse+Describe; second call with same name+SQL emits ONLY Bind/Execute/Sync (reuse path), and same name+different SQL emits Close('S')+Parse; assert each byte sequence against goldens (exercises `prepared` cache logic in `startTask`).
- [P2][unit][impl] Decoder golden table: feed recorded RowDescription+DataRow bytes through `makeRow` for int4/int8/numeric/bool/jsonb/bytea/NULL and assert decoded JS values match a golden JSON (no server needed) — anchors the `defaultDecoders` contract.
- [P2][integration][impl] Golden update workflow: `UPDATE_GOLDEN=1` regenerates fixtures; assert a normal run with mismatched bytes FAILS with a readable hex diff (not just `false`).

#### Out-of-scope guards (assert clean absence)
- [P2][unit][out-of-scope-guard] No `sql\`\`` template tag exported: assert `index.ts` exports do not include a tagged-template `sql`; importing it is `undefined`.
- [P2][integration][out-of-scope-guard] LISTEN/NOTIFY: a `NotificationResponse` ('A') is silently ignored by `handle()`; assert `LISTEN x; NOTIFY x` does not surface an event/crash and the connection stays usable (no public notify API).
- [P2][integration][out-of-scope-guard] COPY: `COPY t TO STDOUT` produces a CopyOutResponse the driver does not handle; assert it fails cleanly (errors/hangs-with-timeout) rather than corrupting subsequent queries — document as unsupported.
- [P2][unit][out-of-scope-guard] No native libpq / no server-side cursor helper: assert no `pg-native`/cursor symbols are exported and these are absent from the API surface.

### Roadmap-pending harness hooks (placeholders so future sections plug in)
- [P2][integration][todo:feature] CancelRequest harness: ability to open a second socket using `backendKey` (`{pid,secret}` already captured in `handle` case 'K') to send an out-of-band CancelRequest; register pending spec for the timeout/AbortSignal roadmap.
- [P2][integration][todo:feature] TLS fixture: optional `initdb` with server cert + `ssl=on` to exercise `ssl: tls.ConnectionOptions` (verify-ca/verify-full are roadmap); assert plain run skips when no certs generated.

### Fixtures & data needed
- Roles: `postgres` (superuser, scram pw `postgres`), `md5user`/`md5pw` (md5), `scramuser`/`scrampw` (scram) — per `setup-pg.sh`; created with `password_encryption` toggled appropriately.
- Databases: shared `testdb`; ability to `CREATE DATABASE` for db-per-suite path; `postgres` db for auth tests.
- `pg_hba.conf`: local trust, md5 for md5user, scram for all else (host 127.0.0.1/::1).
- Tables/types: canonical `t(id serial pk, name text, n8 bigint, amount numeric, ok bool, data jsonb, blob bytea)` + 3 seed rows (alice / bob / all-NULL) including `\xdeadbeef` and `\x00ff` bytea. Per-suite throwaway schemas.
- Server settings to control per-suite: `DateStyle`, `bytea_output`, `standard_conforming_strings`, `client_encoding` (driver forces UTF8 in startup), `password_encryption`, `TimeZone`.
- Binaries: `initdb`, `pg_ctl`, `psql` on PATH (or `PG_BIN`); optional Docker (`postgres:14-17`).

### PG-version / config sensitivities
- `bytea_output` (`hex` default in PG9.0+ vs `escape`): minipg decodes bytea via the configured decoder; goldens/decoder tests must pin `bytea_output=hex` since the driver assumes text-hex (`\x..`).
- `DateStyle`/`TimeZone`: timestamps/date/time decode to STRING as-is, so date format differs across `DateStyle=ISO,MDY` etc. — version-stable only if pinned; relevant to richer-decoder roadmap (timestamptz→Date).
- `standard_conforming_strings`: affects literal escaping in seed SQL (`'\x00ff'` bytea literal needs the `\x` form regardless; ensure seeds don't rely on backslash-escape mode).
- `password_encryption` default flipped to `scram-sha-256` in PG14; fixture explicitly sets it per-role so md5user is reproducible on 14-17.
- Error fields / SQLSTATE text wording can vary across majors; PgError assertions should match `code` (e.g. `42P01`), never message text.
- `application_name` visibility in `pg_stat_activity` consistent 14-17; usable to assert startup params took effect.
- Default port 5432 vs ephemeral: tests MUST never bind 5432; assert helper picks a free port to avoid clobbering a dev server.

### Estimated test count
~46


## Wire Protocol — Unit, Golden & Fuzz  — scope: implemented

Pure, no-DB unit tests for `src/protocol.ts` (the `W.*` frontend writers, the incremental `Parser`, and `parseRowDescription`/`parseDataRow`) plus `src/codec.ts` (`encodeParam`, and the decoder maps). The writers are tiny deterministic Buffer builders (`msg` prefixes a type byte + int32 self-inclusive length; `startup`/`sslRequest` have no type byte), so they are ideal for byte-exact golden assertions hand-derived from the PG v3 protocol spec. The `Parser` is a stateful re-assembler that concatenates leftover bytes with each chunk and emits `{type, body}` only when `len+1` bytes are available — the key risks are chunk-boundary splits, multiple/partial messages per chunk, and 5-byte header underflow. `parseRowDescription`/`parseDataRow` walk NUL-terminated names and int32 length-prefixed cells with `-1` meaning NULL. These tests must lock the exact bytes and prove the parser never throws on arbitrary input (only returns fewer messages / buffers).

### Test groups

#### W.startup golden
- [P0][unit][impl] `W.startup({user:'postgres',database:'testdb'})` produces: int32 totalLen, int32 196608 (0x00030000), `user\0postgres\0database\0testdb\0`, trailing `\0`; assert full hex byte-for-byte and that `readInt32BE(0)===buf.length`. (refs: none)
- [P0][unit][impl] `W.startup` skips keys whose value is `undefined`/`null` (`{user:'x',options:undefined}` emits only the `user` pair) — assert `options` substring absent and length correct. (refs: none)
- [P1][unit][impl] `W.startup({})` (no params) -> int32 len(=9), int32 196608, single `\0`; exact 9-byte buffer. (refs: none)
- [P1][unit][impl] `W.startup` with multi-byte UTF-8 value (`application_name:'café'`) — length accounts for UTF-8 byte length not char count. (refs: none)

#### W.parse / W.bind / W.describe / W.execute / W.close / W.sync / W.flush / W.terminate golden
- [P0][unit][impl] `W.parse('','select 1')` -> `'P'`, int32 len, `\0` (empty name), `select 1\0`, int16 0 (param-type count); exact bytes + length self-consistency. (refs: none)
- [P0][unit][impl] `W.parse('stmt1','select $1')` named statement: includes `stmt1\0` then sql then int16 0. (refs: none)
- [P0][unit][impl] `W.parse` throws via `guardNul` when SQL contains `\0` (e.g. `'select 1 '`) — error message matches `/NUL byte/`, no buffer returned. (refs: none)
- [P0][unit][impl] `W.bind('','',[],0)` empty bind -> `'B'`, `\0` portal, `\0` stmt, int16 0 (param formats), int16 0 (param values), int16 1 + int16 0 (one result-format code = text); exact bytes. (refs: none)
- [P0][unit][impl] `W.bind` with one text param `{format:0,bytes:Buffer.from('abc')}` -> param-format-count 1 + format 0, value-count 1, int32 3 + `abc`; verify trailing result-format `0001 0000`. (refs: none)
- [P0][unit][impl] `W.bind` with a NULL param `{format:0,bytes:null}` writes int32 `-1` (0xFFFFFFFF) and no value bytes. (refs: none)
- [P0][unit][impl] `W.bind` with a binary param `{format:1,bytes:Buffer.from([0xde,0xad])}` writes format code int16 1 and the raw 2 bytes with int32 length 2. (refs: none)
- [P1][unit][impl] `W.bind(...,resultFormat=1)` sets the trailing result-format code to int16 1 (binary) — locks the single-code-applies-to-all behavior. (refs: none)
- [P1][unit][impl] `W.bind` with mixed-format params (one text + one binary) writes a per-param format array of length N preceding the value array. (refs: none)
- [P0][unit][impl] `W.describe('S','stmt1')` -> `'D'`, `'S'` byte, `stmt1\0`; and `W.describe('P','')` -> `'D'`,`'P'`,`\0`. (refs: none)
- [P0][unit][impl] `W.execute('',0)` -> `'E'`, `\0`, int32 0 (unlimited rows); `W.execute('portal',50)` -> int32 50. (refs: none)
- [P1][unit][impl] `W.close('S','stmt1')` -> `'C'`,`'S'`,`stmt1\0`; `W.close('P','')` portal variant. (refs: none)
- [P0][unit][impl] `W.sync()` -> exactly `53 00 00 00 04` (`'S'` + len 4, empty payload). (refs: none)
- [P1][unit][impl] `W.flush()` -> `48 00 00 00 04` (`'H'`); `W.terminate()` -> `58 00 00 00 04` (`'X'`). (refs: none)
- [P0][unit][impl] `W.sslRequest()` -> exactly `00 00 00 08 04 D2 16 2F` (len 8, magic 80877103), no type byte. (refs: none)

#### W.password / SASL golden
- [P0][unit][impl] `W.password('secret')` -> `'p'`, int32 len, `secret\0` (cstr, NUL-terminated); exact bytes. (refs: none)
- [P0][unit][impl] `W.password('md5'+hex)` carries the md5 digest string verbatim with trailing `\0`. (refs: none)
- [P0][unit][impl] `W.saslInitial('SCRAM-SHA-256', clientFirst)` -> `'p'`, `SCRAM-SHA-256\0`, int32 = byte length of clientFirst, then clientFirst bytes (NOT NUL-terminated). Assert the int32 equals UTF-8 byte length, not char count. (refs: none)
- [P0][unit][impl] `W.saslResponse(clientFinal)` -> `'p'` + raw clientFinal bytes, no length prefix, no NUL terminator. (refs: none)
- [P1][unit][impl] `W.saslInitial` with empty clientFirst writes int32 0 then no payload. (refs: none)

#### Parser — happy framing
- [P0][unit][impl] Single complete message in one chunk (e.g. a `'C'` CommandComplete `SELECT 1\0`) returns one `{type:'C', body}` with body = payload-after-header and length `total-5`. (refs: none)
- [P0][unit][impl] Two complete messages concatenated in one chunk return both in order; `buf` is fully consumed (next `push(empty)` returns `[]`). (refs: none)
- [P0][unit][impl] Zero-payload message (len=4, e.g. `'1'` ParseComplete `31 00 00 00 04`) yields `{type:'1', body.length===0}`. (refs: none)
- [P1][unit][impl] N>2 messages of differing types in one chunk preserve exact order and type bytes. (refs: none)

#### Parser — chunk-boundary splits (re-assembly)
- [P0][unit][impl] A message split after the type byte only (1 byte, then the rest) — first `push` returns `[]` (header underflow <5), second returns the full message. (refs: none)
- [P0][unit][impl] A message split inside the int32 length field (e.g. 3 bytes then rest) returns `[]` then the message — proves it waits for ≥5 header bytes before reading length. (refs: none)
- [P0][unit][impl] A message split inside the payload (header+partial body, then remainder) returns `[]` then the message, body intact. (refs: none)
- [P0][property][impl] Byte-by-byte feed: push a 3-message stream one byte at a time; concatenation of all emitted messages equals feeding the whole stream at once (deterministic re-assembly invariant). (refs: none)
- [P1][property][impl] Random chunking: for a fixed multi-message buffer, 100 random split points all yield the identical ordered message list. (refs: none)
- [P1][unit][impl] Trailing partial message after several complete ones: complete messages emitted now, partial retained; the rest in a later `push` completes it. (refs: none)

#### Parser — length-prefix edge cases
- [P0][unit][impl] Header present but `len+1 > available` returns `[]` and retains the bytes (no off advance, no throw). (refs: none)
- [P1][unit][impl] Exactly 5 bytes where len=4 (empty body) is parsed; exactly 5 bytes where len>4 waits. (refs: none)
- [P2][unit][impl] Large declared length (e.g. len = 0x0000FFFF) with body delivered across many chunks assembles correctly (no premature emit). (refs: none)
- [P2][chaos][impl] Pathological large length field (e.g. len=0x7FFFFFFF) — parser must NOT allocate/throw; it simply buffers and returns `[]` until impossible-to-satisfy (documents current unbounded-buffer behavior as a known footgun). (refs: none)

#### Parser — fuzz / never-crash
- [P0][property][impl] Feed 1000 random-length buffers of random bytes; assert `push` never throws and always returns an array (may be empty). (refs: none)
- [P0][property][impl] Byte-flip fuzz: take a valid message stream, flip random bytes (including length fields), feed in random chunks — no exception escapes `push`. (refs: none)
- [P1][property][impl] Random type bytes (including non-ASCII / 0x00) — parser tolerates any byte as `type` (`String.fromCharCode`) and frames purely on length. (refs: none)
- [P2][chaos][impl] Adversarial length=0,1,2,3 in header position (total <5 impossible since len reads from buffer) and len pointing past EOF repeatedly — parser stays in buffering state, no infinite loop. (refs: none)

#### parseRowDescription
- [P0][unit][impl] Two-field RowDescription body decodes name, tableOid, columnId(int16), dataTypeOid, dataTypeSize(int16, may be negative for varlena), typeModifier, format — assert all seven fields per column against hand-built bytes. (refs: none)
- [P0][unit][impl] Zero columns (`n=0`) returns `[]`. (refs: none)
- [P1][unit][impl] Column name with multi-byte UTF-8 decodes correctly and off advances past the right number of bytes (NUL scan is byte-based). (refs: none)
- [P1][unit][impl] Negative `dataTypeSize` (-1 for variable-length types like text) read as signed int16. (refs: none)
- [P2][unit][impl] Field with format code 1 (binary) is reported as `format:1` (parser is format-agnostic; documents that columns can declare binary). (refs: none)

#### parseDataRow
- [P0][unit][impl] Row with two non-null cells returns two Buffers whose contents match the slice; offsets advance by `4+len` each. (refs: none)
- [P0][unit][impl] Cell length `-1` yields `null` in that position (NULL handling) without advancing past data. (refs: none)
- [P0][unit][impl] Zero columns (`n=0`) returns `[]` (length-0 array). (refs: none)
- [P1][unit][impl] Empty (zero-length, len=0 not -1) cell returns a zero-length Buffer, distinct from null. (refs: none)
- [P1][unit][impl] Mixed row: [value, NULL, empty, value] decodes to [Buffer, null, Buffer(0), Buffer] in order. (refs: none)
- [P1][unit][impl] Returned cell Buffers are subarrays (views) of body — mutating body would reflect (documents zero-copy; relevant if caller retains across chunks). (refs: none)

#### codec.encodeParam
- [P0][unit][impl] `encodeParam(null)` and `encodeParam(undefined)` -> `{format:0, bytes:null}` (SQL NULL). (refs: none)
- [P0][unit][impl] `encodeParam(Buffer.from([0,1,2]))` -> `{format:1, bytes:<same buffer>}` (binary, passes NUL through — bytea allowed). (refs: none)
- [P0][unit][impl] `encodeParam(new Date('2020-01-02T03:04:05.000Z'))` -> text bytes = ISO string `2020-01-02T03:04:05.000Z`. (refs: none)
- [P0][unit][impl] `encodeParam(true)`/`encodeParam(false)` -> text `'t'`/`'f'`. (refs: none)
- [P0][unit][impl] `encodeParam({a:1})` and `encodeParam([1,2])` -> text = `JSON.stringify` output, format 0. (refs: none)
- [P0][unit][impl] `encodeParam(42)` / `encodeParam(3.14)` / `encodeParam(123n)` (bigint via String) -> `String(v)` text bytes. (refs: none)
- [P0][unit][impl] `encodeParam('a b')` throws `/NUL byte/` (text NUL guard). (refs: none)
- [P1][unit][impl] Order matters: `Buffer` is checked before generic `object` (a Buffer is an object) — assert a Buffer never gets JSON-stringified. (refs: none)
- [P1][unit][impl] `encodeParam('')` -> zero-length Buffer, format 0 (empty string param, NOT null). (refs: none)
- [P2][unit][impl] `encodeParam(NaN)` / `encodeParam(Infinity)` -> `'NaN'`/`'Infinity'` text (documents String() behavior; server may reject — client encodes regardless). (refs: none)
- [P2][unit][impl] `encodeParam` round-trips into `W.bind` correctly: encode a NULL + a value, feed to `W.bind`, assert the bind value section has int32 -1 then the value. (refs: none)

#### codec decoder map (unit, no DB)
- [P0][unit][impl] `defaultDecoders` maps int8(20) and numeric(1700) -> ABSENT, so `decoderFor` falls back to string (precision-safe footgun guard): `decoderFor(20,map)(Buffer.from('9007199254740993'))==='9007199254740993'`. (refs: none)
- [P0][unit][impl] `decoderFor(16,...)` bool: `'t'`->true, `'f'`->false; `decoderFor(23,...)` int4 -> number; `decoderFor(701,...)` float8 -> number. (refs: none)
- [P1][unit][impl] `asBytea` decodes `\x6465616462656566` hex form -> Buffer 'deadbeef'; and a non-`\x` payload falls back to utf8 bytes. (refs: none)
- [P1][unit][impl] `asJson` for json(114)/jsonb(3802) parses `{"a":1}` -> object. (refs: none)
- [P1][unit][impl] `buildDecoders({20: customInt8})` returns a NEW map with the override applied while leaving `defaultDecoders` unmutated (no shared-mutation bug). (refs: none)
- [P2][unit][impl] `buildDecoders(undefined)` returns the shared `defaultDecoders` instance (identity check) — documents the fast path. (refs: none)

#### Guard tests (out-of-scope features absent at protocol layer)
- [P2][unit][out-of-scope-guard] There is no simple-query (`'Q'`) writer in `W` — assert `('Q' in W)===false` / `W` exposes only the extended-protocol set (locks scope). (refs: none)
- [P2][unit][out-of-scope-guard] No COPY (`'d'`/`'c'`) or function-call writers exist in `W`. (refs: none)

### Roadmap / pending specs (todo:feature)
- [P1][unit][todo:feature] `W.cancelRequest(pid, key)` writer (CancelRequest: int32 16, magic 80877102, int32 pid, int32 key) — pending until out-of-band cancel lands. Mark skipped. (refs: roadmap CancelRequest)
- [P2][unit][todo:feature] Binary RESULT-format Bind path: `W.bind(...,resultFormat=1)` already encodes the code; add a pending decode-side golden once binary decoders exist. Mark skipped. (refs: roadmap binary result format)
- [P2][unit][todo:feature] SCRAM channel-binding (`-PLUS`) `saslInitial` would prefix `p=tls-server-end-point` gs2 header instead of `n,,` — pending writer variant. Mark skipped. (refs: roadmap SCRAM -PLUS)
- [P2][unit][todo:feature] Simple-query `'Q'` writer golden — pending until simple-query protocol is implemented. Mark skipped. (refs: roadmap simple-query)

### Fixtures & data needed
None server-side — this domain is pure unit. Needs hand-built byte fixtures: helper to assemble backend messages (`mkMsg(type, payloadBuffer)`), hex literals for golden expected outputs, and a small seeded PRNG (deterministic) for the fuzz/random-chunk property tests so failures reproduce. A `splitAt(buf, points[])` helper to drive chunk-boundary cases. No PG types/roles/tables required.

### PG-version / config sensitivities
Largely version-independent: the v3 framing, message type bytes, and length semantics are stable PG14–17. Sensitivities live in the byte CONTENT that flows through, not the framing: `bytea_output` (hex `\x` vs legacy `escape`) changes what `asBytea` must parse — golden bytea decode test should cover both forms; `DateStyle`/`timestamptz` affect timestamp strings (kept as strings here, so decode layer is insensitive) and `Date` param encoding always emits ISO regardless of server `DateStyle`; `standard_conforming_strings` is irrelevant since params go via Bind (no in-SQL literals); `password_encryption` selects md5 vs scram which only changes which `W.password`/`W.saslInitial` path is exercised, not the byte format. `dataTypeSize` negative values and varlena `typeModifier` are consistent across versions.

### Estimated test count
72


## Property-Based & Fuzz Testing  — scope: implemented (with a few todo:feature + out-of-scope-guard cases)

This domain stress-tests the four pure, total-by-intent surfaces of minipg with generated/random inputs rather than fixed examples: the text-format decoders (`src/codec.ts` `defaultDecoders`/`decoderFor`), the param encoder (`encodeParam`), the wire writers (`src/protocol.ts` `W.*`), and — most importantly — the incremental `Parser.push` framer plus `parseRowDescription`/`parseDataRow`. The core invariants we assert: (1) value INSERT→SELECT round-trips losslessly for generated values across every supported type, honoring minipg's precision-safe string defaults for int8/numeric; (2) `Parser.push` produces the identical message sequence regardless of how the byte stream is re-split into chunks (framing is associative/chunking-invariant); (3) the parser and decoders never throw and never infinite-loop on arbitrary bytes; (4) `encodeParam` is total (or throws a clear, documented error) over fuzzed JS values. Reading the source shows two concrete fuzz-exposed footguns to pin down: `Parser.push` computes `total = len + 1` from a raw `readInt32BE` with **no lower-bound/negative-length guard**, so a crafted/garbage length ≤ -1 makes `off += total` non-advancing → potential infinite loop or desync; and `encodeParam` routes `symbol`/`bigint`/`Promise` through `String(v)`/`JSON.stringify` with surprising results. These are excellent property/fuzz targets.

Recommended generator: **fast-check** (already idiomatic for Bun/TS; provides `fc.assert(fc.property(...))`, shrinking to minimal counterexamples, `fc.uint8Array`, `fc.string`, `fc.bigInt`, `fc.double`, and `fc.context`). Hand-rolled generators are acceptable only for the byte-chunking re-split splitter (a small custom arbitrary over split-point arrays) and for building synthetic wire frames; everything else should be fast-check arbitraries. Pin a fixed seed in CI and print the seed on failure so counterexamples reproduce. Keep `numRuns` modest for integration round-trips (network-bound, e.g. 100) and high for pure-function properties (e.g. 1000+).

### Test groups

#### Round-trip invariants: value INSERT → SELECT (across types)
- [P0][property][impl] For generated `text`/`varchar` strings (fast-check `fc.string`, `fc.fullUnicode` minus 0x00), `INSERT $1` then `SELECT` returns a string byte-for-byte equal to the input — no escaping, no first-char loss, no `\n`/backslash reinterpretation. (refs: node-postgres#895, node-postgres#1174, node-postgres#905, node-postgres#2357)
- [P0][property][impl] For generated safe integers (`fc.integer`) bound to an `int4`/`int8` column, the decoded value equals the input: int4 → `number`, int8 → its exact decimal **string**. (refs: node-postgres#1283)
- [P0][property][impl] For generated big integers (`fc.bigInt` across the full signed-64 range incl. ±2^63, MSB set) inserted as a param and read from an `int8` column, the returned string equals `value.toString()` with no low-bit loss. (refs: node-postgres#166, node-postgres#1283)
- [P0][property][impl] For generated arbitrary-precision decimals (random digit strings with scale, e.g. `12345678901234567890.12345`, `0.0268`, `0.30`) inserted via param into `numeric`/`numeric(p,s)`, the returned default decode is a string equal to the canonical PG text (scale preserved, never truncated to `0`). (refs: node-postgres#2957, node-postgres#849, node-postgres#107)
- [P0][property][impl] For generated `fc.double` values (incl. subnormals, ±0, large magnitudes, `Number.MAX_SAFE_INTEGER`) bound and read from `float8`, `decode(x) === x` (session must set `extra_float_digits=3`); assert `Object.is(decoded, input)` so −0 and the round-trip hold. (refs: node-postgres#730, node-postgres#339)
- [P1][property][impl] For generated booleans bound to a `bool` column, decode returns the matching JS boolean (`asBool`: first byte `0x74`='t'). (baseline)
- [P1][property][impl] For generated random byte buffers (`fc.uint8Array`, any length incl. empty, incl. bytes that look like `\x` text) bound as a binary `bytea` param and read back, the returned Buffer is `.equals(input)` — covers the `asBytea` `\x`-hex decode path. (baseline + footgun: input whose UTF-8 is literally `\xNN`)
- [P1][property][impl] For generated JSON values (`fc.jsonValue`) bound to a `jsonb` column, the parsed decoded value deep-equals the input (modulo object key reordering jsonb performs); assert via canonicalized compare. (refs: node-postgres#145)
- [P1][property][impl] NULL round-trip: for each supported type column, binding JS `null` stores SQL NULL (verify `IS NULL`) and `SELECT` decodes back to JS `null` — never `"NaN"`, never `"null"`, never `NaN`. (refs: node-postgres#1613, node-postgres#26, node-postgres#17, postgres.js#336)
- [P2][property][impl] Empty-value round-trip: empty string `''` → `""` (≠ null), empty buffer → zero-length Buffer (≠ null), empty array param to `= ANY($1)` → zero rows, all distinct from NULL. (refs: node-postgres#263)

#### Encoder ∘ decoder round-trip (pure, no server)
- [P0][property][impl] For each supported OID's decoder, `decode` over generated valid text payloads is total (never throws): int2/int4/oid/float4/float8 (`asNumber` on numeric-text), bool, json/jsonb (valid-JSON arbitrary), bytea (`\x`-hex and raw), and the string fallback for unknown OIDs. (baseline)
- [P0][property][impl] `encodeParam(decode_inverse(x))`-style symmetry for the precision-safe string types: a numeric/int8 string read from PG, re-bound as a param, re-read, is stable (idempotent round-trip), proving no float coercion sneaks in. (refs: node-postgres#811, node-postgres#1300)
- [P1][property][impl] `asBytea` round-trips any Buffer encoded as `\x`+hex: for `fc.uint8Array`, `asBytea(Buffer.from('\\x'+buf.toString('hex')))` `.equals(buf)`. (pure)
- [P2][property][impl] `asJson` over `fc.jsonValue` serialized with `JSON.stringify` yields a deep-equal value (json/jsonb decoder totality on valid JSON). (pure)

#### `encodeParam` totality & footguns (fuzzed JS values)
- [P0][property][impl] `encodeParam` over a wide arbitrary of JS values (`fc.oneof` of string without NUL, number, boolean, Date, Buffer, plain object, array, null/undefined) never throws and returns `{format, bytes}` with `format ∈ {0,1}` and `bytes` a Buffer or null. (baseline)
- [P0][property][impl] For any string containing `\0` (NUL injected at a generated index), `encodeParam` throws the documented `/NUL byte \(0x00\)/` error (client-side, before the wire). (refs: node-postgres#2080, node-postgres#2936; smoke #10)
- [P1][unit][impl] Footgun guard: `encodeParam(Symbol())` — `typeof` is `'symbol'`, falls through to `String(v)` which **throws TypeError**; assert current behavior (throws) and that the error is catchable, not a connection-desync. (source-derived footgun)
- [P1][unit][impl] Footgun guard: `encodeParam(123n)` (BigInt) → `String(v)` = `"123"`, format 0; assert it encodes to decimal text (does NOT throw "cannot serialize BigInt"). (refs: node-postgres#2395)
- [P1][unit][impl] Footgun guard: `encodeParam(Promise.resolve(1))` → `typeof 'object'` → `JSON.stringify` = `'{}'`; assert current (silent `{}`) behavior and flag as a known footgun a future version may want to reject. (refs: node-postgres#2304)
- [P1][property][impl] `encodeParam(Date)` over generated dates always yields ISO-8601 text (`v.toISOString()`), format 0; round-trips through a `timestamptz` cast param without throwing. (baseline)
- [P2][property][impl] `encodeParam(object/array)` over `fc.jsonValue` objects yields `JSON.stringify(v)` bytes exactly once (no double-escaping); a custom `toJSON` is honored once. (refs: node-postgres#145, node-postgres#450)
- [P2][property][impl] No caller mutation: encoding an array of params does not mutate the input array or its elements (numbers stay numbers in caller's array). (refs: node-postgres#750)

#### Parser framing: chunking-invariance (associativity over re-splits)
- [P0][property][impl] Build a known buffer of N concatenated valid backend messages (random types/lengths/payloads); for any generated list of split points, feeding the chunks sequentially through one `Parser` instance and concatenating the returned `RawMessage[]` yields the EXACT same sequence (types + body bytes) as feeding the whole buffer at once. Core "framing is associative over chunk re-splits" property. (refs: node-postgres#1524, node-postgres#2936)
- [P0][property][impl] Byte-at-a-time feeding (chunk size 1) of the same multi-message buffer reconstructs the identical message sequence — exercises the `this.buf.length - off >= 5` partial-header and `< total` partial-body wait paths. (baseline)
- [P1][property][impl] Single-byte and zero-byte chunks interleaved (incl. empty `Buffer.alloc(0)` pushes) never produce spurious/duplicate/dropped messages and leave no residual when the stream ends on a message boundary. (baseline)
- [P1][property][impl] A trailing partial message (stream cut mid-payload) yields no message for that fragment and is completed correctly when the remainder arrives in a later `push`. (baseline)
- [P1][unit][impl] Empty body messages (e.g. ParseComplete `'1'`, BindComplete `'2'`, NoData `'n'`, length=4, zero payload) are framed correctly with an empty `body` Buffer, regardless of chunk boundary. (baseline)

#### Parser totality & safety on arbitrary bytes (fuzz)
- [P0][property][impl] `Parser.push(fc.uint8Array of any length/content)` — over many random byte arrays and many random chunkings — must **not throw** (no `RangeError` from `readInt32BE` past end; loop guarded by `>= 5`). (refs: node-postgres#2936)
- [P0][property][impl][todo:feature] FOOTGUN/likely-bug: feed a frame whose declared length field is **negative** (high bit set, e.g. bytes `FF FF FF FF`) so `len = readInt32BE` < 0, `total = len+1 ≤ 0`; assert the parser does not enter an infinite loop / non-advancing `off` and does not silently desync. EXPECT this to currently fail or hang → marks the missing negative/min-length guard (`len` must be ≥ 4) as a defect to fix. Use a hard test timeout to catch the hang. (source-derived: `protocol.ts` lines 65-71)
- [P1][property][impl] FOOTGUN: declared length larger than available bytes (e.g. len says 1MB, only 10 bytes fed) must cause the parser to *wait* (return no message, retain buffer) and never read out of bounds — verify it completes only once the full payload arrives across pushes. (source-derived)
- [P1][property][impl] Garbage type bytes: random/invalid type chars (non-ASCII, control bytes) are still framed structurally (Parser only splits on length; type interpretation is the caller's job) — assert `RawMessage.type` is the verbatim char and no throw. (totality)
- [P2][property][impl] `parseDataRow` over synthetic 'D' bodies: random column count and random cell lengths incl. `-1` (NULL) decode to the right `(Buffer|null)[]`; an array with mixed NULL and non-NULL cells preserves positions. (baseline + NULL handling)
- [P2][property][impl] `parseRowDescription` over synthetic 'T' bodies with generated field names (incl. multi-byte UTF-8, max-length, empty name) and random OIDs/format codes parses all fields with correct offsets (18-byte fixed tail after the C-string name). (baseline)
- [P2][unit][impl] `parseDataRow`/`parseRowDescription` with field/column count of 0 returns an empty array (empty-result handling). (baseline)

#### Wire writers: structural invariants (fuzz)
- [P0][property][impl] For generated `(portal, statement, params[], resultFormat)`, `W.bind(...)` output is a structurally valid 'B' message: type byte `'B'`, length == payload+4, the two param-count int16s both equal `params.length`, NULL params encoded as `i32(-1)`, non-NULL as length-prefixed bytes; re-parsing the body reconstructs the inputs. (refs: parameters/value-serialization)
- [P0][property][impl] `W.parse(name, sql)` with generated SQL containing `\0` throws the `guardNul` error ("query text contains NUL byte"); without NUL, emits a 'P' frame whose two C-strings round-trip to `name` and `sql`. (refs: node-postgres#2936; smoke #10)
- [P1][property][impl][todo:feature] FOOTGUN/16-bit limit: `W.bind` with `params.length > 65535` — `i16(n)` overflows/wraps silently (writeInt16BE on >32767 throws, but counts 32768..65535 wrap to negative). Assert minipg rejects >65535 params with a clear client-side error rather than emitting a corrupted Bind. EXPECT current failure (no guard found in source) → marks the 16-bit param-count guard as a todo. (refs: node-postgres#581, postgres.js#64)
- [P1][property][impl] `msg()` length self-consistency: for every writer (`startup`, `password`, `parse`, `bind`, `describe`, `execute`, `close`, `sync`, `flush`, `terminate`) over generated args, the int32 length field equals `buffer.length - (hasTypeByte ? 1 : 0)`. (structural totality)
- [P2][property][impl] `W.startup` over generated `Record<string,string>` params (skipping undefined values) round-trips to the same key/value pairs and is NUL-terminated; an undefined value is omitted entirely. (baseline)

#### Stress / chaos cross-checks (generated, against real PG)
- [P1][chaos][impl] Property: random interleaving of generated queries on one connection (each awaited) all return correct results in order — exercises the one-in-flight serialization queue under fuzzed query mix. (smoke #11)
- [P2][perf][impl] Round-trip a large generated payload (multi-MB text/bytea param) to force multi-chunk TCP framing on the read side; assert the reassembled value equals input (ties chunking-invariance to a real socket). (refs: node-postgres#1524)

#### Out-of-scope guards (property/fuzz angle)
- [P2][unit][out-of-scope] Simple-query protocol is not implemented: a multi-statement string with params surfaces a clear server/client error ("cannot insert multiple commands"), asserting minipg does not silently fall back. (refs: node-postgres#1396)
- [P2][unit][out-of-scope] No `sql\`\`` template tag / identifier interpolation: a plain interpolated query body bound as a value yields a server syntax error at `$1`, not silent raw-SQL execution. (refs: postgres.js#214)

### Fixtures & data needed
- A round-trip table with one nullable column per supported type: `text`, `varchar`, `char(5)`, `int4`, `int8`, `numeric`, `numeric(20,5)`, `float8`, `bool`, `bytea`, `jsonb`, `timestamptz`, plus an `int4[]`/`text[]` column for `= ANY($1)` empty-array cases.
- Session GUC `extra_float_digits=3` set on connect (required for the float8 exact round-trip on PG<12; harmless on 12+).
- Pure-function tests (codec/protocol) need no server — they import `src/codec.ts` and `src/protocol.ts` directly and run with `bun test`.
- fast-check as a dev dependency; a fixed CI seed and seed-on-failure logging.
- A synthetic-frame builder helper (type byte + int32 length + payload) and a chunk-splitter arbitrary for the framing properties.

### PG-version / config sensitivities
- `extra_float_digits`: PG<12 truncates float text at default 0 → float8 round-trip fails unless set to 3; PG12+ emits shortest round-trip by default.
- `EXTRACT(EPOCH ...)` return type differs: float8/Number on PG<14, numeric/string on PG14+ — avoid using it as a numeric round-trip generator source, or gate by version.
- `bytea_output` (`hex` vs `escape`): `asBytea` only handles `\x`-hex; on a server set to `escape` the default decoder mis-decodes. Property tests assume default `hex` (PG9.0+); add a guard asserting behavior under `escape` is a known limitation.
- `standard_conforming_strings`: irrelevant for parameterized binds (values are length-prefixed, not SQL literals) — a property test should confirm round-trips are invariant to this setting.
- `DateStyle`: affects text decode of timestamps (minipg keeps them as strings); generated Date params are sent as ISO and are DateStyle-insensitive on input, but SELECT-back text varies — compare via a cast to a stable form.
- jsonb reorders/normalizes object keys and whitespace across versions; compare decoded JSON structurally, not by raw string.

### Estimated test count
38


## Concurrency & Chaos — scope: implemented (with a few todo:feature cancel/timeout cases)

minipg enforces **one query in flight per `Connection`**: `query()`/`stream()` push a `Task` onto `this.queue` and call `processQueue()`, which only starts the next task when `state==='ready'` and `current===null` (connection.ts:200-203). Responses are framed by a single `Parser`; `ReadyForQuery` (`Z`) triggers `finishTask()` which settles `current` and pumps the queue, so ordering is strictly FIFO and each result is bound to the task that was `current` when its `DataRow`/`CommandComplete` arrived. The **settlement invariant** lives in `fatal()` (connection.ts:241-248): on any socket `error`/`close` it flips `state='closed'`, rejects `current`, and drains+rejects every queued task — so no promise should hang. Notable gaps to probe: there is **no `CancelRequest`/out-of-band cancel** (backendKey is captured but unused), **no per-query timeout/AbortSignal**, the `Connection` is **not an EventEmitter** (a drop only rejects in-flight/queued promises — there is no `'error'`/`'end'` event and no `pool.on('error')`), the pool's idle list is a **LIFO stack** (no fairness across idle conns), and `Pool.end()` **does not settle parked waiters** (`for (const w of this.waiters.splice(0)) void w` is a no-op — connection.ts/pool.ts:67), a hang footgun.

### Test groups

#### Single-connection serialization & FIFO
- [P0][integration][impl] Issue `c.query('select 1 as a')` then immediately `c.query('select 2 as b')` WITHOUT awaiting the first; both resolve, `a=1` before `b=2`, second Parse/Bind not written until first `ReadyForQuery` (assert via order of resolution + correct values). (refs: node-postgres#516, #896, #1488, #2311, #3134)
- [P0][integration][impl] Fire N=100 INSERTs of distinct values on one connection without awaiting, then `select count(*)`/`select ... order by`; all 100 rows persisted and readable in order. (refs: node-postgres#483)
- [P0][integration][impl] Loop `i in 0..9`: `c.query('select $1::int', [i])` with no await; each result reflects its own `i` (not all `9`), completion order == submission order. (refs: node-postgres#834, #1073, #1691)
- [P0][integration][impl] Queue 10 distinct `select i as v`, each with its own `.then`; every handler gets its own distinct row, none repeated/skipped. (refs: node-postgres#1073, #1288)
- [P1][integration][impl] Queue `[BEGIN, failing-stmt, ROLLBACK, select 1]` concurrently on one conn; failing stmt rejects with PgError, ROLLBACK runs AFTER it, final `select 1` resolves — strict FIFO survives an error, no `transaction start while in start state`. (refs: node-postgres#1288, #1461)
- [P1][integration][impl] Read-after-write on one conn: `INSERT ... RETURNING` then a following `SELECT` (queued, not awaited) observes the completed write — no stale read from reordering. (refs: node-postgres#1192, #1866)
- [P0][integration][impl] CONTRACT assertion: minipg QUEUES (does not reject) a second concurrent query — assert the queue grows and both settle, documenting the queue-not-fail-fast contract. (refs: node-postgres#3633)

#### Strict result-set integrity under load
- [P1][perf][impl] Soak: 2000 small `select $1::int` over a single connection (awaited in a tight loop / partially overlapped); every result is the complete correct single row, never empty/truncated. (refs: node-postgres#401)
- [P1][integration][impl] Heavy mixed-width concurrent queries (varying column counts, NULLs, large `repeat()` text, bytea, int8/numeric-as-string) queued together; parser never throws RangeError/`ERR_OUT_OF_RANGE`, no spurious null columns, framing stays aligned. (refs: postgres.js#1039)
- [P1][integration][impl] Parameterized `INSERT ... RETURNING id,name` queued under burst; no `Cannot read property 'name' of undefined`, each result mapped to its originating query. (refs: node-postgres#2454, #2455, #2456)
- [P2][integration][impl] Mix result modes in one burst (`array`, `object`, `buffer`, `raw`) interleaved on one conn; each task decodes per its own `mode`, no cross-talk of decoder state. (refs: node-postgres#1039)

#### Async/out-of-order backend message safety
- [P1][unit][impl] Drive a mock server that emits `ParseComplete`/`BindComplete`/`NoticeResponse`/`NotificationResponse(A)` while `current===null` (after a query cleared); `handle()` ignores them (default/`N`/`A` branches), no TypeError, a subsequent real query on the same conn still works. (refs: node-postgres#3174, #2817, #2455, #2456)
- [P1][unit][impl] After `finishTask()` clears `current`, a stray `DataRow`/`CommandComplete` arriving with no `current` is dropped (dataRow guard `if (!t...) return`), conn stays usable. (refs: node-postgres#2817, #478)
- [P2][unit][impl] `ErrorResponse` (`E`) arriving while `current` is set marks `current.error` and the conn still returns to `ready` on the following `Z` (error path does not wedge the queue). (refs: node-postgres#1288)

#### Interleaved query + stream on one connection
- [P0][integration][impl] Start `stream(big)`, and concurrently call `c.query('select 42')` before consuming the stream; the query is QUEUED behind the stream task (one-in-flight), stream drains fully, then `select 42` resolves. (refs: node-postgres#1449)
- [P0][integration][impl] Stream early-`break` mid-iteration sets `cancelled`, resumes the socket, server query runs to completion server-side (no CancelRequest), `finishTask` fires `streamEnd`, and the NEXT `c.query` on the same conn succeeds — connection left usable. (refs: smoke.ts#8, node-postgres#1449)
- [P1][integration][impl] Backpressure: stream a `generate_series(1,1e6)` with small `highWaterMark`; assert `socket.pause()` is called once `buf.length>HWM` and `resume()` once consumer drains below `HWM/2` (spy on socket), no unbounded buffer growth. (refs: postgres.js#1039)
- [P1][integration][impl] Two streams requested back-to-back on one conn serialize: second stream's task does not start until first's `ReadyForQuery`; rows of each go to the correct iterator. (refs: node-postgres#266)
- [P2][integration][impl] `stream()` on an already-closed connection yields a rejecting `next()` (err set at creation, connection.ts:281), iterator settles, no hang. (refs: node-postgres#538)

#### Pool parallelism, contention & fairness
- [P0][integration][impl] Pool `max>=4`, launch 4×`select pg_sleep(0.3)` via `Promise.all`; wall-clock ≈0.3s (overlapping on separate backends), not 1.2s. Require `max>=K`. (refs: node-postgres#912, #1621, #1959)
- [P0][integration][impl] Pool `max=3`, fire 5 concurrent `select $1::int`; excess 2 park in `waiters`, all 5 resolve with correct values, `pool.size<=3`. (refs: node-postgres#1621, smoke.ts#13)
- [P1][integration][impl] `max=1` pool: 5 `pool.query` calls issued in sequence complete in call order (single client → per-conn FIFO); guards against the #1275 mis-expectation (no order guarantee at `max>1`). (refs: node-postgres#1275)
- [P1][integration][impl] `pool.connect()` checkout for a transaction: `BEGIN; INSERT; COMMIT` on the checked-out `client`, then `release()`; the conn returns to the idle pool and a later acquire reuses it cleanly. (refs: node-postgres#1621)
- [P2][integration][impl] FOOTGUN/fairness: pool idle list is LIFO (`idle.pop()`); document that idle reuse is not round-robin — assert last-released conn is reused first (so test authors do not assume FIFO connection rotation). (refs: pool.ts:25)
- [P1][chaos][impl] A pooled `pool.query` whose backend is killed mid-flight rejects, `release()` sees `state==='closed'`, deletes the dead conn and `refill()` opens a replacement for any waiter; a subsequent `pool.query` succeeds (pool self-heals). (refs: node-postgres#473, #1012, #2535, #2635)

#### CHAOS: socket killed mid-query / mid-stream (settlement invariant)
- [P0][chaos][impl] Mock/real server, query in flight, then `socket.destroy()`; the in-flight promise rejects with `connection terminated unexpectedly` within a bounded time (no hang), `state==='closed'`. (refs: node-postgres#1700, #1783, #2283, postgres.js#600, #708)
- [P0][chaos][impl] THE INVARIANT: 1 in-flight + 5 queued tasks, then kill socket; ALL 6 promises reject (current via `fatal`, queue drained), none left pending — assert via `Promise.allSettled` all `rejected`. (refs: node-postgres#1700, postgres.js#827)
- [P0][chaos][impl] Stream in flight, kill socket mid-rows; `streamError` fires → a pending `next()` rejects (and a fresh `next()` rejects with the stored `err`), iterator settles, no crash. (refs: node-postgres#1449, postgres.js#600)
- [P0][chaos][impl] `query()` on a connection already in `state==='closed'` rejects immediately with `connection is closed` (connection.ts:259), never hangs. (refs: node-postgres#1322, #1500, #1991, #182)
- [P1][chaos][impl] ECONNRESET delivered as socket `'error'`: `fatal()` runs once (guarded by `state==='closed'` early-return), the error reaches the in-flight promise, a second `'close'` does not double-settle or throw. (refs: node-postgres#314, #584, #1900, #2710)
- [P1][chaos][impl] GUARD (no event-emitter): after an abrupt drop with NO in-flight/queued query, minipg has nowhere to surface the error (not an EventEmitter, no `pool.on('error')`); assert the process does NOT crash with an unhandled `'error'` (socket error handler always present, connection.ts:109) — documents the design gap. (refs: node-postgres#465, #683, #821, #1165)
- [P1][chaos][impl] Server sends ErrorResponse `57P01` (admin shutdown / `pg_terminate_backend`) for the in-flight query: it rejects as `PgError` code `57P01`; if the socket then closes, no secondary `handleCommandComplete of null` style crash. (refs: node-postgres#465, #478, #1872, postgres.js#600)
- [P1][chaos][impl] After a server restart that drops the pool's conns, the next `pool.query` opens fresh connections and succeeds; dead conns removed from `all`. (refs: node-postgres#2535, #2635, #1060)

#### CHAOS: partial / slow / malformed server writes
- [P1][chaos][impl] Mock server writes a valid response one byte at a time across many `onData` chunks; `Parser` reassembles correctly, query resolves with full result (framing across chunk boundaries). (refs: postgres.js#1039)
- [P1][chaos][impl] Mock server writes a truncated/garbage message then closes; `parser.push` throw is caught in `onData` and routed through `fatal()` → in-flight rejects, no uncaught throw. (refs: node-postgres#1352, #1940)
- [P2][chaos][impl] Server accepts TCP then immediately closes before `ReadyForQuery` during connect; `connect()` rejects (via `fatal` while `connecting`), not left pending. (refs: node-postgres#534, postgres.js#457)
- [P2][chaos][impl] Slow server (delays each `DataRow`) while consumer iterates a stream slowly; backpressure pause/resume cycles repeatedly, all rows delivered, no buffer blowup, no timeout. (refs: node-postgres#1792, #1863)

#### end()/shutdown under concurrency (no hang, all settle)
- [P0][chaos][impl] `end()` while a query is in flight: `end()` sets `state='closed'` then `socket.end`; assert the in-flight promise settles (the subsequent socket `close` → `fatal` rejects it) and `end()` itself resolves — no unsettled promise. (refs: node-postgres#1803, #1833, #2329)
- [P0][integration][impl] `end()` resolves even when socket already destroyed / never fully connected (1000ms fallback timer in connection.ts:299 guarantees resolution). (refs: node-postgres#1381, #2923, postgres.js#32)
- [P1][integration][impl] `end()` called twice returns/resolves the second time immediately (early `if (state==='closed') return`). (refs: node-postgres#2716)
- [P1][integration][impl] `query()` after `end()` rejects with `connection is closed`, does not throw synchronously / hang. (refs: node-postgres#538, #725)
- [P0][chaos][impl] FOOTGUN BUG: `Pool.end()` with parked `waiters` (acquired all `max`, extra callers waiting) — current code `void w` does NOT settle them, so those `pool.query` promises HANG. Assert the desired contract (waiters reject with `pool is closed`) as a FAILING/known-bug test. (refs: node-postgres#1803, pool.ts:67)
- [P1][integration][impl] `Pool.end()` closes all conns in `all` (idle + busy) and resolves; subsequent `pool.acquire()` throws `pool is closed`. (refs: node-postgres#467, #1193, #1600)
- [P2][integration][impl] After `end()`, no stray socket write/timer fires; open-handle count returns to baseline so the process can exit. (refs: node-postgres#120, #1545, #2146)

#### todo:feature — cancel / timeout / abort (pending specs)
- [P1][integration][todo:feature] Per-query timeout: `query(sql, params, { timeout })` should reject after N ms and mark the conn broken so queued queries do not silently hang. NOT IMPLEMENTED — pending. (refs: node-postgres#1824, #3399)
- [P1][integration][todo:feature] AbortSignal: passing an already-aborted / later-aborted signal should reject the query and stop sending it. NOT IMPLEMENTED — pending. (refs: roadmap)
- [P1][chaos][todo:feature] Out-of-band CancelRequest: a long-running query cancelled via the captured `backendKey` (pid/secret) sends a CancelRequest on a side socket and the query rejects with `57014 query_canceled`. `backendKey` is captured (connection.ts:150) but UNUSED — pending. (refs: roadmap)
- [P2][integration][todo:feature] Stream cancel should issue CancelRequest instead of draining the full result server-side (current `return()` only ignores rows). Pending optimization. (refs: connection.ts:291)
- [P2][integration][todo:feature] Transaction helper sugar (`begin(fn)` auto-COMMIT/ROLLBACK) under concurrent use serializes correctly; currently only raw `BEGIN/COMMIT` works. Pending. (refs: node-postgres#1461)

#### Footguns & out-of-scope guards
- [P1][unit][impl] Queue lifecycle: completing the last queued task fires `finishTask`→`processQueue` which no-ops when queue empty; assert no double-settle of any promise across a full drain (each resolve/reject called once). (refs: node-postgres#916)
- [P2][unit][impl] NUL-byte param/SQL rejection happens in `startTask` encode (caught, rejects that task, then `queueMicrotask(processQueue)` continues the queue) — assert one bad task rejecting does NOT wedge following queued tasks. (refs: connection.ts:222-225, smoke.ts#10)
- [P2][integration][out-of-scope-guard] `LISTEN`/`NOTIFY`: server `NotificationResponse` (`A`) is silently ignored (connection.ts:158); assert no notification event is delivered (feature absent, fails cleanly). (refs: out-of-scope)
- [P2][integration][out-of-scope-guard] Simple-query / multi-statement: a multi-statement string via extended protocol behaves per PG (only first or errors) — assert minipg does not expose a simple-query path. (refs: out-of-scope)

### Fixtures & data needed
- Real PostgreSQL on 127.0.0.1:54329, db `testdb`, user/pass `postgres` (matches smoke.ts `base`), plus `md5user`/`scramuser` roles.
- Table `t` (from smoke fixtures) and a scratch table `chaos_ins(id int)` for the N=100 insert / read-after-write cases (TRUNCATE between runs).
- `pg_sleep`, `generate_series` for overlap/backpressure tests.
- A **mock TCP/PG server** (raw `net.Server` speaking enough wire protocol) to drive: byte-at-a-time writes, truncated/garbage frames, out-of-order `ParseComplete`/`A`/`N` with no active query, `57P01` ErrorResponse, accept-then-close, and on-demand `socket.destroy()` mid-query/mid-stream.
- Ability to `pg_terminate_backend(pid)` (needs the backend pid — obtain via `select pg_backend_pid()`) and to restart/pause the docker PG for restart/self-heal cases.
- Spy/wrap on `socket.pause`/`resume`/`write` to assert backpressure and serialization timing.

### PG-version / config sensitivities
- `pg_terminate_backend` / fast-smart shutdown emit `57P01` (PG14-17 consistent); an immediate SIGKILL/crash drops WITHOUT a `57P01` message → expect `connection terminated unexpectedly` instead. Tests must branch on graceful vs hard kill.
- `query_canceled` is `57014` across versions (relevant to the todo cancel specs).
- OS-level half-open detection (no FIN) differs macOS vs Linux — bound chaos timeouts generously and rely on the mock server for deterministic mid-query drops rather than real network severing.
- Decoding sensitivities (DateStyle, bytea_output=hex, int8/numeric→string) are orthogonal here but reused in the mixed-width integrity test; pin `bytea_output=hex` and default DateStyle so result-integrity assertions are stable.
- `idle_in_transaction_session_timeout` / server `statement_timeout` could pre-empt the pg_sleep overlap and long-query tests — ensure they are unset/large on the test server.

### Estimated test count
44


## Performance & Regression Harness — scope: partial(roadmap)

A SEPARATE harness (`bench/`), not part of the boolean pass/fail suite. It measures throughput (simple/param/prepared), latency percentiles, memory/GC stability under large/streamed result sets, and parser allocation, then compares against committed JSON baselines with band-based regression thresholds. Grounded in the source: minipg runs one query in flight per connection with an array-backed FIFO queue (`queue.shift()` in `processQueue`/`fatal` — O(n) drain, a guard target), the `Parser.push` does `Buffer.concat([this.buf, chunk])` on every chunk that carries leftover bytes (potential super-linear accumulation on results split across many TCP segments — a guard target), and `makeRow` allocates one container per row plus a `decoderFor` map lookup per cell. minipg has NO type-OID introspection query (decoders are a static OID→fn `Map`, `codec.ts`), NO per-query `Error`/stack capture (the success path just `resolve`s in `finishTask`), and NO `escapeLiteral`/template tag — several classic perf bugs are therefore structurally absent and become "asserted-absent" guards rather than measurements. Roadmap items (`maxResultSize` cap, timing/telemetry hooks, binary result format, simple-query protocol) are planned here as `[todo:feature]` pending benches.

**Methodology (applies to every case below).** Runner: Bun (`bun bench/run.ts`) against a real Dockerized Postgres on loopback. Each bench: configurable warmup (default 2s / 1k ops) then a timed window (default 10s or N ops); report ops/sec, p50/p90/p99/p999 latency (hdr-style histogram), and `process.memoryUsage()` RSS+heapUsed sampled on an interval. Memory benches force GC between phases (Bun `--expose-gc` / `Bun.gc(true)`), discard warmup, take the post-GC plateau, and assert *trend* (linear-regression slope ≈ 0 over the steady window) not absolute bytes. Event-loop lag sampled via a fixed-interval timer drift probe. Every threshold is a relative band vs a committed `bench/baselines/*.json` (keyed by machine class + PG major + Bun version); CI compares to baseline with a tolerance (default ±15% throughput, ±25% p99) and only the harness's own self-consistency invariants (no leak, no OOM, no unbounded queue) are hard assertions. Baselines vs psql/libpq are recorded as *attribution ratios*, never as gating asserts (no pg-native dependency). All perf assertions are explicitly non-flaky: medians/plateaus/slopes over windows, never single-sample comparisons.

### Test groups

#### Memory & listener stability (no unbounded growth)
- [P0][perf][impl] Run 100k identical parameterized `SELECT $1::int` on one persistent `Connection`; after warmup+GC, heapUsed and RSS slope over the steady window is ≈0 (within GC noise band) — no monotonic growth. (refs: node-postgres#86, #774, #1417, #3070)
- [P0][perf][impl] Same 100k loop but assert the `socket`'s `data` listener count and the process's total active listeners stay at baseline (minipg attaches one `data` handler in `afterTransport`); no `MaxListenersExceededWarning` emitted across the run. (refs: node-postgres#1451, #86)
- [P1][perf][impl] Issue 50k queries each with a DISTINCT column-name set (`SELECT 1 AS c0, ...`) so each produces a fresh RowDescription; heap plateaus — `parseRowDescription` must not retain per-query field arrays beyond the in-flight task (unnamed statements are not cached; verify `prepared` Map stays empty). (refs: postgres.js#96, node-postgres#1417)
- [P1][perf][impl] Cache-growth guard: run 50k NAMED prepared queries cycling through K distinct names (e.g. K=1000) reusing the same SQL; `connection.prepared` Map size stabilizes at K, not 50k, and re-preparing the same name+SQL emits no extra Parse (reuse path in `startTask`). (refs: node-postgres#1417, postgres.js#96)
- [P1][perf][impl] 50k sequential `INSERT ... RETURNING id` comparing int4 PK vs uuid PK; both plateau and uuid RETURNING (decoded as string via fallback decoder) does not consume disproportionately more steady-state heap than int. (refs: node-postgres#1561, #1571)
- [P2][perf][impl] Repeatedly construct/`connect()`/`end()` 5k short-lived Connections; after each cycle GC, the count of live `Connection`/socket objects returns to ~baseline (no retained closures via `connectResolve`/`connectReject`, which are nulled in `ready`/`fatal`). (refs: node-postgres#86, #597)
- [P2][perf][impl] Sustained pooled SELECTs (10 conns, 1M ops) over a long run reach a stable RSS plateau; `Pool.idle`/`all`/`waiters` structures return to steady size. (refs: node-postgres#2894)

#### Large result handling & OOM protection
- [P0][perf][impl] Fetch a single multi-MB row (`SELECT repeat('x', 8_000_000)`); completes successfully and wall time scales within a small constant factor of psql for the same query — guards against `Parser.push` `Buffer.concat` quadratic copying when the row spans many TCP chunks. (refs: node-postgres#1103, #3467)
- [P0][perf][impl] Fetch a large multi-join result (e.g. 1M rows × several cols) via `stream()`; iterate to completion with heap bounded near `highWaterMark`×row-size — process does not OOM (buffered `query()` of the same is allowed to be the failing/heavy counter-baseline). (refs: node-postgres#2633, #2638)
- [P1][perf][impl] Parser-accumulation micro-guard: feed `Parser.push` a large message delivered as many small chunks vs one big chunk; assert total bytes copied / time grows ~linearly, not quadratically, in chunk count (direct regression guard on the `Buffer.concat([this.buf, chunk])` pattern). (refs: node-postgres#1103, #3467)
- [P1][todo:feature] With a configured `maxResultSize` byte cap, a result exceeding the cap rejects with a catchable error mid-stream (not OOM); under the cap succeeds. Pending — minipg has no such config today (PENDING/skip). (refs: node-postgres#2336)

#### Row & value parsing throughput
- [P1][perf][impl] `SELECT a, b` vs `SELECT *` over identical rows: per-row JS decode cost (`makeRow` + `decoderFor` per cell) scales with selected column count and `a,b` is not slower than `*` for the same returned columns. (refs: node-postgres#371)
- [P1][perf][impl] Parse one row with ~600 columns; per-row time stays within a small band of the committed baseline — no quadratic-in-columns behavior in `parseDataRow`/`makeRow` (both are single linear passes; this is the regression guard). (refs: node-postgres#3055)
- [P1][property][impl] Object-mode shape stability: all rows of one query share an identical V8 hidden class — `makeRow` ('object') inserts keys in the fixed `fields` order every row; assert via `%HaveSameMap`-style probe or stable key-order + prototype across the result so downstream access isn't deoptimized. (refs: node-postgres#3042)
- [P1][perf][impl] Parse a large buffered result (e.g. 500k rows) on one `onData` burst; measure max event-loop lag during the synchronous `for (const m of messages) this.handle(...)` drain — stays under a small threshold (documents the known single-tick parse cost; baseline-tracked). (refs: node-postgres#1531)
- [P2][perf][impl] JSON/JSONB fast path: returning one server-side `to_json(t)` value (single jsonb cell, parsed once by `asJson`) parses faster than field-by-field typed decoding of the same data across many columns/rows — documents and tracks the documented fast path. (refs: node-postgres#3565, #1807, #3098)
- [P2][perf][impl] Decode-mode cost ladder: `array` vs `object` vs `buffer` vs `raw` for the same 100k-row result — quantify per-mode throughput; `raw`/`buffer` (per-row/per-cell `Buffer.from` copies in `makeRow`) tracked as the copy-cost baseline, `array` fastest. (refs: node-postgres#1993, #1808)
- [P2][perf][impl] Custom `config.types` decoder override has overhead comparable to a built-in decoder (same `decoderFor` Map lookup path) — overriding int8→BigInt does not regress throughput beyond a small band vs the default string decoder. (refs: node-postgres#1993)

#### bytea encode/decode efficiency
- [P1][perf][impl] Decode a multi-MB bytea column (`buffer`/`array` mode); `asBytea` hex path (`Buffer.from(s.slice(2),'hex')`) returns the exact bytes and completes within a small constant factor of psql, with bounded allocations (guard the intermediate `b.toString('utf8')` string allocation cost). (refs: node-postgres#1286, #2240)
- [P1][perf][impl] Insert large bytea buffers as binary params (`encodeParam` Buffer→`{format:1}` zero-copy passthrough); throughput within a reasonable band of baseline — verify no extra copy of the param buffer in `W.bind`. (refs: node-postgres#1680)

#### Streaming throughput & backpressure cost
- [P0][perf][impl] Stream a 1M-row result via `stream()` and iterate as fast as possible; throughput is within a reasonable factor of the buffered `query()` of the same data — no per-row round-trip stall (single Execute, rows arrive as 'D' messages). (refs: node-postgres#2058)
- [P1][perf][impl] Backpressure correctness under a slow consumer: with `highWaterMark=200`, when the consumer awaits between rows the socket actually pauses (`buf.length > HWM` → `socket.pause()`) and resumes at `HWM/2`; steady-state buffered rows stay bounded near HWM (heap bounded), proving pause/resume hysteresis works. (refs: node-postgres#2058, #2633)
- [P1][perf][impl] Early-break cancel cost: break out of the stream after K rows; `return()` sets `cancelled` and resumes the socket — remaining 'D' rows are dropped in `dataRow` (the `t.cancelled` short-circuit) without buffering, and the connection returns to ready promptly (next query latency unaffected). (refs: node-postgres#2058)
- [P2][perf][impl] HWM tuning sweep: throughput vs heap across `highWaterMark` ∈ {50,200,1000,10000}; record the curve as a baseline (no assertion beyond monotonic-ish heap growth with HWM). (refs: node-postgres#2058)

#### Extended-protocol & parameter-path overhead
- [P0][perf][impl] A parameterized extended-protocol query (`SELECT $1::int`) is NOT an order of magnitude slower than the same simple-value query for an identical plan — minipg always uses extended protocol; this is the floor measurement, tracked vs baseline. (refs: node-postgres#3325, postgres.js#794)
- [P0][perf][impl] Named prepared reuse: 100k calls with the same `name`+SQL emit exactly ONE Parse+Describe (subsequent `startTask` hits `reuse=true`, skips Parse) and throughput exceeds the unnamed (re-parse-every-call) path by a measurable margin. (refs: node-postgres#3325, postgres.js#794)
- [P1][perf][impl] Param-encoding overhead: a query with 0 params vs 1 vs 16 params — `t.params.map(encodeParam)` adds only sub-µs-scale fixed cost per param, no tens-of-ms preparation spike. (refs: node-postgres#3213)
- [P1][perf][impl] Per-query dispatch has no measurable fixed object-construction overhead: the `Task` object + Promise allocation per `query()` call is tracked; throughput of a trivial `SELECT 1` is within band of baseline (guards a `Query.checkConstructor`-style regression). (refs: node-postgres#2039)
- [P2][perf][impl] Binary-param detection cost: `encodeParam` decides binary mode per value via a single `Buffer.isBuffer` check (no scan of all params); a 16-param mixed query with one Buffer costs ~the same as detecting it first — verify no O(params) pre-scan exists. (refs: node-postgres#1875)
- [P2][perf][impl] Re-prepare-on-change cost: same `name` with DIFFERENT SQL triggers a Close + Parse (the `else if (cached)` branch); measure that this churn path is bounded and the `prepared` Map updates correctly (footgun guard, not hot path). (refs: node-postgres#3325)

#### Type-OID cache (avoid per-transaction reloads) — asserted-absent
- [P0][integration][impl] Across 10k sequential transactions (raw `BEGIN`/`COMMIT` via `query`), assert via server `pg_stat_statements` / query log that minipg issues ZERO type/array-OID introspection queries — decoders are a static OID→fn Map in `codec.ts`, so the postgres.js per-transaction reload bug is structurally absent. (refs: postgres.js#903, #952)

#### Error/stack-trace & telemetry cost — asserted-absent + roadmap
- [P1][perf][impl] Success-path purity: 100k successful queries — assert no `Error` is constructed on the happy path (`finishTask` only builds a `PgError` when `t.error` is set; success just resolves a plain object), so there is no per-query stack-capture CPU tax. (refs: postgres.js#273, #290)
- [P2][todo:feature] Timing/telemetry hooks (acquire/execute/complete timestamps) add negligible overhead when disabled and are opt-in. Pending — minipg exposes no timing hooks today (PENDING/skip). (refs: node-postgres#2189, postgres.js#558)

#### Pool acquisition latency & queue structure
- [P0][perf][impl] `pool.query` p50/p99 latency is within a small band of direct `Connection.query` for the same statement on a warm pool (idle conn available → `idle.pop()` O(1), no doubled latency). (refs: node-postgres#1654)
- [P1][perf][impl] Waiter/idle scaling: saturate a `max=10` pool with 100k queued `acquire()`s; total time scales ~linearly. NOTE/footgun: `Pool.release` uses `this.waiters.shift()` (O(n) array shift) and `Connection.queue` uses `queue.shift()` — record the scaling curve and flag if it trends quadratic vs baseline. (refs: node-postgres#2252)
- [P1][perf][impl] Connection-queue scaling: enqueue 100k queries on a SINGLE connection (one-in-flight serialization, `processQueue` drains via `queue.shift()`); throughput stays linear, not quadratic — direct guard on the array-shift drain. (refs: node-postgres#2252)
- [P1][perf][impl] Burst-then-quiesce: ramp pool concurrency to max, then drop to 1; sustained low-concurrency throughput recovers to baseline (no stuck `waiters`/`idle` degraded state after the burst). (refs: postgres.js#747)
- [P2][perf][impl] Dead-connection refill cost: kill an in-use conn so `release` sees `state==='closed'` and calls `refill()`; the pool reopens for waiters without latency cliff and `all`/`idle` accounting stays correct under churn. (refs: node-postgres#2894)

#### Insert / batch throughput
- [P1][perf][impl] Multi-row single-statement INSERT (`INSERT ... VALUES ($1,$2),($3,$4),...` with N tuples) achieves substantially higher throughput than N sequential awaited single-row inserts on one connection (one-in-flight makes the sequential path round-trip-bound). (refs: node-postgres#2447, #851, #1919)
- [P2][perf][impl] Pooled parallel inserts (M conns issuing single-row inserts concurrently) vs one connection sequential: quantify the pool concurrency speedup curve up to `max`. (refs: node-postgres#2447, #851)

#### Client-vs-server latency attribution
- [P1][perf][impl] For a sub-ms server query (`SELECT 1`) on an idle dataset, client submit-to-resolve p50/p99 is low and consistent with no random spikes introduced inside the driver (track p999 for outliers). (refs: node-postgres#2884, #1601, #3300)
- [P2][perf][impl] Attribution ratio: compare client-measured time to server `EXPLAIN ANALYZE`/`pg_stat_statements` time for a representative query; record the ratio as a diagnostic baseline (non-gating) so unexplained client overhead is visible. (refs: node-postgres#2884, #2189)
- [P2][perf][impl] Callback-after-read invariant: the result promise resolves only after `finishTask` runs at ReadyForQuery ('Z'), so the server isn't left blocked in ClientRead while user callback work runs — measure server-side ClientRead wait stays near zero. (refs: node-postgres#2189, #874)

#### NULL / empty / edge baselines (happy-path the issues omit)
- [P2][perf][impl] All-NULL wide result (every cell `len===-1` → `null` fast path in `parseDataRow`/`makeRow`) parses at least as fast as the all-non-null equivalent — NULL handling has no extra cost. (refs: node-postgres#3055)
- [P2][perf][impl] Empty result set (`SELECT ... WHERE false`, 'C' with rowCount 0, no 'D' rows) round-trips at near the raw network floor; large loops of empty results plateau in memory. (refs: node-postgres#2894)
- [P2][perf][impl] NUL-byte rejection is cheap and synchronous: a param/SQL containing `\0` rejects client-side in `encodeParam`/`W.parse` before any socket write, and the connection stays usable for the next query (footgun guard, no leak of the wedged task — `startTask` catch path requeues). (refs: node-postgres#3325)

#### Out-of-scope perf guards (assert absent / fail cleanly — minimal)
- [P2][perf][out-of-scope-guard] No `escapeLiteral`/`sql\`\`` template API exists; assert the export is absent so no super-linear string-escape hot path can regress (the node-postgres#3194 bug class cannot occur here). (refs: node-postgres#3194)
- [P2][chaos][out-of-scope-guard] NotificationResponse ('A') under load is silently ignored (`handle` case 'A' returns); flooding NOTIFY does not accumulate buffers or grow heap — LISTEN/NOTIFY is unsupported, so there's no notification-buffer over-allocation path (#1818 class absent). (refs: node-postgres#1818)
- [P2][perf][todo:feature] Binary RESULT format and simple-query protocol throughput benches are placeholders. Pending — `W.bind` hardcodes one result-format code and minipg always uses extended protocol (PENDING/skip). (refs: node-postgres#3565)

### Fixtures & data needed
- Tables: `bench_small(id int pk, a int, b int, c text)`; `bench_wide` with ~600 columns (generated DDL); `bench_bytea(id int, payload bytea)` seeded with multi-MB blobs; `bench_json(id int, doc jsonb)` with large nested docs; `bench_uuid(id uuid pk default gen_random_uuid(), v int)`; a 1M-row `bench_stream` table (or `generate_series`-backed view) for streaming/large-result.
- Generators: deterministic seed scripts producing 8MB text rows, multi-MB bytea, distinct-column-name SQL, and N-tuple multi-row INSERT statements.
- Roles/extensions: superuser-ish role to enable `pg_stat_statements` (shared_preload_libraries) and read `pg_stat_activity.wait_event` for ClientRead attribution; `pgcrypto` (or PG13+ `gen_random_uuid`) for uuid fixtures.
- Server settings: `pg_stat_statements.track=all`, `log_statement=all` (to assert zero introspection queries), `track_activities=on`. Reference psql/libpq binary present for attribution baselines (non-gating).
- Harness assets: `bench/baselines/<machine>-<pgmajor>-<bunver>.json`, hdr-histogram + event-loop-lag util, GC-forcing runner (`bun --expose-gc`), RSS/heap sampler.

### PG-version / config sensitivities
- PG14→17: planner/`generate_series` and parallel-plan changes shift SERVER time — bench attribution must pin/record PG major and isolate client cost; baselines are per-PG-major.
- `bytea_output` (hex vs escape): `asBytea` only handles `\x` hex; under `escape` it falls through to raw UTF-8 bytes — bytea benches must set `bytea_output=hex` (PG default) or they measure a different (incorrect) decode path; pin it.
- `DateStyle`/`timestamptz`/`TimeZone`: timestamp values decode as strings (no Date parse), so decode cost is DateStyle-independent, but param `Date.toISOString()` encoding and server-side text length vary — pin TimeZone for stable timings.
- `standard_conforming_strings` / `client_encoding`: harness forces UTF8 (`startup`); non-UTF8 servers change byte volume and decode cost — pin UTF8.
- `password_encryption` (md5 vs scram-sha-256): affects CONNECT-time cost only (auth handshake), relevant to the connect/teardown memory bench (#597) — record auth method with connect benches; SCRAM PBKDF2 dominates connect latency.
- Bun version: parser/`Buffer.concat`/V8(JSC) GC behavior differs across Bun releases; baselines keyed by Bun version, and the hidden-class/shape-stability probe is JSC-specific (use a Bun-appropriate map-identity check).
- `max_connections` / pool `max`: pool-scaling and burst benches are sensitive to server connection limits and `superuser_reserved_connections`; pin both.

### Estimated test count
49


## Security — scope: partial(roadmap)

This domain proves minipg is a sound trust boundary: untrusted values can never become executable SQL, server-supplied metadata can never mutate the JS runtime, and secrets/TLS fail closed. Grounded in source, minipg's strongest guarantee is structural — `startTask` always sends every value via the extended-protocol `Bind` message (`W.bind`), so values are never spliced into query text; `encodeParam` rejects NUL (0x00) in text params client-side (`codec.ts:52`) and routes `Buffer` through the binary path. The notable *gaps/footguns* visible in source are: object-mode rows are built on a plain `{}` with `o[f.name]=…` (`connection.ts:54-57`) — not a null-prototype object, so `__proto__`/`constructor` column aliases are a live concern; `cfg.password` is an ordinary enumerable field (`connection.ts:92`) with no redaction; `ssl:true` collapses to `rejectUnauthorized:false` (`connection.ts:123`) i.e. encryption without verification; and there is **no** `escapeIdentifier`/`escapeLiteral` helper nor connection-string/DSN parser in the public API. Several cases below are expected to surface real findings, not just pass.

### Test groups

#### Param-boundary injection (value is data, never executable)
- [P0][integration][impl] `query('SELECT $1::text AS v', ["1; DROP TABLE seed_users; --"])` returns exactly one row with `v` === the literal string; a pre-created `seed_users` table still exists afterward — value rode in `Bind`, not SQL text. (refs: node-postgres#44, postgres.js#1170)
- [P0][integration][impl] Stacked-statement rejection: `query('SELECT 1; SELECT 2', [])` rejects with `PgError` code `42601` ("cannot insert multiple commands into a prepared statement"); neither runs. Extended protocol blocks stacked-query injection. (refs: postgres.js#1170, node-postgres#44)
- [P0][integration][impl] Metacharacter round-trip via `RETURNING`/`SELECT $1::text`: input `o'brien -- ; \\ $$ %` comes back byte-identical (never re-parsed). (refs: node-postgres#44)
- [P1][integration][impl] Same round-trip holds with `standard_conforming_strings` toggled `on` and `off` (SET per-session) — proves backslash handling is server-side on a bound value, not client string-building.
- [P1][integration][impl] Type-coerced injection: `query('select $1::int', ['1 OR 1=1'])` rejects with `PgError` `22P02` (invalid input syntax for integer), it is NOT evaluated as a boolean expression.
- [P1][integration][impl] Object param can't escape its column: `query('insert ... ($1::jsonb) returning data', [{x: '"); DROP TABLE t; --'}])` stores/returns the JSON text verbatim; payload stays data inside jsonb.
- [P1][property][impl] Property test: for N random strings (containing `'`, `"`, `;`, `--`, `$$`, `%`, backslash, unicode) `select $1::text` returns input unchanged.
- [P2][integration][impl] Empty-string vs NULL distinction: `''` param returns a zero-length string; `null` param returns SQL `NULL` (`encodeParam` `bytes:null`), confirming they are not conflated.

#### NUL byte & control-character handling
- [P0][unit][impl] `encodeParam('a\0b')` throws `/NUL/` client-side before any bytes hit the wire (`codec.ts:52`). (refs: security.md verification note, line 42 correction)
- [P0][integration][impl] `query('select $1::text', ['a\0b'])` rejects with the NUL error AND the connection stays usable for a subsequent `select 42` — `startTask` serializes params before committing `this.current`, so the throw cannot wedge the queue (`connection.ts:205-226`).
- [P1][integration][impl] Binary path bypasses the text guard correctly: `query('select $1::bytea', [Buffer.from([0,1,2,0])])` round-trips all four bytes including 0x00 (Buffer → binary `format:1`, no NUL check). Distinguishes text vs binary encoding.
- [P1][integration][impl] FOOTGUN/guard: NUL inside the SQL string itself (`query('select 1 -- \0', [])`) — `encodeParam` only guards params, `W.parse` writes SQL as a C-string. Assert the actual behavior (server error or truncation) and document the gap; connection must remain usable.
- [P2][integration][impl] Non-NUL control chars (`\n`, `\t`, `\r`, emoji/4-byte UTF-8) in a text param round-trip unchanged through `select $1::text`.

#### Prototype-pollution-safe key handling
- [P0][integration][impl] Object mode, `query('select 1 as "__proto__"', [], {mode:'object'})`: `Object.prototype` is unmodified globally AND the value is reachable as an own property of the row. Expected to FAIL/expose a bug — `o['__proto__']=…` on a plain `{}` (`connection.ts:56`) does not create an own property for non-object values; should use `Object.create(null)` or `Object.defineProperty`. (refs: node-postgres#3654)
- [P0][integration][impl] Object mode column aliased `"constructor"` and `"prototype"`: value stored as own property, `({}).constructor === Object` still holds, no global pollution. (refs: node-postgres#3625, node-postgres#3654)
- [P1][integration][impl] Worst case — jsonb column aliased `"__proto__"` returning an object `{"polluted":true}`: `o['__proto__']={…}` must not relink the row's prototype chain nor pollute global; assert `({}).polluted === undefined`. (refs: node-postgres#3654)
- [P1][integration][impl] Object mode column `"toString"`/`"hasOwnProperty"`: own property holds the value and does not break later `JSON.stringify(row)` / `Object.keys(row)`.
- [P1][unit][impl] Internal `prepared` map (a `Map`, `connection.ts:77`) is pollution-safe: name a statement `'__proto__'` then `'constructor'`, run each twice (reuse path) — correct results, no collision with inherited keys. Confirms map-not-object choice.
- [P2][integration][impl] Duplicate column aliases in object mode (`select 1 as a, 2 as a`): document last-write-wins (footgun baseline); array mode keeps both cells.

#### Secret redaction (password never leaks)
- [P0][unit][impl] `JSON.stringify(conn)` and `util.inspect(conn)` of a configured `Connection` must not contain the plaintext password. Expected to FAIL/expose a finding — `cfg.password` is an enumerable field (`connection.ts:92`); fix is non-enumerable storage or a custom `inspect`. (refs: node-postgres#2064, node-postgres#1568)
- [P1][unit][impl] Server auth-failure `PgError` (wrong password → `28P01`): neither `error.message` nor `error.stack` embeds the configured password (server fields never carry it; `Object.assign(this, fields)` in `errors.ts:36`). (refs: node-postgres#1568)
- [P1][unit][impl] `JSON.stringify(pgError)` of a thrown auth/connection error does not expose the password. (refs: node-postgres#1568)
- [P1][unit][impl] `util.inspect(pool)` / `JSON.stringify(pool)` does not leak the password held for spawning connections.
- [P2][unit][impl] Client-thrown errors (NUL guard, `connect timeout after …ms`) contain no credentials.

#### SASLprep correctness & SCRAM hardening (unit on `scram()`)
- [P0][unit][impl] Iteration-count DoS cap: `scram(pw).continue(serverFirst with i=1000000)` throws `/bad iteration count/` (`auth.ts:41`, cap 100000); guards PBKDF2 resource exhaustion.
- [P0][unit][impl] Non-positive iterations (`i=0`, `i=-1`) → throws `/bad iteration count/`.
- [P0][unit][impl] Server-nonce binding: `continue` with `r=` not prefixed by the client nonce → throws `/nonce mismatch/` (`auth.ts:39`), blocking nonce-substitution.
- [P0][unit][impl] `final()` with a tampered `v=` (one byte flipped) → throws `/server signature verification failed/` via `timingSafeEqual` (`auth.ts:56`); proves server is authenticated (no downgrade/MITM accept).
- [P0][unit][impl] `final()` with no `v=` attribute → throws `/missing server signature/`.
- [P1][unit][impl] SASLprep/NFKC: password `'Ⅸ'` (ROMAN NUMERAL NINE → `'IX'`) — saltedPassword/clientProof computed on the normalized form; assert the emitted proof equals a reference computed from the NFKC-normalized password (`auth.ts:14,43`). (postgres.js skips this, silently failing 28P01)
- [P1][integration][impl] Non-ASCII password authenticates against a real server role created with the same UTF-8 password (round-trip proof of SASLprep).
- [P1][unit][impl] Full happy-path SCRAM vector: `clientFirst` === `n,,n=*,r=<nonce>`; given a canned serverFirst, `continue` emits `c=biws,r=<nonce>,p=<proof>` and a matching `final` verifies — locks the message format.
- [P2][unit][impl] `md5Password('user','pw',salt)` matches a precomputed `'md5'+md5(md5('pw'+'user')+salt)` test vector (`auth.ts:7-10`).
- [P2][unit][impl] SASL mechanism negotiation: AuthenticationSASL offering only `SCRAM-SHA-256-PLUS` → `fatalConnect('unsupported SASL mechanisms…')` (`connection.ts:172`); channel binding (-PLUS) is roadmap, must fail cleanly not silently downgrade.

#### TLS must fail closed; misconfig guards
- [P0][integration][impl] `ssl:'require'` (and `ssl:true`) against a server replying `N` to SSLRequest → connect rejects with `/server does not support SSL/` (`connection.ts:128`); no plaintext fallback.
- [P0][integration][impl] `ssl:false` against an SSL-capable server → plaintext startup, no SSLRequest upgrade (baseline; `connection.ts:111`).
- [P1][integration][impl] `ssl:{rejectUnauthorized:true}` (or with a bogus `ca`) against a self-signed server → TLS error, connect rejects (cert not trusted → fail closed; `tlsSock.on('error')` → `fatal`).
- [P1][integration][impl] FOOTGUN/guard: `ssl:true` against a self-signed server CONNECTS without verification because it maps to `rejectUnauthorized:false` (`connection.ts:123`). Assert current behavior and document that this is encryption-only; verify-full is required for trust.
- [P1][integration][todo:feature] verify-full / hostname check: `ssl:{rejectUnauthorized:true, ca:<correct>}` but cert CN/SAN ≠ host → must reject. (roadmap: TLS verify-ca/verify-full modes)
- [P2][unit][impl] SNI/servername derivation: `host` an IP → `servername` undefined (no SNI); `host` a name → `servername`===host (`connection.ts:122`), enabling hostname verification when enabled.
- [P1][integration][impl] Unexpected SSLRequest reply byte (neither `S` nor `N`) → `fatalConnect('unexpected SSL response byte: …')` (`connection.ts:130`).
- [P2][integration][todo:feature] `verify-ca` mode: a future sslmode-style option is not yet supported; assert it is ignored/unsupported today (no silent insecure connect). (roadmap)

#### Identifier / literal escaping helpers
- [P1][unit][impl] GUARD: confirm the public API exports **no** `escapeIdentifier`/`escapeLiteral` today (only `connect/createPool/query/stream/end/pool.*`); document that identifiers cannot be parameterized, so dynamic-identifier SQL is currently the caller's responsibility.
- [P1][unit][todo:feature] `escapeIdentifier('foo')` → `"foo"`; `escapeIdentifier('fo"o')` → `"fo""o"` (double quotes doubled, nothing else interpreted). (refs: node-postgres#1699, node-postgres#2295)
- [P1][unit][todo:feature] `escapeIdentifier('tbl"; DROP TABLE x; --')` → a single quoted identifier `"tbl""; DROP TABLE x; --"`; interpolated it references one (non-existent) table and runs no DDL. (refs: node-postgres#2295, node-postgres#1699)
- [P2][unit][todo:feature] `escapeLiteral`: wraps in single quotes, doubles embedded single quotes, AND for backslash-containing input doubles the backslash and emits the `E''` prefix (matches `quote_literal`). (refs: node-postgres#446; security.md line 43 refinement)

#### Out-of-scope security guards (assert absent / fails cleanly)
- [P1][unit][impl] GUARD: minipg takes a config object, not a DSN string — there is no connection-string parser, so there is no credential-echo-in-parse-error path; passing a `"postgresql://…:password@…"` string as `host` is treated as a literal host (connect fails by lookup), not parsed for `password=`. (refs: node-postgres#3145, node-postgres#1568 — n/a by design)
- [P1][unit][impl] GUARD: no arbitrary file read from config — minipg never auto-reads `sslcert`/`sslkey`/`sslrootcert` paths; TLS `ca`/`cert`/`key` are passed straight through as `tls.ConnectionOptions`. With a spied `fs`, configuring `ssl:{...}` triggers zero reads (caller supplies bytes). (refs: node-postgres#3651)
- [P1][integration][impl] GUARD: result column aliased with a JS payload, `select 1 as "\"); process.exit(1);//"` → becomes an inert string column name in array/object mode; no `eval`/`Function`, process stays alive. (refs: node-postgres#1408)
- [P2][integration][todo:feature] Session/RLS leakage across pooled checkout: `SET LOCAL "app.user_id"=…` inside a txn is visible to `current_setting('app.user_id')` within the txn and reset after `COMMIT`/`ROLLBACK`; the next pool checkout of the same physical connection sees no residual value. (roadmap: transaction helper / pool reset) (refs: postgres.js#559)

### Fixtures & data needed
- Table `t` (from smoke) plus a throwaway `seed_users` table to prove DDL injection never fires.
- A jsonb column for object-param and `__proto__`-via-jsonb cases.
- Roles: `md5user`/`md5pw`, `scramuser`/`scrampw` (existing), plus a role whose password contains non-ASCII (e.g. `päⅨss`) for SASLprep round-trip.
- A real TLS-enabled PostgreSQL with a self-signed server cert + the matching CA file, AND a non-TLS server (or one replying `N`) for the fail-closed and downgrade cases. SNI test needs a cert whose CN/SAN differs from the connect host.
- Test doubles: a stub TCP server that replies to SSLRequest with `N` / a junk byte; a spied `fs` module to assert zero reads from SSL config.
- Direct unit harness importing `scram`, `md5Password`, `encodeParam` for the protocol-level auth/codec assertions.

### PG-version / config sensitivities
- `standard_conforming_strings` (default `on` since PG9.1): backslash round-trip case must pass with it both on and off — bound params are unaffected, which is the point.
- `bytea_output` (`hex` vs `escape`): `asBytea` (`codec.ts:11-14`) handles `\x` hex; an `escape`-mode server would change decoded bytes — pin to `hex` or assert both.
- `password_encryption` (`md5` vs `scram-sha-256`, default scram since PG14): drives which auth path (`R` code 5 vs 10) is exercised; both must be covered across PG14-17.
- SCRAM channel binding (-PLUS) availability differs by build/PG version; the negotiation guard must hold regardless.
- Server error wording ("cannot insert multiple commands…", `22P02`, `42601`, `28P01`) — assert on SQLSTATE codes, not message text, since wording can drift across PG14-17.
- `client_encoding` is forced to UTF8 at startup (`connection.ts:137`); NUL/control-char cases assume UTF8.

### Estimated test count
51


## Connection & Config  — scope: partial(roadmap)

This domain covers everything before the first query: how `Connection` (and `createPool`) normalizes its `ConnectConfig`, resolves PG* env vars and OS defaults, opens the TCP transport, builds the startup packet, and surfaces connect success/failure deterministically. minipg today accepts **only an object config** — there is NO connection-string / URL parser (`ConnectConfig` has no `connectionString`/URL field; src/types.ts:26-38), so the entire issue-cluster around URL password/special-char parsing, libpq DSNs, and `service=` files is **not implemented** and is planned here as `todo:feature` / guard tests. What IS implemented (src/connection.ts:86-99): `host=config.host||PGHOST||'localhost'`, `port=config.port||Number(PGPORT)||5432`, `user=config.user||PGUSER||defaultUser()`, `password=config.password??PGPASSWORD??''`, `database=config.database||PGDATABASE||user`, `applicationName||'minipg'`, `connectTimeout??30000`, a hardcoded `client_encoding=UTF8`, plain `net.connect` (no unix-socket / DNS-multi-host / custom-stream support), and exposed `serverParams` + `backendKey`.

### Test groups

#### Config defaults & precedence (object config)
- [P0][unit][impl] `new Connection({})` with no fields and a clean env yields cfg `host='localhost'`, `port=5432`, `applicationName='minipg'`, `connectTimeout=30000` — assert against `conn.cfg`. (refs: node-postgres#1391)
- [P0][unit][impl] Explicit `host` in config takes precedence over `PGHOST` (set both, assert cfg.host = explicit). (refs: node-postgres#2963)
- [P0][unit][impl] Explicit `port`/`user`/`database`/`password` each override their PG* env counterpart. (refs: node-postgres#3327)
- [P0][unit][impl] `database` defaults to the resolved `user` when neither `config.database` nor `PGDATABASE` is set (matches psql/libpq). (refs: node-postgres#788, postgres.js#141)
- [P1][unit][impl] `password` defaults to empty string `''` (not `undefined`) when unset, so an empty-password server connects rather than crashing in auth encoding. (refs: node-postgres#854)
- [P1][unit][impl] `connect()` does NOT mutate the user-supplied config object (deep-equal the input object before/after). (refs: node-postgres#1059)
- [P1][unit][impl] `connect()` is idempotent — two calls return the same promise and open only one socket (src/connection.ts:102). (refs: node-postgres#2235)
- [P2][unit][impl] Wrong/unknown option key (e.g. `username` instead of `user`) is silently ignored and falls through to PGUSER/OS user — GUARD/document this footgun (assert cfg.user is NOT the bogus value; ideally surfaces as auth failure, never a silent wrong-role connect). (refs: node-postgres#2193)

#### Port / host coercion footguns
- [P1][unit][impl] `port:'5433'` (string) — `Number('5433')` coerces to 5433; assert cfg.port is the number 5433, not the string. (refs: postgres.js#622, node-postgres#3311)
- [P1][unit][impl] `port:0` falls through `||` to default 5432 (GUARD: document that 0 is not honored as a port). (refs: node-postgres#3311)
- [P2][unit][impl] `PGPORT` set to a non-numeric string → `Number(...)` is NaN (falsy) → cfg.port falls back to 5432 rather than producing NaN passed to net.connect. (refs: node-postgres#3311)
- [P2][unit][impl] Empty-string `PGPORT=''` → falsy → 5432 (no NaN). (refs: node-postgres#3311)

#### Environment-variable resolution (PG*)
- [P0][integration][impl] With no host in config and `PGHOST` set (including a DNS hostname, not only an IP), connect uses PGHOST and a `SELECT 1` returns rows. (refs: node-postgres#3137, node-postgres#1497, node-postgres#2769)
- [P0][unit][impl] `PGUSER` is used when `config.user` is unset; an explicit user never silently falls back to OS user. (refs: postgres.js#19, node-postgres#847, node-postgres#1168, node-postgres#1538)
- [P1][unit][impl] `PGDATABASE` used when `config.database` unset; otherwise db defaults to resolved user. (refs: node-postgres#788)
- [P1][unit][impl] `PGPASSWORD` used when `config.password` unset; `config.password=''` (explicit empty) is honored over PGPASSWORD via `??` (assert empty string wins, since `?? ` only falls back on null/undefined). (refs: node-postgres#854)
- [P1][integration][impl] PG* env vars set AFTER module import but BEFORE `new Connection()` are honored at construct/connect time (read in constructor, not snapshotted at module load). (refs: node-postgres#2769)
- [P2][unit][impl] GUARD: minipg reads `PGUSER` only (NOT `PGUSERNAME` — libpq defines only PGUSER); assert `PGUSERNAME` set with `PGUSER` unset does NOT change cfg.user. (refs: postgres.js#19, cl-correction)
- [P2][unit][todo:feature] `PGCONNECT_TIMEOUT` / `PGAPPNAME` / `PGOPTIONS` / `PGSSLMODE` are NOT yet honored — pending spec asserting they will map to connectTimeout/applicationName/options/ssl. (refs: node-postgres#1095, node-postgres#1883)

#### Default-user fallback
- [P1][unit][impl] With `config.user` and `PGUSER` both unset, cfg.user = `os.userInfo().username` (src/connection.ts:40-42). (refs: node-postgres#847, node-postgres#1658)
- [P2][unit][impl] When `os.userInfo()` throws (sandbox / no passwd entry), fallback chain is `USER` → `USERNAME` → `'postgres'`; assert it never yields `undefined`. (refs: node-postgres#1658, postgres.js#19)
- [P2][unit][impl] Resolved user also drives database default (unset DB + fallback user → database === that user). (refs: node-postgres#788)

#### Startup packet & startup parameters
- [P0][integration][impl] Startup message is null-terminated and connects to PG15+ without `invalid startup packet layout: expected terminator as last byte`, including for a subsequent parameterized INSERT. (refs: node-postgres#62, node-postgres#63, node-postgres#88, postgres.js#542)
- [P0][integration][impl] `user` and `database` are sent as separate startup params (src/connection.ts:137) — supplying distinct user/database connects to the right DB as the right role, never concatenated. (refs: node-postgres#349)
- [P1][integration][impl] A configured `applicationName` appears in `pg_stat_activity.application_name` for this backend (`SELECT application_name FROM pg_stat_activity WHERE pid = <backendKey.pid>`). (refs: node-postgres#1223, node-postgres#3392)
- [P1][integration][impl] With no `applicationName`, the default `'minipg'` is sent and visible in `pg_stat_activity` (acts as the driver-identifying fallback). (refs: node-postgres#1883)
- [P1][integration][impl] `client_encoding` is sent as `UTF8` (hardcoded) and `SHOW client_encoding` returns `UTF8`. (refs: node-postgres#88)
- [P1][unit][impl] `serverParams.server_version` is populated from the ParameterStatus stream during startup and readable WITHOUT issuing `SELECT version()` (src/connection.ts:149). (refs: node-postgres#2002)
- [P1][unit][impl] `backendKey.pid`/`.secret` are populated from BackendKeyData and exposed on the connection without an extra query (src/connection.ts:150). (refs: node-postgres#2665)
- [P2][unit][impl] `serverParams` accumulates other startup ParameterStatus keys (e.g. `DateStyle`, `integer_datetimes`, `standard_conforming_strings`, `TimeZone`) as sent by the backend. (refs: node-postgres#983)
- [P2][integration][todo:feature] Pending: an `options` / `search_path` / `TimeZone` / `DateStyle` connect-time param forwarded into the startup packet (e.g. `options=-c search_path=myschema`) and reflected by `SHOW`. minipg sends no such params today. (refs: node-postgres#1095, node-postgres#983, postgres.js#645, postgres.js#535)
- [P2][unit][todo:feature] Pending: non-string/object startup value (e.g. object-valued `options`) must throw a clear validation error, never `ERR_INVALID_ARG_TYPE`/Buffer.byteLength TypeError from protocol encoding. (refs: node-postgres#2290, node-postgres#2960, node-postgres#3587)

#### Connect lifecycle: settles, never hangs
- [P0][integration][impl] `connect()` returns a promise that resolves on success and is `await`-able. (refs: node-postgres#1716, node-postgres#2019)
- [P0][integration][impl] Connecting to a refused endpoint (closed port on localhost) rejects (catchable) with an `ECONNREFUSED`-bearing error and sets state `'closed'`. (refs: node-postgres#2222, node-postgres#1180)
- [P0][integration][impl] Connecting to a non-existent database rejects with a `PgError` carrying SQLSTATE `3D000` (`database "x" does not exist`) — ErrorResponse during connecting routes to fatalConnect (src/connection.ts:156). (refs: node-postgres#1196, node-postgres#1999)
- [P1][integration][impl] Bad password rejects with `PgError` SQLSTATE `28P01`/`28000` during the auth phase, not a hang. (refs: node-postgres#2222)
- [P1][integration][impl] `connect_timeout` (small `connectTimeout`, e.g. 50ms, to an unroutable/blackhole IP) rejects with `connect timeout after 50ms` instead of hanging; the timer is cleared on success (no late rejection). (refs: node-postgres#2222, node-postgres#3169)
- [P1][integration][impl] Connecting to a non-Postgres server (e.g. an HTTP/echo port) fails fast with a clear error (parser throw → fatal), not an infinite loop or unhandled crash. (refs: node-postgres#1694, node-postgres#254)
- [P1][integration][impl] An unresolvable host rejects with a catchable `ENOTFOUND`-bearing error (socket 'error' → fatal). (refs: node-postgres#791, node-postgres#1506)
- [P2][integration][impl] After a connect rejection, `conn.state==='closed'` and a subsequent `query()` rejects with `connection is closed` rather than queueing forever (src/connection.ts:259). (refs: node-postgres#2235)
- [P2][chaos][impl] Socket closed by peer mid-handshake (before ReadyForQuery) rejects the connect promise with `connection terminated unexpectedly` (src/connection.ts:110), not a silent hang. (refs: node-postgres#2246, node-postgres#2227)

#### Unix domain sockets — NOT implemented
- [P1][integration][todo:feature] `host` set to a socket directory path (`/var/run/postgresql`, `/cloudsql/proj:region:inst`) should connect over the unix socket and run a query. Today minipg passes the path straight to `net.connect({host,port})` → DNS/ENOTFOUND; pending spec. (refs: node-postgres#16, node-postgres#1617, node-postgres#3146, postgres.js#484)
- [P2][unit][todo:feature] Socket path used as-is with NO `.s.PGSQL.<port>` double-append once implemented. (refs: node-postgres#277, node-postgres#287)
- [P2][integration][todo:feature] Unix-socket connection allows a database name distinct from the username. (refs: node-postgres#484)

#### Connection-string / URL parsing — NOT implemented (guard + roadmap)
- [P1][unit][todo:feature] Passing a `postgres://user:pass@host:5433/db` URL string (or `{connectionString}`) should parse to host/port/user/password/database. Today there is no parser; document/guard that a string is rejected or ignored cleanly (NOT silently char-indexed into `{0:'p',...}`). (refs: node-postgres#1228, node-postgres#1263, node-postgres#3126)
- [P2][unit][todo:feature] Percent-encoded special chars in password (`p%40ss%23`→`p@ss#`, `%20`→space, `%2F`→`/`) decode byte-for-byte once URL parsing lands. (refs: node-postgres#2331, node-postgres#258, node-postgres#3013)
- [P2][unit][todo:feature] URL with no pathname (`postgres://user@host`) defaults database to username, no `slice of null`. (refs: postgres.js#3, postgres.js#141)
- [P2][unit][impl] GUARD: an undefined/garbage `host` (e.g. `host: undefined` with no PGHOST) does not produce a misleading "Server does not support SSL"; it defaults to `localhost` (assert cfg.host==='localhost'). (refs: node-postgres#1391, node-postgres#1086)

#### Out-of-scope guards (assert absent / clean failure, no full coverage)
- [P2][unit][impl] No `connectionString` support: GUARD that the documented config shape is object-only and a libpq `key=value` DSN string is not silently accepted as a host. (refs: node-postgres#1756) — out of scope for this driver.
- [P2][unit][impl] No `service=`/`pg_service.conf` resolution — guard that no such lookup happens. (refs: node-postgres#416) — out of scope.
- [P2][unit][todo:feature] No multi-host / `target_session_attrs` / DNS round-robin failover — comma-host string is not parsed; single host only (roadmap, not core). (refs: node-postgres#1470, node-postgres#932, node-postgres#1733)
- [P2][unit][todo:feature] No custom Duplex-stream / pre-connected-socket injection; `net.connect` is always used (guard for now). (refs: node-postgres#2503, node-postgres#3629, node-postgres#2896)

### Fixtures & data needed
- A live PostgreSQL 15+ instance (Docker; reuse src/docker.ts pattern) reachable over TCP on a known host/port.
- A throwaway role + database with a known password to exercise PGUSER/PGPASSWORD/PGDATABASE and 28P01/3D000 paths; plus a role with empty password (or `trust`/`md5`/`scram` HBA variants) for the empty-password test.
- A closed/unused localhost port (refused), a blackhole/non-routable IP (timeout), and a non-Postgres listener (e.g. a bare TCP echo/HTTP server on a temp port) for fail-fast tests.
- Env-var sandboxing helper: save/restore `process.env` PG* keys (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE/PGUSERNAME) around each env test; helper to stub `os.userInfo()` throwing for the fallback test.
- `pg_stat_activity` query keyed by `conn.backendKey.pid` to assert application_name.

### PG-version / config sensitivities
- Startup-packet terminator strictness is PG14+; the null-terminator test must run against PG15+ to catch regressions (older servers were lenient).
- Default auth method depends on server `password_encryption` (md5 vs scram-sha-256) and pg_hba.conf — empty-password and bad-password tests should run against at least scram and md5 HBA configs.
- `server_version` string format varies across PG14–17 (e.g. `15.6`); assert prefix/semver-parse, not exact equality.
- `SHOW client_encoding` returns `UTF8` regardless; safe across versions. `DateStyle`/`TimeZone` ParameterStatus presence is stable but values are server-config-dependent (don't hardcode).
- Node 17+ DNS ordering (IPv6-first `localhost`) can cause `ECONNREFUSED ::1` on IPv4-only servers — relevant to the localhost connect baseline even though minipg has no explicit IPv4 fallback (document as a known environment footgun).

### Estimated test count
44


## TLS / SSL  — scope: partial(roadmap)

What to test: how minipg decides to attempt TLS, negotiates the in-band Postgres SSLRequest, upgrades the live TCP socket, and resolves trust/verification. Grounded in `src/connection.ts`: `ssl` is normalized as `config.ssl ?? false` and may only be `true | 'require' | tls.ConnectionOptions` (there is NO connection-string/`sslmode` parsing, NO `sslnegotiation=direct`, NO `PGSSL*` env handling — all roadmap). `startSSL()` writes `W.sslRequest()` then does `sock.once('data', …)` and reads `buf[0]` as the `S`/`N` byte; on `S` it calls `tls.connect({ socket, servername })` reusing the same socket; on `N` it errors only when `ssl === true || ssl === 'require'`, otherwise (i.e. an `ssl` OBJECT) it silently falls back to plaintext. TLS options: for a string/`true` it forces `rejectUnauthorized:false` (encrypt-but-don't-verify); for an object it spreads the user opts over `{ socket, servername }`, so `servername`/`rejectUnauthorized`/`ca`/`key`/`cert`/`checkServerIdentity`/`secureOptions` all pass straight to `tls.connect`. `servername` is `host` for names, `undefined` for IPs (IP is never passed for altname validation — a footgun).

### Test groups

#### SSL config coercion (boolean / string / object)
- [P0][integration][impl] `ssl: true` against an SSL-enabled server completes the handshake and runs `SELECT 1`, never throwing a TypeError about the `in` operator. (refs: node-postgres#2406, #2411, #2892)
- [P0][unit][impl] `ssl: false` (and omitted `ssl`, which defaults to `false`) sends NO SSLRequest: assert the very first bytes written to the socket are the StartupMessage, not `80877103`; explicit `false` is honored. (refs: node-postgres#2449, #2754, #848)
- [P0][integration][impl] `ssl: 'require'` (string) is accepted and enables TLS (does not throw / is not treated as falsey), connecting with `rejectUnauthorized:false`. (refs: node-postgres#2659)
- [P0][integration][impl] `ssl: { ca, key, cert }` object is honored as non-boolean: its fields reach `tls.connect` (spy/mock `tls.connect` and assert the merged opts contain `ca/key/cert`). (refs: node-postgres#1069)
- [P1][unit][impl] For `ssl: true`/`'require'` the TLS opts are exactly `{ socket, servername, rejectUnauthorized:false }` — assert verification is intentionally disabled (documented footgun vs node-postgres which defaults to verify). (refs: node-postgres#2375)
- [P2][unit][impl] For an `ssl` object, `rejectUnauthorized` is NOT injected by minipg, so omitting it inherits Node's default (`true`) and verification stays ON unless the user opts out.

#### SSLRequest negotiation framing
- [P0][integration][impl] With SSL enabled, the first 8 bytes written are the SSLRequest packet (length 8, code `80877103`/`0x04d2162f`) and it precedes the StartupMessage; server never reports `unsupported frontend protocol 1234.5679`. (refs: node-postgres#2085, #2089, #2128)
- [P0][integration][impl] The client reads the single-byte `S` reply and completes the TLS handshake, then StartupMessage flows over the encrypted socket. (refs: node-postgres#1160, #1521)
- [P0][integration][impl] SSL upgrades the EXISTING TCP socket in place (`tls.connect({ socket })`): exactly one outbound TCP connection is opened, not a second. (refs: node-postgres#3045)
- [P1][chaos][impl] Footgun guard: `startSSL` uses `sock.once('data', …)` and reads only `buf[0]`. Simulate the server sending the `S` byte and TLS ServerHello fused into ONE TCP segment (or `S` arriving in its own late segment) — assert the handshake still completes and no bytes after `buf[0]` are dropped before TLS takes over. (refs: node-postgres#1160, #1521)
- [P1][integration][impl] After the upgrade, writes go through the TLSSocket (queries succeed) — no `this.stream.write is not a function` and no `ERR_UNKNOWN_ENCODING` analog. (refs: node-postgres#3294, postgres.js#218)
- [P2][unit][impl] An unexpected first byte (neither `S` nor `N`, e.g. an ErrorResponse `E`) triggers `fatalConnect` with `unexpected SSL response byte: …` and the connect promise rejects (no hang). (derived from source line 130)

#### Server declines SSL (N reply) and pg_hba
- [P0][integration][impl] `ssl: true` (or `'require'`) against a server that replies `N` rejects the connect promise with `server does not support SSL` and the socket is destroyed (no leaked handle). (refs: node-postgres#1262, #553, #2079)
- [P0][chaos][impl] BUG GUARD: `ssl: { … }` (object) against a server replying `N` currently FALLS BACK TO PLAINTEXT silently (source: only `=== true || === 'require'` errors). Assert/document this footgun — an explicit cert-bearing SSL request should arguably fail closed, not downgrade. (derived from source line 127-129)
- [P1][integration][impl] Connecting WITHOUT SSL to a server whose `pg_hba.conf` requires SSL surfaces the backend FATAL (`no pg_hba.conf entry … SSL off`) as a catchable rejection with a readable message via `fatalConnect`, not a garbled/unhandled error. (refs: node-postgres#390, #2494)
- [P1][todo:feature] `sslmode=prefer` should attempt SSL first and transparently fall back to plaintext on `N` instead of erroring — pending spec (no `prefer` concept exists; `'require'` hard-errors). (refs: node-postgres#2720, #2775, #2572)
- [P2][todo:feature] `sslmode=disable` should perform no handshake so a non-SSL server yields no `server does not support SSL` error — pending; today the equivalent is `ssl:false`. (refs: node-postgres#3089)

#### Self-signed certs and rejectUnauthorized
- [P0][integration][impl] `ssl: { rejectUnauthorized: false }` connects over TLS to a server presenting a self-signed cert WITHOUT raising `self-signed certificate in certificate chain`. (refs: node-postgres#2009, #2946, #2880, postgres.js#38, #359, #597)
- [P1][integration][impl] `ssl: true` against a self-signed-cert server connects (because minipg forces `rejectUnauthorized:false`) — encrypts but does not verify. (refs: node-postgres#2375, #2607)
- [P1][integration][impl] `ssl: { rejectUnauthorized: true }` (or default true via bare object) against a self-signed-cert server REJECTS with a cert-chain error and the connect promise rejects cleanly (no crash). (refs: node-postgres#2009)

#### Custom CA / verified TLS
- [P0][integration][impl] `ssl: { ca: <customCA> }` verifies the server cert and connects with verification ON (Node default `rejectUnauthorized:true`); a server cert signed by that CA is accepted, a cert NOT signed by it is rejected. (refs: node-postgres#1523, #1540, #3600, postgres.js#571)
- [P1][integration][impl] Providing a CA does NOT silently disable validation — assert the merged opts do not contain `rejectUnauthorized:false` when only `ca` is supplied. (refs: node-postgres#1523)
- [P2][todo:feature] `sslmode=require` + `sslrootcert` (CA file via connection-string/env) connecting with verification — pending (no connection-string/file loading). (refs: node-postgres#643, #1413)
- [P2][todo:feature] `sslrootcert=system` loading OS trust roots for verify-full — pending. (refs: node-postgres#3101, postgres.js#689)

#### Client certificate authentication
- [P0][integration][impl] `ssl: { ca, key, cert }` presents the client cert so a server requiring `clientcert` accepts the TLS connection (no `connection requires a valid client certificate`); the key/cert reach `tls.connect` via the object spread. (refs: node-postgres#2392, #2405, #2424, #727)
- [P1][unit][impl] `key`/`cert` survive normalization: store an `ssl` object whose `key` is defined non-enumerably and assert it still reaches `tls.connect` (minipg spreads with `{ ...base, ...this.cfg.ssl }`, which only copies enumerable props — guard for the node-postgres #2392 regression class). (refs: node-postgres#2392)
- [P2][integration][impl] Supplying `ca/key/cert` keeps SSL ON (does not downgrade to plaintext) — but note the `N`-reply object-fallback footgun above. (refs: node-postgres#2414)
- [P2][todo:feature] Connection-string `sslcert`/`sslkey`/`sslrootcert` PATHS loaded from disk and presented — pending (no path loading). (refs: node-postgres#2024)

#### Hostname verification, SNI, servername, IP
- [P0][integration][impl] TLS handshake sends SNI: connecting by hostname passes `servername === host` to `tls.connect` (assert via mock) so SNI-routing providers (Neon) accept. (refs: postgres.js#705)
- [P0][unit][impl] Connecting by IPv4/IPv6 sets `servername: undefined` (via `net.isIP`). FOOTGUN GUARD: the IP is therefore NOT forwarded for IP-altname validation, unlike node-postgres — assert current behavior and flag as a verification gap. (refs: node-postgres#2263, #1950)
- [P1][unit][impl] Explicit `ssl.servername` overrides the host-derived value: object spread puts user `servername` AFTER `base`, so `{ ...base, servername:'x' }` wins — assert `tls.connect` receives the user value, not `host`. (refs: node-postgres#2803, #2773)
- [P1][integration][impl] User-supplied `ssl.checkServerIdentity` is forwarded to `tls.connect` and invoked for hostname verification (passes via spread). (refs: node-postgres#1185, #2178, postgres.js#62)
- [P2][unit][impl] No DEP0123 servername deprecation warning is emitted when connecting by IP (servername is `undefined`, not the IP). (refs: node-postgres#1950)

#### Malformed cert material → catchable error
- [P0][chaos][impl] Malformed `ca`/`key`/`cert` PEM strings reject the connect promise with a clear PEM/certificate error and do NOT crash the process via uncaughtException (tls error → `fatal` → reject). (refs: node-postgres#2307, #2004, #836)
- [P1][unit][impl] A `tls.connect`-thrown synchronous error (bad opts) is caught and surfaced as a connect rejection rather than escaping `startSSL`'s `data` handler. (refs: node-postgres#2307)

#### Connection-string sslmode parsing [todo]
- [P1][todo:feature] `?sslmode=disable` disables SSL and the token is stripped from dbname; no SSLRequest sent. (refs: node-postgres#1949, postgres.js#177)
- [P1][todo:feature] `?sslmode=require` enables SSL with `rejectUnauthorized:false` (driver-specific: self-signed still connects). (refs: node-postgres#2375, #2607)
- [P1][todo:feature] `?sslmode=no-verify` (node-postgres extension, NOT libpq) ≡ `rejectUnauthorized:false`. (refs: node-postgres#2281, #2607)
- [P1][todo:feature] `?ssl=true` in the URL enables a secure connection. (refs: node-postgres#275, #532)
- [P1][todo:feature] Given `connectionString` PLUS explicit `ssl: { ca }`, the explicit object is preserved and not overwritten by sslmode parsed from the string (merge precedence deterministic). (refs: node-postgres#1709, #2380, #3355)
- [P2][todo:feature] `sslmode` is settable via the config object form (parity with the string), and via `PGSSLMODE` env. (refs: node-postgres#3563, #3294)
- [P2][todo:feature] `PGSSLCERT`/`PGSSLKEY`/`PGSSLROOTCERT` env vars configure client cert/key/CA. (refs: node-postgres#2723)

#### verify-ca / verify-full modes [todo]
- [P1][todo:feature] `sslmode=verify-ca` enables SSL with chain verification (`rejectUnauthorized:true`) but does NOT enforce hostname; `verify-full` additionally validates hostname (sets/keeps `checkServerIdentity`). (refs: node-postgres#1884, #2934)
- [P2][todo:feature] `verify-full` against a cert whose CN/SAN mismatches the host rejects with a hostname-mismatch error; `verify-ca` with the same mismatch connects. (refs: node-postgres#2934)

#### Direct TLS negotiation (PG17) [todo]
- [P2][todo:feature] `sslnegotiation=direct` against a PG17 server begins the TLS handshake immediately after TCP connect, skipping the SSLRequest byte exchange. (refs: node-postgres#3346, postgres.js#993)
- [P2][todo:feature] ALPN (`postgresql`) is offered for direct-TLS so the server accepts the direct negotiation. (refs: node-postgres#3346)

#### TLS robustness / races / credential refresh
- [P1][chaos][impl] Repeated rapid connects with `ssl:true` do not intermittently fail with a `socket disconnected before secure TLS connection` analog: a `close`/`error` on the raw socket during the upgrade window rejects the in-flight connect cleanly (no double-resolve, no hang). (refs: node-postgres#3401, postgres.js#763, #1044, #1083)
- [P1][unit][impl] Connect timeout fires during the TLS handshake (server accepts TCP, stalls before `S`): `connTimer` rejects with `connect timeout after Nms` and destroys the socket. (derived from source line 106)
- [P2][todo:feature] Pool credential/secureContext refresh: updating the pool's `ssl` options causes subsequently created connections to use refreshed certs without recreating the pool. (refs: node-postgres#2893, #2618)
- [P2][unit][impl] `ssl.secureOptions` / `secureContext` / `minVersion` pass through the object spread to `tls.connect` (TLS protocol restriction honored). (refs: node-postgres#1769)

#### Out-of-scope guards
- [P2][unit][impl] SCRAM channel binding (`SCRAM-SHA-256-PLUS`) is NOT advertised/selected: with a `-PLUS`-only server minipg fails cleanly with `unsupported SASL mechanisms` rather than attempting channel binding over the TLS socket. (roadmap [todo] for -PLUS; guard here that it fails closed)
- [P2][unit][impl] No `sql`-template / LISTEN / COPY interplay with TLS — TLS path exposes only `connect`/`query`/`stream` (assert API surface unchanged when SSL on).

### Fixtures & data needed
- An SSL-enabled local Postgres (e.g. dockerized PG with `ssl=on`) presenting: (a) a self-signed server cert, and (b) a cert signed by a test CA. Generate a throwaway CA + server cert (matching CN/SAN to `localhost`) + a mismatched-host cert + a client cert/key pair via `openssl`, stored under the scratchpad.
- A second PG/`pg_hba.conf` variant requiring `hostssl … clientcert=verify-full` for the client-cert tests, and one with `hostnossl`/SSL-required entries for the pg_hba FATAL test.
- A non-SSL Postgres (or a stub TCP server replying `N` to SSLRequest) for the decline/fallback cases; a stub server that fuses `S`+ServerHello or stalls, for framing/race/timeout tests.
- Mock/spy on `tls.connect` to assert merged options (`servername`, `ca/key/cert`, `rejectUnauthorized`, `checkServerIdentity`, `secureOptions`) without a real handshake (unit-level).
- Malformed PEM strings (truncated/garbage) for the crash-guard test.

### PG-version / config sensitivities
- `sslnegotiation=direct` and ALPN require PG17+ (todo); pre-17 servers only do the SSLRequest preamble.
- `sslrootcert=system` semantics differ by libpq version (PG16+); todo.
- `ssl` GUC and `pg_hba.conf` (`hostssl`/`hostnossl`/`clientcert`) control which negotiation paths are reachable; error text for `no pg_hba.conf entry … SSL off` is stable across PG14-17 but locale-sensitive.
- Server cipher/`ssl_min_protocol_version` (default TLSv1.2 since PG12) interacts with `secureOptions`/`minVersion`; restricting to TLSv1.3 must still complete.
- node-postgres-vs-libpq divergence: `require`/`no-verify` → `rejectUnauthorized:false` is a driver convention, not libpq spec — label these tests driver-specific.

### Estimated test count
44


## Authentication — scope: partial(roadmap)

What to test: how minipg negotiates and completes each wire-protocol auth method and how it surfaces failures. The driver supports exactly three methods in `connection.ts#auth`: cleartext (code 3 → `W.password`), MD5 (code 5 → `md5Password(user, pwd, salt[4..8])`), and SASL SCRAM-SHA-256 (code 10/11/12 via the `scram()` state machine in `auth.ts`). Any other auth code, or a SASL mechanism list lacking `SCRAM-SHA-256`, calls `fatalConnect` with an explicit error. Credentials resolve only from `config` → env (`PGUSER`/`PGPASSWORD`/`PGDATABASE`) → OS user (`os.userInfo().username`); password defaults to `''`. The SCRAM client does SASLprep-as-NFKC, rejects a server nonce that does not start with the client nonce, bounds iterations to `>0 && <=100000`, and verifies the server signature with `timingSafeEqual`. Notable real gaps to pin down: there is NO lower iteration floor (it accepts `i=1`), no `.pgpass`, no function/async credentials, and no channel binding — all roadmap/out-of-scope, planned below as pending specs and guards.

### Test groups

#### Cleartext password (auth code 3)
- [P0][integration][impl] Connect to a role whose `pg_hba.conf` line is `password` (cleartext) with the correct password → `connect()` resolves, `select 1` returns 1, `current_user` equals that role. (refs: node-postgres#2632)
- [P1][integration][impl] Cleartext role with `password: ''` against a role that has an empty password → empty string is sent verbatim and authenticates (not treated as "no password"). (refs: node-postgres#2297)
- [P1][integration][impl] Cleartext with wrong password → rejects with `PgError` code `28P01`, no unhandled `'error'` event.

#### MD5 password (auth code 5)
- [P0][integration][impl] Connect to an md5 role (`md5user`/`md5pw`) → authenticates; `select 1` returns 1 (baseline already in smoke.ts #12, keep and extend with `current_user` assertion). (refs: node-postgres#1000, node-postgres#1899)
- [P0][unit][impl] `md5Password('md5user','md5pw', salt)` equals `'md5' + md5(md5('md5pw'+'md5user') + salt)` computed independently; assert the exact 35-char `md5...` hex string for a fixed 4-byte salt. (refs: node-postgres#1018, node-postgres#1080)
- [P1][unit][impl] Binary salt bytes (e.g. `Buffer.from([0x00,0xff,0x80,0x7f])`) are concatenated as raw bytes, not as a UTF-8 string — result matches a byte-accurate reference. (refs: node-postgres#1003, node-postgres#1019, node-postgres#1029)
- [P1][unit][impl] MD5 with a non-ASCII password (`'pä'`) — `Buffer.from(password,'utf8')` path produces the same digest as a UTF-8 reference (MD5 does NOT SASLprep; raw UTF-8 bytes).
- [P1][integration][impl] md5 role with wrong password → `PgError` `28P01`, connection rejected cleanly.

#### SCRAM-SHA-256 handshake (auth codes 10/11/12) — happy path & concurrency
- [P0][integration][impl] Connect to a scram role (`scramuser`/`scrampw`) → full client-first → server-first → client-final → server-final completes, `final()` verifies the server signature, `select 1` returns 1 (baseline in smoke.ts #12; extend). (refs: node-postgres#2661, node-postgres#1508)
- [P0][integration][impl] Open N=50 SCRAM connections in parallel (`Promise.all` of `connect()`); ALL resolve and run a query — proves no shared mutable SASL state leaks (each `Connection` holds its own `scramState`). (refs: postgres.js#123, postgres.js#142, node-postgres#3222, node-postgres#2608)
- [P1][integration][impl] Same 50-way parallel SCRAM through a `createPool({max})` growing under load → no "Last message was not SASLResponse" / cross-handshake corruption. (refs: node-postgres#3222)
- [P1][integration][impl] SCRAM with wrong password → server ErrorResponse during auth → `PgError` `28P01` rejected (smoke.ts #12 asserts rejection; tighten to assert `.code==='28P01'`).

#### SCRAM state-machine unit tests (drive `scram()` directly)
- [P0][unit][impl] `scram(pwd).clientFirst` begins with the gs2 header `n,,` and contains `n=*,r=<base64 nonce>`; the nonce is `randomBytes(18)` base64 (24 chars). (refs: node-postgres#1508)
- [P0][unit][impl] `clientFinalNoProof` uses `c=biws` (base64 of `n,,`) and echoes the full server nonce `r=`; the emitted `p=` proof equals `xor(clientKey, hmac(storedKey, authMessage))` for a known salt/iteration vector (golden vector cross-checked vs an independent SCRAM impl).
- [P0][unit][impl] Server nonce that does NOT start with the client nonce → `continue()` throws `SCRAM: server nonce mismatch`. (refs: postgres.js#430, postgres.js#668)
- [P0][unit][impl] Tampered server-final `v=` (flip one byte) → `final()` throws `SCRAM: server signature verification failed`; correct `v=` passes (timingSafeEqual length+content). (server-signature tamper guard)
- [P1][unit][impl] Server-final missing the `v=` attribute, or `final()` called before `continue()` (no stored serverSignature) → throws `SCRAM: missing server signature`.
- [P1][unit][impl] Iteration upper bound: server-first with `i=100001` → `continue()` throws `SCRAM: bad iteration count` (PBKDF2 DoS cap). Boundary `i=100000` is accepted.
- [P1][unit][impl] Iteration non-positive: `i=0` and a non-numeric `i=abc` → throws `bad iteration count`.

#### SASLprep / Unicode passwords
- [P0][integration][impl] A password with non-ASCII characters that NFKC-normalizes (e.g. fullwidth/compat form vs canonical) authenticates against a SCRAM role created with the normalized password in psql — confirms `saslprep` (NFKC) parity with the server. (refs: node-postgres#? — driver comment cites postgres.js skipping this)
- [P1][unit][impl] `saslprep` is exactly `String.prototype.normalize('NFKC')`: a compatibility-decomposable input (e.g. `'ﬁ'` ﬁ → `'fi'`) changes the bytes fed into PBKDF2; assert the salted password differs from the un-normalized input.
- [P1][integration][impl] A plain ASCII password is unchanged by NFKC and still authenticates (no over-normalization regression).
- [P2][integration][impl] Password containing spaces / special chars (`'success computer'`, `'p@ss:w/rd'`) supplied via config object authenticates over SCRAM. (refs: postgres.js#680)

#### Wrong / missing password — failure surfacing (no unhandled crashes)
- [P0][integration][impl] Wrong password (cleartext/md5/scram) → the `connect()` promise rejects with a catchable `PgError`, `code==='28P01'`; assert NO `process` `uncaughtException` and the socket is destroyed (`fatalConnect`). (refs: node-postgres#599, #746, #2846, #1511, #2690)
- [P0][integration][impl] Same wrong-password failure acquired via `createPool().query(...)` / `pool.connect()` → surfaces as a rejection to the caller, Pool does not emit an unhandled `'error'`. (refs: node-postgres#599)
- [P1][integration][impl] Server requires a password but none supplied (`password` omitted → defaults to `''`) → fails with a clear auth error (`28P01`), not a silent hang. (refs: node-postgres#2904)
- [P1][chaos][impl] Socket destroyed mid-handshake (kill server between server-first and server-final) → `connect()` rejects with `connection terminated unexpectedly` / socket error, never hangs past `connectTimeout`. (refs: node-postgres#1927)

#### SASL mechanism negotiation
- [P0][unit][impl] `auth()` with code 10 and a mechanism list excluding `SCRAM-SHA-256` (e.g. only `SCRAM-SHA-256-PLUS`) → `fatalConnect(new Error('unsupported SASL mechanisms: ...'))` naming the offered mechanisms; promise rejects. (refs: node-postgres#3361, node-postgres#3505)
- [P1][unit][impl] `auth()` with code 10 offering `['SCRAM-SHA-256','SCRAM-SHA-256-PLUS']` → selects `SCRAM-SHA-256` (does not require PLUS). (refs: node-postgres#3361, node-postgres#2943)
- [P1][unit][impl] `auth()` with an unsupported auth code (e.g. 7 GSS, 6 SCM, 9 SSPI) → `fatalConnect('unsupported authentication request: <code>')`, promise rejects (not a hang). 

#### Credential resolution & defaults
- [P1][unit][impl] No `user` in config and `PGUSER` unset → startup packet carries `os.userInfo().username` (not empty, not hardcoded "postgres"). (refs: node-postgres#1719, node-postgres#1780)
- [P1][unit][impl] `database` defaults to the resolved `user` when neither `config.database` nor `PGDATABASE` is set. 
- [P1][unit][impl] Precedence: explicit `config.password` overrides `PGPASSWORD`; `config.user` overrides `PGUSER`. 
- [P2][integration][impl] Username with special chars (`'IAM:master'`, `'success computer'`) is transmitted verbatim in the startup packet and authenticates with valid creds. (refs: node-postgres#1528, node-postgres#2285)
- [P2][unit][impl] `password` accepted as a literal value type other than string is coerced/handled — passing a number/Buffer: confirm current behavior (cleartext `W.password` and `pbkdf2Sync`/`createHmac` require a string; assert it either throws a clear client-side error before the wire or is documented). (footgun guard, refs: node-postgres#2757, #3210)

### Roadmap features (pending / skipped specs — todo)
#### Iteration floor (security)
- [P1][unit][todo:feature] Server-supplied `i=1` (below the SCRAM-spec safe minimum) SHOULD be rejected; current driver only checks `i>0 && i<=100000` and so ACCEPTS `i=1` — write as a PENDING spec asserting a future `i>=4096` floor, and a companion IMPL test documenting today's behavior (accepts i=1) so the gap is visible. (refs: node-postgres#3655)

#### SCRAM channel binding (-PLUS)
- [P2][integration][todo:feature] Against a TLS server requesting/allowing channel binding, advertise `p=tls-server-end-point` and include `cbind` data in client-first/client-final; current driver hardcodes `n,,`/`c=biws` (no binding) — pending. (refs: node-postgres#1508, node-postgres#3222)
- [P2][unit][todo:feature] When channel binding is requested but unsupported, fail with a clear error rather than silently downgrading.

#### Dynamic / async credentials
- [P2][integration][todo:feature] `password` as a sync/async function resolved per-connection (RDS IAM rotation) → currently unsupported (constructor stores `config.password` as-is; a function would reach `W.password`/`pbkdf2Sync` and fail). Pending spec + guard that a function password fails with a clear error today, never `[object Promise]`/`createHmac` TypeError. (refs: node-postgres#1873, #3223, #2757, postgres.js#615)
- [P2][integration][todo:feature] Function-valued `user` resolved per-connection — pending. (refs: node-postgres#2679, postgres.js#881)

#### `.pgpass` / PGPASSFILE
- [P2][integration][todo:feature] No password supplied + matching `~/.pgpass` / `$PGPASSFILE` line → read and use it; current driver does NOT read `.pgpass` (defaults password to `''`). Pending spec. (refs: node-postgres#455, postgres.js#964)

#### Cert / IAM-token / GSSAPI
- [P2][integration][todo:feature] Client-cert auth over TLS without a DB password — pending (TLS verify modes are themselves roadmap). (refs: node-postgres#1358, #2548)
- [P2][integration][todo:feature] AWS IAM token (1000+ char) used as the SCRAM/cleartext password over SSL sends fully without truncation/hang. (refs: node-postgres#1843, postgres.js#288)
- [P2][integration][todo:feature] GSSAPI/Kerberos request → currently hits the `default` unsupported-auth-code path; pending GSS exchange spec. (refs: node-postgres#1443, #2526)

### Out-of-scope guards
- [P2][integration][impl] Connecting to a `trust`-auth server (`POSTGRES_HOST_AUTH_METHOD=trust`) with no password → AuthenticationOk (code 0) handled, connects without sending any password, no `28P01`. (refs: node-postgres#2524)
- [P2][unit][impl] Peer/ident over a unix-domain socket is NOT supported by the transport (`net.connect({host,port})` is TCP-only) → assert a clear failure / documented limitation rather than a hang. (refs: node-postgres#202, #613, #2160)

### Fixtures & data needed
- Docker PG with multiple roles via `pg_hba.conf` per method:
  - `md5user`/`md5pw` (hba: `md5`), `scramuser`/`scrampw` (hba: `scram-sha-256`), `cleartextuser`/`clearpw` (hba: `password`), `emptypwuser` with empty password, `unicodeuser` with an NFKC-normalizable password, `specialuser` with `'success computer'`/`'p@ss:w/rd'`.
- `password_encryption=scram-sha-256` when creating SCRAM roles; `md5` (or `SET password_encryption='md5'` before `CREATE ROLE`) for md5 roles.
- A `trust`-configured instance/port (or `POSTGRES_HOST_AUTH_METHOD=trust`) for the trust guard.
- For unit tests: import `md5Password`, `scram` from `src/auth.ts`; craft synthetic server-first/server-final strings (compute golden vectors with an independent SCRAM reference / psql-created credential). Optionally a tiny in-process fake server emitting AuthenticationRequest bytes to exercise `connection.ts#auth` mechanism-list and unsupported-code branches without a real PG.
- `current_user` / `select 1` round-trips for happy-path confirmation.

### PG-version / config sensitivities
- `password_encryption` default is `scram-sha-256` on PG10+; md5 roles must be created with it set to `md5`, else `CREATE ROLE ... PASSWORD` stores a SCRAM verifier and the md5 hba line still triggers md5 challenge → mismatch. Pin per-role.
- SCRAM is unavailable pre-PG10 (driver targets modern PG; note as min-version).
- SCRAM-SHA-256-PLUS / channel binding availability depends on TLS being negotiated and PG build; relevant only to the -PLUS roadmap specs.
- FIPS environments disable MD5 in OpenSSL → md5 unit/integration tests would throw at `createHash('md5')`; the driver does not pre-call md5 at connect (only on code 5), so SCRAM still works — note as an environment sensitivity (refs: node-postgres#3268).
- OAUTHBEARER (PG18) and GSSAPI are version/build gated and roadmap-only.
- SASLprep behavior depends on the JS engine's `String.normalize('NFKC')` (stable across Node/Bun), but server-side SASLprep is fuller (RFC 4013 prohibited chars) — flag passwords with prohibited/bidi chars as a possible divergence.

### Estimated test count
44


## Query Protocol — scope: implemented (with roadmap pending specs)

minipg is **extended-protocol only**: every `query()`/`stream()` serializes one task into the byte sequence `Parse('P') → Describe('S',name) → Bind('B') → Execute('E', maxRows=0) → Sync('S')` and writes it as one buffer (`connection.ts:205-229`). There is **no simple-query (`Q`) path**, no true pipelining (one query in flight; others sit in `this.queue` — `processQueue`/`startTask`), `Execute` always uses `maxRows=0` (fetch-all, so no `PortalSuspended`), `Describe` is always statement-level (`'S'`), and `Bind` always requests **text** result format for all columns (`protocol.ts:44`, `i16(1),i16(0)`). Backend messages are handled in `handle()` (`connection.ts:146-161`): `T`/`n`/`D`/`C`/`E`/`Z` are meaningful; `ParseComplete`/`BindComplete`/`CloseComplete`/`ParameterDescription`/`PortalSuspended`/`EmptyQueryResponse('I')`/`CopyData('d')`/`CopyResponse` all fall through `default` and are silently ignored. This section tests that lifecycle, its recovery after errors, and the documented consequences (multi-statement rejected, COPY hangs, binary results unsupported). It supersedes smoke.ts #4/#9/#11.

### Test groups

#### Extended-protocol message sequence & byte layout
- [P0][unit][impl] `W.parse('', 'select 1')` emits `'P'` + Int32 len + cstr(name) + cstr(sql) + Int16(0) param-type-oid count; assert exact bytes incl. single trailing NUL on each cstr and length = payload+4 (refs: node-postgres#64).
- [P0][unit][impl] `W.bind('', '', [], 0)` result-format section is `Int16(1)` then `Int16(0)` (one text code for all columns); assert exact layout per spec (Int16 count, then that many Int16 codes) (refs: node-postgres#3487, #2451).
- [P0][unit][impl] `W.bind` with one Buffer param encodes `Int16 paramFormatCount`, per-param format Int16, `Int16 valueCount`, then `Int32 len`+bytes; a NULL/`bytes==null` param encodes `Int32(-1)` with no value bytes — verify byte-exact.
- [P1][unit][impl] `W.describe('S','st')` = `'D'` + `'S'` + cstr(name); `W.execute('p',0)` = `'E'` + cstr(portal) + `Int32(0)`; `W.sync()` = `'S'` + `Int32(4)` empty payload — assert each.
- [P1][integration][impl] Capture bytes written for a single `query('select $1::int',[7])`: assert the on-wire order is exactly P,D,B,E,S in one socket write (one `socket.write` call), proving the documented single-round-trip unnamed-statement shape (refs: node-postgres#1573, #2326).
- [P1][integration][impl] Server reply order for that query is ParseComplete→ParameterDescription→RowDescription→BindComplete→DataRow…→CommandComplete→ReadyForQuery and resolves correctly despite the driver ignoring the *Complete acks (default case).

#### Empty, whitespace-only, and comment-only query strings
- [P0][integration][impl] `query('')` → server sends EmptyQueryResponse(`'I'`), driver ignores it, resolves `{rows:[], columns:[], rowCount:null, command:null}` (no `command` tag, no throw); connection still ready afterward.
- [P0][integration][impl] `query('   \n\t  ')` (whitespace only) behaves identically to empty query: resolves with `command:null, rowCount:null, rows:[]`.
- [P0][integration][impl] `query('-- just a comment')` and `query('/* block */')` (comment-only) resolve as empty query (`command:null`), not an error.
- [P1][integration][impl] `query('select 1;')` (single statement + trailing semicolon) succeeds, `command:'SELECT'`, returns the row — trailing `;` on a single command is legal under Parse.
- [P1][integration][impl] After an empty-query resolve, a subsequent normal `select 42` returns 42 (connection not desynced by the unhandled `'I'`).

#### NoData vs RowDescription (no-row-set vs row-returning statements)
- [P0][integration][impl] `select 1` → Describe('S') yields RowDescription(`'T'`), `t.fields` populated, `columns:['?column?']`, rows present.
- [P0][integration][impl] `create table tmp_x(id int)` (DDL) → Describe('S') yields NoData(`'n'`), `fields=[]`, `columns:[]`, `rowCount:null`, `command:'CREATE'`, resolves success (refs: node-postgres#1862, #1257).
- [P0][integration][impl] `insert into t(...) values(...)` (no RETURNING) → NoData; `rowCount` = inserted count, `command:'INSERT'`, `rows:[]`.
- [P0][integration][impl] `insert ... returning id` → RowDescription present, `rows` carries returned ids, `command:'INSERT'`, `rowCount` = affected.
- [P1][integration][impl] A query whose result set is empty but typed (`select 1 where false`) → RowDescription present (`columns:['?column?']`) but `rows:[]`, `rowCount:0` — distinguish "no rows" from "no row set" (NoData).
- [P1][integration][impl] `CHECKPOINT` / `SET search_path TO public` (utility, no result) → NoData, resolves success with `command` set, `rowCount:null`.

#### CommandComplete tag parsing (command name + rowCount)
- [P0][integration][impl] `select` over 3 rows → tag `SELECT 3` parsed to `command:'SELECT'`, `rowCount:3` (`firstCstr` + regex `/(\d+)\s*$/`).
- [P0][integration][impl] `INSERT 0 5` tag → `command:'INSERT'`, `rowCount:5` (last integer, not the oid `0`); `DELETE 2`→2, `UPDATE 4`→4.
- [P1][integration][impl] FOOTGUN-GUARD: multi-word command tag `CREATE TABLE` → minipg reports `command:'CREATE'` (only first token, `tag.split(' ')[0]`), `rowCount:null`. Document this truncation as current behavior (assert `'CREATE'`, not `'CREATE TABLE'`).
- [P1][integration][impl] `MERGE 3` (PG15+) → `command:'MERGE'`, `rowCount:3`; skip cleanly on PG14.
- [P2][integration][impl] A relation/string literal containing a trailing digit does not corrupt rowCount because the tag is parsed from the *CommandComplete* tag, not the SQL (`select 'abc9'` → `command:'SELECT'`, `rowCount:1`).

#### Multi-statement string behavior (extended-protocol consequence)
- [P0][integration][impl] `query('select 1; select 2')` (no params) → server rejects Parse with PgError SQLSTATE `42601` `cannot insert multiple commands into a prepared statement`; minipg surfaces it as PgError, does NOT silently run only the first (refs: node-postgres#33, #897, #911, #946, #1400, #1932, #3095, postgres.js#538, #1030).
- [P0][integration][impl] Same multi-statement string WITH a param (`select $1::int; select 2`) → identical `42601`; connection recovers and next query succeeds.
- [P1][integration][impl] DDL script `create table a(...); create table b(...)` via `query()` → `42601` (cannot batch DDL on extended path); document that the simple/unsafe path is the roadmap remedy (refs: postgres.js#47, #86, #472, node-postgres#2100).
- [P1][integration][impl] A single data-modifying CTE `with ins as (insert ... returning id) insert into child select id from ins` executes as ONE statement (no split), reports affected rows — confirm WITH is not mistaken for multi-statement (refs: node-postgres#1589, postgres.js#396).
- [P1][integration][impl] Multi-table `with a as (...), b as (...) select ...` returns correct rows (single statement) (refs: node-postgres#1557, #2339).
- [P2][integration][todo:feature] [todo:simple-query protocol] `select 1; select 2; select 3` on a future simple path executes all three and returns last/all results without error — PENDING spec (refs: node-postgres#83, #141, #1190, postgres.js#748).
- [P2][integration][todo:feature] [todo:simple-query protocol] `insert ...; select 1/0` on the simple path: divide-by-zero ErrorResponse rejects AND the earlier insert is rolled back (implicit transaction), row count after = 0 — PENDING (refs: node-postgres#1717, postgres.js#1090).
- [P2][integration][todo:feature] [todo:simple-query protocol] `CREATE INDEX CONCURRENTLY` as the only simple statement succeeds (driver must NOT auto-wrap in BEGIN/COMMIT, else `25001`) — PENDING (refs: postgres.js#198).

#### Parser framing & chunk-reassembly robustness
- [P0][unit][impl] `Parser.push` reassembles a message whose 5-byte header is split across two chunks (1 byte then 4 bytes) — no read until `>=5` bytes buffered (`protocol.ts:65`).
- [P0][unit][impl] A DataRow/RowDescription split mid-body across N chunks (e.g. byte-by-byte feed) yields exactly one complete message once `len+1` bytes available; no `RangeError`/out-of-range, no partial emit (refs: node-postgres#39, #2053, #191).
- [P0][unit][impl] Two full messages concatenated in one chunk emit two RawMessages in order; trailing partial of a third is retained in `this.buf` and not emitted until completed.
- [P1][unit][impl] `parseDataRow` decodes mixed cells: `len=-1` → `null`, `len=0` → empty Buffer, `len=N` → exact subarray; `parseRowDescription` reads name cstr + 18-byte fixed tail for each of `n` fields.
- [P1][unit][impl] An unknown/unexpected message type byte (e.g. `'X'`/garbage) is *not* thrown on — `handle()` default ignores it cleanly (no `Cannot read property 'name' of undefined` crash) (refs: node-postgres#1239, #1881, #3082).
- [P1][integration][impl] NoticeResponse(`'N'`) and ParameterStatus(`'S'`) arriving mid-query (e.g. from `SET` / a notice-raising function) are absorbed without desync or `Unrecognized message code` (refs: node-postgres#364).
- [P2][chaos][impl] Garbage/non-Postgres bytes during startup terminate with a catchable error and never enter an infinite C-string scan (`readCstrings`/`firstCstr` bounded by buffer length) (refs: node-postgres#1048, #2959).
- [P2][unit][impl] A zero-field RowDescription (`n=0`) and a zero-cell DataRow parse to `[]` without over-read.

#### Extended-path error recovery & lifecycle state
- [P0][integration][impl] `select * from does_not_exist` → PgError `42P01`; driver stores `t.error` on `'E'`, continues to `'Z'`/ReadyForQuery, then `finishTask` rejects; a subsequent `select 7` succeeds (connection returned to `ready`) (refs: node-postgres#2451, #2055; smoke #9).
- [P0][integration][impl] Runtime error mid-rows (`select 1 union all select 1/0`) → some DataRows may arrive then ErrorResponse; promise REJECTS (not partial-resolve), and `t.rows` accumulated are discarded; next query clean.
- [P1][integration][impl] Because the driver always emits Sync, after any ErrorResponse the connection is reusable WITHOUT a manual reset (no "unclean server" / portal-state error — safe under pgbouncer-style reuse).
- [P1][integration][impl] An error on a NAMED prepared statement does not poison its cache incorrectly: the failing parse (e.g. bad SQL under a new name) leaves `this.prepared` without a stale entry, and reusing a *different valid* name still works.
- [P2][chaos][impl] Socket close mid-query rejects the in-flight task AND all queued tasks with one error (`fatal()`), and state becomes `closed`; later `query()` rejects with `connection is closed` (refs lifecycle contract).

#### FIFO queueing (serialized "pipelining")
- [P0][integration][impl] Fire N=10 `query()` calls back-to-back without awaiting; each resolves with its own correct result in submission order (queue is FIFO, one in flight) (refs: node-postgres#611, #663, #2646, #3193, postgres.js#236; supersedes smoke #11 which only does 2).
- [P1][integration][impl] Interleave a failing query among queued ones (`select 1`, `bad sql`, `select 2`): the middle rejects with its own error, the others resolve correctly and in order — no cross-talk of results to wrong promise.
- [P1][integration][impl] A query enqueued while another is in flight is not written to the socket until the prior `ReadyForQuery` (assert no second `socket.write` before first `'Z'`).
- [P2][integration][todo:feature] True client-side pipelining (multiple Bind/Execute before a single Sync, batched round trip) is NOT supported — PENDING spec; document current per-query Sync (refs: node-postgres#2257, postgres.js#343).

#### Very large / boundary query text
- [P1][integration][impl] A ~1 MB valid SQL text (e.g. `select` of a long generated literal / large `VALUES` list) round-trips: Parse length prefix correct, result returned, no truncation.
- [P1][integration][impl] A query with thousands of parameters (e.g. `select array[$1,$2,...]` up to a few hundred) binds correctly; verify Bind `Int16` param-count is honored.
- [P2][perf][impl] Streaming `generate_series(1, 1_000_000)` with backpressure (HWM) completes without unbounded memory; early `break` cancels (`t.cancelled`, socket resume) and connection stays usable (extends smoke #8).
- [P2][unit][impl] Boundary: a single message whose payload pushes total length near Int32 — assert length math (`payload.length+4`) does not overflow for realistic large bodies.

#### NUL bytes & C-string fidelity (outbound)
- [P0][unit][impl] `W.parse(name, 'select \0 1')` throws `query text contains NUL byte (0x00)` (guardNul) BEFORE any socket write; `startTask` catches and rejects, connection stays usable (refs: node-postgres#1115, #1758; smoke #10 covers param-side).
- [P0][integration][impl] A NUL in a string param is rejected client-side via `encodeParam`/serialize throw (rejected in `startTask` try) — no `invalid message format` from server; queue advances (`processQueue` in microtask).
- [P1][unit][impl] Statement/portal name and param text are each emitted with exactly one trailing NUL and correct length prefix (no double-NUL, no missing terminator) so the server never returns `invalid string in message` (refs: node-postgres#64).

#### Query-text fidelity (no mangling) — driver passes SQL byte-for-byte
- [P1][integration][impl] `select * from "user"` returns rows of the table literally named `user` (quoted identifier preserved), not `current_user` output (refs: node-postgres#28).
- [P1][integration][impl] Schema-qualified `myschema.mytable` and `insert into myschema.mytable ...` reach the server unchanged (prefix not dropped) (refs: node-postgres#1732, postgres.js#190).
- [P1][integration][impl] Case-sensitive quoted `"DOCUMENT".tbl` resolves exact-case (not folded/unquoted) (refs: node-postgres#1897).
- [P2][integration][impl] A non-breaking space (U+00A0) inside SQL is sent as-is and produces the server's syntax error for those literal bytes — driver does NOT normalize whitespace (refs: node-postgres#1960).
- [P2][integration][impl] `::date` cast and operator expressions (`~` regex / `E'\\d'` escape) parse identically to psql and return the same row count — extended path does not alter cast/operator/escape resolution (refs: node-postgres#444, #1646, #1562).
- [P2][integration][impl] `set request.jwt.claims to $1` (SET cannot bind params) → syntax error at `$1`; document `set_config($1,...)`/inline as the workaround (refs: postgres.js#640).

#### Out-of-scope guards (assert absent / fail cleanly)
- [P1][integration][impl] psql backslash meta-command `\d` / `\l` sent as a query rejects with SQLSTATE `42601` (`syntax error at or near "\"`) — minipg surfaces it, does not hang (refs: node-postgres#898, #1985, #3209).
- [P1][integration][impl] GUARD: there is no simple-query API surface (`query` always parameterizable/prepared); confirm a multi-statement cannot be smuggled in (covered by 42601 above) — assert no `simple()`/`simpleQuery` export.
- [P1][integration][impl] GUARD: `client.query()` returns a Promise, NOT an event-emitter (`.on('row'|'end'|'error')` is undefined) — document the deliberate API difference from node-postgres' submittable (refs: node-postgres#1372, #1377).
- [P2][chaos][impl] GUARD: `COPY t TO STDOUT` / `COPY t FROM STDIN` via `query()` is unsupported — CopyResponse (`'G'`/`'H'`/`'W'`) and CopyData(`'d'`) fall through `default` and are ignored; document that COPY FROM STDIN HANGS (no CopyData sent, no timeout) as a known footgun, COPY TO returns empty/garbage rows. (Mark blocked-on roadmap timeout/cancel for clean failure.)
- [P2][integration][impl] GUARD: `LISTEN x` + server NotificationResponse(`'A'`) is silently ignored (no LISTEN/NOTIFY support); `LISTEN` itself executes (utility) but notifications never surface.

#### Roadmap pending specs (extended-protocol features not yet built)
- [P1][integration][todo:feature] [todo:binary-result-format] With binary result mode requested, Bind result-format codes are `1` and values decode via binary parsers (int4/timestamp) to the same JS values as text mode — PENDING; today `bind` hardcodes text `i16(0)` (refs: node-postgres#3317, #3487).
- [P1][integration][todo:feature] [todo:timeout/cancel] Per-query timeout + AbortSignal + out-of-band CancelRequest (using `backendKey`) cancels a long `select pg_sleep(...)` and rejects with a timeout/abort error, leaving connection usable — PENDING.
- [P2][integration][todo:feature] [todo:portal-fetch] `Execute` with `maxRows>0` + PortalSuspended handling (server-side fetch in chunks) — PENDING; today `maxRows=0` always (no PortalSuspended path; `'PortalSuspended'` ignored).
- [P2][integration][todo:feature] [todo:describe-portal] Portal-level Describe / cursor support — PENDING (driver only Describe('S')).

### Fixtures & data needed
- Reuse smoke `t` table (id int, name text, n8 int8, amount numeric, ok bool, data jsonb, blob bytea, 3 rows incl. a NULL row).
- A `"user"` table and a `"DOCUMENT"` schema + `"DOCUMENT".tbl`, plus `myschema.mytable`, to test quoted/qualified identifier fidelity.
- A child/parent table pair for data-modifying CTE (`ins`→child) tests.
- A volatile function or `SET client_min_messages` to trigger NoticeResponse mid-query for parser-absorption tests.
- A mock/in-memory socket (or byte-capture wrapper around `socket.write`) for unit-level byte-layout and `Parser.push` chunk-splitting tests (no server needed).
- Roles already present: `md5user`, `scramuser` (auth, not exercised here).

### PG-version / config sensitivities
- CommandComplete tag wording is stable across PG14-17, but `MERGE n` requires PG15+ (skip on 14). Row-returning vs NoData distinction is version-stable.
- `42601` text `cannot insert multiple commands into a prepared statement` is stable PG14-17.
- `standard_conforming_strings` affects `E''`/backslash-escape fidelity tests (#1562); pin to default `on`.
- `DateStyle`/`bytea_output`/`client_encoding` do not affect protocol framing but DO affect text-decoded values; these belong to the type-decoding domain — keep protocol assertions on `command`/`rowCount`/`columns`/framing, not decoded scalar formatting.
- EmptyQueryResponse(`'I'`) behavior for empty/whitespace/comment-only strings is identical PG14-17.
- `CREATE INDEX CONCURRENTLY` / implicit-transaction rollback tests are only meaningful once the simple-query path exists (roadmap) — keep PENDING.

### Estimated test count
58


## Parameters & Binding — scope: implemented (with roadmap/guard sub-cases)

How JS values bind to `$1..$N` placeholders in the extended protocol. minipg does **zero** client-side SQL parsing: the SQL text is sent verbatim to `Parse` (`guardNul` is the only inspection), `Parse` declares **0 param-type OIDs** so the *server* infers every type, and `Bind` ships params in order. Encoding lives entirely in `codec.ts#encodeParam`: `null`/`undefined`→SQL NULL, `Buffer`→binary param (format 1), `Date`→ISO-8601 UTC text, `boolean`→`t`/`f`, **any other `object` (incl. Array/Set/Map/Promise)→`JSON.stringify`**, everything else→`String(v)` with a NUL-byte guard. Consequences worth pinning: a JS array becomes a JSON string (`[1,2,3]`), **not** a PG array literal (`{1,2,3}`), so the `= ANY($1)` idiom does NOT work from a JS array; param-count mismatch is caught by the *server* (not client); and `>32767` params throw a raw `writeInt16BE` RangeError rather than a clear "too many parameters" message (`protocol.ts` `i16(params.length)`).

### Test groups

#### Positional placeholders & verbatim transmission (baseline)
- [P0][integration][impl] `query('select $1::int, $2::text', [7,'x'])` returns `[7,'x']`; placeholders map positionally. (refs: node-postgres#3132)
- [P0][integration][impl] Reusing one placeholder `select $1::int + $1::int` with `[5]` binds the single value to every occurrence and returns `10`; only DISTINCT placeholders count as params. (refs: node-postgres#1264, node-postgres#3132)
- [P1][integration][impl] Multi-digit indices `select $10,$11,...,$1` with 11 params bind to the correct positions (greedy parse is server-side; minipg passes verbatim), no `$1`+`0` misparse. (refs: node-postgres#3226)
- [P1][integration][impl] `select $1::text` with `'$2 not a placeholder'` stores the literal string verbatim; the embedded `$2` is data, never a second placeholder; no count mismatch. (refs: node-postgres#503, node-postgres#2192)
- [P1][integration][impl] `?` is NOT rewritten: `select 1 where 1=?` with `[1]` reaches the server verbatim and yields a `42601` syntax error (no silent `?`→`$`). (refs: node-postgres#1100, node-postgres#1720, node-postgres#2176)
- [P2][integration][impl] Empty param list: `query('select 1', [])` and `query('select 1')` (params omitted) both succeed and return `1`.
- [P2][unit][impl] `encodeParam` is order-preserving and 1:1 with input array length (no reordering/dedup of repeated values).

#### NULL and undefined binding
- [P0][unit][impl] `encodeParam(null)` and `encodeParam(undefined)` both return `{format:0, bytes:null}` (the `v == null` branch) — deterministic SQL NULL, never a throw on `.toString`. (refs: node-postgres#55, node-postgres#797, node-postgres#779)
- [P0][integration][impl] `insert ... values ($1)` with `null` into an `integer`/`uuid`/`text` column stores SQL NULL with no "invalid input syntax for integer/uuid". (refs: node-postgres#779, node-postgres#1649, node-postgres#1821)
- [P0][integration][impl] `undefined` param into a nullable column stores SQL NULL (minipg's fixed policy = NULL), round-trips back as `null`; document there is NO `transform.undefined`/`UNDEFINED_VALUE` throw. (refs: node-postgres#55, postgres.js#630)
- [P1][integration][impl] `select $1::int is null` with `[null]` returns `true` (explicit cast resolves the type; bare `select $1 is null` with `null` instead yields `42P18 could not determine data type`). (refs: postgres.js#153, postgres.js#134, node-postgres#1775)
- [P2][integration][impl] A `null` element inside an array/object param is preserved through `JSON.stringify` (`[1,null,2]` → jsonb with SQL `null`), distinct from a top-level `null` param→SQL NULL.

#### Number / bigint / boolean / string scalar encoding
- [P0][integration][impl] JS number `123` against an `integer` column binds as integer (no `"123.456"`/`invalid input syntax`); `select $1::int` with `123` returns `123`. (refs: node-postgres#996, node-postgres#1581, node-postgres#3165)
- [P1][integration][impl] Float `1.5` → `select $1::float8` returns `1.5`; integer-valued float `8.0` stringifies to `"8"` and casts to int cleanly (guard the version-string footgun). (refs: node-postgres#2674, node-postgres#2626)
- [P0][unit+integration][impl] `bigint` `9007199254740993n` → `encodeParam` String path → text `"9007199254740993"`; `select $1::int8` round-trips with NO precision loss and NO "Do not know how to serialize a BigInt". (refs: node-postgres#2395, postgres.js#125)
- [P1][unit+integration][impl] `boolean` true/false → `t`/`f`; `select $1::bool` returns `true`/`false`; with explicit cast no "could not determine data type". (refs: node-postgres#167)
- [P1][integration][impl] String with quotes/apostrophes/backslash/regex `'\s\w+$'`/commas stored verbatim, no added escaping, no injection/syntax error (sent as a Bind value, never interpolated). (refs: node-postgres#841, node-postgres#1020, postgres.js#169)
- [P0][integration][impl] Full string is transmitted — first char not stripped, whole value stored and compared equal. (refs: node-postgres#2357, node-postgres#2962)
- [P2][integration][impl] Numeric `LIMIT $1` with `50` (number) binds correctly and limits rows; positive baseline distinct from the `'ALL'` footgun. (refs: postgres.js#1002, postgres.js#560)
- [P2][integration][impl] `bigint` `0n` and negative bigint serialize correctly (boundary around String(0n)='0').

#### Date / Buffer (binary) encoding
- [P1][unit+integration][impl] `Date` → `encodeParam` text `format:0` = `toISOString()` (UTC); `select $1::timestamptz` round-trips to the same instant; document the UTC/ISO normalization. (refs: node-postgres#1740, node-postgres#786)
- [P0][unit+integration][impl] `Buffer` → `encodeParam` `{format:1, bytes:<buf>}` (binary param); `insert`/`select $1::bytea` round-trips exact bytes incl. high bytes. (refs: node-postgres#786)
- [P1][integration][impl] A Buffer param CONTAINING `0x00` bytes is accepted (binary path skips the NUL guard) and stored in `bytea` byte-exact — NUL rejection applies to text params only.
- [P2][integration][impl] `prepareValue`-style determinism: same `Date`/`Buffer` encodes identically across two calls (no mutation of the input Buffer). (refs: node-postgres#1740)

#### Object / JSON & the JS-array footgun
- [P0][unit+integration][impl] Plain object `{a:1}` → `JSON.stringify` text; `select $1::jsonb` parses back to `{a:1}`. (refs: node-postgres#145, node-postgres#450)
- [P1][unit][impl] Custom `toJSON()` is honored exactly once (no double-escaping) — object with `toJSON(){return {x:1}}` → `{"x":1}`. (refs: node-postgres#145, node-postgres#450)
- [P0][integration][impl] **Footgun guard:** a JS array `[1,2,3]` → `JSON.stringify` = `[1,2,3]` (JSON), NOT a PG array literal `{1,2,3}`; therefore `select $1::int[]` / `= ANY($1)` with the JS array FAILS with `invalid input syntax for ... array`; the working path is `select $1::jsonb` OR passing the literal STRING `'{1,2,3}'`. Pin both branches. (refs: node-postgres#82, node-postgres#1008, node-postgres#1653, node-postgres#2242)
- [P1][integration][impl] Passing the string `'{1,2,3}'` to `select $1::int[]` / `= ANY($1)` returns a real `int[]` and matches every element — the documented minipg idiom for arrays. (refs: node-postgres#220, node-postgres#894)
- [P1][integration][impl] JS array bound to a `jsonb` column is stored as a JSON array (correct), distinct from a PG array column. (refs: node-postgres#1519, postgres.js#1055)
- [P2][unit][impl] **Footgun guard:** a `Set`/`Map` param → `JSON.stringify` = `{}` (NOT its members); assert current silent `{}` behavior so a future fix is intentional. (refs: node-postgres#2912)
- [P1][unit][impl] **Footgun guard:** a `Promise` param → `JSON.stringify` = `{}` (silently bound blank, NOT thrown); assert current behavior. [also tag todo:feature below]. (refs: node-postgres#2304)
- [P2][integration][impl] A JS array containing a `Buffer`/`bigint`/`Date` member is JSON.stringified (Buffer→`{type:'Buffer',data:[...]}`, bigint→throws inside JSON.stringify) — pin that a bigint nested in an object param throws cleanly and the connection stays usable for the next query. (refs: node-postgres#1854)

#### Parameter count, mismatch, limit & indexing
- [P0][integration][impl] Too FEW params: `select $1,$2` with `[1]` → server `08P01` "bind message supplies 1 parameters but ... requires 2", surfaced as `PgError`; connection recovers (next query works). (refs: node-postgres#1307, node-postgres#1747)
- [P0][integration][impl] Too MANY params: `select $1` with `[1,2]` → server error "supplies 2 ... requires 1" as `PgError`; minipg does NOT silently drop extras. (refs: node-postgres#2123, node-postgres#3232)
- [P1][integration][impl] `$1` inside a single-quoted literal `select '$1'` with `[1]` → "supplies 1 parameter but ... requires 0" (server sees 0 placeholders). (refs: node-postgres#503, node-postgres#578, node-postgres#1693)
- [P1][integration][impl] LIKE: `'%$1%'` with a value errors (count mismatch), while `'%'||$1||'%'` (or `$1` bound to `'%smith%'`) matches — pin correct vs wrong form. (refs: node-postgres#14, node-postgres#503, node-postgres#1144)
- [P1][integration][impl] Exactly N placeholders + N-element array sends exactly N bind params, no "supplies X but requires Y". (refs: node-postgres#1747, node-postgres#3232)
- [P0][unit][impl] **Limit footgun:** 32768 params currently throw a raw `RangeError` from `i16(params.length)` (`writeInt16BE`), caught in `startTask` and rejected; assert it rejects (never sends a corrupted/truncated 16-bit Bind) and the connection survives. (refs: node-postgres#581, node-postgres#1091, postgres.js#64)
- [P1][perf][impl] 32767 params (max writable) in one `Bind` execute correctly (boundary just below the i16 throw).
- [P2][unit][impl] `params` defaults to `[]` when omitted; passing a non-array (e.g. a string) — document current behavior: `t.params.map` throws `TypeError` caught in `startTask`→reject (not a wedged queue). (refs: node-postgres#1043, node-postgres#1335)

#### Type inference by server & explicit casts
- [P0][integration][impl] Because `Parse` sends 0 type OIDs, `select $1` with no cast in an uninferable context (`$1 is null`, `array_cat($1,$1)`, polymorphic) → `42P18 could not determine data type`; adding `$1::type` succeeds. (refs: node-postgres#578, node-postgres#1569, node-postgres#1775, postgres.js#36)
- [P1][integration][impl] Cast must FOLLOW the placeholder: `now() + $1::interval` works; `INTERVAL $1` / `timestamp $1` → `42601` syntax error. (refs: node-postgres#1593, node-postgres#2536, postgres.js#247, postgres.js#433)
- [P1][integration][impl] `DATE $1` / `TIMESTAMP $1` typed-literal grammar is ALWAYS a `42601` syntax error (only `$1::date` works); assert the cast-required path, not "binds as typed literal". (refs: postgres.js#281, postgres.js#998)
- [P1][integration][impl] Param in `INSERT ... VALUES ($1)` against a typed column infers that column's type (e.g. `smallint`), no "operator does not exist: integer = text". (refs: node-postgres#2130, node-postgres#2159, postgres.js#539)
- [P2][integration][impl] `to_tsquery('english', $1)` binds the value as a real param (outside the literal) and runs; `to_tsquery('$1')` does not bind. (refs: node-postgres#212, node-postgres#1885)
- [P2][integration][impl] Re-execute the SAME parameterized SQL with different values multiple times, each binding correctly (extended-protocol re-bind). (refs: node-postgres#2956)

#### NUL-byte rejection (client-side, before the wire)
- [P0][unit][impl] `encodeParam('a b')` throws `/NUL/` (String path guard in `codec.ts`). (refs: smoke#10)
- [P0][integration][impl] `query('select $1::text', ['a b'])` rejects client-side with the NUL message; nothing written to the socket; connection still usable afterwards.
- [P1][unit][impl] SQL text with a NUL: `query('select 1 ')` rejects via `guardNul(sql,'query text')` in `W.parse` before any wire write. (refs: protocol.ts#33)
- [P2][unit][impl] **Coverage gap guard:** a NUL inside a STRING value of an OBJECT param is JSON-escaped to ` ` (6 chars, no real 0x00 byte) and is NOT rejected — pin that the object/JSON path bypasses the primitive guard yet remains wire-safe.

#### Identifiers / keywords / disallowed contexts are NOT parameterizable (guard)
- [P1][integration][impl] `order by $1` with a column-name string is a constant → rows NOT reordered (or `non-integer constant in ORDER BY`); pin that identifier substitution does NOT happen. (refs: node-postgres#300, node-postgres#1284, postgres.js#251)
- [P1][integration][impl] `LIMIT $1` with `'ALL'` → error (`$1` is bigint); `IS $1` → `42601` syntax error (keywords/predicates not bindable). (refs: node-postgres#844, node-postgres#1032, node-postgres#1751)
- [P1][integration][impl] Table/column identifier as param (`CREATE TABLE $1`, `select * from $1`) → server syntax error, never identifier injection. (refs: node-postgres#1276, node-postgres#1632, node-postgres#2247)
- [P2][integration][impl] `SET search_path TO $1` → syntax error; `set_config($1,$2,false)` (real params) works — pin the workaround. (refs: node-postgres#1194, node-postgres#1648)
- [P2][integration][impl] Anonymous `DO $$ ... $$` block given a param → "supplies 1 parameters but ... requires 0". (refs: node-postgres#1221, postgres.js#263)
- [P2][integration][impl] Multi-statement string with params → "cannot insert multiple commands into a prepared statement"; the single statement binds fine. (refs: node-postgres#1396)

#### Caller-data integrity & bulk binding
- [P1][unit][impl] `query` does not mutate the caller's params array (numbers not stringified in place); original array deep-equals after the call (`t.params.map(encodeParam)` creates a new array). (refs: node-postgres#750, node-postgres#799)
- [P1][integration][impl] Multi-row INSERT with flattened `$1..$n` from an array of tuples inserts all rows correctly. (refs: node-postgres#530, node-postgres#957, node-postgres#3087)
- [P2][integration][impl] `INSERT ... SELECT $1 WHERE NOT EXISTS (...)` binds and executes (not parsed as a row constructor). (refs: node-postgres#375, node-postgres#2909)
- [P2][chaos][impl] If `encodeParam` throws mid-serialization (e.g. NUL or nested bigint-in-JSON), `this.current` is never set, queue is not wedged, and the NEXT queued query runs to completion. (refs: node-postgres#3573)

#### Roadmap / out-of-scope (pending specs)
- [P1][unit][todo:feature] Clear client-side "too many bind parameters (max 65535)" guard BEFORE the `i16` RangeError — currently absent; mark pending. (refs: node-postgres#581, postgres.js#64)
- [P2][unit][todo:feature] Throw on a `Promise`/thenable param instead of silently binding `{}`. (refs: node-postgres#2304)
- [P2][integration][todo:feature] Explicit per-query param type-OID hints (`query.types`) — `Parse` currently always sends 0 OIDs (server-infer only). (refs: node-postgres#312, node-postgres#373, node-postgres#145)
- [P2][integration][todo:feature] Built-in JS-array → PG-array-literal encoding so `= ANY($1)` works from a JS array without manual `'{...}'`. (refs: node-postgres#82, node-postgres#2242)
- [P2][unit][out-of-scope-guard] No `sql\`\`` template tag / `sql()` helper exists — assert the public API offers only positional `$N` (importing/expecting a tag fails); do NOT port postgres.js `sql()` cases.

### Fixtures & data needed
- Table `params_t (id serial pk, i int, big int8, flt float8, ok bool, txt text, ts timestamptz, blob bytea, j jsonb, arr int[], u uuid)`.
- A nullable-everything table for NULL/undefined round-trips.
- `to_tsvector`/`to_tsquery` available (core), `set_config`, `generate_series`.
- Helper to build a 32767- and 32768-element param array (the i16 boundary).
- Reuse smoke.ts connect config (`127.0.0.1:54329`, db `testdb`).

### PG-version / config sensitivities
- `DateStyle` / timezone: `Date`→ISO-UTC round-trip via `timestamptz` is stable; plain `timestamp`/`date` columns return text whose format depends on `DateStyle` — assert against `timestamptz` or normalize.
- `bytea_output` (`hex` default on PG≥9): `asBytea` only handles `\x` hex + raw fallback; an `escape` setting would change decode — pin `hex`.
- `standard_conforming_strings`: irrelevant to bound values (no client interpolation) but matters for the in-literal `$1` guard tests using backslashes.
- `42P18`/`08P01` wording is stable PG14–17; assert on SQLSTATE (`code`), not message text.
- Array literal acceptance (`'{1,2,3}'::int[]`) is version-stable; the JS-array→JSON footgun is minipg-specific, not version-dependent.

### Estimated test count
58


## Prepared Statements — scope: partial(roadmap)

The extended-query path is the only path minipg has: every `query()`/`stream()` goes through Parse/Describe/Bind/Execute/Sync (`startTask`, connection.ts:205-229). Naming is opt-in via `opts.name`. With a name, the connection keeps a per-connection `prepared` Map<name,{sql,fields}> that is populated only when RowDescription (`T`) or NoData (`n`) arrives (connection.ts:152-153), so a statement is effectively "cached" only after a successful Parse+Describe. On reuse with the SAME name+SQL the driver skips Parse/Describe and sends only Bind/Execute (cached `fields` reused; connection.ts:216). On the SAME name + DIFFERENT SQL it does NOT raise a client error — it silently sends `Close('S',name)`, drops the cache entry, and re-Parses (connection.ts:217). Without a name every call uses the UNNAMED statement (empty name) and re-Parses each time (connection.ts:219), so nothing accumulates server-side. Parse always declares 0 param-type OIDs (protocol.ts:34) so the server infers all parameter types; Bind always requests text result format (protocol.ts:44). There is NO describe-only API, NO prepare-without-execute, NO DEALLOCATE/close API, NO `prepare:false`/simple-protocol switch, and NO cache invalidation on DDL/rollback/deallocate — those are roadmap or footguns to guard.

### Test groups

#### Named: parse-once, bind-many, cached RowDescription
- [P0][integration][impl] Run the same named parameterized SELECT (`name:'by_id'`, `where id=$1`) N=5 times with different params on one connection; assert each call returns the per-call-correct row (not the first call's rows) AND `pg_prepared_statements` shows exactly one entry for that name with `from_sql=false`. (refs: node-postgres#207, node-postgres#863, node-postgres#1074, node-postgres#3295, postgres.js#478)
- [P0][integration][impl] After the first named call, a second call with the same name+SQL must produce NO RowDescription on the wire (driver reuses cached `fields`): assert `r.columns` on the reuse call equals the first call's columns and is correct even though no Describe was sent. (refs: node-postgres#1074)
- [P1][integration][impl] Named statement whose Describe yields NoData (e.g. `INSERT INTO t(...) VALUES($1,$2)` no RETURNING): cache stores `fields:[]`; reuse path Binds/Executes and `rowCount` reflects each insert; `columns` is `[]`. (refs: node-postgres#415)
- [P1][unit][impl] Inspect `connection.prepared` (or via behavior) that a named entry is created ONLY after RowDescription/NoData, i.e. after a successful Parse — not optimistically at send time. (refs: node-postgres#665)
- [P2][integration][impl] Named SELECT returning zero rows (`where id=$1` with non-matching param) still caches and reuses correctly; `rows:[]`, `rowCount:0`, `command:'SELECT'`.

#### Same name + different SQL → Close + re-Parse (no client error)
- [P0][integration][impl] Reissue name `'q'` first with `select 1 a` then with `select 2 b`: assert the second call returns column `b`/value 2 (re-prepared), NOT the cached first text. Document that minipg's behavior is silent Close+re-Parse, NOT the "must be unique" client error some drivers raise. (refs: node-postgres#1813, node-postgres#345)
- [P1][integration][impl] After a name is re-pointed to new SQL, `pg_prepared_statements` still shows exactly one entry for that name and its current text matches the NEW SQL (old plan was Closed, not leaked). (refs: postgres.js#303)
- [P1][integration][impl] Re-point a name that previously had RowDescription columns to SQL with a different column set; assert `columns` updates to the new set (stale cached `fields` not reused). (refs: node-postgres#815, postgres.js#303)
- [P2][integration][impl] Re-point a name from a SELECT (had fields) to an INSERT (NoData): cached `fields` correctly replaced by `[]`, no leftover columns.

#### Unnamed statement (default path)
- [P0][integration][impl] Repeated parameterized queries with NO `name` run 50x; assert `pg_prepared_statements` stays EMPTY (empty statement name is never registered) — no accumulation / leak. (refs: node-postgres#1772, postgres.js#997)
- [P1][integration][impl] Unnamed param query uses extended protocol (binds `$1`), NOT server-side `PREPARE`/`EXECUTE`/`DEALLOCATE`; assert correct result and that consecutive different unnamed SQLs each work without cross-contamination. (refs: node-postgres#1772)
- [P2][integration][impl] Two different unnamed param queries with DIFFERENT param counts run back-to-back on one connection each Parse independently; statement-2 binds statement-2's count (no carried-over count). (refs: postgres.js#303)

#### Many distinct names & distinct texts, no cross-contamination
- [P1][integration][impl] Prepare 100 distinct names on one connection, then re-execute all in shuffled order; each returns its own correct result and `pg_prepared_statements` shows 100 entries. (refs: node-postgres#2940)
- [P1][integration][impl] Two named texts selecting different columns (`name1` → `select a from t`, `name2` → `select b from t`) interleaved; `name2` never reuses `name1`'s cached plan/columns. (refs: node-postgres#815, postgres.js#303)

#### Parameter count, binding & server-side type inference
- [P0][integration][impl] Named `insert into t(x) values($1)` with one bound value succeeds; never errors `bind message supplies 1 parameters, but ... requires 0` (Parse declares 0 OIDs → server infers, count comes from SQL). (refs: node-postgres#415, node-postgres#784, node-postgres#903)
- [P1][integration][impl] CTE `with v(a,b) as (values($1,$2)) select * from v` registers param count 2 and binds both. (refs: node-postgres#1630)
- [P1][integration][impl] `select * from t where id = any($1)` with an `int[]`/`text[]` argument: minipg encodes array param as JSON-stringified text (codec `encodeParam`); assert it binds and returns matching rows — and if PG rejects the JSON-array text for `int[]`, capture the exact failure as a known limitation (array params not natively encoded). (refs: postgres.js#806, postgres.js#221)
- [P1][integration][impl] `select $1::int, $2::text` named: server infers/resolves via cast; values decoded correctly (int4→number, text→string). (refs: postgres.js#221)
- [P2][integration][impl] NULL param: `select $1::int` with `[null]` → param sent as -1 length, result row cell is `null`.
- [P2][integration][impl] Two long named queries with differing param counts sequential on one conn don't cross-contaminate counts. (refs: postgres.js#303)

#### Error during prepare / cache poisoning guards
- [P0][integration][impl] Named query with a syntactically invalid SQL → PgError (42601); the name is NOT left in the cache (no T/n arrived), connection returns to ready, and a subsequent VALID query under the SAME name Parses fresh and succeeds. (refs: node-postgres#665)
- [P1][integration][impl] Named statement that Parses+Describes fine but errors at Execute (e.g. unique-constraint violation 23505): cache entry persists (was set on NoData), connection recovers, and the next reuse of that name with valid params Binds/Executes without re-Parse. 
- [P1][integration][impl] Empty / whitespace-only SQL text: Parse succeeds server-side and yields EmptyQueryResponse (rowCount 0) — assert the call resolves promptly and the connection does NOT hang; phrase as client-recovery, not a server error. (refs: node-postgres#822)
- [P2][integration][impl] NUL byte (0x00) in SQL text is rejected client-side before any wire write (protocol.ts `guardNul`), rejecting the promise without wedging the queue (subsequent query still works). 

#### Cache-invalidation footguns (current behavior + roadmap)
- [P0][integration][impl] Footgun: prepare name `'s'` (SELECT *), then `ALTER TABLE t ADD COLUMN`/drop a selected column, then reuse `'s'` → server raises `cached plan must not change result type` (0A000) as a PgError; assert it surfaces cleanly and the connection recovers (driver does NOT transparently re-Parse today). (refs: postgres.js#120)
- [P1][integration][impl] Footgun: prepare name `'d'`, run `DEALLOCATE d` (or `DISCARD ALL`) via a raw query on the SAME connection, then reuse `'d'` → server raises `prepared statement "d" does not exist` (26000); driver does not invalidate its cache. Assert error surfaces and connection recovers. (refs: node-postgres#1889)
- [P1][integration][impl] Footgun: server-side `PREPARE foo as select 1` via raw query, then a driver named query `name:'foo'` (different/any text) → driver sends Parse for `foo` → `prepared statement "foo" already exists` (42P05). Assert deterministic error + recovery. 
- [P2][integration][impl] Inside `BEGIN; <server-side PREPARE p ...>; ROLLBACK;` then reuse name `p` via driver: protocol-Parse'd statements survive transaction boundaries but SQL-level `PREPARE` is rolled back; assert driver behavior is the corresponding server error, documenting that minipg keeps no belief tied to transaction state. (refs: node-postgres#600)
- [P1][todo:feature] Transparent re-Parse on `cached plan must not change result type` (0A000): driver should detect, drop cache entry, re-Parse and retry once. PENDING. (refs: postgres.js#120)
- [P1][todo:feature] Transparent re-Parse on `prepared statement ... does not exist` (26000): driver should re-prepare instead of failing. PENDING. (refs: node-postgres#1889)
- [P2][integration][impl] Parameterized `insert into t select ... union all select ...` named, executed twice, does not raise `relation with OID ... does not exist`; baseline that minipg carries no stale relation/type cache of its own. (refs: node-postgres#1579)

#### Pool: per-connection statement isolation
- [P0][integration][impl] Each `Connection` owns its own `prepared` Map: prepare name `'p'` on a checked-out client A, release; check out client B (forced distinct via `max:2` and holding A), run name `'p'` on B → B Parses fresh in its own session (its `pg_prepared_statements` had no `p`), no `does not exist`/`already exists`. (refs: node-postgres#139)
- [P1][integration][impl] `pool.query(sql, params, {name:'p'})` issued 10x: lands on various pooled connections, each correct; no global name collision because names are per physical connection and the client cache matches that connection's server session. (refs: postgres.js#40, postgres.js#547, node-postgres#1255)
- [P1][integration][impl] After releasing a connection that prepared `'p'` and reacquiring the SAME connection (single-conn pool), the cached `'p'` is reused (Bind/Execute only) — releasing does not clear per-connection cache; assert correct reuse. (refs: node-postgres#139)
- [P2][chaos][impl] Run named queries in parallel across a `max:4` pool under load; assert no `prepared statement "X" already exists` and all results correct (guards the transaction-pooler collision class, which minipg avoids by per-connection naming). (refs: postgres.js#960, postgres.js#76, node-postgres#1255)

#### Roadmap / not-yet-implemented (pending specs)
- [P1][todo:feature] `describe(sql, {name?})` API: Parse + Describe only, returning ParameterDescription OIDs and RowDescription columns WITHOUT Execute. Currently absent (startTask always appends Bind+Execute+Sync). PENDING. (refs: node-postgres#1236, node-postgres#1903, postgres.js#221)
- [P1][todo:feature] `describe()` on a mutating INSERT must NOT execute it — assert zero rows written and exactly one Describe round-trip. PENDING (no describe-only path exists; today a named INSERT always Executes). (refs: postgres.js#424, postgres.js#275)
- [P1][todo:feature] Prepare-without-values then execute later: a `prepare(name, sql)` that issues Parse only and an `execute(name, values)` that Binds later. Currently impossible (Bind always sent with Parse). PENDING. (refs: node-postgres#24, node-postgres#903, postgres.js#122)
- [P1][todo:feature] Explicit `deallocate(name)`/close API that sends `Close('S',name)` AND clears the client cache so the name re-prepares cleanly. Today `Close` is only emitted internally on same-name/different-SQL. PENDING. (refs: node-postgres#1889)
- [P1][todo:feature] `prepare:false` / simple-protocol switch forcing the simple query path (single message, values inlined) for pooler compatibility; assert no named entries in `pg_prepared_statements`. minipg has no simple protocol today (all extended). PENDING. (refs: node-postgres#1933, postgres.js#41, postgres.js#76, node-postgres#2266)
- [P2][todo:feature] Binary RESULT format option per query (Bind result format 1); today protocol.ts hardcodes text format 0. PENDING. (refs: roadmap binary RESULT format)
- [P2][todo:feature] Type inference resolved via ParameterDescription for ambiguous params (e.g. uncast `$1`); today driver relies purely on server inference from SQL/casts and surfaces `could not determine data type of parameter $1` (42P18). Assert current behavior is the clean server error; auto-cast/inference is PENDING. (refs: postgres.js#1102, node-postgres#2287)

#### Out-of-scope / spec-correctness guards
- [P2][integration][impl] Parameters in a `DO $$...$$` anonymous block: assert minipg surfaces the server's rejection (PG disallows params there) deterministically rather than mis-binding; connection recovers. (refs: node-postgres#812)
- [P2][integration][impl] Parameterized `CREATE VIEW v AS SELECT $1::int`: per verified PG14 behavior, ParameterDescription count is 0 and Bind of one value fails with `bind message supplies 1 parameters, but ... requires 0` (08P01); assert minipg surfaces this deterministic error (params not allowed in DDL — same class as DO block), NOT silent success. (refs: postgres.js#1102, corrected in cluster notes)
- [P2][integration][impl] `set transaction isolation level serializable` as first statement of a `BEGIN` via named/unnamed query succeeds — minipg injects no prior prepare/describe round-trip on a separate connection state that would void "before any query" (it does Parse+Describe+Bind+Execute in one Sync on the same conn). (refs: postgres.js#164)
- [P2][integration][impl] Guard: reusing a named prepared statement repeatedly inside one transaction does not raise `cursor "X" already exists` — minipg always uses the UNNAMED portal (`Bind('', name, ...)`, connection.ts:220), so no portal/cursor name collision. (refs: node-postgres#36)
- [P1][unit][impl] Param/SQL encoding throws (NUL guard) BEFORE `this.current` is committed: assert a throwing named query rejects but the queue is not wedged and the next queued query proceeds (connection.ts:205-226 serialize-before-commit invariant).

### Fixtures & data needed
- A table `t(id int primary key, name text, a int, b int, x int, val int[], data jsonb)` seeded with a few rows (reuse smoke `t` where possible).
- A unique constraint to trigger 23505 at Execute-time.
- Read access to `pg_prepared_statements` (available to the session owner) to assert named/unnamed registration counts.
- A second role/connection for parallel pooler-collision chaos test; a `max:2`/`max:4` pool.
- Ability to run raw DDL (`ALTER TABLE`, `CREATE VIEW`), `PREPARE`/`DEALLOCATE`/`DISCARD ALL` for footgun tests.
- A teardown that drops created views/columns between cases (DDL invalidation test mutates schema).

### PG-version / config sensitivities
- `cached plan must not change result type` (0A000) wording/timing is stable across PG14-17 but the exact column-change that triggers it differs (add vs drop vs retype) — test a retype to be safe.
- `pg_prepared_statements` columns (`generic_plans`/`custom_plans` added PG17) — only depend on `name`/`statement`/`from_sql`, present in all of PG14-17.
- Plan-type switching (custom→generic after 5 executions) is internal; do NOT assert on it, but be aware reuse counts ≥6 exercise the generic-plan path.
- Array param via JSON text (`any($1)`) is sensitive to `array` input syntax: JSON `[1,2,3]` is NOT valid Postgres array literal `{1,2,3}` — this likely FAILS for native `int[]` and is the documented encoding limitation; behavior is consistent across versions.
- `standard_conforming_strings`/`DateStyle`/`bytea_output` affect decoding of returned values, not the prepare path itself; keep result assertions on stable types.
- SCRAM vs md5 auth (`password_encryption`) is orthogonal here but pooled named tests should run under the default auth of the test cluster.

### Estimated test count
44


## Result Modes & Metadata — scope: implemented (+ a few partial(roadmap)/out-of-scope-guard)

This domain pins the contract every consumer depends on: how `connection.ts` materializes server messages into the `QueryResult` shape `{ rows, columns, rowCount, command }` across the four row modes, plus the command-tag / rowCount / column-metadata semantics. Grounded in source: `makeRow()` builds rows per mode — `array` decodes per field into a positional array, `object` writes `o[f.name] = ...` in field order (so **duplicate names collapse, rightmost column wins**, never "last non-null"), `buffer` maps each cell to `Buffer.from(c)` or `null`, and `raw` returns `Buffer.from(body)` — the **entire DataRow message body**, not per-cell. `columns` is `(t.fields ?? []).map(f => f.name)` (only the names — minipg does NOT expose node-postgres-style field descriptors with `dataTypeID`/`tableID`/`format`); `command` is `tag.split(' ')[0]` and `rowCount` is `parseInt` of the trailing `(\d+)` of the command tag (so `CREATE TABLE`/`DO`/`BEGIN` yield `rowCount: null`). RowDescription (`T`) populates `fields`; NoData (`n`) sets `fields = []`, so a zero-row SELECT keeps its columns while an INSERT-without-RETURNING reports `columns: []`. NULL cells decode to `null` in every cell-oriented mode. Extended-protocol-only: one statement per query, so multi-statement strings and simple-query semantics are guard cases.

### Test groups

#### Array mode (default) row shape
- [P0][integration][impl] `query('select 1 a, 2 b')` (default mode) returns `rows[0]` as a positional array `[1, 2]` whose length equals `columns.length`, `Object.getPrototypeOf(rows[0]) === Array.prototype`. (refs: node-postgres#593, node-postgres#612)
- [P0][integration][impl] Array mode preserves SELECT-list order: `select 3 c, 1 a, 2 b` → `rows[0] === [3,1,2]` and `columns === ['c','a','b']` (no reordering/sorting by name). (refs: node-postgres#3068)
- [P1][integration][impl] Duplicate column names in array mode preserve BOTH values: `select 1 as x, 2 as x` → `rows[0] === [1,2]`, `columns === ['x','x']` (length 2). (refs: node-postgres#280, node-postgres#593, node-postgres#1054, node-postgres#2237)
- [P1][integration][impl] LEFT JOIN selecting same-named columns from both sides exposes both via array mode; a NULL from the unmatched side does NOT overwrite the non-null from the other (positions are independent). (refs: node-postgres#1050, node-postgres#1136, node-postgres#1305)

#### Object mode row shape & duplicate-column collapse
- [P0][integration][impl] `query(sql, [], { mode:'object' })` returns plain objects: `Object.getPrototypeOf(row) === Object.prototype`, and `JSON.stringify(row)` includes every distinct column key. (refs: node-postgres#685, node-postgres#707, node-postgres#1131)
- [P0][integration][impl] Duplicate column names collapse to **rightmost wins**: `select 1 as x, 2 as x` in object mode → `{ x: 2 }` deterministically. Snapshot-lock so it cannot silently flip back to last-non-null. (refs: node-postgres#3189, node-postgres#3062)
- [P0][integration][impl] Rightmost-wins is column-position based, NOT value based: `select 1 as x, null as x` → `{ x: null }` (rightmost wins even when null); `select null as x, 2 as x` → `{ x: 2 }`. Guards the #3189 regression. (refs: node-postgres#3189)
- [P1][integration][impl] `columns` (the names array) still lists all collapsed names — `select 1 x, 2 x, 3 x` → `columns.length === 3` even though the object has one `x` key. (refs: node-postgres#1539, node-postgres#2138)
- [P1][integration][impl] Quoted mixed-case identifier preserved exactly as the object key: `select now() as "theTime"` → `'theTime' in row` (not `thetime`). (refs: node-postgres#244, node-postgres#195)
- [P1][integration][impl] Unquoted identifier folded to lowercase by the server and surfaced verbatim: `select 1 as "FirstName"` vs `select 1 as FirstName` → keys `'FirstName'` vs `'firstname'`; driver does not re-case. (refs: node-postgres#1786, node-postgres#2587)
- [P2][integration][impl] Column name containing special chars / apostrophe (`select 1 as "it's a col"`) becomes a row key without crashing or injection during row construction. (refs: node-postgres#934)
- [P2][integration][impl] Unaliased expression keys: `select 1` → key `'?column?'`; `select count(*) from t` → key `'count'`. (refs: node-postgres#2138)

#### Buffer mode row shape
- [P0][integration][impl] `mode:'buffer'` returns each cell as a `Buffer` of the raw text-format bytes (undecoded): `select 'alice', '42'::int4` → `[Buffer('alice'), Buffer('42')]`; `int8` cell is the ASCII bytes of the digits, not a numeric. (refs: smoke.ts#3)
- [P0][integration][impl] Buffer mode row length equals `columns.length`; each entry is `Buffer.isBuffer(c) || c === null`. (refs: node-postgres#481)
- [P1][integration][impl] Buffer cells are copies (`Buffer.from(c)`), not views into the parser's chunk: mutating a returned cell does not corrupt a subsequent row's data. (refs: source makeRow)

#### Raw mode row shape (whole-DataRow bytes)
- [P0][integration][impl] `mode:'raw'` returns ONE `Buffer` per row equal to the full DataRow message body (column-count header + per-cell length prefixes + cell bytes), not a per-cell array: `select 1, 2` → `Buffer.isBuffer(rows[0])` and `rows[0]` length > the decoded payload. (refs: smoke.ts#4)
- [P1][integration][impl] Raw-mode row buffer is independent per row (`Buffer.from(body)` copy): two streamed raw rows do not alias the same backing memory. (refs: source makeRow)
- [P2][integration][impl] Raw mode for a NULL cell: the row buffer encodes the `-1` length sentinel for that column (assert by parsing the body) — no separate JS `null` is produced since the unit is the whole row. (refs: source makeRow)

#### NULL cells across every mode
- [P0][integration][impl] `select null::int4, null::text, null::jsonb` → array mode `[null,null,null]`; object mode all keys present with value `null`; buffer mode `[null,null,null]`. (refs: smoke.ts#1)
- [P1][integration][impl] Mixed NULL/non-NULL in one row decode independently in every cell mode: `select 1, null, 'x'` → array `[1,null,'x']`, object `{...: null}`, buffer `[Buffer,null,Buffer]`. (refs: node-postgres#1050)
- [P1][integration][impl] A row that is entirely NULLs is still a real row (rowCount counts it): `select null, null` → `rowCount: 1`, `rows.length === 1`, never synthesized-away. (refs: node-postgres#464)

#### `columns` metadata
- [P0][integration][impl] `columns` is ALWAYS an array — `[]` when there is no RowDescription (NoData), never `undefined`/`null`. (refs: node-postgres#2056)
- [P0][integration][impl] `columns` order matches SELECT-list order including numeric/quoted names: `select 1 as "2", 2 as "1"` → `columns === ['2','1']`. (refs: node-postgres#3068)
- [P1][integration][impl] `SELECT (col1,col2) FROM t` (composite/record) yields ONE column (`columns.length === 1`, name `'row'`) while `select col1, col2` yields two — assert the structural difference. (refs: node-postgres#3131)
- [P1][unit][impl] Named-prepared reuse path keeps `columns` correct: a second call with the same `name`+SQL serves `fields` from the per-connection cache (`this.prepared`) and still maps the same `columns`. (refs: source startTask)
- [P2][todo:feature] Rich field descriptors (`dataTypeID`, `tableID`, `columnID`, `dataTypeSize`, `dataTypeModifier`, `format`) are NOT currently exposed (only `columns` names). Pending spec for when minipg adds a `fields` array — assert `format:'text'` for all fields in text protocol once implemented. (refs: node-postgres#481, node-postgres#988, node-postgres#1688)

#### Empty result set (0 rows keeps columns)
- [P0][integration][impl] `select id, name from t where false` resolves (no hang) with `rows: []`, `command: 'SELECT'`, `rowCount: 0`, and `columns === ['id','name']` (RowDescription present without data). (refs: node-postgres#325, node-postgres#1132, node-postgres#2056)
- [P0][integration][impl] `select * from <empty_table>` resolves with `rows: []` and the table's full column list in `columns`. (refs: node-postgres#464, node-postgres#2708)
- [P1][integration][impl] `select * from <a_view>` returns the view's DATA rows (rows.length matches underlying data), not just an empty array with columns. (refs: postgres.js#676)
- [P1][integration][impl] Zero-row result never fabricates a row of nulls: `rows.length === 0` strictly, and `rows` is a real empty array. (refs: node-postgres#464)

#### Command tag & rowCount semantics
- [P0][integration][impl] SELECT: `rowCount === rows.length` for a 3-row select; never `rowCount:1` with empty rows. (refs: node-postgres#979, node-postgres#2182)
- [P0][integration][impl] INSERT without RETURNING: `command:'INSERT'`, `rows: []`, `columns: []` (NoData), `rowCount: 1` (parsed from `INSERT 0 1`). (refs: node-postgres#633, node-postgres#1640)
- [P0][integration][impl] UPDATE / DELETE affecting N rows: `command:'UPDATE'`/`'DELETE'`, `rowCount: N`; affecting ZERO rows reports `rowCount: 0` (not undefined), so callers detect no-op. (refs: node-postgres#59, node-postgres#78, node-postgres#121)
- [P0][integration][impl] DDL `create table ...`: `command:'CREATE'`, `rows: []`, `columns: []`, `rowCount: null` (no trailing number in tag). (refs: node-postgres#2001)
- [P1][integration][impl] Anonymous `DO $$ ... $$` block: `command:'DO'`, `rows: []`, `rowCount: null`, even if it performs internal writes. (refs: node-postgres#2824)
- [P1][integration][impl] `begin` / `commit` (raw transaction control via query): `command:'BEGIN'`/`'COMMIT'`, `rowCount: null`. (refs: node-postgres#360)
- [P1][unit][impl] `rowCount` is always a JS `number` or `null`, never `NaN`/`undefined`: assert `parseInt` of tags `INSERT 0 5`→5, `DELETE 100`→100, `SELECT 0`→0, `CREATE TABLE`→null. (refs: node-postgres#708, node-postgres#1245, node-postgres#3352)
- [P2][integration][impl] Command word extraction takes only the first token: multi-word tags `CREATE TABLE`/`ALTER TABLE`/`DROP TABLE` → `command` is `'CREATE'`/`'ALTER'`/`'DROP'` (first token), `rowCount: null`. (refs: node-postgres#2001)
- [P2][integration][impl][version] `MERGE ... ` (PG15+) → `command:'MERGE'`, `rowCount` = merged row count; skip on PG14. (refs: node-postgres#2504)

#### RETURNING and affected-row data
- [P0][integration][impl] `insert ... returning id` (serial) → `rows[0]` contains the generated id, `command:'INSERT'`, `rowCount: 1`, `columns` includes `'id'`. (refs: node-postgres#9, node-postgres#669, node-postgres#1234)
- [P0][integration][impl] `delete ... where id in ($1,$2) returning *` returns ALL matched rows (`rows.length === 2`), not just the first; `rowCount: 2`. (refs: node-postgres#989)
- [P1][integration][impl] `insert ... select ... returning *` returns each inserted row and `rowCount === rows.length`. (refs: node-postgres#1405)
- [P1][integration][impl] `insert ... on conflict do update ... returning *` returns the upserted row, `rowCount: 1`. (refs: node-postgres#974, node-postgres#1546)
- [P2][integration][impl] Same insert with vs without RETURNING: without → `columns: []`,`rows: []`,`rowCount:1`; with → populated `columns`/`rows`. (refs: node-postgres#1640)
- [P2][integration][impl] RETURNING in object mode applies duplicate-collapse / casing rules identically to SELECT. (refs: node-postgres#502)

#### Large / numeric rowCount correctness
- [P1][integration][impl] `insert into t select generate_series(1, 5000)` → `rowCount: 5000` as a JS number (tag `INSERT 0 5000`). (refs: node-postgres#1330)
- [P2][property][impl] Property: for command tags of form `<WORD>[ <oid>] <n>`, parsed `rowCount` equals the trailing integer and `command` equals the first word, for random N in [0, 1e6]. (refs: node-postgres#708)
- [P2][unit][impl] Footgun: rowCount uses base-10 `parseInt`; assert a tag with leading-zero count (none normally produced) and a tag with no number both behave (`DELETE 007`→7, `SELECT`→null) — documents the regex `(\d+)\s*$`. (refs: source handle 'C')

#### Result-object shape & destructuring contract
- [P0][unit][impl] Resolved result is exactly `{ rows, columns, rowCount, command }`; destructuring a non-existent prop (e.g. `result.fields`) yields `undefined`, not a throw. Document the divergence from node-postgres (`fields`) and postgres.js (array-with-metadata). (refs: node-postgres#3362, node-postgres#216)
- [P1][unit][impl] `rows` is a plain `Array` (not an array-with-hidden-metadata like postgres.js); `JSON.stringify(result.rows)` round-trips object-mode rows with all keys. (refs: postgres.js#147, node-postgres#1409)
- [P2][integration][impl] JSON/array aggregate values surface under their server column key in `rows[0]`, not an empty object: `row_to_json(t)`, `array_agg(...)`, `pg_try_advisory_lock($1,$2)` each present a real value. (refs: node-postgres#831, node-postgres#688, node-postgres#2744)

#### Guards: out-of-scope / not-yet-implemented behaviors
- [P1][integration][out-of-scope-guard] Multi-statement string in one extended-protocol query fails cleanly: `select 1; select 2` rejects with a `PgError` (SQLSTATE `42601`, "cannot insert multiple commands into a prepared statement") — minipg does NOT return an array of result sets. Document. (refs: node-postgres#360, node-postgres#508)
- [P2][integration][out-of-scope-guard] Single-statement back-compat: a normal `select 1` still returns a single result object (never wrapped in an array). (refs: node-postgres#360)
- [P2][unit][out-of-scope-guard] No column-name transform hook exists: keys are exactly the server names; assert no snake→camel folding occurs by default and no transform option is honored. (refs: postgres.js#491)
- [P2][unit][out-of-scope-guard] No `mode:'map'` is supported; passing an unknown mode falls through to the `array` branch (`default` in `makeRow`) — assert array output rather than a Map. (refs: node-postgres#1718)
- [P2][todo:feature] Binary RESULT format (roadmap): once requested, `buffer`/`raw` cells would carry binary wire bytes and decoders switch on format — pending spec asserting binary int4 decodes correctly. (refs: roadmap)

### Fixtures & data needed
- A seed table `t(id int4 PK, name text, n8 int8, amount numeric, ok bool, data jsonb, blob bytea)` with ≥3 rows incl. a row with NULL name (mirrors smoke.ts). 
- An empty table `empty_t(a int, b text)` and a view `t_view AS select id, name from t` (for view-rows test).
- A table with a `serial`/`generated always as identity` id for RETURNING (`ins(id serial PK, v text)`), plus a unique constraint for ON CONFLICT.
- A table for INSERT...SELECT bulk rowCount (5000 rows via generate_series).
- A composite-yielding query (`select (id, name) from t`).
- Optional: a trigger that suppresses a row (to assert rows:[] without throw) — lower priority.

### PG-version / config sensitivities
- `MERGE` command tag exists only PG15+; gate that case.
- Command-tag format for `SELECT`/`INSERT 0 N`/`UPDATE N`/`DELETE N` is stable PG14–17; `rowCount` parsing should be version-agnostic.
- Decoding-sensitive settings (`bytea_output` hex vs escape, `DateStyle`, `standard_conforming_strings`) affect cell VALUES (codec domain) but not the result/columns/rowCount shape this domain asserts — keep value assertions tolerant or pin server settings (hex bytea assumed, matching smoke.ts `deadbeef`).
- `?column?` default name for unaliased expressions is stable across PG14–17.
- Object-mode duplicate-collapse and identifier case-folding are server-driven and version-stable; lock with snapshots.

### Estimated test count
55


## Data Types — core scalars  — scope: partial(roadmap)

Round-trip, NULL, and decode coverage for minipg's core scalar types. Grounded in `src/codec.ts`: the driver decodes text-format only, with a fixed `defaultDecoders` map keyed by OID — bool(16)→`b[0]===0x74`, bytea(17)→hex/`\x` Buffer, int2(21)/int4(23)/oid(26)→`Number()`, float4(700)/float8(701)→`Number()`, json(114)/jsonb(3802)→`JSON.parse`; **everything else falls back to UTF-8 string** via `decoderFor`'s `?? asString`. That means int8(20), numeric(1700), money(790), text/varchar/char/name, uuid(2950), timestamps, and all arrays decode as raw strings by default — precision-safe by design (`asNumber` is never applied to int8/numeric). The param encoder is type-driven by the JS value (Buffer→binary fmt 1, Date→ISO, boolean→`t`/`f`, object/array→JSON, else `String(v)`) and rejects any NUL (0x00) byte client-side before the wire. Overrides flow through `buildDecoders(config.types)` which clones the default map and `set`s per-OID, so e.g. int8→BigInt is opt-in. Several focus items (override hook plumbing, BigInt symmetry on encode, NaN-as-float, array element decode) probe the boundary between what `codec.ts` implements and what is still roadmap.

### Test groups

#### int2 / int4 — number decode
- [P0][integration][impl] `SELECT 1::int4, (-5)::int4, 32767::int2, (-32768)::int2` decode to JS `number` with `typeof === 'number'` and exact values (refs: codec int2=21/int4=23→asNumber).
- [P0][integration][impl] `SELECT NULL::int4` and `NULL::int2` decode to JS `null`, never `0` or `NaN`.
- [P1][integration][impl] int4 boundary values `2147483647` and `-2147483648` round-trip exactly as numbers (within safe-integer range).
- [P1][integration][impl] Param-bind path: `SELECT $1::int4` with JS `0` returns `0` (not coerced to null/`""`); `String(0)` encode is `"0"`.
- [P1][integration][impl] Inserting a value beyond int4 range (e.g. `2147483648`) into an `integer` column via `$1` rejects with catchable `PgError` SQLSTATE `22003` (out of range), connection stays usable. (refs: node-postgres#1963)
- [P2][integration][impl] `oid` type (OID 26) decodes via `asNumber` to a JS number, e.g. `SELECT 'int4'::regtype::oid` returns a number.

#### int8 / numeric / money — precision-safe STRING default
- [P0][integration][impl] `SELECT 9223372036854775807::int8` (max bigint) returns exact string `"9223372036854775807"`, `typeof === 'string'`, NOT a rounded Number. (refs: node-postgres#1283, #1450)
- [P0][integration][impl] int8 value `9007199254740993` (2^53+1) round-trips as string `"9007199254740993"` — assert no 2^53 precision loss (the existing smoke check, hardened). (refs: node-postgres#166)
- [P0][integration][impl] `SELECT 0.0268::numeric` returns string `"0.0268"`, NOT `0` / truncated. (refs: node-postgres#2957)
- [P0][integration][impl] `SELECT 12345678901234567890.12345::numeric` round-trips losslessly as canonical PG text string. (refs: node-postgres#107, #266)
- [P1][integration][impl] `numeric(8,2)` value `0.3` returns string `"0.30"` (scale/trailing-zero preserved). (refs: node-postgres#849, #884)
- [P1][integration][impl] `SELECT COUNT(*)` over `t` returns int8 as a JS **string** (`typeof === 'string'`). (refs: node-postgres#378, #639, postgres.js#249)
- [P1][integration][impl] `SELECT SUM(n8)` over an int8 column returns a precision-preserving string. (refs: node-postgres#2631, postgres.js#746)
- [P1][integration][impl] `money` (OID 790) is not in `defaultDecoders` → decodes via `asString` to the raw locale-formatted string (e.g. `"$1,234.56"`); document/guard this fallback rather than coercing to number.
- [P0][integration][impl] `SELECT NULL::int8` and `NULL::numeric` decode to JS `null`, never `NaN` or `"NaN"`. (refs: node-postgres#26)
- [P0][integration][impl] Passing JS `null` for a numeric/bigint param inserts SQL NULL (verify `IS NULL`), never the literal `'NaN'`. (refs: node-postgres#1613, postgres.js#336)
- [P1][integration][impl] `'NaN'::numeric` under the default (string) decoder returns the string `"NaN"` (per verification-note correction: string-default driver yields strings for ALL numeric values incl. NaN), distinct from `null`. (refs: node-postgres#1943)
- [P2][integration][impl] `bigserial`/int8 primary key returned as string by default. (refs: postgres.js#105, #486)

#### float4 / float8 — number decode incl. special values
- [P0][integration][impl] float4/float8 columns decode to JS `number` (not string) via asNumber; `SELECT 1.5::float8` → `1.5`. (refs: node-postgres#339)
- [P1][integration][impl] `SELECT 9007199254740991::float8` (MAX_SAFE_INTEGER) round-trips exactly; assert session sets `extra_float_digits` so full precision is emitted (note: only strictly required PG<12). (refs: node-postgres#730, #3092)
- [P1][integration][impl] `'NaN'::float8` decodes to JS `NaN` (Number.isNaN true) — `Number("NaN")` is NaN. (refs: node-postgres#1943)
- [P1][integration][impl] `'Infinity'::float8` → `Infinity`, `'-Infinity'::float8` → `-Infinity` (`Number("Infinity")` works); distinct from null. 
- [P0][integration][impl] `SELECT NULL::float8` decodes to JS `null` (not `NaN`, since `asNumber` is bypassed for NULL cells).
- [P2][integration][impl] float4 narrowing: `SELECT 0.1::float4` decodes to the JS number of its text repr (assert the value PG emits, not exact 0.1).

#### bool — t/f decode and JS-boolean encode
- [P0][integration][impl] `SELECT true` → JS `true`, `SELECT false` → JS `false` (booleans, not strings `"t"`/`"f"`); via `asBool` `b[0]===0x74`. (refs: node-postgres#499, postgres.js#858)
- [P0][integration][impl] `SELECT NULL::bool` → JS `null` (not `false`). (refs: node-postgres#499)
- [P0][integration][impl] Bind JS `true`/`false` to `$1::bool` → encoder emits `t`/`f`, round-trips to JS `true`/`false`. (refs: node-postgres#499)
- [P1][integration][impl] Binding `null` to a boolean column stores SQL NULL, reads back JS `null` (not false). (refs: node-postgres#499)
- [P1][integration][impl] Inserting truthy string literals `'t'`,`'true'`,`'yes'`,`'on'`,`'1'` (as `$1::bool` or into bool col) all store/return `true`; `'f'`,`'false'`,`'no'`,`'off'`,`'0'` all store/return `false` — PG does the cast, driver passes the string verbatim. (refs: postgres.js#858)
- [P1][integration][impl] Inserting unrecognized `'maybe'` into a bool column rejects with `PgError` SQLSTATE `22P02` (`invalid input syntax for type boolean`), not silent `false`. (refs: postgres.js#858)
- [P2][integration][impl] `bit`/`bit(n)` (not in decoder map) falls back to `asString`: `B'101'::bit(3)` → `"101"`, `B'1'::bit` → `"1"` (stable string repr, no truncation/reorder). (refs: node-postgres#1422)

#### text / varchar / char(n) / name — byte-for-byte string fidelity
- [P0][integration][impl] Backslash fidelity: bind `"a\\nb"` (4 chars: a, backslash, n, b) into TEXT via `$1`, read back exactly 4 chars — no conversion to newline, no backslash loss (params are length-prefixed, immune to standard_conforming_strings). (refs: node-postgres#895, #1174)
- [P0][integration][impl] Real newline `"line1\nline2"` (0x0A) round-trips as a real 0x0A byte, not a literal `\n`. (refs: node-postgres#905)
- [P1][integration][impl] Multiple consecutive backslashes `"C:\\\\path"` survive every backslash. (refs: node-postgres#1174)
- [P0][integration][impl] `SELECT NULL::text` → JS `null`, never the 3-char `"null"`. (refs: node-postgres#17)
- [P0][integration][impl] `SELECT ''::text` → `""` (empty string), distinct from `null`; empty-string column does not read back null and vice versa. (refs: node-postgres#263)
- [P1][integration][impl] No numeric coercion: `SELECT '007'::text` → `"007"`, `'3'::varchar` → `"3"` (typeof string, leading zeros kept). (refs: node-postgres#876)
- [P1][integration][impl] `char(5)` of `'ab'` returns `"ab   "` with 3 trailing blank-pad spaces intact (matches psql), not trimmed. (refs: node-postgres#1738)
- [P2][integration][impl] `name` type (OID 19, not in map) falls back to asString: `SELECT 'public'::name` → `"public"`.
- [P2][integration][impl] `citext` value `'3'` decodes to string `"3"` (requires citext extension; dynamic OID → asString fallback). (refs: node-postgres#876)
- [P1][chaos][impl] concat + varchar-cast query shape returns correct rows with no ECONNRESET regardless of select-list order (framing guard). (refs: node-postgres#1524)

#### bytea — hex in/out, NUL bytes, large blobs
- [P0][integration][impl] Random ~64-byte Buffer param into a `bytea` column round-trips byte-for-byte equal (encoder sends format=1 binary). (refs: node-postgres#37, #807, #1690)
- [P0][integration][impl] `\xdeadbeef` decodes via `asBytea` to `Buffer.from([0xde,0xad,0xbe,0xef])` (the existing smoke check, generalized). (refs: node-postgres#161)
- [P0][integration][impl] Buffer containing NUL bytes `Buffer.from([1,0,2,0,3])` round-trips full length, no UTF8 error, no truncation at first NUL (bytea param is a Buffer → binary, so client-side NUL guard does NOT fire). (refs: node-postgres#980, #1849, #2557)
- [P1][integration][impl] Buffer with backslash byte `0x5C` / `Buffer.from('\\x123f')` stores literal bytes, not interpreted as bytea escape, round-trips unchanged. (refs: node-postgres#855)
- [P1][integration][impl] Large ~80KB random Buffer inserts without length/type error and `SELECT` returns identical bytes (verify length + hash). (refs: node-postgres#1166, #3527)
- [P1][integration][impl] Same payload inserted once as Buffer param and once as `'\x...'` hex string literal produce byte-identical stored bytea. (refs: node-postgres#1958, postgres.js#340)
- [P0][integration][impl] `SELECT NULL::bytea` → JS `null`.
- [P2][integration][impl] `asBytea` legacy/non-`\x` branch: a value lacking the `\x` prefix is decoded via `Buffer.from(s,'utf8')` (guard documents the fallback; relevant only under `bytea_output=escape`).
- [P2][integration][todo:feature] `Uint8Array` / `ArrayBuffer` / view with non-zero byteOffset passed as bytea param — CURRENTLY only `Buffer.isBuffer(v)` matches in `encodeParam`, so a bare Uint8Array hits `typeof === 'object'` → `JSON.stringify` (wrong). Pending spec: should encode as binary bytea. (refs: node-postgres#1166, #3323)
- [P1][unit][impl] `encodeParam` no-deprecation guard: bytea decode uses `Buffer.from`/`alloc` (codec uses `Buffer.from`), run with `--throw-deprecation`, assert no `Buffer() is deprecated`. (refs: node-postgres#2426)

#### uuid — canonical string default + override + invalid input
- [P0][integration][impl] `SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid` → that canonical lowercase string (OID 2950 not in map → asString). (refs: node-postgres#1726)
- [P1][integration][impl] `SELECT $1::uuid` with UPPERCASE input returns canonical lowercase (PG normalizes; driver does not pre-mangle). (refs: node-postgres#1726)
- [P0][integration][impl] `SELECT $1::uuid` with `''` rejects: `PgError` SQLSTATE `22P02`, message `invalid input syntax for type uuid: ""`; driver does NOT coerce `''`→NULL. (refs: node-postgres#2738)
- [P1][integration][impl] `$1::uuid` with `'not-a-uuid'` and with one-digit-short uuid both reject SQLSTATE `22P02`. (refs: node-postgres#2738)
- [P1][integration][impl] `$1::uuid` with JS `null` → SQL NULL, no error (NULL is the correct absent-value sentinel). (refs: node-postgres#2738)
- [P2][integration][impl] Braced form `'{a0eebc99-...380a11}'` accepted by PG, round-trips unbraced — driver does not pre-validate/reject valid alternate forms. (refs: node-postgres#2738)
- [P1][integration][impl] Override via `config.types`: register OID `2950`→16-byte Buffer decoder; `SELECT '...'::uuid` returns a 16-byte Buffer (hyphens stripped); other types decode normally in same row (scope isolation). (refs: node-postgres#1726)

#### oid type values & numeric handling
- [P1][unit][impl] `buildDecoders({26: customFn})` clones default map and overrides oid decoder without mutating `defaultDecoders` (no cross-test leakage); other OIDs retain defaults. (refs: node-postgres#328)
- [P2][integration][impl] An OID value above signed-int4 max (>2147483647) is read/handled as unsigned and resolves to its registered parser, not negative-key miss / raw text. (refs: node-postgres#2974)
- [P2][integration][impl] A column whose data-type OID has no registered decoder falls back to `asString` (the `?? asString` path) rather than throwing. 

#### UTF-8 fidelity, multibyte & client_encoding
- [P0][integration][impl] Insert+SELECT `'café résumé naïve ÆØÅ €'` (Latin accents + U+20AC) on UTF8 DB returns `===` identical JS string, no `�`. (refs: node-postgres#206, #2203)
- [P0][integration][impl] 4-byte UTF-8 emoji `'😀'` (U+1F600) round-trips with identical codepoints/length. (refs: node-postgres#206)
- [P1][integration][impl] Parameterized accented WHERE: `WHERE name = $1` with `'José'` returns exactly the server-matching rows (not zero rows). (refs: node-postgres#2438, postgres.js#138)
- [P1][chaos][impl] Thousands of rapid back-to-back queries returning multibyte text spanning TCP packet boundaries never produce `invalid byte sequence`/decode errors (buffer-framing guard). (refs: node-postgres#3307)
- [P0][unit][impl] NUL-byte param guard: `query('select $1::text', ['a\0b'])` rejects client-side with `/NUL/` before the wire (the existing smoke check; codec.ts line 52). Connection remains usable for the next query. (refs: node-postgres#2080, postgres.js#238)
- [P1][integration][impl] Embedded NUL in SQL text (not just param) is rejected/clean — no `08P01` desync, connection usable afterward. (refs: node-postgres#2936)
- [P2][integration][todo:feature] `client_encoding` configurable (e.g. `'latin1'`): startup packet sends it, `SHOW client_encoding` reflects it, byte `0xE9` decodes to `'é'` — CURRENTLY decoders use `toString('utf8')` hardcoded (codec asString), so non-UTF8 decode is unimplemented; pending spec. (refs: node-postgres#498, #1033, #2732)
- [P2][integration][todo:feature] SQL_ASCII DB high-bit bytes do not throw client-side `invalid byte sequence for encoding "UTF8"` when an explicit client encoding is set — roadmap (no encoding option yet). (refs: node-postgres#2475)

#### Override hook & BigInt (config.types)
- [P1][integration][impl] int8→BigInt override: `config.types = {20: (b)=>BigInt(b.toString())}`; `SELECT 9223372036854775807::int8` returns `9223372036854775807n` (BigInt, ===). (refs: postgres.js#27, node-postgres#2398)
- [P1][integration][impl] Override is opt-in: with no override, int8 stays string `"9223..."` (default preserved). (refs: postgres.js#27)
- [P2][integration][todo:feature] BigInt param ENCODE symmetry: passing a JS `BigInt` (e.g. `9223372036854775807n`) as `$1` — CURRENTLY `typeof bigint` is not handled in `encodeParam`; it falls through to `String(v)` which actually yields the correct decimal string. Assert `String(123n)==="123"` round-trips into numeric without truncation; flag as implicit (no explicit BigInt branch). (refs: postgres.js#874, node-postgres#3075)
- [P2][integration][todo:feature] numeric/int8 array element decode (`int8[]`, `numeric[]`) — arrays are not in `defaultDecoders` so the whole array decodes as one raw string `"{1,2}"`; richer array decoding (per-element BigInt/NaN) is roadmap. Guard the current string behavior. (refs: node-postgres#1943, postgres.js#1106)

#### Out-of-scope guards
- [P2][integration][impl] Numeric-param type deduction: inserting a numeric-string into `numeric(9,6)` via `$1::numeric` succeeds with no `inconsistent types deduced for parameter` error. (refs: node-postgres#1205)
- [P2][unit][impl] `types.builtins`-style constant access is NOT part of minipg's surface (overrides are raw OID numbers via `config.types`); assert the documented API is numeric-OID keyed, no `builtins` map required. Guard against assuming a node-pg-types dependency. (refs: node-postgres#2856)

### Fixtures & data needed
- Reuse smoke `t` table (id int4, name text, n8 int8, amount numeric, ok bool, data jsonb, blob bytea) plus a 3rd NULL row.
- New per-test temp tables: `bytea` col, `bytea[]` col, `char(5)` col, `boolean` col, `numeric(8,2)`/`numeric(9,6)` cols, `integer` col (for range-error), `uuid` col.
- Extensions: `citext` (P2, skip if absent). 
- Server settings probes: `SHOW extra_float_digits`, `SHOW client_encoding`, `SHOW bytea_output`, `SHOW standard_conforming_strings`.
- Roles: existing postgres/md5user/scramuser (not needed here).
- Helper: random-buffer + sha256 for large-blob equality; codepoint-array comparator for emoji.

### PG-version / config sensitivities
- `EXTRACT(EPOCH ...)`: NUMERIC (string) on PG14+, but float8 (number) on PG<14 — gate or assert per-version (excluded from core scalars but noted).
- `extra_float_digits`: PG12+ emits shortest-round-trip by default; the float8 MAX_SAFE_INTEGER precision assertion only strictly needs `extra_float_digits=3` on PG<12.
- `bytea_output`: default `hex` (9.0+) drives the `\x` branch of `asBytea`; the non-`\x` legacy-escape branch only exercised under `bytea_output=escape`.
- `standard_conforming_strings`: irrelevant to parameterized binds (length-prefixed) but affects embedded SQL string literals — backslash tests use params to stay version-independent.
- `client_encoding`: minipg currently hardcodes UTF-8 decode; latin1/SQL_ASCII tests are roadmap and version-independent once implemented.
- `money` output depends on `lc_monetary`; assert via string fallback rather than exact format.

### Estimated test count
58


## Data Types — Temporal & JSON  — scope: partial(roadmap)

This domain pins down how minipg decodes and encodes temporal (`date`, `time`, `timetz`, `timestamp`, `timestamptz`, `interval`) and JSON (`json`, `jsonb`, `jsonb[]`) values. Grounded in `src/codec.ts`: minipg deliberately decodes **all temporal types as raw UTF-8 strings** (no OID for 1082/1083/1114/1184/1186/1266 in `defaultDecoders`, so they hit the `asString` fallback in `decoderFor`), which side-steps the entire timezone-shift / off-by-one-day bug class that plagues node-postgres & postgres.js — so most "datetime" issues become **guard tests that assert the string is passed through verbatim**. JSON/jsonb decode via `JSON.parse` (`asJson`, OIDs 114 & 3802); params encode objects/arrays via a single `JSON.stringify` and `Date` via `toISOString()` (`encodeParam`). The auto-Date-decoder, timestamptz→Date, richer parsers, and binary result format are roadmap items planned here as pending specs.

### Test groups

#### timestamp (without time zone) decode — string passthrough baseline
- [P0][integration][impl] `SELECT '2020-06-01 13:45:00'::timestamp` returns the exact string `'2020-06-01 13:45:00'` (typeof === 'string'); value is byte-identical when the same query runs under `TZ=UTC`, `TZ=America/New_York`, and `TZ=Asia/Kolkata` — minipg applies no host-offset shift because no Date coercion occurs. (refs: node-postgres#11, #225, #1071, postgres.js#563, #999, #1075)
- [P0][integration][impl] `SELECT * FROM generate_series('2020-01-01'::timestamp, '2020-01-01 03:00', '1 hour')` returns 4 string rows with no ±1h DST/local distortion; the strings are `'2020-01-01 00:00:00' .. '03:00:00'` verbatim. (refs: node-postgres#429, #993, #655, #1868)
- [P1][integration][impl] Insert a JS `Date` (e.g. `new Date(Date.UTC(2020,5,1,13,45,0))`) into a `timestamp` column, then `SELECT` it back as string: stored text equals the Date's ISO wall clock from `toISOString()` minus the `Z`/offset semantics — assert the round-tripped string matches the encoded `toISOString()` value, independent of host `TZ`. (refs: node-postgres#1172, #2141)
- [P2][integration][impl] Multi-row `IN (...)` / large select of non-null `timestamp` columns never returns spurious `null`; every cell is a non-empty string. (refs: node-postgres#471, #551, #2443, #3274)

#### timestamptz decode — instant preserved as text, session-zone sensitive
- [P0][integration][impl] `SELECT '2020-01-01 00:00:00+05:30'::timestamptz` returns a string; with `SET TIME ZONE 'UTC'` it reads `'2019-12-31 18:30:00+00'` and with `SET TIME ZONE 'Asia/Kolkata'` it reads `'2020-01-01 00:00:00+05:30'` — same instant, server controls only the textual offset; minipg passes both through unchanged. (refs: node-postgres#1150, #2390, #2525, #616, postgres.js#388)
- [P1][integration][impl] Round-trip a JS `Date` through a `timestamptz` column and reparse the returned string (e.g. via `new Date(str)`): `inserted.getTime() === Date.parse(selected)` under any host `TZ` and any server `SET TimeZone`. (refs: node-postgres#2530, #3278)
- [P1][integration][impl] The same `timestamptz` literal selected twice in one connection (two queries) decodes to identical strings. (refs: node-postgres#1119)
- [P2][integration][impl] `SET TIME ZONE` issued on a pooled client (via `pool.connect()` then a `SET` query) affects the textual offset of `timestamptz` on subsequent queries on that same client. (refs: node-postgres#3265, #2417, #3246)

#### date decode — calendar day passthrough (no rollover)
- [P0][integration][impl] `SELECT '1975-05-11'::date` returns the string `'1975-05-11'` (typeof string) identically under negative-offset (`TZ=America/Los_Angeles`) and positive-offset (`TZ=Asia/Kolkata`) hosts — never `'1975-05-10'`/`'1975-05-12'`, because there is no `new Date('1975-05-11')` UTC-midnight coercion. (refs: node-postgres#510, #818, #1844, #2154, postgres.js#697)
- [P1][integration][impl] `'2020-03-15'::date` and `'2020-03-15 09:00'::timestamp::date` are internally consistent: both yield `'2020-03-15'` with no acquired time/zone suffix. (refs: node-postgres#156, #1577)
- [P1][integration][impl] A `BETWEEN $1 AND $2` range over a `date` column with date-string params (`'2020-01-01'`, `'2020-12-31'`) matches exactly the same rows as the literal form — params are sent as text, not stringified differently. (refs: postgres.js#582)

#### time / timetz / interval decode — string passthrough
- [P1][integration][impl] `SELECT '12:34:56'::time` (oid 1083) returns `'12:34:56'` string. (baseline happy path)
- [P0][integration][impl] `SELECT '12:34:56+05:30'::timetz` (oid 1266) returns a defined, correct string `'12:34:56+05:30'` rather than being dropped/unhandled — guards postgres.js's "timetz unhandled" defect via minipg's string fallback. (refs: postgres.js#54)
- [P1][integration][impl] `SELECT '1 year 2 mons 3 days 04:05:06'::interval` returns the server's text form verbatim; leading-zero fields (`'00:00:08'`) survive (no radix/parseInt corruption since no parsing happens). (refs: node-postgres#113, #2566)
- [P1][integration][impl] A negative interval `'-1 day -02:00:00'::interval` returns the full negative text unchanged (no sign-flip on any component). (refs: node-postgres#1380)
- [P2][integration][impl] With `SET intervalstyle = 'iso_8601'`, `'3 months'::interval` returns the ISO-8601 string `'P3M'` (non-empty, not all-zeros artifact). (refs: node-postgres#3156)

#### temporal edge eras, sentinels & precision
- [P1][integration][impl] `SELECT '0063-01-01 00:00:00 BC'::timestamp` returns a string containing `'BC'` (era preserved, not silently converted to AD). (refs: node-postgres#424)
- [P1][integration][impl] A 5-digit year `SELECT '12020-01-01'::date` returns `'12020-01-01'` (no truncation to 4 digits). (refs: node-postgres#441)
- [P0][integration][impl] `SELECT 'infinity'::timestamp` returns the string `'infinity'` and `'-infinity'::timestamp` returns `'-infinity'` — never `'Invalid Date'`/`NaN`. (refs: node-postgres#1026, postgres.js#728)
- [P0][integration][impl] Microsecond precision survives: `'2020-01-01 00:00:00.123456'::timestamp` returns the full `'...123456'` string (no truncation to ms) — minipg's string-default is lossless where a `Date` decoder would drop digits. (refs: node-postgres#1200, #1207, #269)
- [P2][integration][impl] A pre-2000 timestamp `'1970-01-01 00:00:01'::timestamp` decodes correctly as string (guards the binary-path "Invalid Date before 2000" bug — N/A while text-only, assert string correctness). (refs: node-postgres#1832)

#### temporal param encoding (JS Date and date-like strings)
- [P0][unit][impl] `encodeParam(new Date('2020-06-01T13:45:00.000Z'))` yields `{format:0, bytes: Buffer('2020-06-01T13:45:00.000Z')}` (ISO, never `Date.prototype.toString()` which emits `GMT-...`). (refs: node-postgres#1583, #2061, #2640, #1765, #1870)
- [P0][integration][impl] Binding a `Date` to `timestamptz` works under server `DateStyle=MDY` and `DateStyle=YMD` alike (ISO is unambiguous) — no `22007`/`22023`. (refs: node-postgres#2061, #1870)
- [P0][unit][impl] `encodeParam(new Date(undefined))` (invalid Date) **throws** (`toISOString()` raises `RangeError: Invalid time value`) rather than emitting `0NaN-NaN-...`. Pin this as the documented behavior. (refs: node-postgres#3318)
- [P1][integration][impl] An ISO-8601 string with explicit offset `'2020-01-01T00:00:00+05:00'` bound to a `timestamptz` stores the indicated instant (string param path), and a PG fractional-seconds string `'2020-01-01 00:00:00.123'` is not split on `.`. (refs: node-postgres#1746, postgres.js#222)
- [P2][integration][impl] A bogus string like `'to_timestamp(now())'` bound as a `::timestamptz` param is treated as a value and produces a clean `PgError` (SQLSTATE `22007`), never crashing the encoder with "Invalid time value". (refs: postgres.js#1048)
- [P2][unit][impl] A Date param compared/cast to `timestamp` equals the same ISO string embedded in a `jsonb` literal (encoder consistency). (refs: node-postgres#2088)

#### temporal custom decoder override (opt-in Date / raw-string)
- [P1][integration][impl] Registering `config.types = {1114: b => new Date(b.toString()+'Z')}` (or `1184`/`1082`) makes those columns return JS `Date`s — verifies `buildDecoders` merges per-OID overrides over `defaultDecoders` and `decoderFor` honors them on pooled connections. (refs: node-postgres#285, #783, #1084, #1350, postgres.js#161)
- [P0][integration][impl] (negative/footgun) A timestamp embedded in `json_build_object('t', '2020-01-01 00:00:00'::timestamp)` is returned inside the parsed JSON as the string Postgres emitted and is **NOT** run through the OID-1114 decoder; the same value selected as a bare column **is**. Confirms nested-JSON values bypass the per-OID registry. (refs: node-postgres#1743, #1876)
- [P2][integration][impl] A custom timestamp decoder applies regardless of how columns are projected (literal vs computed expression column), since `decoderFor` keys only on the RowDescription OID. (refs: postgres.js#1010)

#### [todo] built-in temporal Date decoders (roadmap)
- [P1][integration][todo:feature] (pending) Built-in opt-in decoder maps `timestamptz`(1184)→JS `Date` at the correct instant regardless of host `TZ`; `inserted.getTime()===selected.getTime()`. (refs: node-postgres#3278, postgres.js#388)
- [P1][integration][todo:feature] (pending) Built-in `date`(1082) decoder returns a value whose calendar fields are 1975/May/11 with no negative-offset rollover (the bug node-postgres ships). (refs: node-postgres#510, postgres.js#697)
- [P2][integration][todo:feature] (pending) With a parse-as-UTC option, `'2020-06-01 13:45:00'::timestamp` yields a Date whose **UTC** fields equal the wall clock (`getUTCHours()===13`) under any host TZ. (refs: node-postgres#783, #1071)
- [P2][unit][todo:feature] (pending) Sub-ms rounding rule is pinned: `'2020-01-01 00:00:00.1239'::timestamp` → built-in Date decoder resolves `getMilliseconds()` per documented rule (truncate→123 vs round→124). (refs: node-postgres#1200, #1207)
- [P2][integration][todo:feature] (pending) `interval`(1186) structured decoder: `'00:00:00'::interval`→fully-zeroed object (defined hours/minutes/seconds), not `{}`. (refs: node-postgres#2566)
- [P2][integration][todo:feature] (pending) Temporal interop: `Temporal.Instant`→`timestamptz`, `Temporal.PlainDate`→`date` round-trip equivalently to Date-based forms. (refs: node-postgres#3663, postgres.js#856)

#### json/jsonb decode to JS values
- [P0][integration][impl] `SELECT '{"a":1,"b":"x"}'::jsonb` returns a deep-equal JS object `{a:1,b:'x'}` (not a string); same for `'[1,2,3]'::json`→`[1,2,3]`. (refs: node-postgres#199, #658, postgres.js#634)
- [P1][integration][impl] `SELECT to_jsonb(ARRAY[]::int[])` and `COALESCE(array_to_json(...),'[]')::json` decode to JS `[]` (empty array), not the string `'[]'`. (refs: node-postgres#1586, #1920)
- [P0][integration][impl] A jsonb path that is SQL NULL — `SELECT ('{"a":1}'::jsonb)->'missing'` — decodes to JS `null` (the protocol DataRow is NULL → `null`), not `{}` nor the string `"null"`. (refs: node-postgres#3085)
- [P1][integration][impl] A jsonb value that is the JSON literal null — `SELECT 'null'::jsonb` — decodes via `JSON.parse('null')` to JS `null`. (footgun distinction vs SQL NULL above)
- [P2][unit][impl] `asJson(Buffer.from('"x"'))` returns the JS string `'x'` (scalar JSON), and `asJson(Buffer.from('true'))`→`true` (scalar boolean/number paths through `JSON.parse`).

#### json/jsonb param serialization (object / array / scalar / null)
- [P0][integration][impl] Binding `{a:1,b:'x'}` to a `$1::jsonb` param inserts and reads back deep-equal — no manual `JSON.stringify` (encoder's `typeof v==='object'` branch). (refs: node-postgres#208, #705, #767, #800, #1341, #2864, postgres.js#10, #108, #556, #625)
- [P0][integration][impl] Binding `[1,2,3]` to `$1::jsonb` produces JSON `[1,2,3]` (via `JSON.stringify`), NOT a PG array literal `{1,2,3}` — minipg has no array codec so this footgun cannot occur. (refs: node-postgres#374, #442, #857, #1016, #1143, #3125, #2012, #2649)
- [P0][integration][impl] Binding `[]` to a `jsonb` column stores and reads back JS `[]`, NOT `{}` (the node-postgres data-corruption bug). (refs: node-postgres#864, #2680)
- [P1][integration][impl] Binding `[{x:1},{y:2}]` and `[true,false]` to `jsonb` round-trip as proper JSON arrays/objects. (refs: node-postgres#1383, postgres.js#203, #575, #931)
- [P1][integration][impl] Binding a bare JS string `'hello'` to `$1::jsonb` stores `"hello"` (i.e. `JSON.stringify`'d to `"\"hello\""`) and round-trips to `'hello'` — wait: NOTE the encoder's `String(v)` branch for strings does NOT JSON-stringify; assert the **actual** minipg behavior (a bare string is sent as text `hello` and requires the `::jsonb` cast on already-valid JSON, so binding `'"hello"'` works but `'hello'` errors `invalid input syntax`). Pin minipg's real semantics, distinct from auto-encoding drivers. (refs: node-postgres#2576, #2750)
- [P1][integration][impl] Binding a JS boolean `true` to `$1::jsonb`: encoder's boolean branch emits `t` (text), which is **not** valid JSON → expect `PgError 22P02`. Document that callers must pass `JSON.stringify` or rely on object branch; guards the footgun. (refs: postgres.js#386, #1003, #931)
- [P1][integration][impl] Binding `null`/`undefined` to a `jsonb` param sends SQL NULL (`encodeParam` `v==null`), storing SQL NULL — distinct from JSON null. (NULL handling baseline)
- [P2][integration][impl] Binding `{}` to a `jsonb` param stores `{}` without `invalid input syntax`. (refs: node-postgres#1909)
- [P2][integration][impl] `undefined`-valued keys in an object bound to `jsonb` are omitted (`JSON.stringify` semantics): `{a:1,b:undefined}`→stored `{"a":1}`. (refs: node-postgres#1197)

#### bigint-in-json precision (documented loss)
- [P0][integration][impl] `SELECT json_build_object('big', 9007199254740993::int8)` decoded via default `asJson`/`JSON.parse` returns `{big: 9007199254740992}` — i.e. **precision IS lost** above 2^53. Assert the documented lossy behavior (contrast with column-level int8→STRING which is lossless). (refs: node-postgres#1319, #2265, #2385)
- [P1][integration][impl] Numeric/timestamp nested in `row_to_json(...)` is returned in raw JSON form (number/string as PG emitted) and is NOT re-run through per-OID parsers. (refs: node-postgres#1876)
- [P1][integration][impl] Overriding OID 3802 with a bigint-safe parser (e.g. a custom reviver) preserves `9007199254740993` exactly — the opt-in lossless path via `config.types`. (refs: node-postgres#1319, #722)

#### json parser override / raw passthrough
- [P0][integration][impl] `config.types = {3802: b => b.toString('utf8')}` returns the exact raw JSON text for jsonb columns instead of `JSON.parse` output, including scalar JSON (`'"x"'::jsonb` → raw `"\"x\""`). (refs: node-postgres#722, #1122, #2951, postgres.js#194)
- [P1][unit][impl] `buildDecoders({114: id, 3802: id})` returns a map where `decoderFor(114)` and `decoderFor(3802)` are the identity override, while unrelated OIDs keep defaults (verifies override merge does not clobber the base map — `new Map(defaultDecoders)`).

#### double-encoding footgun guard
- [P0][integration][impl] Inserting a JS object into a `jsonb` column then re-selecting yields a JS object, never a double-stringified escaped string (`'"{\\"a\\":1}"'`) — repeated over a loop and under `Promise.all` concurrent inserts on a pool. (refs: postgres.js#678, #937, #378, #379)
- [P1][integration][impl] Passing an already-stringified JSON string for a jsonb column via the **string** param path (`$1::jsonb` with `JSON.stringify(obj)`) stores a single-encoded object, not double-encoded — confirms minipg does not stringify a string a second time (string branch uses `String(v)`). (refs: postgres.js#1139, #114, #242, #872)

#### jsonb[] (array-of-json column)
- [P1][integration][impl] Inserting a JS array of objects into a `jsonb[]` column: since minipg encodes arrays via `JSON.stringify` (producing `[{...}]`, a JSON array — NOT a PG `jsonb[]` literal `{...}`), assert the **actual** outcome — direct bind to a `jsonb[]` column fails type-match / requires explicit construction. Pin minipg's real behavior and that elements are not silently doubly-escaped when the supported pattern (`$1::jsonb[]` is unsupported; `unnest` or per-element) is used. (refs: node-postgres#1588, postgres.js#784, #838)
- [P2][integration][impl] Reading a `jsonb[]` column back: it has no array decoder (arrays fall to `asString`), so it returns the raw PG array text — assert this documented limitation rather than parsed JS. (guard)

#### comparison / cast ergonomics (footgun guard)
- [P1][integration][impl] Comparing a bound value to a `json` column with `WHERE col = $1::json` fails (`operator does not exist: json = json`); the working pattern is `::jsonb` or `::text`. Assert `::jsonb` succeeds and bare/`::json` raises a clean `PgError`. (refs: node-postgres#2675)

#### out-of-scope guards
- [P2][integration][impl] No `sql\`\`` template tag / column-name transform exists, so keys inside a returned jsonb value are inherently never rewritten (e.g. `{"a_b":1}` stays `a_b`) — assert verbatim. (refs: postgres.js#983)
- [P2][unit][impl] minipg exposes no simple-query path for these types; all temporal/JSON decoding is exercised only through extended-protocol `query`/`stream`. (guard that the documented API surface is the only path)

### Fixtures & data needed
- Table `tt(id int4 primary key, ts timestamp, tstz timestamptz, d date, tm time, tmz timetz, iv interval)` seeded with edge rows: normal value, microsecond `.123456`, `infinity`/`-infinity`, BC year, 5-digit year, pre-2000.
- Table `tj(id int4 primary key, j json, jb jsonb, jba jsonb[])` plus ad-hoc `SELECT ... ::jsonb` literals for most cases.
- A role/pool for the "SET TIME ZONE on pooled client" case (reuse existing `createPool`).
- Helper to re-run a query under multiple `process.env.TZ` values (spawn subprocess or set before connect) for host-TZ-invariance assertions.
- Custom `config.types` decoders registered per-connection for override tests.

### PG-version / config sensitivities
- **DateStyle** (`SET datestyle = 'MDY' | 'YMD' | 'ISO'`): changes the **text** of returned temporal columns — string-passthrough tests must either force `ISO` (PG default) or assert against the configured style. Binding a `Date` (ISO) is DateStyle-immune.
- **TimeZone** (`SET TIME ZONE`): alters only the textual offset of `timestamptz`, not the instant; `timestamp`/`date`/`time` text is unaffected.
- **intervalstyle**: `postgres` (default) vs `iso_8601` vs `sql_standard` change interval text shape.
- **Host `TZ` env**: must be irrelevant to minipg (no Date coercion) — this is the central invariant; would matter for the [todo] Date decoders.
- **PG14–17**: jsonb output formatting is stable; `to_jsonb`/`json_build_object` numeric rendering of int8 is consistent. `timestamptz` text offset rendering (`+00` vs `+00:00`) can vary by version — assert via reparse, not exact string, where offsets are involved.
- **standard_conforming_strings**: not directly relevant (params are sent out-of-band via Bind, not interpolated), but worth a guard that backslash content in JSON text survives.

### Estimated test count
58


## Data Types — arrays, ranges, composites, custom  — scope: partial(roadmap)

This domain covers all the "non-scalar / user-extensible" PostgreSQL types: arrays (1d/multidim/NULL/quoting/empty), ranges & multiranges, enums, composite/record, domains, network (inet/cidr/macaddr), geometric, and hstore — plus the cross-cutting "all-common-types round-trip matrix" smoke. Grounded in `src/codec.ts`: `defaultDecoders` only registers bool/bytea/int2/int4/oid/float4/float8/json/jsonb, and `decoderFor` falls back to `asString` for everything else — so **arrays, ranges, composites, enums, domains-over-array, inet/cidr/macaddr, geometric, hstore, uuid, numeric[], int8[] all currently decode to the raw PostgreSQL text literal string** (e.g. `'{1,2,3}'`, `'(1,2)'`, `'a=>1'`). On encode, `encodeParam` turns any JS `object`/array into `JSON.stringify(v)` (NOT a PG array/record literal) and `Buffer` into a binary param — meaning JS-array-as-`$1` does NOT produce `{...}` today. The plan therefore tests **(a) the documented current string/JSON behavior as the baseline contract** and **(b) the roadmap opt-in decoders/encoders (`config.types` per-OID, "richer built-in type decoders (arrays/uuid/timestamptz)")** as `[todo:feature]` pending specs. Every parsing assertion is anchored to PostgreSQL's text I/O grammar.

### Test groups

#### Array decode — current string baseline (impl)
- [P0][integration][impl] `SELECT '{1,2,3}'::int4[]` (array OID 1007, not in `defaultDecoders`) decodes via `asString` fallback to the exact JS string `'{1,2,3}'`, NOT a JS array — documents the current no-array-parser contract. (refs: node-postgres#10, #125)
- [P0][integration][impl] `SELECT '{1.5,2.25}'::float8[]` decodes to the string `'{1.5,2.25}'` (element OID float8 IS a number decoder, but the array OID 1022 is not, so no recursion happens) — guards against accidental partial parsing. (refs: node-postgres#93, #131, #845)
- [P1][integration][impl] `SELECT ARRAY['a,b','c']::text[]` returns the raw literal string `'{"a,b",c}'` (PG quotes the comma element) — confirms quoting is surfaced verbatim, not pre-split. (refs: node-postgres#99)
- [P1][integration][impl] `SELECT '{1,NULL,3}'::int2[]` returns the literal `'{1,NULL,3}'` (unquoted NULL token left in the string) — baseline before todo NULL-element parsing. (refs: postgres.js#1049, #1124)
- [P2][integration][impl] `SELECT array[]::text[]` and `SELECT '{}'::int4[]` each return the string `'{}'`, never `undefined`/`null`. (refs: node-postgres#1261)

#### Array decode — opt-in / built-in array parser (todo:feature)
- [P0][integration][todo:feature] With a registered `config.types` decoder for array OID 1007, `SELECT '{1,2,3}'::int4[]` decodes to JS `[1,2,3]` (numbers via the int4 element parser). (refs: node-postgres#10, #125)
- [P0][integration][todo:feature] `'{1.5,2.25,3.75}'::float8[]` → `[1.5,2.25,3.75]` (decimals preserved, not parseInt-truncated). (refs: node-postgres#93, #131, #845)
- [P0][integration][todo:feature] `'{1.50,2.00}'::numeric[]` (OID 1231) → `['1.50','2.00']` STRINGS (mirrors the scalar numeric→string precision-safe rule in codec.ts comment), not `[1,2]`. (refs: node-postgres#304, #3094)
- [P1][integration][todo:feature] `ARRAY[1,2]::int8[]` → `['1','2']` strings by default (mirrors scalar int8→STRING); array element codec must follow the scalar setting. (refs: node-postgres#452, #614, postgres.js#837)
- [P1][integration][todo:feature] `'{a,b,c}'::varchar[]` (1015), `::"char"[]`/`bpchar[]` (1014), `::name[]` (1003) each → `['a','b','c']`. (refs: node-postgres#73, #217, #986, #2351, postgres.js#718)
- [P0][unit][todo:feature] Array-literal grammar parser: quoted element with embedded comma `'{"a,b",c}'` → `['a,b','c']`; backslash/newline preserved in a `text[]` element. (refs: node-postgres#99, #1147)
- [P0][unit][todo:feature] NULL token: `'{1,NULL,3}'` → `[1, null, 3]` (JS `null`, never `NaN` or string `'NULL'`); quoted `'{"NULL"}'` → `['NULL']` (distinct). (refs: postgres.js#1049, #1124, #800, node-postgres#1274)
- [P1][unit][todo:feature] Non-default lower-bound dimension prefix `'[0:1]={40.44,-79.95}'::float8[]` → strips `[0:1]=` and yields `[40.44,-79.95]` (first elem not NaN). (refs: node-postgres#845, #870)
- [P1][unit][todo:feature] Multi-dim `'{{1,2},{3,4}}'::int4[][]` → `[[1,2],[3,4]]`; empty `'{}'` → `[]`. (refs: node-postgres#2692, #1261, postgres.js#410)
- [P2][unit][todo:feature] Custom element delimiter: `box[]` uses `;` typdelim — `'{(1,1),(0,0);(3,3),(2,2)}'::box[]` parses to 2 elements (not split on `,`). (refs: node-postgres#3020, postgres.js#576)
- [P1][integration][todo:feature] `'{"\\x0001","\\x0203"}'::bytea[]` → array of two `Buffer`; `ARRAY['{"a":1}']::jsonb[]` → `[{a:1}]`. (refs: node-postgres#738, #775)
- [P2][integration][todo:feature] A custom array-type parser supplied in `config.types` overrides the built-in array parser rather than being ignored. (refs: postgres.js#577)

#### Array encode — current JSON.stringify baseline & footgun guard (impl)
- [P0][integration][impl] `encodeParam(['a','b','c'])` hits the `typeof v === 'object'` branch → `JSON.stringify` = `'["a","b","c"]'`; binding this to a `text[]` column FAILS server-side with `malformed array literal` (SQLSTATE 22P02) — documents that JS-array-as-`$1` is NOT yet a PG array literal. (refs: node-postgres#3041, #3319, postgres.js#741)
- [P1][integration][impl] Today's working pattern: bind the array as text and cast — `SELECT $1::int4[]` with `$1 = '{1,2,3}'` (a string) succeeds; this is the supported escape hatch until array encode lands. (refs: node-postgres#10)
- [P1][unit][impl] `encodeParam([1n,2n])` (bigint elements) — bigint is not object/Buffer/Date/bool, falls to `String(v)` only at top level; an array of bigints goes through `JSON.stringify` which THROWS on BigInt (`TypeError: Do not know how to serialize a BigInt`) — guard/document this current limitation. (refs: postgres.js#837)

#### Array encode — opt-in array-literal serializer (todo:feature)
- [P0][integration][todo:feature] JS `['a','b','c']` bound to `text[]` serializes to `{a,b,c}` and round-trips to `['a','b','c']`. (refs: node-postgres#3041, #3319, postgres.js#741)
- [P0][integration][todo:feature] Null elements: `['A', null, 'B']` → `{A,NULL,B}` (no "cannot read of null" throw); empty `[]` → `{}`. (refs: postgres.js#371, #377)
- [P1][integration][todo:feature] Quoting on encode: `['hello world','a,b','','has"quote']` → `{"hello world","a,b","","has\"quote"}` and round-trips byte-exact. (refs: postgres.js#371, node-postgres#1147)
- [P1][integration][todo:feature] Nested JS `[['a'],['b']]` → `{{a},{b}}` for `text[][]`, round-trips. (refs: node-postgres#2692, postgres.js#410)
- [P1][integration][todo:feature] UUID-string array `['<uuid1>','<uuid2>']` bound to `uuid[]` serializes as a uuid array (not one comma-joined string). (refs: node-postgres#2268, postgres.js#1029)
- [P2][integration][todo:feature] Bulk insert `INSERT ... SELECT * FROM UNNEST($1::text[], $2::int4[])` with two JS arrays inserts one row per index. (refs: node-postgres#1644, #3292, postgres.js#452)
- [P2][integration][todo:feature] `= ANY($1::int4[])` membership: `WHERE id = ANY($1)` with `$1=[1,2,3]` returns matching rows (valid `integer[]`/`int4[]` cast token). (refs: node-postgres#3365)

#### Range & multirange (todo:feature + impl baseline)
- [P0][integration][impl] `SELECT '[1,10)'::int4range` decodes via `asString` to the literal string `'[1,10)'` (range OID 3904 not registered) — baseline. (refs: postgres.js#319)
- [P1][integration][impl] Empty `'empty'::tsrange` and unbounded `'[2020-01-01,)'::tsrange` round-trip as their literal strings; `SELECT lower($1::tsrange), upper($1::tsrange), lower_inc(...), upper_inc(...)` lets the test assert bounds/inclusivity server-side. (refs: postgres.js#319)
- [P0][integration][impl] Range-operator type-inference footgun: `SELECT $1::tstzrange @> $2` with `$2` = JS `Date` — `encodeParam(Date)` sends ISO text (format 0); with explicit `$2::timestamptz` (or the `@>` resolving the param as timestamptz) it returns boolean, must NOT raise 22P02 "malformed range literal". (refs: node-postgres#2219)
- [P0][integration][impl] `SELECT daterange('2020-01-01','2020-12-31') @> $1::date` with `$1` = JS Date returns true inside / false outside; boundary `[2020-01-01,2020-12-31)` → `2020-01-01`=true, `2020-12-31`=false (explicit `::date` cast required — daterange element is `date`). (refs: node-postgres#2219)
- [P2][integration][impl] Explicit param cast `$1::timestamptz` overrides any range heuristic — user can always disambiguate. (refs: node-postgres#2219)
- [P1][integration][todo:feature] Registered range decoder for `int4range` → structured `{lower:1, upper:10, lowerInc:true, upperInc:false}` (or driver-documented shape) and re-encodes to `[1,10)`. (refs: postgres.js#68, #319)
- [P2][integration][todo:feature] `int4multirange` `'{[1,5),[10,20)}'` decodes to an array of ranges under an opt-in multirange decoder (PG14+). (refs: postgres.js#319)

#### Enum (impl + todo:feature)
- [P0][integration][impl] `CREATE TYPE mood AS ENUM('sad','ok','happy')`; inserting `$1='happy'` (sent as text via `String(v)`) into `t(m mood)` then `SELECT m` returns the exact JS string `'happy'` (enum OID falls back to `asString`) — scalar enum already round-trips. (refs: postgres.js#197)
- [P0][integration][impl] `SELECT 'sad'::mood` → `'sad'` (unknown enum OID defaults to text decode, no throw). (refs: postgres.js#197)
- [P1][integration][impl] `mood[]` column: today binding JS `['happy','sad']` fails (`JSON.stringify` → not a PG literal); the working path is `SELECT $1::mood[]` with `$1='{happy,sad}'` string → reads back the raw string `'{happy,sad}'`. (refs: postgres.js#197)
- [P1][integration][todo:feature] With array encode + enum-array decode: JS `['happy','sad']` → `mood[]` round-trips to `['happy','sad']`; empty `[]` → `[]`; `['happy',null]` → `{happy,NULL}` preserves null at index. (refs: postgres.js#197)
- [P2][integration][todo:feature] Enum labels needing quoting (`'very happy'`, `'a,b'`) round-trip exactly through `mood[]` encode (proper double-quoting). (refs: postgres.js#197)
- [P2][integration][todo:feature] Server-built `ARRAY['ok','happy']::mood[]` decodes to `['ok','happy']` — exercises dynamic array-OID→element-enum-OID resolution. (refs: postgres.js#197, #944, #1479)

#### Composite / record (impl + todo:feature)
- [P0][integration][impl] `CREATE TYPE complex AS (r float8, i float8)`; `SELECT ROW(1,2)::complex` decodes (no composite parser registered) to the raw literal string `'(1,2)'`, NOT `{r:1,i:2}` — current contract. (refs: node-postgres#1127, #419)
- [P0][integration][impl] Row-expression footgun: `SELECT (a,b) FROM t` returns exactly ONE `record` column whose value is the literal string `'(<a>,<b>)'`, while `SELECT a,b FROM t` returns TWO columns — the two must not be conflated (verify via field-descriptor count). (refs: node-postgres#3529, #1652)
- [P1][integration][impl] `encodeParam({r:1,i:2})` → `JSON.stringify` = `'{"r":1,"i":2}'`; binding to a `complex` param FAILS (not a `(...)` record literal) — documents no composite encode yet. Working path: bind `$1='(1,2)'` text with `$1::complex`. (refs: node-postgres#1469, #2391)
- [P1][unit][todo:feature] Record decode grammar: `("a,b","he said ""hi""",,42)` → `['a,b','he said "hi"', null, '42']` (empty unquoted slot = SQL NULL; `""`→`"`). (refs: node-postgres#1127, #587)
- [P1][integration][todo:feature] Registered composite decoder for `complex` → `{r:1, i:2}` with each field type-parsed (float8 field → number, bool field → JS true not `'t'`). (refs: node-postgres#1127, #419, postgres.js#68)
- [P1][integration][todo:feature] Composite encode: `{r:1,i:2}` (or `[1,2]`) → `(1,2)`, round-trips; string field `'a,b'` → `("a,b")`, JS `null` field → empty slot. (refs: node-postgres#1469, #755, #2391)
- [P2][integration][todo:feature] `array_agg(t)::complex[]` decodes to an array of structured objects (array-of-record nesting). (refs: node-postgres#1487)

#### Domain (impl + todo:feature)
- [P0][integration][impl] `CREATE DOMAIN posint AS integer CHECK(VALUE>0)`; PG reports the BASE OID (int4=23) on the wire, so `SELECT id FROM t(id posint)` with value 5 decodes to JS number `5` via the existing int4 decoder — domain decode already works, no resolution needed (server collapses to base). (refs: node-postgres#2696)
- [P0][integration][impl] `CREATE DOMAIN email AS text`; insert `'a@b.com'`, select → `'a@b.com'` via base text decoder. (refs: node-postgres#2696)
- [P1][integration][impl] CHECK violation: inserting `-1` into `posint` surfaces as PgError SQLSTATE `23514` (check_violation), connection returns to ready (per lifecycle contract), not a crash. (refs: node-postgres#2696)
- [P1][integration][impl] `CREATE DOMAIN mydom AS text`: a `config.types` parser registered on the BASE OID (text/25) FIRES for a `mydom` column (server reports OID 25); a parser keyed on the domain's own OID does NOT fire — document this real semantics (corrected from the issue's wish). (refs: postgres.js#719)
- [P0][integration][todo:feature] ENCODE-side domain footgun: `CREATE DOMAIN strarr AS text[]`; binding JS `['a','b','c']` must serialize to `{a,b,c}` (driver must recognize a domain-over-array as an array for serialization) so INSERT succeeds and reads back `['a','b','c']` — must NOT fail 22P02 malformed array literal. (refs: postgres.js#592)
- [P2][integration][todo:feature] Domain-over-domain (`a AS int`, `b AS a`) decodes/encodes identically to integer (server resolves transitively to OID 23). (refs: postgres.js#592, #719)

#### Network types — inet / cidr / macaddr (the MISSING family) (impl + todo:feature)
- [P0][integration][impl] `SELECT '192.168.0.1'::inet` (OID 869, unregistered) → raw string `'192.168.0.1'`; `'10.0.0.0/8'::cidr` (650) → `'10.0.0.0/8'`; `'08:00:2b:01:02:03'::macaddr` (829) → that string; `macaddr8` (774) likewise — baseline string contract for the gap-analysis MISSING family.
- [P1][integration][impl] inet round-trip via param: `$1='192.168.0.1'` with `$1::inet` then `SELECT host($1::inet)` returns `'192.168.0.1'`; binding a JS string works (no object branch).
- [P1][integration][impl] IPv6 `'2001:db8::1'::inet` and inet with netmask `'192.168.1.5/24'::inet` decode to their exact text representation (netmask suffix preserved for inet, normalized for cidr). 
- [P2][integration][impl] `inet[]` `'{192.168.0.1,10.0.0.1}'::inet[]` → raw string (array decode also unregistered).
- [P2][integration][todo:feature] Opt-in inet decoder parses to `{address, netmask/prefix, family}` structured form (documented shape), round-trips.

#### Geometric types (impl + todo:feature)
- [P0][integration][impl] `SELECT '(1,2)'::point` (OID 600) → raw string `'(1,2)'`; `box`/`circle`/`lseg`/`polygon`/`path`/`line` likewise decode to their text literal strings. (refs: postgres.js#759)
- [P1][integration][impl] Param insert: `$1='(1,2)'` with `$1::point` round-trips; `$1='(2,2),(0,0)'` with `$1::box`, and `WHERE col <@ $1::box` returns geometrically-contained rows (proves correct literal, not string-eq). (refs: node-postgres#2073, #1411, #1703)
- [P1][integration][impl] Negative case: binding a JS object `{x:1,y:2}` to a point param → `JSON.stringify`=`'{"x":1,"y":2}'` → server rejects 22P02 `invalid input syntax for type point` (documents current no-encoder contract). (refs: node-postgres#1411, #1703)
- [P1][unit][impl] Field descriptor exposes the column type OID: a `point` column reports `dataTypeID === 600` in the row/field description (enables consumer-side geometry routing). (refs: node-postgres#3153, #1514)
- [P2][integration][impl] PostGIS `geometry` column with no client casting returns the raw WKB hex string (e.g. `'0101000000...'`) exactly, not auto-converted GeoJSON. (refs: node-postgres#1514, postgres.js#503)
- [P2][integration][todo:feature] Opt-in point decoder → `{x:1,y:2}` symmetric with an encoder that accepts `{x,y}`→`(1,2)` (round-trip identity); box/circle/lseg/polygon get stable documented shapes. (refs: postgres.js#759)

#### hstore (extension, dynamic OID) (todo:feature)
- [P0][integration][impl] Without a registered hstore decoder, `SELECT 'a=>1, b=>2'::hstore` → raw string `'"a"=>"1", "b"=>"2"'` (dynamic OID unregistered) — baseline. (refs: node-postgres#140)
- [P1][unit][todo:feature] hstore parser: `'a=>1, b=>2'` → `{a:'1', b:'2'}` (all values strings); `''` → `{}`; `'k=>v'` → `{k:'v'}`. (refs: node-postgres#140)
- [P1][unit][todo:feature] Quoting: `'"key with spaces"=>"value, with => comma"'` → `{'key with spaces':'value, with => comma'}` (embedded `,`/`=>` inside quotes not delimiters). (refs: node-postgres#140)
- [P1][unit][todo:feature] NULL semantics: `'a=>NULL'` → `{a:null}`; quoted `'a=>"NULL"'` → `{a:'NULL'}` (distinct). (refs: node-postgres#140)
- [P2][integration][todo:feature] Round-trip: JS `{a:'1', b:'two words', c:null}` bound as hstore param reads back equal; value with quotes/backslash/`=>` survives. (Pin `standard_conforming_strings=on`.) (refs: node-postgres#140)
- [P2][integration][todo:feature] Dynamic OID resolution: driver looks up `SELECT oid FROM pg_type WHERE typname='hstore'` and applies the parser; `hstore[]` decodes element-wise. (refs: node-postgres#140)

#### Custom-type registration & scope isolation (impl + todo:feature)
- [P0][unit][impl] `buildDecoders({1700: fn})` returns a NEW map (copy of `defaultDecoders` + override) — registering numeric decoder on connection A's config must NOT mutate `defaultDecoders` or affect connection B (no global singleton). (refs: node-postgres#1838, #2363, #2364, #676)
- [P1][integration][impl] `decoderFor(oid, map)` always returns a callable (falls back to `asString`), never `undefined`, even with no overrides — guards the decode loop. (refs: node-postgres#1175)
- [P1][integration][impl] A registered decoder for OID 3802 (jsonb) is invoked for every row of a multi-row result; output is the parser's value not the raw string. (refs: node-postgres#1225, #626, #3309)
- [P1][integration][impl] A parser returning a non-primitive object (e.g. BigNumber for numeric 1700) yields that instance unchanged in result rows. (refs: node-postgres#3255)
- [P2][unit][impl] Custom decoder receives the raw column `Buffer` (codec `Decoder` signature is `(b: Buffer)=>...`), and `b.toString('utf8')` gives the raw text (e.g. `'3.14'`), never a pre-split array. (refs: postgres.js#421)
- [P1][integration][todo:feature] Per-query `types` override applies only to that query; the next query on the same connection uses defaults. (refs: node-postgres#1810, #2686)
- [P2][integration][todo:feature] Custom SERIALIZER (encode hook) for a type/OID is invoked on the bind path — currently `encodeParam` has no per-OID hook, so this is a roadmap gap (postgres.js#341 numeric-serializer-never-called). (refs: postgres.js#341, node-postgres#3302, postgres.js#1041)
- [P2][integration][todo:feature] Disable-parsing escape hatch: all columns returned as raw text strings (no JSON.parse/Number) — overlaps `mode:'raw'`/`'buffer'`; assert `mode:'buffer'` returns `(Buffer|null)[][]` so callers can self-parse. (refs: node-postgres#2093, #2596)
- [P2][integration][todo:feature] pgvector end-to-end: register `vector` by name (dynamic OID from catalog); JS number array → `[1,2,3]` literal (brackets, no `{}` braces) inserts, and reads back to the equal JS array. (refs: postgres.js#583, #1041, #1115, node-postgres#3351)

#### ALL-COMMON-TYPES round-trip matrix (smoke) (impl)
- [P0][integration][impl] For each scalar that HAS a decoder (bool/16, bytea/17, int2/21, int4/23, oid/26, float4/700, float8/701, json/114, jsonb/3802): `SELECT $1::T` round-trips a representative value to the documented JS type (bool→boolean, bytea→Buffer, int2/4→number, float→number, json/jsonb→parsed). One parametrized case per OID. (refs: codec.ts defaultDecoders)
- [P0][integration][impl] For each STRING-default scalar (int8/20, numeric/1700, text/25, varchar/1043, uuid/2950, timestamp/1114, timestamptz/1184, date/1082, time/1083, interval/1186): `SELECT $1::T` returns the exact text representation as a JS string (precision-safe int8/numeric per codec.ts comment). One case per OID. (refs: codec.ts comment lines 1-4, 16-17)
- [P0][integration][impl] NULL column: `SELECT NULL::T AS a` for each T → `row.a === null` (strictly null, key present `'a' in row`), distinct from falsy `0`/`''`. (refs: node-postgres#1274)
- [P1][integration][impl] Param NULL symmetry: `INSERT ... VALUES($1) RETURNING col` with JS `null` → `encodeParam` returns `{format:0, bytes:null}` → reads back `null`. (refs: node-postgres#1274)
- [P1][integration][impl] `= ANY($1::T[])` membership for each scalar T using a STRING array literal param (`$1='{...}'`) — works today via text cast; one case per representative type. (refs: gap-analysis matrix)
- [P2][integration][impl] NUL-byte guard: a param value containing `\0` (e.g. `'a\0b'` for text, or inside an array literal string) is rejected client-side by `encodeParam` with "parameter contains NUL byte" before hitting the socket. (refs: codec.ts line 52)
- [P2][integration][impl] Buffer param: passing a JS `Buffer` to a `bytea` param uses the BINARY format (format:1) path in `encodeParam` and round-trips byte-exact. (refs: codec.ts line 47)

#### Out-of-scope guard
- [P2][integration][impl] `sql\`...\`` template tag is absent — driver exposes `query(sql, params)` only; assert no `sql` tag export / a template-style call is not supported.
- [P2][integration][impl] Simple-query protocol multi-statement (`SELECT 1; SELECT 2`) is roadmap/out-of-scope for the extended-protocol `query()`; assert it errors cleanly (single-statement extended protocol) rather than silently returning partial results. (refs: roadmap simple-query)

### Fixtures & data needed
- Extensions: `CREATE EXTENSION IF NOT EXISTS hstore;` (dynamic OID); optionally PostGIS (`postgis`) and `vector` — tests guard/skip if extension absent.
- Types: `CREATE TYPE mood AS ENUM('sad','ok','happy')` (+ a label-with-quoting variant); `CREATE TYPE complex AS (r float8, i float8)`; a named composite for array_agg.
- Domains: `posint AS integer CHECK(VALUE>0)`, `email AS text`, `mydom AS text`, `strarr AS text[]`, `intarr AS int[]`, plus chained `a AS int`/`b AS a`.
- Tables: `t_arr(a int4[], tags text[], grid text[][])`, `t_enum(m mood, arr mood[])`, `t_comp(c complex)`, `t_dom(id posint, tags strarr)`, `t_net(ip inet, net cidr, mac macaddr)`, `t_geo(p point, b box)`, `t_hstore(h hstore)`.
- A PL/pgSQL function returning a composite / `SETOF RECORD` and one taking a `tsrange` arg (for range-binding tests).
- Two independent `Connection`s (and a `Pool`) to assert decoder-registry isolation.
- Server settings pinned per-test where relevant: `standard_conforming_strings=on`, known `DateStyle`, `bytea_output=hex`.

### PG-version / config sensitivities
- **Multiranges** (`int4multirange`, etc.) exist only in PG14+ — gate those specs.
- **`standard_conforming_strings`**: hstore backslash-escaping expected values shift with this setting (corrected per the hstore section); pin to `on` and assert.
- **`bytea_output`**: `asBytea` in codec.ts only handles the `\x` hex form (`s.startsWith('\\x')`); under legacy `bytea_output=escape` it would mis-decode — add a guard test asserting hex output is assumed (default since PG9.0), and a baseline that escape-mode bytea is NOT handled.
- **`DateStyle`** affects timestamp/date/interval text — the string-baseline matrix must pin DateStyle (default ISO) so expected strings are stable; relevant to range bound assertions too.
- **OID stability**: built-in array OIDs (1007/1015/1231/...) and scalar OIDs are stable across PG14-17; enum/composite/domain/hstore OIDs are dynamic per-DB and must be resolved via `pg_type` at runtime, not hardcoded.
- **Binary vs text default**: codec decoders assume TEXT format (text I/O grammar). If the driver ever opts a result into binary, none of these text-grammar decoders apply — assert default is text for these types.
- **PostGIS/pgvector**: dynamic OIDs and extension presence; skip cleanly when not installed.
- **`password_encryption`** is irrelevant here (auth domain) — not applicable.

### Estimated test count
78


## Errors & Notices  — scope: partial(roadmap)

Tests how minipg surfaces server `ErrorResponse` ('E') and `NoticeResponse` ('N'), connection/protocol faults, and internal decode failures. Grounded in source: every SQL error becomes a `PgError extends Error` (`src/errors.ts`) whose `.code` is the SQLSTATE; ALL protocol error fields are decoded (`parseErrorFields`: severity/severityLocal/code/message/detail/hint/position/internalPosition/internalQuery/where/schema/table/column/dataType/constraint/file/line/routine) and copied onto the instance via `Object.assign`, making them own-enumerable. There is **no EventEmitter** anywhere — errors are delivered ONLY by promise rejection (in-flight query, or all queued + in-flight on socket fatal); `NoticeResponse` and `NotificationResponse` ('A') are **silently dropped** (`connection.ts` `case 'N'/'A': return`). Known deviations to pin down: `.name === 'PgError'` (not `'DatabaseError'`), `.position` stays a STRING, no SQLSTATE constants / driver-error subclass, no `.cause` on termination, and a decoder thrown inside a type parser escapes the socket `'data'` handler uncatchably (decode happens outside the `onData` try/catch).

### Test groups

#### PgError object shape & field contract
- [P0][integration][impl] Duplicate-PK `INSERT` rejects with `e instanceof PgError`, `e.code === '23505'`, and string `e.detail`, `e.constraint`, `e.table`, `e.schema`; `e.column` is `undefined` (PG omits it for unique violations). (refs: node-postgres#1602, node-postgres#1697, postgres.js#675)
- [P0][integration][impl] NOT-NULL violation (`23502`) exposes `e.column`, `e.table`, `e.schema` populated; check violation (`23514`) and FK violation (`23503`) expose `e.constraint`/`e.table`/`e.detail`. (refs: node-postgres#701, node-postgres#978, node-postgres#1961)
- [P0][integration][impl] Syntax error (`SELECT * FROM`) → `e.code === '42601'` and `e.position` is present and a numeric-string that 1-indexes into the SQL text. GUARD the deviation: `typeof e.position === 'string'` (minipg does NOT coerce to number). (refs: node-postgres#2025, node-postgres#2484, node-postgres#1619)
- [P0][integration][impl] `e.message` equals the server text (e.g. `relation "x" does not exist`); `RAISE EXCEPTION 'boom'` yields `e.message === 'boom'` and `e.code === 'P0001'`. (refs: node-postgres#186, node-postgres#596, node-postgres#2760)
- [P1][integration][impl] `e.severity === 'ERROR'` and `e.severityLocal` decoded ('S' field); both present. (refs: node-postgres#318)
- [P1][unit][impl] `JSON.stringify(err)` and `console.log` round-trip include `code`, `message`, `severity`, `detail`, `constraint` (Object.assign makes them own-enumerable, including `message` which is re-set as an enumerable own prop) — NOT `{}`. (refs: node-postgres#347, node-postgres#318, postgres.js#696, postgres.js#767)
- [P2][integration][impl] Error fields the server does NOT send are `undefined` (syntax error has no `.constraint`/`.table`/`.column`); no stray empty-string fields. (NULL/absent-field handling)

#### SQLSTATE coverage across error classes
- [P0][integration][impl] Missing relation → `42P01`; missing column → `42703`; unknown function → `42883`. (refs: node-postgres#2077, node-postgres#1320, node-postgres#1662)
- [P0][integration][impl] `CREATE TABLE` of existing table → `42P07` (duplicate_table). (refs: node-postgres#736, node-postgres#919)
- [P0][integration][impl] Integer overflow (`SELECT 2147483647::int + 1`) → `22003`; bad text→int (`SELECT 'NaN'::int` / param `'stock'` into int col) → `22P02`. (refs: node-postgres#2752, node-postgres#2310, node-postgres#2730, node-postgres#18, node-postgres#885)
- [P1][integration][impl] Division by zero → `22012`; string-into-int via bound `$1` param surfaces server `22P02`, never silently. (refs: node-postgres#18, node-postgres#885)
- [P1][integration][impl] In aborted transaction: `BEGIN`; failing stmt; next stmt → `25P02` (in_failed_sql_transaction); `ROLLBACK` then recovers. (matches FOCUS: 25P02)
- [P2][integration][impl] `e.code` is consistently the SQLSTATE on EVERY path (there is no `.sqlState` alias) — assert `e.sqlState === undefined`. (refs: node-postgres#938, node-postgres#972)

#### Error-class identity & exports
- [P0][unit][impl] Server error is `instanceof Error` AND `instanceof PgError`; `PgError` is exported from `src/index.ts` main entry. (refs: node-postgres#50, node-postgres#2340, postgres.js#226)
- [P1][unit][impl] DEVIATION GUARD: `e.name === 'PgError'` (issue cluster expects `'DatabaseError'`; document that minipg uses `'PgError'`). `e.stack` is a non-empty string. (refs: node-postgres#2606, node-postgres#50)
- [P1][integration][impl] DEVIATION GUARD: client/driver-level errors (NUL-byte param/SQL, `query()` after `end()`) are PLAIN `Error` with NO machine-readable `.code` and are NOT `instanceof PgError` — document the gap. (refs: node-postgres#2722, node-postgres#3380, postgres.js#1140)
- [P2][unit][todo:feature] Exported SQLSTATE name constants equal runtime `e.code` values — NOT implemented; pending spec. (refs: node-postgres#2660)
- [P2][unit][todo:feature] Distinct driver-error subclass with stable `.code` (e.g. `UNDEFINED_VALUE`, `CONNECTION_CLOSED`) — NOT implemented; pending spec. (refs: node-postgres#2722, postgres.js#450)

#### Catchable propagation — promise-only, never uncatchable
- [P0][integration][impl] `await conn.query('select * from no_such')` rejects exactly that promise with `42P01`; no `unhandledRejection`, no process exit (there is no EventEmitter/`'error'` path to leak to). (refs: node-postgres#2156, node-postgres#2077, postgres.js#37)
- [P0][integration][impl] `query()` after `end()` (state `closed`) rejects with catchable `Error('connection is closed')`, does not throw synchronously. (refs: node-postgres#2272, node-postgres#2691)
- [P0][chaos][impl] Connection killed mid-query (`pg_terminate_backend` from a 2nd conn, or server restart) rejects the in-flight query with `Error('connection terminated unexpectedly')` and process stays alive — no listener attached. (refs: node-postgres#2191, node-postgres#2190, node-postgres#795, postgres.js#854)
- [P0][chaos][impl] Socket `fatal` rejects the in-flight task AND every queued task (fill queue with N queries, drop socket → all N promises reject with same error). (refs: node-postgres#2514, postgres.js#37)
- [P1][integration][impl] Connection-level system errors are distinguishable from SQL errors: bad port → `connect()` rejects with `ECONNREFUSED`/`ETIMEDOUT`/`ENOTFOUND` plain Error (no SQLSTATE); SQL failure carries `.code`. (refs: node-postgres#1705, node-postgres#1416, node-postgres#3334)
- [P1][integration][impl] Error delivered EXACTLY once: a failing query's promise settles once (rejected), never also resolved; subsequent `Z` does not double-fire. (refs: node-postgres#547, node-postgres#565, node-postgres#590)
- [P1][integration][impl] `conn.end()` called from inside a query's `catch` handler closes cleanly without throwing. (refs: node-postgres#1191, node-postgres#1841)
- [P2][chaos][todo:feature] "Unexpected termination" error carries the underlying socket error as `.cause` — NOT implemented (minipg builds a fresh `Error('connection terminated unexpectedly')`); pending. (refs: node-postgres#3621, node-postgres#2522)

#### Type-parser / decode failure (footgun guard)
- [P0][chaos][todo:feature] BUG GUARD: a custom `config.types` decoder that THROWS while decoding a `DataRow` currently propagates out of the socket `'data'` handler (decode runs in `handle`→`dataRow`→`makeRow`, OUTSIDE `onData`'s try/catch) → uncatchable. Spec: it MUST reject the query promise instead. Mark failing/pending. (refs: node-postgres#1204, node-postgres#1241, node-postgres#549)
- [P1][integration][impl] A row value larger than V8 max string (`0x1fffffe8`) — `buffer`/`raw` mode returns Buffer fine; `object`/`array` text decode of an oversized text cell should reject the query, not throw uncatchably (currently same footgun path — document). (refs: node-postgres#2653)

#### Error during prepare / bind (named statements)
- [P0][integration][impl] Parse failure on a named prepared statement (invalid SQL) rejects with the server `42601`/`42P01`; the bad name is NOT cached (`prepared` only set on `T`/`n`), so re-issuing the same name with valid SQL succeeds. (refs: postgres.js#923, postgres.js#1068)
- [P1][integration][impl] Bind failure (wrong param type for a valid prepared stmt) → `22P02`/`42804` rejects; connection recovers; the cached statement remains reusable. (refs: node-postgres#2467)
- [P1][integration][impl] Re-using a cached name with DIFFERENT SQL triggers `Close`+re-`Parse`; if the new SQL errors, the promise rejects and stale entry is removed. (named-prepared footgun)

#### NOTICE / WARNING / NotificationResponse handling (DOCUMENTED: dropped)
- [P0][integration][impl] DOCUMENTED BEHAVIOR: a query whose function does `RAISE NOTICE`/`RAISE WARNING`/`RAISE INFO` still RESOLVES normally with correct rows; the notice is silently dropped (`case 'N': return`) — nothing thrown, nothing printed to stdout/stderr, no result field. Assert resolution + capture stdout/stderr empty. (refs: node-postgres#716, node-postgres#737, node-postgres#752, postgres.js#546, postgres.js#1063)
- [P1][integration][impl] `CREATE TABLE IF NOT EXISTS` on an existing table and `TRUNCATE ... CASCADE` (emit NOTICE) complete successfully with notices dropped and no console noise. (refs: node-postgres#3358, node-postgres#2006)
- [P2][unit][todo:feature] `onnotice`/notice-handler surfacing (structured `{message,severity}`, never an `Error`, silenceable) — NOT implemented; pending. Also: notices correlated onto the result object — pending. (refs: node-postgres#1034, node-postgres#1842, node-postgres#1226, postgres.js#646)
- [P1][integration][impl] OUT-OF-SCOPE GUARD: `NOTIFY chan, 'x'` from another session is ignored (`case 'A': return`); a query issued after it returns correctly (no LISTEN/NOTIFY surfacing). (refs: out-of-scope: LISTEN/NOTIFY)

#### Connection state integrity & recovery after error
- [P0][integration][impl] After a constraint error (`23505`) the SAME `Connection` answers the next query correctly (not permanently closed; `Z` → `finishTask` → `processQueue`). (refs: node-postgres#3104)
- [P0][integration][impl] Error mid-STREAM: a stream that fails partway (e.g. `SELECT 1/(g-3) FROM generate_series(1,10) g` → `22012` after some rows) rejects the consumer's `next()`; the NEXT query on that connection returns the full correct result set (no leaked row state — fresh `Task.rows`). (refs: postgres.js#1119)
- [P1][integration][impl] Partial rows in BUFFERED mode: a query that errors after emitting some DataRows rejects (rows discarded, not partially resolved). (FOCUS: error after partial rows)
- [P1][integration][impl] Stream consumer already iterated N rows then the query errors — earlier rows are observable but the iterator terminates by throwing the PgError; connection still usable. (FOCUS: error after partial rows in stream mode)
- [P2][integration][impl] Constraint violation inside a CTE (`WITH ... INSERT`) and a type-mismatched `UPDATE ... SET` reject with the proper SQLSTATE, not swallowed. (refs: node-postgres#2467, node-postgres#2624)

#### Protocol / startup / malformed-frame robustness
- [P0][chaos][impl] Connecting to a non-Postgres service (HTTP/MySQL port) rejects `connect()` (parser throws → `onData` catch → `fatal`) without a synchronous `TypeError`/assertion in the data handler. (refs: node-postgres#2168, node-postgres#2627, postgres.js#250)
- [P1][integration][impl] `ErrorResponse` during startup (nonexistent database → `3D000`; too-many-connections → `53300`; `database system is starting up` → `57P03`) rejects the `connect()` promise via `fatalConnect`, not a crash. (refs: postgres.js#52, postgres.js#1086, node-postgres#383)
- [P1][unit][impl] `parseErrorFields` on a TRUNCATED/malformed 'E' body (missing trailing `\0`, unknown field byte) returns a partial object without throwing; unknown field bytes are kept under their raw single-char key. (refs: node-postgres#1708, node-postgres#2922, node-postgres#2005)
- [P2][unit][impl] `parseErrorFields(Buffer.alloc(0))` and a body of just `\0` return `{}`; `new PgError({})` has `message === 'PostgreSQL error'`. (empty/NULL input handling)
- [P2][integration][impl] Empty query string (`''` / whitespace) resolves cleanly (EmptyQueryResponse 'I' hits `default: return`, then `Z`) — `rows: []`, `command: null` — does NOT crash (historical `handleEmptyQuery` bug). (baseline footgun)

#### Internal out-of-order / null-state guards
- [P1][chaos][impl] After an error, a stray `CommandComplete`/`DataRow`/`RowDescription` with `current === null` is ignored (`if (this.current)` / `if (!t) return`) — no null-reference crash or loop; driven by issuing back-to-back errored queries. (refs: node-postgres#87, node-postgres#949, node-postgres#2705, postgres.js#216)
- [P2][unit][impl] Building a `PgError` for a severed-connection/duplicate-key case does not throw on redefining `message`/`code` (Object.assign over Error) — the real error propagates. (refs: postgres.js#854, postgres.js#675, postgres.js#896)

#### Stack-trace quality (roadmap)
- [P2][integration][todo:feature] Error from `query()` includes a stack frame at the application call site (not only `errors.ts`/`connection.ts` internal frames) — NOT implemented (PgError built inside `handle`, async boundary); pending capture-at-call-site. (refs: node-postgres#1762, node-postgres#2470, node-postgres#3313, postgres.js#963)

### Fixtures & data needed
- A table with a PRIMARY KEY (for 23505), a NOT NULL column (23502), a CHECK constraint (23514), an FK referencing it (23503), and an `int` column (22P02/22003) — seed 1-2 rows.
- A PL/pgSQL function or `DO` block doing `RAISE EXCEPTION 'boom'` (P0001) and one doing `RAISE NOTICE/WARNING/INFO` (notice-drop tests).
- Two connections (one to run `pg_terminate_backend(pid)` against the victim's `backendKey.pid`) for chaos drop tests.
- A throwing custom decoder via `config.types` for the type-parser footgun.
- A non-Postgres listener (raw TCP echo / HTTP) on a known port for protocol-mismatch test.
- Roles for auth-error path already exist (smoke.ts: md5user/scramuser) → 28P01 wrong-password is covered in Auth domain; reference only.
- stdout/stderr capture helper to assert notices are not printed.

### PG-version / config sensitivities
- `client_min_messages`: NOTICE/WARNING/INFO are client-delivered by default; LOG-level (e.g. `auto_explain`) is NOT delivered unless lowered to `log` — but since minipg DROPS all notices anyway, these tests only assert non-crash/non-print, so version-insensitive.
- Constraint-error verbose fields (schema/table/column/constraint) are 9.3+ — present on all supported PG14-17.
- SQLSTATE strings (23505/42P01/22P02/25P02/...) are stable across PG14-17.
- `RAISE EXCEPTION` default SQLSTATE is `P0001` across versions.
- Integer-overflow/division-by-zero messages differ textually across versions — assert on `.code`, not `.message`, for those.
- `standard_conforming_strings`/`bytea_output` affect codec, not error codes — out of this domain.

### Estimated test count
44


## Transactions — scope: partial(roadmap)

minipg has no transaction abstraction: transactions are driven entirely by issuing raw `BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT` through `query()` on a connection. The atomic unit is one `Connection` (one query in flight, others queue — `connection.ts:200-229`), so a transaction MUST own a dedicated connection obtained via `pool.connect() -> {client, release}` (`pool.ts:60-63`); `pool.query()` acquires+releases per call and can never span a transaction. Critically, the driver parses the `ReadyForQuery` (`Z`) message but **discards the transaction-status byte** (`connection.ts:151` calls `ready()` ignoring `body[0]` = `I`/`T`/`E`), and `pool.release()` (`pool.ts:38-43`) does **no** ROLLBACK / `DISCARD ALL` / session reset — it pushes the connection straight back to idle. Extended-protocol-only (every `query()` does Parse/Bind/Execute/Sync, `connection.ts:219-220`) means semicolon-joined multi-statement strings and the simple-query implicit-transaction semantics are not available. `begin()` sugar and pooled session-state reset are roadmap [todo].

### Test groups

#### Happy-path transaction lifecycle (baseline)
- [P0][integration][impl] `pool.connect()` -> on `client`: `BEGIN`, `INSERT INTO tx(v) VALUES($1)`, `COMMIT`; after release a fresh `SELECT count(*)` sees the row persisted. Asserts the dedicated-connection path commits.
- [P0][integration][impl] `BEGIN`, `INSERT`, `ROLLBACK` on one client; subsequent `SELECT` on another connection sees zero rows (work undone). (refs: node-postgres#1859)
- [P0][integration][impl] Each of `BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT s` returns a `QueryResult` with `command` set to the verb and `rowCount` null; `rows` empty. Baseline result-shape for control statements.
- [P1][integration][impl] After a successful `ROLLBACK`, a subsequent `BEGIN` on the same client starts a fresh usable transaction (no lingering `25P02`); connection is reusable. (refs: node-postgres#2145)
- [P1][integration][impl] Full `BEGIN/INSERT/UPDATE/DELETE/COMMIT` sequence on one retained client commits atomically; all effects visible afterward. (refs: node-postgres#1504, node-postgres#636)
- [P2][integration][impl] Empty transaction `BEGIN; COMMIT` with no statements between succeeds and leaves connection ready.

#### Aborted-transaction state (25P02)
- [P0][integration][impl] `BEGIN`; valid `INSERT a`; a failing statement (e.g. divide-by-zero / duplicate key) rejects with `PgError`; then `COMMIT` — neither `a` nor anything persists (PG turns COMMIT-of-aborted-txn into ROLLBACK). (refs: node-postgres#164, node-postgres#977)
- [P0][integration][impl] After a statement errors inside a txn, the very next query (even `SELECT 1`) rejects with `PgError` `code === '25P02'` (`current transaction is aborted...`) until ROLLBACK/COMMIT. (refs: node-postgres#1826, node-postgres#2350)
- [P0][integration][impl] After the mid-txn error, the client still accepts and successfully runs `ROLLBACK` (returns command `ROLLBACK`); the connection then runs `SELECT 1` cleanly. (refs: node-postgres#323, node-postgres#977)
- [P0][integration][impl] The failing statement rejects **promptly** (reaches the awaiting `catch`), does not hang; in-flight=1 model means the error resolves `current` and `processQueue` drains the next. (refs: node-postgres#2231, node-postgres#2350)
- [P1][integration][impl] Multiple queued statements after a failing one: enqueue `[fail, SELECT 1, SELECT 2]` synchronously inside a txn — `fail` rejects, and the queued valid SELECTs each reject with `25P02` (they DO get sent, since minipg has no client-side abort short-circuit) rather than silently succeeding. Documents minipg's actual behavior vs node-postgres#323's "must NOT execute".
- [P1][property][impl] For any error SQLSTATE class raised mid-txn, the connection returns to `ready` (next query is accepted) — i.e. an ErrorResponse never wedges the connection (`connection.ts:156` sets `current.error`, `finishTask` rejects, `Z` re-readies).

#### Connection isolation under concurrency
- [P0][integration][impl] Two clients from a `max>=2` pool: client A `BEGIN; INSERT`; before A commits, client B `SELECT count(*)` sees 0 (read-committed: uncommitted rows invisible). Then A `COMMIT`; B sees the row. (refs: node-postgres#1819, node-postgres#1340)
- [P0][integration][impl] Statements interleaved across two concurrent dedicated clients never cross transaction boundaries: A's `BEGIN..COMMIT` and B's `BEGIN..COMMIT` each contain only their own statements (verify via distinct row sets). (refs: node-postgres#155, node-postgres#794)
- [P0][chaos][impl] Client checked out, `BEGIN; INSERT`, then `client.end()` (socket closed) without COMMIT: server rolls the txn back; another connection sees no rows. (refs: node-postgres#1340, node-postgres#1458)
- [P1][integration][impl] Many (e.g. 20) rapid `pool.connect()`+txn+release cycles over a small `max` complete without error and all commits persist; no "already a transaction in progress" corruption. (refs: postgres.js#823, postgres.js#274)
- [P1][chaos][impl] FOOTGUN GUARD: running a `BEGIN` via `pool.query()` (not `pool.connect()`) starts a txn then immediately releases the connection to idle still in state `T` (driver does not detect it). Assert the documented hazard: a later `pool.query('INSERT')` may land on that same idle connection inside the leaked txn. This is the central minipg pooling footgun (no status tracking at `connection.ts:151`, no reset at `pool.ts:38`).

#### Savepoints & nesting
- [P0][integration][impl] `BEGIN`; `INSERT a`; `SAVEPOINT s`; `INSERT b`; `ROLLBACK TO SAVEPOINT s`; `COMMIT` — `a` persists, `b` does not. (refs: node-postgres#637, node-postgres#2647, node-postgres#380)
- [P1][integration][impl] After a statement errors inside a savepoint, `ROLLBACK TO SAVEPOINT s` clears the aborted state and lets the txn continue (subsequent valid statement succeeds, COMMIT persists pre-savepoint work). (refs: node-postgres#380)
- [P1][integration][impl] `SAVEPOINT s` / `RELEASE SAVEPOINT s` / nested savepoints all execute on the same retained client across multiple `query()` calls (in-flight serialization keeps them ordered). (refs: node-postgres#380)
- [P2][integration][impl] Same savepoint name reused across two separate sequential transactions on the same client does not conflict. (refs: node-postgres#2483)
- [P2][integration][impl] `ROLLBACK TO SAVEPOINT nonexistent` rejects with `PgError` `3B001` (invalid_savepoint_specification) and leaves the txn in aborted state (recoverable by full ROLLBACK).

#### Isolation levels, serialization, locking & deadlocks
- [P1][integration][impl] `BEGIN ISOLATION LEVEL SERIALIZABLE`: two conflicting txns on distinct connections — the loser's statement or its `COMMIT` rejects with `PgError` `code === '40001'` (serialization_failure), surfaced to the caller. (refs: node-postgres#1721, node-postgres#1934)
- [P1][integration][impl] Two `BEGIN ISOLATION LEVEL REPEATABLE READ` txns updating the same row: a `40001` is *possible* and, when it occurs, is delivered as a catchable `PgError` (retry-able); the READ COMMITTED variant of the same updates blocks then succeeds. (refs: node-postgres#1625; corrected per cluster verification note)
- [P2][chaos][impl] Induce a deadlock (two clients lock rows A,B in opposite order) — one txn's statement rejects with `PgError` `40P01` (deadlock_detected); the other commits. (refs: node-postgres#2092)
- [P2][integration][impl] `LOCK TABLE t IN ACCESS EXCLUSIVE MODE` held by client A; client B's `LOCK`/`SELECT FOR UPDATE` query promise stays pending (blocks) and resolves only after A commits/rolls back — no early return, no driver-side hang of unrelated queries. (refs: node-postgres#2096, node-postgres#2605)
- [P2][integration][impl] Two clients `SELECT ... FOR UPDATE` / `UPDATE` the same row in separate txns: waiter's query resolves once the holder releases the row lock. (refs: node-postgres#2605)
- [P2][integration][impl] `SET CONSTRAINTS ALL DEFERRED` inside a txn with a `DEFERRABLE INITIALLY DEFERRED` FK: the violating INSERT succeeds at statement time but `COMMIT` rejects with the constraint `PgError` (23503/23505). (refs: postgres.js#1117, postgres.js#146)

#### Autocommit & implicit-transaction semantics
- [P1][integration][impl] A loop of `INSERT`s via `pool.query()` (no explicit BEGIN) each autocommit independently; all persist on a later SELECT. (refs: node-postgres#648, node-postgres#741, node-postgres#2658)
- [P1][integration][impl] `DECLARE CURSOR ... ; FETCH` only survives inside an explicit `BEGIN..COMMIT` on a retained client; without BEGIN the cursor is gone (cursor `FETCH` errors / empty) after autocommit. (refs: node-postgres#1986)
- [P1][unit][impl] GUARD (extended-protocol limit): a semicolon-joined multi-statement string e.g. `query('SELECT 1; SELECT 2')` rejects with `PgError` `42601` ("cannot insert multiple commands into a prepared statement") — minipg always uses Parse/Bind/Execute (`connection.ts:219`), so the simple-query implicit-transaction behaviors (node-postgres#2298, #2933) are NOT available. Assert clean failure, not partial execution.
- [P2][integration][todo:feature] simple-query protocol (`mode:'simple'` / no params) enabling `BEGIN; ...; COMMIT` in one round trip and the implicit-one-transaction rollback-of-earlier-statement-on-later-failure behavior. Pending/skipped until simple query is implemented. (refs: node-postgres#2298, node-postgres#2933)

#### Commit visibility & durability
- [P0][integration][impl] After the `COMMIT` promise resolves, a `SELECT` on the SAME client and on a DIFFERENT pooled connection both see the committed rows. (refs: node-postgres#1494, node-postgres#1232)
- [P1][integration][impl] A `COMMIT` that fails (deferred-constraint violation, or serialization failure at commit) rejects the COMMIT `query()` promise with the underlying `PgError`; it is a normal rejection, never an unhandled rejection, and the connection returns to ready. (refs: node-postgres#1911, node-postgres#1934)
- [P1][chaos][impl] Client connection dropped (socket destroyed) before `COMMIT` — open txn rolled back by server; no partial persistence visible to a new connection. (refs: node-postgres#1458)

#### Connection-reuse safety & transaction-status tracking
- [P0][integration][impl] EXPECTED-GAP test: connection left in open (`T`) or aborted (`E`) txn and returned via `release()` is pushed back to idle WITHOUT rollback/reset (`pool.ts:38-43`). Assert current behavior, mark the data-leak hazard, and tie to the [todo] reset feature below. (refs: node-postgres#724, node-postgres#155)
- [P1][integration][impl] `release()` is safe to call exactly once after `COMMIT` on a retained client; the connection is reused by the next `pool.connect()`/`pool.query()` and works. (refs: node-postgres#1252, node-postgres#344)
- [P1][unit][todo:feature] Driver should expose/track the `ReadyForQuery` transaction-status byte (`I`/`T`/`E`) — currently `connection.ts:151` ignores `body[0]`. Pending spec: `connection.txStatus` reflects `I` outside txn, `T` after BEGIN, `E` after in-txn error.
- [P1][integration][todo:feature] Pool should ROLLBACK / `DISCARD ALL` (or destroy) a connection released while `txStatus !== 'I'`, so the next checkout never starts mid-transaction. Pending spec layered on tx-status tracking. (refs: node-postgres#724)

#### Session / SET state across pool checkouts (GUC leakage)
- [P1][integration][impl] `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` on a client causes a later write on that connection to reject with `PgError` `25006` (read_only_sql_transaction). (refs: node-postgres#569)
- [P1][integration][impl] `SET ROLE r` / `SET search_path` on a checked-out client applies to subsequent statements on that connection. (refs: node-postgres#1598, node-postgres#1845, node-postgres#1584)
- [P0][integration][impl] GUC-LEAKAGE GUARD: client A does `SET search_path=secret_schema` (or `SET application_name`), releases; a second `pool.connect()` returning the SAME connection still observes that GUC (`SHOW search_path`) — minipg does no reset (`pool.ts:38`). Assert the leak as current documented behavior. (refs: node-postgres#1584)
- [P1][integration][impl] `SET LOCAL search_path=...` inside a txn reverts automatically at COMMIT/ROLLBACK (server semantics) and does NOT leak — contrast with non-LOCAL `SET` above.
- [P2][integration][todo:feature] Pooled `DISCARD ALL` on release resets GUCs/temp tables/prepared statements; after the [todo] reset lands, the leakage guard above flips to "fresh session". (refs: node-postgres#1584)

#### begin()/transaction helper sugar [roadmap]
- [P1][integration][todo:feature] `pool.begin(async (tx) => {...})` COMMITs when the callback resolves, ROLLBACKs when it throws, and rejects the outer promise with the ORIGINAL `PgError` (`.code` preserved), never a cached/generic error. (refs: node-postgres#1126, postgres.js#272, postgres.js#289, postgres.js#830)
- [P1][integration][todo:feature] An error caught & handled INSIDE the `begin` callback does not propagate as an unhandled/rejected outer promise. (refs: postgres.js#455)
- [P1][integration][todo:feature] `begin` acquires a dedicated connection for the whole span and always releases it (even on throw); a connection that fails mid-txn rejects with a catchable error, no `UnhandledPromiseRejectionWarning`. (refs: postgres.js#162, node-postgres#529, node-postgres#2231)
- [P2][integration][todo:feature] Nested `begin` inside a `begin` issues `SAVEPOINT` (not a top-level COMMIT); inner rollback rolls back only the savepoint, outer continues and commits. (refs: postgres.js#826, postgres.js#985, postgres.js#554)
- [P2][integration][todo:feature] Graceful rollback sentinel: returning a rollback marker rolls back WITHOUT throwing and leaves the connection usable. (refs: postgres.js#500)
- [P2][integration][todo:feature] A loop of inserts inside `begin` inserts each row exactly once (no double-send / pipeline duplication). (refs: postgres.js#352)
- [P2][integration][todo:feature] A long-running `begin` is not killed by idle/lifetime timeouts while active; if the server closes the socket mid-txn the `begin` promise rejects (no silent process exit). (refs: postgres.js#608, postgres.js#658)

#### Out-of-scope guards
- [P2][unit][impl] `sql\`...\`` template-tag transactions are NOT a minipg API — assert the public surface (`connect`/`createPool`/`query`/`stream`/`pool.connect`) has no template-tag transaction method, so postgres.js fragment/pipeline regressions (postgres.js#333, #1082, #893) are structurally inapplicable.
- [P2][unit][impl] No server-side cursor manager / `PREPARE TRANSACTION` helper exists; two-phase commit must be driven by raw `query('PREPARE TRANSACTION ...')` and is not wrapped — assert it runs as a plain statement with no special handling.

### Fixtures & data needed
- Table `tx(id serial primary key, v int)` and a second table with a UNIQUE constraint (for duplicate-key mid-txn failures) and a `DEFERRABLE INITIALLY DEFERRED` FK pair for deferred-constraint-at-commit tests.
- A non-superuser role for `SET ROLE` / RLS and a `secret_schema` for search_path leakage tests; READ ONLY-mode test needs only a writable table.
- A pool with `max>=2` for concurrency/isolation; a separate independent `connect()` connection for cross-connection visibility assertions.
- Locking/deadlock tests need two distinct connections and `pg_advisory_xact_lock` / `SELECT FOR UPDATE` helpers; deadlock test needs careful ordering + short `lock_timeout`/`deadlock_timeout` to keep the suite fast.
- A "kill the socket mid-txn" helper (destroy the underlying socket) for chaos cases.

### PG-version / config sensitivities
- `default_transaction_isolation` and `transaction_isolation` defaults (READ COMMITTED) drive visibility/serialization expectations; SERIALIZABLE/REPEATABLE READ outcomes (40001) are timing/ordering dependent — assert "catchable when it occurs" rather than deterministic occurrence (per cluster verification note on #1625).
- `deadlock_timeout` / `lock_timeout` affect how long lock/deadlock tests block; set explicitly per-connection to avoid flakiness.
- COMMIT-of-aborted-transaction silently becoming ROLLBACK is stable across PG14-17. `25P02`, `40001`, `40P01`, `25006`, `3B001`, `42601` SQLSTATEs are stable across versions.
- `idle_in_transaction_session_timeout` (if set on the server) can abort a connection left in an open txn — relevant to the pooling-leak and long-txn cases.
- Simple-query multi-statement implicit-transaction behavior is irrelevant until the [todo] simple-query protocol lands; today extended-protocol forces single-statement Parse.

### Estimated test count
46


## Cancellation & Timeouts  — scope: partial(roadmap)

This domain bounds how long the driver waits and how it terminates work. In the current source the **only** implemented bound is the connect-phase deadline: `connect()` arms a single `connTimer` (`config.connectTimeout`, default 30000ms) that covers the entire TCP + optional SSL + startup + auth handshake; it fires `fatalConnect()`, which destroys the socket and rejects with `connect timeout after <N>ms`, and is cleared on `ready()` or any `fatal()`. There is **no** per-query timeout, **no** `AbortSignal` support, and **no** out-of-band CancelRequest — `backendKey` (`{pid, secret}`) is captured from the `'K'` message but never used. Server-side GUC timeouts (`statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`) are not auto-applied by config; they only take effect if the caller runs raw `SET ...`, and when the server cancels a statement the driver correctly surfaces it (ErrorResponse `'E'` -> `'Z'` -> `reject` with `PgError`, connection returns to `ready`). The big footguns: stream early-break cancels only client-side (no CancelRequest, so a long server-side query keeps the connection busy until it finishes), an idle-in-transaction FATAL arriving while `current === null` is swallowed (next query rejects with a generic `connection is closed`, losing SQLSTATE `25P03`), and `end()` sets `state='closed'` before socket teardown so `fatal()` early-returns and an in-flight query promise can hang forever.

### Test groups

#### Connect timeout — TCP + startup/auth handshake (implemented)
- [P0][integration][impl] `connect({connectTimeout: 300})` against a blackholed/unroutable host (e.g. 10.255.255.1) rejects in ~300ms (assert elapsed within, say, 250-1500ms) with message matching `/connect timeout after 300ms/`, not the 30s default. (refs: node-postgres#397, node-postgres#2040, postgres.js#79)
- [P0][integration][impl] A stub TCP server that `accept()`s the socket but never sends Authentication*/ReadyForQuery still causes `connect()` to reject at `connectTimeout` (the single `connTimer` spans the startup phase, not just TCP connect). (refs: node-postgres#3197, node-postgres#3348)
- [P0][chaos][impl] A stub server that completes TCP + accepts the SSLRequest ('S') then stalls during the TLS handshake still rejects at `connectTimeout` (timer covers SSL upgrade too). (refs: node-postgres#3197)
- [P1][integration][impl] On connect-timeout rejection the underlying socket is destroyed (`fatalConnect` -> `socket.destroy()`); assert `socket.destroyed === true` / no further `'data'` handling and `state === 'closed'`. (refs: node-postgres#3197)
- [P1][unit][impl] On connect-timeout the `connTimer` is the thing that fired and no *second* dangling timer survives; a successful `connect()` clears `connTimer` in `ready()` so the process can exit (no timer keeping event loop alive). (refs: node-postgres#3219)
- [P1][unit][impl] Calling `connect()` twice returns the same cached `connectPromise` (re-entrancy) — both awaiters settle together on timeout, only one timer armed. (refs: node-postgres#2040)
- [P2][integration][impl] Happy-path baseline: a reachable server completes startup well under `connectTimeout`; promise resolves, `state === 'ready'`, `connTimer` cleared, subsequent query works.

#### Connect-timeout config surface (aliases — guard/todo)
- [P1][unit][todo:feature] `connectionTimeoutMillis` (node-postgres alias) is currently ignored — only `connectTimeout` is read in the constructor. Guard: assert the alias does NOT change the deadline today (falls back to 30000), and mark the alias as a planned feature. (refs: node-postgres#2040)
- [P2][unit][todo:feature] `connect_timeout` connection-string param and `PGCONNECT_TIMEOUT` env var are not honored; guard that they are no-ops now. Note the unit mismatch for the future impl: `PGCONNECT_TIMEOUT` is **seconds** (libpq), `connectTimeout`/`connectionTimeoutMillis` are **milliseconds**. (refs: node-postgres#2040, postgres.js#79)

#### Pool acquisition timeout (todo)
- [P0][integration][todo:feature] `Pool.acquire()` currently pushes to `waiters` with no timeout and waits forever when at `max`; plan a `connectionTimeoutMillis`/acquire-timeout that rejects a queued waiter after N ms. Pending spec: pool at `max` with all clients busy -> `pool.connect()` rejects in ~N ms. (refs: node-postgres#805, node-postgres#1390, node-postgres#1984, node-postgres#2712)
- [P1][integration][todo:feature] A timed-out waiter is removed from the `waiters` queue, and a later `release()` does NOT hand the freed connection to the already-rejected waiter (it goes to the next live waiter or `idle`). (refs: node-postgres#2712, node-postgres#1390)
- [P2][integration][impl] Baseline (no timeout): pool at `max=1`, two queries — the second resolves only after the first releases, in order; documents current unbounded-wait behavior. (refs: node-postgres#1390)

#### Server-side session timeouts (statement_timeout / lock_timeout / idle_in_tx)
- [P0][integration][impl] `SET statement_timeout = '200ms'` then `select pg_sleep(2)` rejects with `PgError`, `e.code === '57014'` (query_canceled); the connection returns to `ready` and a following `select 1` succeeds. (refs: node-postgres#3139, node-postgres#518)
- [P1][integration][impl] After a `statement_timeout` cancel, `SHOW statement_timeout` still reflects the session value (the GUC was a real `SET`, not reset by the error) — and a *non-SET-LOCAL* value persists across the recovered connection. (refs: node-postgres#1536)
- [P1][integration][impl] `lock_timeout`: txn A holds a row lock; txn B with `SET lock_timeout='200ms'` doing `SELECT ... FOR UPDATE` rejects with SQLSTATE `55P03` (lock_not_available); connection recovers. (refs: node-postgres#3604)
- [P1][integration][impl] Per-query override via `SET LOCAL statement_timeout` inside a `BEGIN` block applies only within that txn and does not mutate the session default for the next query on the same connection. (refs: node-postgres#2016)
- [P2][integration][todo:feature] Auto-application of `statement_timeout`/`lock_timeout`/`idle_in_transaction_session_timeout` from pool/connection config — NOT implemented (startup only sends `application_name`+`client_encoding`, no GUC injection). Pending: every newly opened pooled connection has the configured GUC, verified by `SHOW`. (refs: node-postgres#3604, node-postgres#2381)
- [P2][integration][impl] Documented-semantics guard: `statement_timeout` counts execution time only, not ClientRead — a backend blocked waiting on the client is not cancelled by `statement_timeout`. Assert against PG semantics, do not assume cancellation. (refs: node-postgres#1952)

#### idle_in_transaction termination — catchability & SQLSTATE loss (footgun)
- [P0][integration][impl] `BEGIN`, set `idle_in_transaction_session_timeout='200ms'`, idle past it; the next `query()` rejects with a **catchable** error (never an unhandledRejection / process crash). (refs: postgres.js#1133, node-postgres#2381)
- [P0][chaos][impl] FOOTGUN: when the server terminates an idle-in-tx session, the FATAL `'E'` arrives while `current === null` and is swallowed in `handle()`; the subsequent socket close runs `fatal()`. Assert current behavior — the next query rejects with the generic `connection is closed`, and SQLSTATE `25P03` is **lost**. Mark as the regression to fix (surface the original `PgError`). (refs: postgres.js#1133)
- [P1][integration][todo:feature] Pool recovery: after an idle-in-tx kill, the pool should discard the dead connection (`release` already deletes `state==='closed'` conns) and a subsequent `pool.query` should succeed on a fresh connection. Verify `release()`/`refill()` path actually evicts and replaces. (refs: postgres.js#1133)

#### Client-side query timeout (driver-enforced query_timeout) — todo
- [P0][unit][todo:feature] `query(sql, params, {timeout: N})` (or AbortSignal) — currently no such option exists; planning spec: a query exceeding N ms rejects with a timeout error in ~N ms and the hung connection is terminated **or** a CancelRequest is sent (not left wedged with `current` set forever). (refs: node-postgres#1713, node-postgres#1954)
- [P1][unit][todo:feature] A `query_timeout` firing on a `stream()`/iterator path must reject the pending `next()`/emit an error — NOT throw an internal "callback is not a function"; the stream uses `streamError`, the future timeout must route through it. (refs: node-postgres#1860, node-postgres#3475)
- [P1][unit][todo:feature] When a stream/query completes or is `return()`-ed normally before the timeout, the future timeout timer is cleared so the event loop can exit (no leaked timer). (refs: node-postgres#3219)
- [P1][chaos][todo:feature] Client-side timeout aborts a query when the server stops responding mid-result (stub server sends RowDescription + some DataRows then goes silent), independent of any `statement_timeout`. (refs: node-postgres#3124, postgres.js#394)
- [P2][unit][todo:feature] A per-query timeout on `pool.query` aborts only that one query, not siblings or the pool default. (refs: node-postgres#2652, node-postgres#1139)
- [P2][unit][todo:feature] FOOTGUN to guard: slow consumer between stream `next()` calls must not trip a future inactivity timer while the statement is still streaming rows — only true inactivity should fire. (refs: node-postgres#2183)

#### Active query cancellation — CancelRequest protocol (todo)
- [P0][integration][todo:feature] `backendKey` is captured but unused. Plan a `conn.cancel()` that opens a *separate* socket, sends CancelRequest with this connection's `{pid, secret}`; an in-flight `pg_sleep` rejects with SQLSTATE `57014` and the connection drains to `ready`. (refs: node-postgres#753, postgres.js#234, node-postgres#1954)
- [P1][unit][todo:feature] CancelRequest forwards *this* connection's `backendKey.pid`/`secret` (from its own `'K'` message), never a stale or other connection's key. (refs: node-postgres#579)
- [P1][integration][todo:feature] Pool-level cancel: a reliable way to cancel a query on a specific pooled backend by PID; after cancel the pooled conn returns to usable or is recycled. (refs: node-postgres#2261)
- [P0][integration][impl/todo:feature] FOOTGUN (current behavior): stream early-`break`/`return()` sets `t.cancelled` and resumes the socket but sends **no** CancelRequest — the server keeps executing and the rows are drained/ignored until CommandComplete+ReadyForQuery. Assert that with a *cheap* generator (`generate_series(1,100000)`) the connection is usable after break (matches smoke #8), AND add the inverse: with an expensive long query a post-break query is blocked until the server finishes (documents the missing CancelRequest; todo to make break actually cancel). (refs: node-postgres#773)

#### AbortSignal integration (todo)
- [P1][unit][todo:feature] Passing an already-aborted `AbortSignal` to `query()` rejects immediately with an `AbortError` and never enqueues/sends the query (no Parse/Bind written). (refs: node-postgres#2625, node-postgres#2774)
- [P1][integration][todo:feature] Aborting the signal mid-flight triggers a CancelRequest, rejects the promise with `AbortError`, and the query is observably cancelled server-side (SQLSTATE `57014`). (refs: node-postgres#2774)
- [P1][integration][todo:feature] After an aborted query the connection is drained to `ready` and reusable for the next query (no leftover `current`, queue still processes). (refs: node-postgres#2774, node-postgres#2261)

#### Cancelled/timed-out query must settle & leave connection usable (cross-cutting)
- [P0][integration][impl] After ANY server-cancelled query (`57014` via `statement_timeout`), `this.current` is cleared in `finishTask`, queued queries are dispatched, and the next query returns correct results — no wedged queue. (refs: node-postgres#1954)
- [P0][chaos][impl] FOOTGUN: `end()` called while a query is in flight sets `state='closed'` *before* socket teardown, so the socket-`close` `fatal()` early-returns (`if (state==='closed') return`) and the in-flight `query()` promise is **never settled** (hangs). Assert current behavior with a timeout-wrapped await; mark as bug to fix (reject in-flight on `end()`). 
- [P1][integration][impl] Socket error/abrupt close while a query is in flight rejects the in-flight promise AND every queued query with the same error (`fatal()` drains `current` + `queue`); a later `query()` rejects with `connection is closed`. (refs: node-postgres#1954)

#### Long-running query must not be killed by the driver (baseline)
- [P1][integration][impl] With no client-side timeout configured, `select pg_sleep(3)` (proxy for a multi-minute query) runs to completion and returns; the connection is never flipped to idle/terminated mid-execution (driver has no `idleTimeoutMillis`/keepalive that could fire — assert it stays `ready` and resolves). (refs: node-postgres#1398)
- [P2][integration][impl] A long stream that is fully consumed (not broken) returns all rows; backpressure pause/resume during the long run does not cause premature termination.

### Fixtures & data needed
- A real PostgreSQL (the smoke `base`: 127.0.0.1:54329, db `testdb`) for integration cases; `pg_sleep`, `generate_series` for long/cancellable work; a lock fixture table + two connections for `lock_timeout`/idle-in-tx.
- A controllable raw-TCP stub server (Node `net.createServer`) for chaos cases: variants that (a) accept then never speak, (b) accept SSLRequest then stall the TLS upgrade, (c) send RowDescription + N DataRows then go silent.
- A blackhole/unroutable address (e.g. `10.255.255.1`) or a firewalled port for TCP connect-timeout timing.
- Session GUCs set per-test via raw `SET` / `SET LOCAL`: `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`.
- Two pooled connections for lock contention; a `max=1` pool for acquisition-ordering.
- Generous wall-clock tolerance windows on timing assertions to avoid CI flakiness.

### PG-version / config sensitivities
- SQLSTATE values are stable across PG14-17: `57014` (query_canceled), `25P03` (idle_in_transaction_session_timeout), `55P03` (lock_not_available). Cite these directly.
- GUC value formatting from `SHOW`: PG normalizes units (e.g. `'200ms'` may echo as `200ms`); assert tolerantly. `statement_timeout=0` means disabled.
- `idle_in_transaction_session_timeout` exists from PG 9.6+; behavior (FATAL termination) is consistent across supported versions.
- `statement_timeout` semantics (execution time only, excludes ClientRead) are version-independent and underpin the #1952 guard.
- No DateStyle/bytea_output/standard_conforming_strings sensitivity in this domain (it's protocol/timing, not value decoding).
- For the future CancelRequest impl: the CancelRequest packet format (1234,5678 magic + pid + secret) is protocol-version stable across PG14-17.

### Estimated test count
38


## Connection Pool — scope: partial(roadmap)

What we test: the `Pool` in `src/pool.ts`, a deliberately minimal lazy pool over `Connection`. Source reality: it keeps `idle: Connection[]` (LIFO via `pop`), `all: Set`, and a FIFO `waiters: ((c)=>void)[]`. `acquire()` reuses an idle conn, else opens up to `max` (default 10), else parks a resolver in `waiters`. `release()` evicts closed conns (and `refill()`s for waiters), discards conns if pool `closed`, else hands the conn to the next waiter or pushes to idle. `pool.connect()` returns `{client, release}`; `pool.query()` acquires/uses/releases in a `finally`. `end()` sets `closed`, **silently drops parked waiters without rejecting them** (`for (const w of this.waiters.splice(0)) void w` is a no-op), clears `all`/`idle`, and `Promise.all`s `c.end()` on every tracked conn.

Critical source-level footguns to pin with tests: (1) **no double-release / use-after-release guard** — `release()` blindly re-queues a conn, so a second `release()` double-adds it (idle count can exceed physical conns) and a query on a released-then-reissued client corrupts another caller; (2) **waiters parked at `end()` hang forever** (their resolver is never called/rejected); (3) **`refill()` open-failure path re-`unshift`s the waiter but schedules no retry**, so a transient connect failure (e.g. `53300 too many clients`) can wedge a waiter; (4) idle reuse is LIFO, not FIFO; (5) `Connection.end()` terminates immediately and does **not** wait for an in-flight query, so `pool.end()` does not truly drain checked-out work. Everything around timeouts, min, idle reaping, lifetime, events, destroy-flag, and session reset is unimplemented → `[todo:feature]` pending specs.

### Test groups

#### Lazy open & idle reuse (baseline)
- [P0][integration][impl] Fresh `max:5` pool: `size===0 && idleCount===0 && waiting===0` before any acquire; first `acquire()` opens exactly one backend (`size===1`), and `pg_stat_activity` shows 1 conn for this app.
- [P0][integration][impl] Acquire then `release()` then acquire again returns the SAME physical backend (assert via `SELECT pg_backend_pid()` equality across the two checkouts); `idleCount` returns to its pre-acquire value after release. (refs: node-postgres#1673, #3011, #3463, postgres.js#163)
- [P1][integration][impl] Acquire a client, run NO query, release; it returns to idle (not leaked). Repeat `max+5` times on a `max:3` pool: no hang, `size<=3`, `idleCount` restored to a sane value. (refs: node-postgres#137, #227, postgres.js#751)
- [P1][unit][impl] Idle reuse order is LIFO: acquire 3 (pids A,B,C), release in order A,B,C, then acquire 3 again → order C,B,A (documents `idle.pop()` semantics; guard against accidental change).
- [P0][integration][impl] `pool.query('select 1')` on an empty pool opens one conn, returns rows, and releases it (idleCount===1, size===1 afterward); a second `pool.query` reuses it (size stays 1). (refs: node-postgres#1151, #2069)
- [P1][integration][impl] `pool.query` releases on ALL paths: zero-row result (`select 1 where false`) and erroring query (`42P01`) both leave `idleCount` restored / size unchanged; repeated calls never grow backends beyond `max`. (refs: node-postgres#1741, #2264, #2334)

#### Max bound & exhaustion / FIFO waiter queue
- [P0][integration][impl] `max:3`, fire `5` concurrent `pool.query('select $1::int',[i])`; all 5 resolve with correct values and `size<=3` throughout (mirrors smoke test #13, keep as regression). (refs: node-postgres#801, #1556)
- [P0][integration][impl] `max:N`, issue `N+M` concurrent `pool.connect()`; exactly `N` resolve immediately, `M` park (`waiting===M`), and each queued one resolves as earlier clients release — never dropped, never opening an `N+1`th backend. Cover `max:1`, `max:3`, `max:50`. (refs: node-postgres#931, #1289, #1907, #3476, postgres.js#369)
- [P0][property][impl] FIFO fairness: enqueue `K` waiters with recorded submission order; release clients one at a time; assert waiters resolve in exact submission order (`waiters.shift()`), no starvation. (refs: node-postgres#1331, #2452, #2927)
- [P0][integration][impl] Full pool, zero idle: releasing one checked-out client immediately hands the conn to the oldest waiter (no `isFull && idle===undefined` deadlock); the waiter's promise resolves with a usable client. (refs: node-postgres#2693, #801)
- [P1][perf][impl] `max:50` with 20 concurrent long-ish queries: measured peak concurrency ===20 (not batched in 10s); `size<=50`. (refs: node-postgres#1907, #1948, #2462)
- [P1][integration][impl] Backend-count invariant under sustained load: drive `200` queries through `max:5`; `SELECT count(*) FROM pg_stat_activity WHERE application_name/datname=...` never exceeds 5 at any sample. (refs: node-postgres#351, postgres.js#42)
- [P1][chaos][impl] Leak simulation: acquire `max` clients via `pool.connect()` and never release → next `acquire()` parks (`waiting>0`, does not resolve); after releasing the leaked clients, the parked acquire resolves and queries run again. (refs: node-postgres#224, #1085, #1768, #2785)
- [P1][integration][impl] Server-side `53300 too many clients already` surfaces from `open()` as a rejected `acquire()`/`query()` carrying SQLSTATE 53300; the pool is NOT permanently poisoned (after the contention clears, a later acquire succeeds). (refs: node-postgres#557, #1270)
- [P2][chaos][todo:feature] `53300` during a `refill()`-driven open should be retried/re-queued rather than silently wedging the waiter — currently `refill()` `unshift`s but schedules no retry, so the waiter hangs. Pending spec asserting transient-retry semantics. (refs: node-postgres#557)

#### Release & use-after-release correctness (footgun guards)
- [P0][unit][todo:feature] Double `release()` of the same client must throw "already released" (or be a no-op) and MUST NOT double-add to idle. Current source re-pushes → assert the intended guard; today this would make `idleCount > size`. (refs: node-postgres#111, #2515)
- [P0][unit][todo:feature] Query on a client AFTER its `release()` must reject ("client has been released") rather than silently executing on a conn now owned by another caller. No release-token exists today → pending. (refs: node-postgres#771, #1039, #2302)
- [P1][unit][todo:feature] `pool.connect()`'s returned `release()` called twice double-returns the same client (same closure → `this.release(client)` twice); assert idempotent release guard. (refs: node-postgres#111)
- [P1][integration][impl] Releasing inside a `.then()` chain does not abort the chain: `pool.query().then(r => { /* implicit release already happened in finally */ return use(r) })` still delivers the result to downstream handlers. (refs: node-postgres#1112, #1710)
- [P1][integration][impl] `pool.connect()` client held across `BEGIN; ...; COMMIT/ROLLBACK` is NOT auto-returned mid-transaction; a `ROLLBACK` issued later runs on the SAME backend (same pid) with no "connection is closed". (refs: node-postgres#35, #2512)
- [P2][unit][todo:feature] Calling `client.end()` directly on a pool-owned conn then releasing it: `release()` sees `state==='closed'`, deletes from `all`, and `refill()`s — assert it does NOT re-enter idle (this path IS handled in source; lock it in). (refs: node-postgres#159, #1414, #1430)
- [P2][unit][todo:feature] `release(true)` destroy-flag: closes the conn, removes from pool, and a fresh replacement is opened on next acquire (size invariant holds). Not implemented → pending. (refs: node-postgres#1997)

#### Dead-connection eviction & refill
- [P0][chaos][impl] Backend killed mid-checkout (`SELECT pg_terminate_backend(pid)` from a side conn, or server drops socket): the conn transitions to `closed`; on `release()` it is removed from `all` (not returned to idle) and `refill()` opens a replacement for any waiter; subsequent `acquire()` succeeds. (refs: node-postgres#631, #948, #1460, #2243)
- [P0][chaos][impl] `max:1` reborn case: kill the single backend, release it, and a queued waiter still gets a freshly opened conn (the one slot is recreated). (refs: node-postgres#2641, #517)
- [P1][integration][impl] Recoverable query error (`23505` unique_violation / statement-level error) leaves the SAME checked-out client usable: the next query on it succeeds (conn returns to `ready`, not killed). (refs: node-postgres#673, #1290, #1777)
- [P1][chaos][impl] `refill()` correctness: with `W` waiters and a dead-conn freeing capacity, exactly `min(W, max-size)` replacement opens are started; resulting `size<=max` and each successful open resolves a waiter. (refs: node-postgres#632)
- [P2][chaos][todo:feature] When a destroyed/failed conn had queued work, those queries are re-driven on a healthy client or errored back to callers — never silently lost. (Pool today owns one query per checkout; document expectation.) (refs: node-postgres#632, #517)
- [P2][integration][todo:feature] A conn returned while in an ABORTED transaction (`25P02`) must be reset/rolled-back before reuse so the next acquirer isn't stuck `in_failed_sql_transaction`. No auto-reset today → pending. (refs: node-postgres#154)

#### Graceful shutdown (pool.end)
- [P0][integration][impl] After `await pool.end()`, `pg_stat_activity` shows zero backends for this app (enables `DROP DATABASE`); `size===0`, `idleCount===0`. (refs: node-postgres#1445, #1695, #2766, #3280)
- [P0][unit][impl] `acquire()`/`pool.query()`/`pool.connect()` after `end()` reject with "pool is closed" (source guard at top of `acquire`). (refs: node-postgres#1477, #1635, #3635)
- [P0][integration][impl] `end()` is idempotent: a second `await pool.end()` resolves without throwing. (refs: node-postgres#1858)
- [P0][integration][impl] `end()` always resolves (no hang) with: only-idle conns present; more queries queued than `max`; mid-flight queries. (refs: node-postgres#1802, #2034, #2341, postgres.js#861)
- [P0][integration][todo:feature] BUG GUARD: waiters parked at `end()` must be rejected (pool closed), not silently dropped. Source does `for (const w of this.waiters.splice(0)) void w` (no-op) → a `pool.connect()` awaiting a slot when `end()` is called hangs forever. Pending spec asserting the parked promise rejects. (refs: node-postgres#2199, #2778)
- [P1][integration][todo:feature] `end()` resolves ONLY after already-issued queries settle (last `pool.query()` resolves before `end()`); currently `Connection.end()` terminates without awaiting the in-flight query, so a checked-out query may be cut off → pending drain semantics. (refs: node-postgres#1979, #2163, #2328, #3113)
- [P2][integration][todo:feature] `end({drain})` finishes queued queries before closing; non-drain may cancel queued queries but still terminates without hanging. Not implemented → pending. (refs: node-postgres#1980, postgres.js#861)
- [P2][integration][todo:feature] Pool emits an `end` event on shutdown; a reserved-then-released conn does not block `end()`. No event API today → pending. (refs: node-postgres#2399, postgres.js#925)

#### Dedicated client (pool.connect / reserve)
- [P0][integration][impl] `pool.connect()` hands a dedicated client that runs multiple SEQUENTIAL queries on the SAME backend (same pid); while held, pool available-capacity drops by exactly one (`size` up by 1 or an idle consumed). (refs: postgres.js#603, #616, node-postgres#2677)
- [P1][integration][impl] After `connect()`+`release()`, the backend returns to idle and is reused; a subsequent `pool.end()` resolves and does not hang on the released conn. (refs: postgres.js#925)
- [P1][integration][impl] A reserved client that runs NO prior query still resolves `connect()` (does not hang) and `release()` returns it cleanly. (refs: postgres.js#751)

#### Connect-error propagation
- [P0][integration][impl] Unreachable backend (bad port → ECONNREFUSED) makes `pool.connect()`/`acquire()` REJECT with the connect error; it does not resolve an Error object as a client, and `all` does not retain the failed conn (`open()` `catch` deletes it). (refs: node-postgres#1142, #1795)
- [P0][integration][impl] Failed acquire surfaces the error exactly once as a catchable rejection (async/await) — no unhandled rejection, no process crash, no duplicate pool `error`. (refs: node-postgres#1170, #1301, #2758)
- [P1][unit][impl] After a connect failure, `size` is unchanged (failed conn removed from `all`); a later `acquire()` against a now-reachable server succeeds (pool not permanently failed).
- [P1][chaos][todo:feature] If `open()` rejects inside `refill()`, the waiter is currently re-`unshift`ed with no retry → it hangs. Pending spec: the parked waiter must eventually reject or be retried, never silently stall. (refs: node-postgres#557)

#### Acquire timeout (roadmap)
- [P1][integration][todo:feature] `connectionTimeoutMillis`/acquire timeout: when no free client and pool at `max`, a parked `acquire()` rejects with a timeout error instead of hanging; wait-for-pooled time counts toward the timeout. Not implemented → pending. (refs: node-postgres#2704, postgres.js#824, #1036)
- [P2][integration][todo:feature] A connect-timeout firing mid-connect closes any socket that opened, leaving nothing tracked/idle (no leak). (refs: node-postgres#3543)
- [P1][unit][todo:feature][AbortSignal] Per-acquire `AbortSignal` cancels a parked waiter and rejects with an abort error, removing it from `waiters`. (ties to roadmap AbortSignal/timeout). (refs: node-postgres#2704)

#### Min / size configuration (roadmap + impl)
- [P0][unit][impl] `max: undefined` falls back to default 10 (source `config.max ?? 10`), NOT 1; opening 10 concurrent acquires opens up to 10. (refs: postgres.js#833)
- [P1][unit][impl] Explicit `max:N` is honored under load — never more than `N` backends opened (covered above; assert via config readback `pool` not exceeding). (refs: node-postgres#445, #846, #975)
- [P2][integration][todo:feature] `min` keeps at least that many idle conns established at startup and after idle periods (never drops below `min`). No `min` support today → pending. (refs: node-postgres#1278, #1869, #3009, #3508, postgres.js#672)
- [P2][unit][todo:feature] `max:0` / disable-pooling semantics are deterministic (queries still run, clients destroyed on release rather than pooled) — guard against `0` silently falling back to default. Today `config.max ?? 10` treats `0` as `0` (acquire would never open and never queue-resolve → hang). Pending decision/spec. (refs: node-postgres#319, #392, #853, #1227)

#### Idle reaping & connection lifetime (roadmap)
- [P2][integration][todo:feature] `idleTimeoutMillis`: an idle conn is closed after the timeout, disappears from `pg_stat_activity`, and `size`/`idleCount` drop. Not implemented → pending. (refs: node-postgres#1044, #1404, postgres.js#518)
- [P1][chaos][todo:feature] A CHECKED-OUT client is never reaped by the idle timer even if held past `idleTimeoutMillis`; using it after a long pause does not throw "connection is closed" (race guard). (refs: node-postgres#1892, #2938)
- [P2][integration][todo:feature] `idleTimeoutMillis:0` = never reap (node-postgres semantics): conns stay open and are reused. NOTE per verification: postgres.js `idle_timeout:0` is the INVERSE (dispose immediately) — assert minipg's chosen semantics explicitly, one assertion per behavior. (refs: node-postgres#2431, postgres.js#208)
- [P2][integration][todo:feature] `maxLifetimeSeconds`/TTL: a conn older than the lifetime is closed+replaced on release; younger conns reused. (refs: node-postgres#2027, #2965, #3298)
- [P2][unit][todo:feature] Idle/lifetime timers are `unref`'d / `allowExitOnIdle` honored so an otherwise-idle process exits without explicit `pool.end()`. (refs: node-postgres#2078, postgres.js#918)

#### Session-state isolation & setup hooks (roadmap)
- [P1][integration][impl] A `SET search_path`/GUC on a checked-out client affects subsequent queries on THAT conn while held (baseline: extended protocol carries session state on one backend). (refs: node-postgres#1134, #2619, postgres.js#501)
- [P1][chaos][todo:feature] LEAK GUARD: a `SET search_path='evil'` on checkout A, released without reset, must NOT be observed by the next acquirer of the same physical backend (when reset is configured). Today there is no reset → state leaks; pending spec for `DISCARD ALL`/reset-on-release. (refs: postgres.js#501, node-postgres#391, #2897)
- [P2][integration][todo:feature] A per-new-connection `setup`/`onconnect` hook runs exactly once per NEW backend (e.g. `SET application_name`) and the setting is present on every later checkout; it does NOT run on reused acquires. Not implemented → pending. (refs: node-postgres#703, #3086, #3301, #3617, postgres.js#553)

#### Observability (stats & events)
- [P1][unit][impl] `size`, `idleCount`, `waiting` are defined numbers reflecting state: after acquiring K, `size`/in-use up by K and `idleCount` down accordingly; releasing restores them. (Note: API names differ from node-postgres `totalCount`/`waitingCount`.) (refs: node-postgres#1090, #1376, #3208, postgres.js#443)
- [P1][integration][impl] `waiting` reflects parked acquires and returns to 0 once slots free; under correct release it does not grow unbounded while `idleCount` stays 0 (leak signal). (refs: node-postgres#2366, postgres.js#919)
- [P2][integration][todo:feature] Pool emits an `idle`/release event when a client becomes available again (no event API today). (refs: node-postgres#2209, #2402, #2612, postgres.js#1100)

#### Multiple pools & config isolation
- [P1][integration][impl] Two pools to different databases serve their respective DBs independently, never cross-share conns, each with its own `max`. (refs: node-postgres#187, #671, #2878)
- [P1][unit][impl] Constructing/using a pool does NOT mutate the passed config object (assert deep-equal of config before/after acquire). (refs: node-postgres#1294)
- [P2][integration][impl] `poolA.end()` closes only pool A; pool B stays usable (independent `all` sets). (refs: node-postgres#867)

#### Out-of-scope guards
- [P2][unit][impl] No `sql\`\`` template tag on Pool (assert `pool.sql === undefined` / not a function). (out-of-scope)
- [P2][integration][impl] LISTEN/NOTIFY via pool has no dedicated affinity API beyond `connect()`; a `LISTEN` on a released client does not deliver notifications to the pool — assert it fails cleanly / is undocumented. (out-of-scope)
- [P2][unit][impl] No COPY / cursor / native-libpq surface on Pool (methods absent). (out-of-scope)
- [P2][unit][impl] External-pooler concern: pool uses extended protocol with named statements cached PER CONNECTION; assert that with reused conns repeated named-statement queries do not error locally (true PgBouncer transaction-mode `42P05` behavior is documented as untested/out-of-scope here). (refs: postgres.js#172 — guard only)

### Fixtures & data needed
- Reuse smoke `base` config (host 127.0.0.1:54329, user postgres, db testdb) plus the seeded table `t`.
- A small table for insert/visibility and unique-violation tests: `pool_t(id serial primary key, k text unique)`.
- Helper SQL: `SELECT pg_backend_pid()` (backend identity for reuse/affinity), `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name=$app` (backend-count invariant), `SELECT pg_terminate_backend($pid)` from a side connection (dead-conn chaos), `pg_sleep()` for concurrency/timeout timing.
- A low-`max_connections` test role/db (or low-`max` + many pools) to provoke `53300 too many clients`.
- An unreachable endpoint (closed port) for ECONNREFUSED connect-error tests.
- Distinct second database (e.g. `postgres`) for the multi-pool isolation test.

### PG-version / config sensitivities
- `application_name` filtering in `pg_stat_activity` requires either setting it in startup params or filtering by `datname`/`usename`; behavior of `pg_stat_activity` columns is stable across PG14-17.
- `53300` is emitted only when `max_connections` (minus superuser-reserved) is actually hit; superuser connections bypass `superuser_reserved_connections`, so use a non-superuser role to reliably trigger it.
- `pg_terminate_backend` returns boolean and async-terminates; the client observes socket close (handled by `Connection.fatal` → state `closed`). Timing differs slightly across versions but the close event is reliable.
- Session-state/`DISCARD ALL` behavior is PG-stable; `search_path` leak tests are version-insensitive.
- Idle-timeout/lifetime/min specs are driver-side (roadmap) and not PG-version sensitive, but max-lifetime recycling interacts with server `idle_in_transaction_session_timeout` if a checked-out conn sits idle in a transaction.

### Estimated test count
58


## Streaming & Backpressure — scope: implemented (with roadmap/out-of-scope guards)

minipg exposes exactly ONE streaming primitive: `conn.stream(sql, params, {name?, mode?, highWaterMark?})` returning a hand-rolled `AsyncIterableIterator<Row>` (connection.ts:265-293). It is NOT a Node `Readable` and there is NO server-side cursor / `read(n)` batch API — rows are pushed one-at-a-time as `DataRow` ('D') messages arrive (`onRow`, connection.ts:273-277) into an in-memory `buf`, and TCP backpressure is applied via `socket.pause()` when `buf.length > HWM` (default 200) and `socket.resume()` when `buf.length < HWM/2` on the consumer's `next()` drain path (connection.ts:276, 286). Critically, early `return()`/break does NOT issue a protocol-level cancel: it sets `t.cancelled = true` so `dataRow` drops subsequent rows (connection.ts:194), resumes the socket, and lets the query DRAIN server-side to `ReadyForQuery` ('Z') before the connection is reusable — so an early break over a huge result still transfers (and discards) every row. Streams share the single-query-in-flight queue with `query()`, so a stream blocks subsequent queries until it ends/drains. This domain tests iteration in all 4 result modes, real socket pause/resume hysteresis, cancel-drain correctness, mid-stream error rejection, empty/large results, interleaving, and guards the absent cursor/Readable/cancel surfaces.

### Test groups

#### Async-iteration baselines (all result modes)
- [P0][integration][impl] `for await (const row of conn.stream('select id from t order by id'))` over a 3-row table yields rows in order; collected `[r[0]]` equals `[1,2,3]` and the loop terminates (done). (supersedes smoke.ts #7)
- [P0][integration][impl] Default mode is `'array'`: each yielded row is `unknown[]` with cells decoded per OID (int4->number, int8->string), identical to `query()` array mode for the same SQL.
- [P0][integration][impl] `stream(sql, [], {mode:'object'})` yields `Record<string,unknown>` keyed by column name; `stream(sql, [], {mode:'buffer'})` yields `(Buffer|null)[]` of undecoded cells; `stream(sql, [], {mode:'raw'})` yields one `Buffer` per `DataRow`. Assert one row each against the known fixture.
- [P1][integration][impl] NULL cells stream correctly: in object/array mode a NULL column yields `null`; in buffer mode the cell is `null` (not an empty Buffer). (refs: §1 NULL handling baseline)
- [P1][integration][impl] Parameterized stream: `stream('select id from t where id > $1', [1])` yields only matching rows; param `$1` is bound (not interpolated).
- [P1][integration][impl] Manual iterator-protocol drive: call `.next()` repeatedly; each resolves `{value,done:false}` for a row and a final `{value:undefined,done:true}`; calling `.next()` again after done stays `{done:true}` (connection.ts:288).
- [P2][integration][impl] `stream()` return value is both iterable and iterator: `obj[Symbol.asyncIterator]() === obj` (connection.ts:284).

#### Backpressure & flow control (real TCP pause/resume)
- [P0][integration][impl] Slow consumer over a large result (`generate_series(1,200000)`) with a delay per row: `buf.length` (internal) never grows unboundedly — assert peak buffered rows stays within a bounded multiple of HWM, proving `socket.pause()` engaged. (refs: §3 node-postgres#2135, #2472, postgres.js#1)
- [P0][integration][impl] With a tiny `highWaterMark` (e.g. 4) and a paused consumer (awaits a never-resolving-until-signaled promise between rows), the server stops sending: after the consumer stalls, RSS/heap and internal buf stop growing; once the consumer resumes, rows continue to completion. (refs: §3 node-postgres#1325)
- [P1][integration][impl] Resume hysteresis: pause triggers when `buf.length > HWM`; resume only when drained below `HWM/2` (connection.ts:276,286). Drive with HWM=10, fill to >10 (paused), consume down to 4, assert `socket.resume()` was called exactly once at the crossing (spy on socket).
- [P1][integration][impl] A fast `for await` consumer (no artificial delay) over `generate_series(1,1e5)` receives all rows in order with no pause ever engaged (buf stays small because each `next()` drains immediately). Assert count and ordering.
- [P1][integration][impl] HWM default is 200 when `highWaterMark` omitted (connection.ts:270); explicitly passing `highWaterMark` overrides it (verify via observed pause point).
- [P2][property][impl] For random HWM in [1..500] and random per-row consumer delay, total rows received == server row count and order preserved (no lost/duplicated rows across pause/resume cycles). (refs: §3 node-postgres#3175, #2224 — stream completes without stalling)
- [P2][integration][impl] Edge HWM values: `highWaterMark:1` and `highWaterMark:0` still complete a multi-row stream to done without deadlock (resume condition `buf.length < HWM/2` degenerates to "empty"). Guard against stall.

#### Early break / cancel / drain semantics (the headline footgun)
- [P0][integration][impl] Early `break` after N rows of a large stream leaves the connection usable: `for await (...) { if(++c===3) break }` then `await conn.query('select 42')` returns 42. (supersedes smoke.ts #8)
- [P0][integration][impl] `return()` sets `cancelled` and subsequent `DataRow`s are dropped, not decoded (connection.ts:194): break in object/buffer mode does not throw a decode error on later rows.
- [P0][integration][impl] FOOTGUN/DOCUMENTED: early break over `generate_series(1,1e6)` still DRAINS the full result server-side before the next query runs (no protocol CancelRequest). Assert the next `query()` only resolves after a measurable drain, and that ordering is preserved (next query result is correct), documenting that break does not save bandwidth. (refs: §4 postgres.js#389; contrast roadmap CancelRequest)
- [P1][integration][impl] After early break while the socket was paused, `return()` resumes the socket so draining can complete (connection.ts:291) — assert the connection reaches `ready` and a follow-up query succeeds (no permanent stall). (refs: §4 node-postgres#2119)
- [P1][integration][impl] Double/late `return()`: calling the iterator's `return()` after the stream already completed resolves `{done:true}` and does not throw (no null-socket crash). (refs: §4 node-postgres#2588, #2642 close-twice)
- [P1][integration][impl] Breaking BEFORE the first row (break in an empty-bodied loop / `return()` immediately after creating the stream) cancels cleanly; follow-up query succeeds.
- [P2][chaos][impl] Repeated open-stream-then-break in a tight loop (1000x) leaves no leaked in-flight task: `conn.current` is null after settling and every iteration's follow-up query succeeds (guard against queue wedging). (refs: §4 leak cluster)

#### Error propagation (mid-stream & connection loss)
- [P0][integration][impl] A stream whose SQL errors at execution (e.g. `select 1/0` or `select * from no_such_table`) rejects the iterator's `next()` with a `PgError` carrying SQLSTATE; the connection then recovers and a subsequent `query()` succeeds (connection.ts:234,279). (refs: §5 node-postgres#1674)
- [P0][integration][impl] Error arriving while a consumer is awaiting `next()` (pending `waiting` slot) rejects that pending promise immediately, not on a later call (connection.ts:279). (refs: §5 node-postgres#2870)
- [P0][chaos][impl] Backend killed mid-stream (kill the server-side backend PID via a second connection, or destroy the socket) rejects the in-flight stream's iterator and does NOT hang: `fatal()` calls `streamError` for current + queued (connection.ts:246-247). (refs: §5 node-postgres#2187, #2707, #2468)
- [P1][integration][impl] Error mid-stream after some rows already delivered: rows received before the error are observed, then `next()` throws the error rather than silently completing with fewer rows (`done:true`). (refs: §5 postgres.js#1166)
- [P1][integration][impl] NUL-byte guard for streams: `stream('select $1::text', ['a\\0b'])` causes the first `next()` to reject (startTask catch -> `streamError`, connection.ts:223) without sending to the wire and without wedging the queue (`processQueue` re-runs). (refs: smoke.ts #10 extended to stream path)
- [P1][integration][impl] Streaming on an already-closed connection: `stream(...)` sets `err` (connection.ts:281) and the first `next()` rejects with "connection is closed"; no task is queued.
- [P2][integration][impl] After a mid-stream error, queued queries behind the stream are also rejected on a fatal socket error but a fresh query on a NON-fatal query error (ErrorResponse) still works (distinguish PgError-recovery from socket-fatal paths).

#### Empty & trivial result sets
- [P0][integration][impl] Empty stream (`select 1 where false` / `select * from t where false`): the `for await` body never runs, loop completes; `streamEnd` fires with rowCount 0 and `done:true` (connection.ts:278).
- [P1][integration][impl] Single-row stream: exactly one row yielded then done.
- [P1][integration][impl] Non-SELECT command via stream (e.g. `create temp table z(x int)` or an `insert ... ` with no RETURNING): no rows yielded, loop completes cleanly without throwing (no `T`/RowDescription path issues).
- [P2][integration][impl] Stream of a query returning only NULL rows (`select null from generate_series(1,3)`) yields 3 rows each `[null]`.

#### Large results: bounded memory & non-blocking loop
- [P1][perf][impl] Stream `generate_series(1,1e6)` fully consumed with a small HWM: process completes, total count == 1e6, and peak heap stays bounded (assert `process.memoryUsage().heapUsed` delta well under what buffering 1e6 rows would require). (refs: §9 node-postgres#181, #526, #1956)
- [P1][integration][impl] Event loop is not blocked during streaming: a `setInterval` timer keeps firing while a slow-consumer stream runs (rows arrive incrementally as parsed, not all-at-once). (refs: §9 node-postgres#366, #2544 — hold to a streamable seq-scan/generate_series plan, not a server-side-Sort SRF)
- [P2][perf][impl] First row is observed well before the stream completes for a streamable plan (`generate_series`), proving incremental delivery (timestamp of first `next()` resolution << total stream time).
- [P2][integration][impl] Wide rows (many columns / large text fields) stream without per-row decode errors; memory still bounded by HWM in row-count terms. Note documented limitation: a single huge field arrives as one length-prefixed `DataRow` blob and cannot be sub-streamed (§9 #3405 — guard, not a capability).

#### Interleaving, queueing & named prepared statements
- [P0][integration][impl] A `query()` issued while a stream is mid-iteration is QUEUED and only runs after the stream ends/drains (single-in-flight, connection.ts:200-203); its result is correct and arrives after the stream completes.
- [P1][integration][impl] Two streams started back-to-back serialize: the second does not begin emitting until the first reaches `ReadyForQuery`; both deliver full correct row sets.
- [P1][integration][impl] Named prepared statement via stream: `stream(sql, p, {name:'s1'})` parses once and caches fields; a second `stream`/`query` with same name+SQL reuses the cached plan (no re-Parse), different SQL same name triggers Close+re-Parse (connection.ts:214-219). (refs: §10 node-postgres#3007)
- [P1][integration][impl] A streamed query mixing a stream and a normal `query()` of the SAME named statement returns consistent results (cache shared across both code paths).
- [P2][integration][impl] Multi-statement SQL in a stream (`select 1; select 2`) fails fast with a clear PgError (`cannot insert multiple commands into a prepared statement`) via `streamError`, connection stays usable. (refs: §10 node-postgres#3285, #2520)
- [P2][integration][impl] A WITH/CTE single-statement query streams its rows successfully (single command, allowed). (refs: §10)

#### Out-of-scope / roadmap guards
- [P1][unit][impl] GUARD: minipg has NO server-side cursor API — assert there is no `conn.cursor`/`read(n)` batch method and no `QueryStream` Node `Readable` (the stream result lacks `.pipe`/`.on`/`.destroy`). Document that bounded memory is achieved via TCP backpressure, not DECLARE/FETCH portals. (refs: §2, §8 — features intentionally absent)
- [P2][integration][impl] GUARD: refcursor is only reachable via raw SQL (`BEGIN; SELECT myproc(); FETCH ALL IN "<name>"; COMMIT`) through `query()`/`stream()`, not a first-class API — assert the raw-SQL path streams refcursor rows within one transaction and there is no dedicated refcursor helper. (refs: §7 node-postgres#1137)
- [P0][integration][todo:feature] PENDING: protocol-level out-of-band cancel (CancelRequest using `backendKey`) so early break/timeout actually stops the server instead of draining — currently absent; mark skipped until implemented. (refs: roadmap CancelRequest; §4)
- [P1][integration][todo:feature] PENDING: per-query/stream timeout + `AbortSignal` to abort a stalled stream and reject the iterator without socket teardown — currently no `signal` option on `StreamOptions`; skipped. (refs: roadmap)
- [P2][integration][todo:feature] PENDING: binary RESULT format streaming (request Bind result format 1) — `stream` always uses text format (Bind format 0, connection.ts:220); skipped until binary decoders land. (refs: roadmap binary RESULT format)
- [P2][integration][todo:feature] PENDING: simple-query-protocol streaming path — not implemented; skipped. (refs: roadmap simple-query)

### Fixtures & data needed
- Existing `t` table from smoke fixture (id int4, name text, n8 int8, amount numeric, ok bool, data jsonb, blob bytea) with 3 rows incl. a NULL-name row.
- `generate_series(1, N)` for N in {0, 1, 1e5, 1e6} — no table needed (set-returning function, streamable plan).
- A row-returning function / view with only-NULL columns for NULL streaming.
- A second connection (or `pg_terminate_backend(pid)` using the streamed conn's `backendKey.pid`) to kill a backend mid-stream for chaos tests.
- A stored proc returning REFCURSOR for the refcursor guard.
- Roles md5user/scramuser already provisioned (unrelated here but shared harness).
- Server settings default; tests run on the docker PG at 127.0.0.1:54329, db `testdb`.

### PG-version / config sensitivities
- `generate_series` plan is a streamable function scan on all PG14-17 — first-row-before-completion assertions hold; avoid top-level Sort/Hash or materialized SRFs which buffer server-side and would break the incremental-delivery assertion.
- Row count / `CommandComplete` tag parsing (`rowCount`, connection.ts:155) is stable across versions; `streamEnd` summary surfaces it.
- `cannot insert multiple commands into a prepared statement` is the extended-protocol error text on PG14-17 (assert via SQLSTATE 42601, not exact string, for version safety).
- bytea_output (hex vs escape) affects buffer/raw mode bytes for the `blob` column — pin `bytea_output=hex` or decode via the driver's bytea decoder; DateStyle affects timestamp text decoding if streamed.
- Backpressure timing (when pause engages) depends on TCP/socket buffer sizes and OS — assert bounded-ness (peak buf within a multiple of HWM) rather than exact pause counts; spy on `socket.pause/resume` for deterministic hysteresis checks rather than wall-clock.
- SCRAM/SSL irrelevant to streaming semantics but the transport (tls.TLSSocket vs net.Socket) must still honor pause/resume — optionally run one backpressure test over SSL to ensure `socket.pause()` works on the TLS socket too.

### Estimated test count
46


## Out-of-Scope Guards & Runtime Parity  — scope: out-of-scope-guard

minipg deliberately omits the template-tag DSL, LISTEN/NOTIFY, COPY, and logical replication: `src/index.ts` exports only `connect`/`createPool`/`Connection`/`Pool`/`PgError`/`defaultDecoders` and its header comment states "No template tags, no LISTEN/NOTIFY, no COPY." At the protocol layer (`src/connection.ts` `handle()`) NoticeResponse (`'N'`) and NotificationResponse (`'A'`) are explicitly ignored, and a catch-all `default` silently swallows every other message type — including the COPY sub-protocol frames `CopyInResponse('G')`, `CopyOutResponse('H')`, `CopyBothResponse('W')`, `CopyData('d')`, `CopyDone('c')`. The purpose of this domain is to GUARD those omissions: prove the unsupported surfaces are genuinely absent / handled without corrupting or wedging the connection, and to prove RUNTIME PARITY — the full suite runs on Bun (primary) and a smoke subset on Node, over a pure `net`/`tls`/`crypto` surface with no native addon. These are intentionally small, high-signal guards, not full feature coverage.

### Test groups

#### Absence of the `sql\`\`` template tag & other DSL surfaces
- [P0][unit][impl] The package's public exports are exactly `{connect, createPool, Connection, Pool, PgError, defaultDecoders}` (plus types); assert there is NO exported `sql` tagged-template factory, no `sql.unsafe`, no `sql.begin`, no `sql.file`, no `notify`/`listen`/`subscribe` symbol. (refs: api_ergonomics dynamic-composition cluster — postgres.js#12/#807)
- [P1][unit][impl] `Connection`/`Pool` instances expose NO `sql`, `listen`, `notify`, `subscribe`, `copyTo`, or `copyFrom` method; calling such a member is `undefined` (TypeError on invocation), not a silent no-op. (refs: copy ownership — node-postgres#3283; listen_notify — postgres.js#1069)
- [P1][unit][impl] minipg has no identifier-quoting / fragment-composition helper (`sql('col')`, `sql.join`): dynamic SQL must be built by the caller as a plain string; assert no such helper is exported so users are not lulled into an injection-unsafe missing API. (refs: api_ergonomics identifier quoting — postgres.js#21/#188)
- [P2][unit][impl] `conn.query` accepts ONLY `(sql:string, params?, opts?)` — passing a tagged-template strings array (`query(['select ', ''], 1)`) does NOT interpolate; it is coerced/rejected, never executed as a hidden template tag. (guard against accidental DSL footgun)

#### LISTEN / NOTIFY async messages are ignored without breaking the connection
- [P0][integration][impl] Run `LISTEN ch` then trigger `NOTIFY ch, 'payload'` from a SECOND connection while the first connection is otherwise idle; the NotificationResponse (`'A'`) is silently dropped (no event, no callback) and a subsequent `query('select 1')` on the listening connection still returns `1` — connection stays in `ready`. (refs: listen_notify basic delivery — node-postgres#23/#169)
- [P0][integration][impl] Issue `query("select pg_notify('ch','x')")` and concurrently `LISTEN ch` on the same connection; the inbound `'A'` frame interleaved with `'D'`/`'C'`/`'Z'` does NOT corrupt result parsing — the query still resolves with the correct row and rowCount. (refs: listen_notify trigger delivery — node-postgres#1543)
- [P1][integration][impl] A self-`NOTIFY` delivered AFTER the triggering query's ReadyForQuery (arrives between queries) is swallowed by `handle()` `case 'A'` and never surfaces; the next query is unaffected. (refs: listen_notify connection lifetime — node-postgres#2537)
- [P1][integration][impl] `RAISE NOTICE 'msg'` inside a function/`DO` block emits a NoticeResponse (`'N'`) that is ignored: the surrounding query completes successfully with its normal result, and the notice does NOT become a thrown PgError. (refs: listen_notify NoticeResponse — node-postgres#1971)
- [P2][integration][impl] A NOTIFY whose payload is empty/NULL (`NOTIFY ch`) arriving on the connection is ignored exactly like a payloaded one — no parser exception on a zero-length payload field. (refs: listen_notify NULL payload — node-postgres#23)
- [P2][unit][impl] No `notify(channel,payload)` helper exists; the only way to notify is raw `query("select pg_notify($1,$2)", [ch,payload])`, which executes as an ordinary parameterized query and returns a normal result. (refs: listen_notify parameterization — node-postgres#1258/#1265)

#### COPY is unsupported — must error/return cleanly, never hang the connection (KNOWN FOOTGUN)
- [P0][integration][impl] `query('COPY t TO STDOUT')` (server emits `'H'` CopyOutResponse, `'d'` CopyData rows, `'c'` CopyDone, `'C'`, `'Z'`): minipg ignores `'H'/'d'/'c'` in the `default` branch and resolves on `'C'/'Z'` with an EMPTY/rowless result; assert it does NOT hang and the connection returns to `ready` so the next query succeeds. (refs: copy basic TO STDOUT — node-postgres#80; copy ownership reuse — node-postgres#3283)
- [P0][chaos][impl] FOOTGUN GUARD: `query('COPY t FROM STDIN')` puts the server into CopyIn mode (`'G'`); minipg ignores `'G'` and never sends CopyData/CopyDone, so no ReadyForQuery arrives and the query promise WOULD hang. Wrap the call in a bounded timeout and assert it does NOT silently hang forever — document this as the dangerous case and the [todo:feature] fix (driver should reject COPY-FROM-STDIN client-side or send CopyFail). (refs: copy error-settle — node-postgres#241/#601, postgres.js#1173)
- [P1][unit][todo:feature] minipg SHOULD detect a COPY-initiating statement (or the `'G'` response) and reject the query with a clear, actionable PgError ("COPY is not supported") instead of swallowing the frame — pending spec until implemented. (refs: copy parameters/clear-error — node-postgres#1176, node-postgres#241)
- [P1][integration][impl] After a COPY TO STDOUT call resolves empty (per above), the SAME connection runs a normal `select` correctly — protocol did not desync from the swallowed `'H'/'d'/'c'` frames. (refs: copy mid-stream resync / reuse — node-postgres#601, node-postgres#3283)
- [P1][integration][impl] `pool.query('COPY t TO STDOUT')` does not desync the pool: whether it resolves empty or errors, the borrowed connection is released and a subsequent `pool.query('select 1')` from the pool returns `1`. (refs: copy pool ownership — node-postgres#3283)
- [P2][unit][impl] No `copyFrom`/`copyTo` streaming method exists; COPY is reachable only as a raw `query(...)` string (which behaves per the guards above), confirming COPY-as-Node-stream is genuinely out of scope. (refs: copy stream lifecycle — node-postgres#3284, postgres.js#917)

#### Logical replication / `subscribe()` is unsupported
- [P1][integration][impl] minipg always uses the EXTENDED protocol (Parse/Bind/Describe/Execute — see `startTask` in `src/connection.ts`); assert it never offers a replication/simple-query mode, so `START_REPLICATION` paths are unreachable. A `query('IDENTIFY_SYSTEM')` over a normal connection just runs as an ordinary statement (or errors from the server), not a replication handshake. (refs: replication protocol mode — postgres.js#292)
- [P1][unit][impl] No `subscribe()` API and no `replication` connection option exist on `ConnectConfig`/`Pool`; assert the surface is absent so logical-decoding is not silently half-implemented. (refs: replication public typings — postgres.js#262)
- [P2][integration][impl] If the server sends a CopyBothResponse (`'W'`, the replication streaming frame) it lands in the `default` ignore branch and does not crash the parser; assert no exception (this is the same swallow path as COPY, kept as a regression sentinel). (refs: replication decoding overrun — postgres.js#296)

#### Other out-of-scope surfaces (guard, do not cover)
- [P2][unit][impl] No simple-query (`'Q'`) entry point is exposed today; multi-statement strings go through extended protocol where a single statement is expected — assert a multi-statement string (`'select 1; select 2'`) behaves per server (errors), confirming simple-query is [todo:feature] not silently present. (refs: roadmap simple-query protocol)
- [P2][unit][impl] No cursor / server-side portal streaming API beyond `conn.stream()`; assert there is no `cursor()`/`fetch(n)` method — server-side cursors are out of scope. (refs: replication row-by-row cursor — node-postgres#1759)

#### Runtime parity — Bun (primary) full suite
- [P0][integration][impl] The entire suite runs under `bun test` (per `test/smoke.ts` shebang `bun test/smoke.ts`): connect, parameterized query, all four result modes, and `stream()` with backpressure all pass on Bun against the real PG. (refs: runtime alternative-runtimes Bun — postgres.js#427/#692, node-postgres#3420)
- [P1][integration][impl] On Bun, `createPool` + concurrent `pool.query` issued 2nd/3rd time keep low latency and reuse connections (no per-request reconnect); pool drains cleanly on `pool.end()`. (refs: runtime Bun pooled latency — node-postgres#3679)
- [P1][integration][impl] On Bun, an SSL connection (`ssl:'require'`) connects, runs `select 1`, and `conn.end()` RESOLVES (does not leave a never-resolving promise) — guard against the Deno/Bun end-over-SSL hang. (refs: runtime end-over-SSL — node-postgres#3420/#3481)

#### Runtime parity — Node smoke subset
- [P0][integration][impl] A smoke subset (connect + `select 1` + one parameterized query + `object` mode + `conn.end()`) runs identically under `node` (via tsx/ts loader) as under Bun; assert the same row values and no runtime-specific failures. (refs: runtime Node LTS connect — node-postgres#2170/#2895)
- [P1][unit][impl] Loading `src/index.ts` under Node emits ZERO deprecation warnings (no `new Buffer()`; capture `process.on('warning')` during import) — buffers use `Buffer.alloc`/`Buffer.from`. (refs: runtime deprecation hygiene — node-postgres#1158/#1473)
- [P2][integration][impl] `AsyncLocalStorage` context set before a query is readable inside the resolved query's `.then` on Node (no async-context loss across the socket callback). (refs: runtime async-context — node-postgres#2404/#2533)

#### Pure net/tls/crypto surface (no native, no edge-only APIs)
- [P0][unit][impl] Static-import audit: the driver imports ONLY `node:net`/`node:tls`/`node:crypto` (+ `node:assert` in tests) for I/O and auth — assert there is no `require`/import of `pg-native`, libpq, `cloudflare:sockets`, or any native addon anywhere under `src/`. (refs: runtime bundler native-dep — node-postgres#838/#2975; cloudflare scheme — postgres.js#691)
- [P1][unit][impl] SCRAM-SHA-256 / md5 auth use `node:crypto` primitives (PBKDF2, `timingSafeEqual`) — assert auth works on both Bun and Node with the same crypto code path (no web-crypto vs node-crypto divergence). (refs: runtime crypto feature-detect — node-postgres#3050/#3206)
- [P2][unit][impl] The driver does not read `process.env` at module top-level for config when a full config object is passed (grep `src/` for top-level `process.env`); assert importing with explicit config works in an env-restricted context. (refs: runtime no-top-level-env — node-postgres#3560, postgres.js#1078)
- [P2][unit][impl] No browser-only or edge-only assumptions: a bare `import` of the driver does not crash on absence of `os.userInfo`/`perf_hooks`; default username resolution is guarded. (refs: runtime feature-detect — postgres.js#990/#51)

### Fixtures & data needed
- Reuse `test/smoke.ts` schema: table `t(id int4 pk, name text, n8 int8, amount numeric, ok bool, data jsonb, blob bytea)` seeded with 3 rows (row 3 has NULL name) — already present.
- A second connection (or the pool) to send NOTIFY while the first LISTENs.
- A small table for COPY targets (the existing `t` suffices for `COPY t TO STDOUT`; a throwaway `copy_t(a int)` for `COPY ... FROM STDIN` hang guard).
- Server roles: default `postgres` superuser is enough; no replication slot / `replication=database` role needed (replication is only guarded as absent).
- Bounded-timeout helper (e.g. `Promise.race` with a 2s timer) to assert the COPY-FROM-STDIN hang guard without wedging the test process.
- Both `bun` and `node` (with a TS loader, e.g. tsx) available on PATH for the parity matrix; PG reachable at `127.0.0.1:54329` (testdb / postgres / postgres) per smoke config.

### PG-version / config sensitivities
- NOTIFY/Notice framing is identical PG14–17; payload-less NOTIFY yields a zero-length payload field — exercise the parser on that edge regardless of version.
- COPY default format is text; `COPY t TO STDOUT` output and the CommandComplete `COPY n` tag are stable across PG14–17, but the swallowed-result behavior under test is driver-side, so version-insensitive.
- `RAISE NOTICE` verbosity and whether a NoticeResponse is sent can depend on `client_min_messages`; set it explicitly (`notice`) so the ignore-path test is deterministic.
- SSL/SCRAM parity depends on `password_encryption=scram-sha-256` (PG default since 14) vs md5; run the crypto-surface test against both encodings if the server allows.
- Bun vs Node TLS stacks differ; the end-over-SSL resolve test is the runtime-sensitive one. `standard_conforming_strings`/`bytea_output`/`DateStyle` are not exercised by these guards (decoding parity lives in other domains).

### Estimated test count
33
