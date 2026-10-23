# minipg — Development History

**minipg** is a dependency-free PostgreSQL driver in pure TypeScript, built Bun-first with multi-runtime entries (Node, Deno, Cloudflare Workers) and serverless drivers (Neon WebSocket/HTTP, AWS Aurora Data API). It was built in roughly two weeks (June 26 – July 10, 2026) across five working sessions, starting from a benchmark of `pg` vs `postgres.js` and ending as a full driver: faster than both incumbents and `Bun.sql` on decode-heavy reads, ~3× faster than postgres.js on bulk inserts, with logical replication, server-side cursors, and snapshot-pinned reads.

Method notes that shaped everything: designs were explored in isolated `playground/` benches before any `src/` change; every encoder change is guarded by byte-identity tests (+ fast-check properties); the JIT and interpreted mappers are held equal by a dual-variant test suite that runs every query test against both engines; benchmarks interleave lanes per round (±2% spread vs ±30% sequential) and never compare across hygiene regimes (post-checkpoint vs back-to-back).

Hardware/context for all numbers: Apple M4, Bun 1.3.14 (JSC), local PG 14.15 (unix socket, port 54329) unless stated otherwise.

---

## Phase 1 — Foundation from real-world evidence (Jun 26–27)

The project began by mining the incumbents' issue trackers to learn what breaks real drivers before writing one.

- **Issue corpus:** all 3,258 issues from postgres.js (797) + node-postgres (2,460), clustered by ~50 background agents into a 26-category driver taxonomy → `ISSUE_CLUSTERS_AND_TEST_SUITE.md` (501KB, 1,175 cited test cases, gap analysis).
- **Local research DB:** PGlite cache of issues + ~13.4k comments with GIN FTS and pgvector semantic search (all-MiniLM-L6-v2, 384-dim, fully offline).
- **Architecture teardown:** `ARCHITECTURE_AND_FLOWS.md` (13 subsystems, 26 Mermaid diagrams of both incumbents, source-grounded) + `RUNTIME_DEPENDENCIES.md` (Node-builtin usage matrices, cross-runtime support).
- **Driver core shipped (Jun 27):** 7 strict-TS modules — `connection.ts`, `protocol.ts`, `codec.ts`, `auth.ts` (md5 + SCRAM with SASLprep), `pool.ts`, `errors.ts`, `types.ts`. Extended protocol, prepared-statement cache, streaming with TCP backpressure. 15/15 smoke checks vs real PG.
- **Test plan:** `TEST_PLAN.md` (~1,106 cases, 22 domains, each grounded in an issue cluster). An audit pass surfaced and fixed the classic driver killers up front: decoder throws crashing the process, `end()` leaving promises hanging, prototype pollution via `__proto__` columns, parser infinite loop on garbage length, tx-state leaking across pool checkouts.

## Phase 2 — Resilience: cancellation, reconnect, mock server (Jun 28)

- **MockPgServer** (`test/mock/server.ts`): scriptable in-process PG v3 backend — canned results, fault injection (drop-mid-query, fatal-then-close, hang), the restart/prepared-cache trap. The deterministic foundation for chaos tests.
- **Cancellation:** per-query `timeout` + `AbortSignal` → out-of-band CancelRequest on a fresh socket (v3 protocol can't cancel in-band) + socket-destroy fallback.
- **Pool circuit breaker:** DB restart (the single most-reported failure class in the corpus) → ONE background probe with backoff; the waiting herd is released only when the probe reconnects. No reconnect storm. Default on.
- **Durable single-connection reconnect** (opt-in): reject in-flight, keep queued, clear prepared cache, backoff, resume.
- Suite at this point: 861 → 887 pass / 0 fail.

## Phase 3 — Performance: from 1.3× slower to fastest (Jun 28 – Jul 4)

Baseline honesty first: initial minipg was **1.1–1.3× slower than `pg`**. A variant-based exploration (each kept as a bench fixture, gated by a verifier) found what actually pays:

- Per-column decoder functions: **no gain** (rejected). Fused parse/decode: **no gain** (rejected).
- Int-from-bytes: decode 1.46×. Reusable write buffer: write 1.6–2.1×.
- **Codegen row mapper** (monomorphic `new Function` object literal, decode straight from buffer offsets): decode 1.66× (array) / 1.84× (object) — erases the object-mode penalty.
- Winner merged: write-buffer + inlined codegen. Real-PG verdict: fastest on param/100-row/prepared vs both incumbents.

Follow-on decode work:

- **latin1 fast path** for ASCII-guaranteed types (numbers, temporals, uuid): 1.4–1.7×.
- **Binary wire format per column**, bench-proven per type: timestamptz→epoch **6.9–10.7×**, date ~10×, float8 bit-exact `readDoubleBE`. Rejected from binary: uuid (text is 3.5× faster), json/jsonb (PG stores json as text — binary saves nothing).
- **Shape-aware JSON scanner:** the headline is correctness — `JSON.parse` silently corrupts int8 in `json_agg` (`9007199254740993` → `…992`). Hybrid shipped: regex bigint pre-scan (1.27× overhead on the common path) → native JSON.parse when safe, byte-scanner when precision demands.
- **Engine portability finding:** V8 and JSC disagree wildly (`Object.create(null)` rows: JSC 16µs vs V8 430µs) — the monomorphic object literal is the only portable fast path.

**Standings after merge (1000 rows, real PG, minipg JIT = 1.0×):** Bun.sql 1.23×, `pg` 2.64×, postgres.js 3.40× slower.

The JIT and interpreted engines were then unified: **one driver, one seam** — `decode: 'auto' | 'jit' | 'interpreted'` (auto = JIT where `new Function` works, interpreted under CSP/QuickJS), kept provably equal by the dual-variant suite.

## Phase 4 — Typed results: shapes, defaults, self-healing (Jul 2–4)

- **`query(sql, params, { shape })`** — declared column shapes drive a compiled mapper: `{ id: 'bigint:number', created: 'timestamptz:ms' }`.
- **Decode defaults chosen deliberately** (user calls): temporal → `Date`, int8 → `BigInt` (exact), numeric → exact string; opt-outs per column (`:string`, `:ms`, `:number`) or globally (`temporal: 'string'`).
- **Shapes auto-request binary** for bench-proven types (`BINARY_FAST`). Adversarial verification caught two silent-corruption bugs before ship: int8>2⁵³ text-vs-binary rounding divergence, and years 0001–0099 remapped to 1900+ by `Date.UTC`.
- **float4 story:** `float4:precise` (exact stored f32, binary-eligible, verified 20k values) vs `:pretty` (PG canonical text). A pure-JS Ryu float32 port was built and validated against 3M values (including PG's `acceptBounds=false` quirk) — then **rejected**: text `Number()` is both fastest and 100% correct for the canonical value.
- **Prepared reuse auto-upgrades to binary:** named plain queries go text on execution #1 (OIDs unknown), binary from #2 via cached RowDescription.
- **DDL self-heal:** `0A000 cached plan must not change result type` → transparent one-shot retry (re-Parse), with strict guards (never in-tx, never typed, never streams). Verified: a retried INSERT does not double-insert (0A000 fires pre-execution).
- **Observability:** `metrics` (ms/µs), `debug` (statement reuse, decode engine, generated mapper source), `{ trace }` for caller stack traces — after exploring six approaches across Bun/Node/Deno and proving no runtime built-in can do it (async stack tagging is DevTools-only; ALS can't attribute a shared socket callback).
- **Packaged:** `minipg 0.1.0`, tsdown unbundled (1:1 `src/*.js` + `.d.ts`).

## Phase 5 — Pipelining, pool API, transactions (Jul 4–5)

- **Pipelining, default-on** (`pipeline: false` to opt out): the single `current` slot became an `inflight` FIFO (PG replies in order); gated mode is literally depth 1. Per-query Sync gives free error isolation. Streams are solo barriers. Auto-off behind transaction poolers.
- **Write coalescing:** `queueMicrotask` flush — `Promise.all` of 20 queries leaves in ONE socket write.
- **`connection.rtt`** — rolling round-trip samples from auth legs + per-query TTFB (localhost floor measured: 49µs).
- **Lazy pool API:** `pool.query()` returns a thenable `PoolQuery` (nothing runs until awaited); `pool.execute()` is the eager form. Three set-runners: `pool.batch()` (one conn, atomic tx, pipelined), `pool.pipeline()` (one conn, autocommit each), `pool.parallel()` (fan out).
- **Transactions:** `begin(fn)` / `transaction(fn)` on Pool + Connection; the `tx` handed to the callback IS the connection (hot path, streaming, pipelining inside); nesting auto-savepoints; isolation options.
- Suite: 1,189 pass / 0 fail, both variants.

## Phase 6 — Serverless drivers (Jul 5–6)

- **`minipg/neon-ws`:** Neon's WS proxy tunnels the real wire protocol → pure `config.socket` transport, ZERO core changes — prepared statements, pipelining, transactions all work. Facts pinned from Neon's own source: `wss://<host>/v2`, no SSLRequest, plain SCRAM. 465 tests pass over a live WAN tunnel. Found Neon virtualizes `backendKey.pid`.
- **`minipg/neon-http`:** not wire protocol — a new query client that still **reuses the compiled mapper** by byte-scanning the raw HTTP response into synthetic DataRows: **4.13ms / 24KB alloc** per 5000-row decode vs 8.66ms / 1.30MB naive JSON.parse (~2× faster, ~54× less alloc). Full-suite audit: zero decode bugs; a dedicated cross-transport parity suite asserts HTTP ≡ wire decode.
- **`minipg/aurora`** (RDS Data API): zero-dep hand-rolled SigV4 via WebCrypto (proven against AWS vectors), `bind()` param API, per-cell Field variants converted to PG text and fed through the same mapper — int8 above 2⁵³ exact via `longReturnType=STRING`. Validated offline (mock fetch), against the local-data-api Docker emulator, and against **real deployed AWS Aurora** (then torn down).
- **Verified on real workerd** (`minipg/cf`): SCRAM, streaming, binary typed queries, Hyperdrive binding.

## Phase 7 — The insert ladder (Jul 5–7)

Explored bottom-up in `playground/inserts/` (raw protocol clients, no src changes), then shipped as public API:

| Path | Throughput (10k-row tier, 6-col) |
|---|---|
| sequential autocommit | 30k rows/s |
| one tx, sequential | 80k |
| pipelined 1-row inserts | 284k |
| VALUES ×100 | 737k |
| **`bulkInsert` (unnest arrays)** | **825k** |
| **`copyMany` (binary COPY)** | **1.11M** (~3× postgres.js helper) |

Key findings and features along the way:

- **Write-through param encoding:** the old value→String→Buffer chain (705ns/row) became direct buffer writes — text 302ns, **binary 157ns, zero heap allocs** (4.8× on 10k batches). Binary plans compile from server-echoed OIDs (server truth beats declared types).
- **`params` option** (explicit declared types, e.g. `['int8', 'int4[]', 'jsonb']`): OIDs go into Parse — pins types server-side, enables binary from execution #1, pooler-safe. This explicit model beats `pg` (text+infer), postgres.js (JS-value inference breaks on empty/mixed arrays), and `$1::type` casts.
- **JIT bind encoder** (`compileBindEncoder`): per-statement generated function writing the whole Bind+Execute+Sync; period-detection reuses one row body ×N for VALUES batches. **2.29× single-row / 1.97× batch client-side** — but 1M-row end-to-end is ~1.0×: inserts are server-bound; the JIT is a client-CPU win (byte-identity enforced by 4,000-run fast-check).
- **`bulkInsert`:** unnest arrays = ONE stable prepared statement (every cache stays hot); auto-chunks (single statements collapse at 1M rows — server materializes the whole array before row 1); chunk size adapts to row width (`min(64, 32KB/rowBytes)` after a sweep showed big chunks never win on realistic WAL-on servers).
- **`bulkInsert({ defaults: true })`** (Jul 7): unnest can't express DEFAULT — an `undefined` cell would insert NULL and override it. Opt-in switches to multi-row VALUES where `undefined` emits the literal `DEFAULT` keyword (volatile defaults like `nextval` evaluate per row) while explicit `null` stays NULL. Naming the generated statements measured **2.5× faster** in the uniform case → always name, no cap.
- **`copyFrom` / `copyMany`:** COPY FROM STDIN over the simple protocol, ~256KB frames with drain backpressure; binary COPY reuses the same element encoders as binary params.
- **`bulkUpdate`:** unnest-join updates; shape spread is small (≤1.8× — per-row MVCC dominates), adaptive chunking transfers (261k rows/s @100k).
- **`atomic: false`** WAL-friendly mode (chunk-per-commit, survivable failures, `error.insertedRows`) — measured **fastest at 1M** (1.12M rows/s, +23% over one giant COPY). **UNLOGGED is THE server lever:** +40–80%, copyMany 1.88M rows/s project record.
- **`onProgress`** per-chunk callbacks (rows, bytes, elapsed).
- **Upserts explored, deliberately parked:** DO UPDATE + duplicate in one statement = error 21000 → chunk-boundary lottery. Decision: NEVER silently dedupe; design finalized (loud client-side duplicate detection) awaiting go-ahead.
- Found and fixed the **42P05 pipelined-named-statement race** (N first-uses of a name in one burst each wrote Parse).

## Phase 8 — Correctness sweeps: arrays, engines, runtimes (Jul 7–8)

- **Array params:** audit found 14 of 23 declared array types mis-encoded as JSON (`22P02`). Fixed: every array OID routes through the binary array encoder with text-literal fallback. 29/29 verified live vs Neon.
- **Array output decode, shape-gated** (can't gate by OID — plain and shaped `int4[]` share 1007): `shape: { v: 'numeric[]' }` decodes with element precision (int8[]→BigInt, numeric[]→exact string). Adversarial verify caught 2 edge bugs (BC-era dates, ±infinity in arrays) — fixed to match binary scalars. *Later superseded: the gate was dropped and the array decoder is now bound to the built-in array OIDs themselves (`tagArrayCol`), so plain queries decode arrays too — shaped and unshaped `int4[]` deliberately land on the same value. `config.types` still overrides per-OID; per-database element types (`enum[]`, `domain[]`, composite arrays) remain shape-only.*
- **Write-through text encoders:** array literals 1.2×, COPY text 1.74×.
- **Collect/Transform/Nullable shape markers:** `Collect({...})` groups flat join columns into nested objects; `Transform(type, fn)` per-column decode-time transforms (null passes through); works inside `Json()`/`Jsonb()` too. Later split: `Collect` always returns an object; `CollectNullable` nulls the group on LEFT-JOIN miss.
- **`'unknown'` shape type:** column decodes by runtime OID when the type isn't known upfront.
- **PostGIS/pgvector types** (explicit-only, bare names stay raw text): `point:xy`, `vector:f32`, `geometry:geojson`/`Buffer` — full EWKB parser (7 geometry types, SRID, Z/M, both byte orders).
- **LLRT investigated, dropped** (user call): QuickJS has no `new Function` — the existing `isEvalAvailable()` gate already handles it; not a real PG audience.

## Phase 9 — The backpressure discovery (Jul 8)

A Go/Rust shootout (pgx v5, tokio-postgres — same prepared-statement workload, tuned PG) exposed minipg's one pathological case: **pipelining over a unix socket was slower than sequential** (1059ms vs 704ms, 3× CPU) while TCP was fine.

- Root cause: `flushWrites()` ignored `socket.write()`'s return value — ~6.7MB queued into an 8KB socket send buffer, and managing that userspace queue was the CPU cost.
- A fixed byte cap would be WRONG: optimal in-flight = bandwidth-delay product, which is opposite by locality (Neon at ~30ms RTT scales 4.6× with deep pipeline; local wants shallow).
- **Fix: let the socket's own flow-control decide** — observe `write() === false`, arm a one-shot `'drain'`, gate dispatch. No constant, self-tuning. Result: socket 1059→**593ms** (CPU 616→181), TCP also improved, **Neon deep-pipeline preserved** (0.48M rows/s).
- Post-fix standings (1M-row bulk insert, tuned PG): minipg 505ms ≈ Rust/tokio-postgres 501ms, ahead of Go/pgx.

## Phase 10 — Logical replication for CDC (Jul 7–9)

Built for drizzle-pulse. Proven end-to-end in `playground/replication/` first, then shipped as `replication()` (`src/replication.ts`):

- Walsender over the real auth/transport stack: IDENTIFY_SYSTEM, CREATE_REPLICATION_SLOT (legacy `EXPORT_SNAPSHOT` keyword — the parenthesized form is PG15+), START_REPLICATION, CopyBoth streaming, standby-status acks.
- pgoutput v1 decode (Begin/Commit/Relation/Insert/Update/Delete/Truncate/Message); relation messages carry column OIDs → **the existing decoder catalog and JIT mappers apply unchanged** (tuples are query-wire text).
- **Gapless backfill proven:** exported snapshot sees exactly pre-slot rows; post-slot writes arrive as the first streamed transactions. At-least-once semantics verified (no ack → full replay on reconnect).
- Gotchas documented: REPLICA IDENTITY DEFAULT = no old tuple; unchanged TOAST columns = marker not value (and only incompressible >2KB values TOAST); unacked durable slots retain WAL (disk hazard).
- **Live demo:** `watch.ts` — console CDC diffs of Drizzle Studio edits, confirmed working.

## Phase 11 — The read path: cursors and snapshots (Jul 9–10)

- **`cursor()`** (Pool + Connection): server-side DECLARE/FETCH cursors — sync creation, lazy open, `next()` / `all()` / `drain()` / `batches()` / `for await`. Abandonment guards: client idle timer (non-destructive rollback — the pooled connection survives) + server `idle_in_transaction_session_timeout` (fires even if the process froze). `fullScan` sets `cursor_tuple_fraction = 1.0`; `snapshot` pins an exported snapshot. DECLARE accepts $n bind params (verified); COPY doesn't.
- **`backfill()` deleted** — `cursor({ snapshot, fullScan })` + eager `open()` fully subsumed it.
- **`query({ snapshot })`:** one-shot snapshot-pinned reads — BEGIN/SET SNAPSHOT/query/COMMIT pipeline into ONE round trip; failure self-rollbacks.
- **COPY-based reading REJECTED with numbers:** cursor fully decoding objects (3.86M rows/s) beats COPY TO transport-only (2.90M) — DataRow's length-prefixed fields decode faster than COPY's escaped text can even be split.
- **Backfill tuning (1M rows):** `shape` is the one big lever (**4.88M rows/s, +33%** — binary wire for fast types); array mode buys nothing (JIT makes object keys free); same-process parallel cursors LOSE (the single JS thread is the ceiling — split across workers, pinned to one snapshot, if >5M rows/s is needed).
- **DB-pressure probe:** neither a big SELECT nor a cursor buffers results server-side (~1MB backend memory either way — Postgres streams). The real cursor cost is the open snapshot blocking vacuum, which the guards cap. Client memory is the only story: `all()` ≈ 150MB/1M rows, streamed `batches()` ≈ 10MB flat.

---

## Rejected approaches (with reasons)

| Idea | Verdict |
|---|---|
| Per-column decoder functions, fused parse/decode | No measurable gain |
| uuid/json binary wire format | Text is faster (uuid 3.5×; json is stored as text) |
| Ryu float32 shortest-round-trip port | Correct (3M values verified) but slow; text `Number()` wins |
| `Object.create(null)` rows | 27× slower on V8; `__proto__` guard instead |
| COPY for reading | Cursor beats it decoded-vs-transport-only; no params/pacing |
| Same-process parallel cursors | JS thread is the ceiling; slower than one cursor |
| Fixed byte cap for pipelining | BDP is locality-dependent; socket flow-control self-tunes |
| Silent upsert dedupe | Never silently drop data (design principle) |
| LLRT support | Not a real PG audience; eval-gate already degrades gracefully |
| Write-splitting for socket backpressure | Total in-flight bytes matter, not per-write size |
| `captureStackTrace` default | Reverted; opt-in `{ trace }` per query instead |
| VALUES mode at scale | Chunk-size artifact; tuned unnest wins every scale |

## Headline numbers (for slides)

- **Decode (1000 rows):** minipg JIT 1.0× > Bun.sql 1.23× > pg 2.64× > postgres.js 3.40×
- **Insert ladder (10k tier):** pipelined 284k → VALUES 737k → bulkInsert 825k → copyMany 1.11M rows/s; UNLOGGED record 1.88M
- **Read path (1M rows):** cursor+shape 4.88M rows/s decoded; query{snapshot} single round trip
- **neon-http decode:** ~2× faster, ~54× less allocation than naive JSON handling
- **Backpressure fix:** unix socket 1059→593ms, CPU 616→181ms, remote unharmed
- **vs native:** 1M-row bulk insert — minipg (Bun) 505ms ≈ Rust tokio-postgres 501ms
- **Tests:** ~1,200 integration/unit cases, every query test run against BOTH decode engines; byte-identity + fast-check on every encoder; adversarial verify workflows caught 4+ silent-corruption bugs pre-ship

## Session index

| Session | Span | Focus |
|---|---|---|
| c5406bc1 | Jun 26 – Jul 4 | Corpus, core driver, resilience, JIT decode, shapes, packaging |
| f7b6e694 | Jul 1 – Jul 5 | Pipelining, rtt, lazy pool API, transactions |
| a7cc5fbb | Jul 5 – Jul 10 | Serverless drivers, arrays, JIT encoder, backpressure fix, Go/Rust shootout |
| ffe4d832 | Jul 7 | `bulkInsert({ defaults: true })` |
| 64537bcf | Jul 5 – Jul 10 | Insert ladder, replication/CDC, cursor(), snapshot reads, read-path tuning |
