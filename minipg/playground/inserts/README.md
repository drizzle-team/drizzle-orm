# Insert efficiency ladder — playground

Design exploration for minipg's insert story. **Zero `src/` changes** — everything minipg runs
through the public API; COPY runs through `copy-client.ts`, a ~150-line raw-protocol client that
doubles as the prototype for CopyIn support in `src/connection.ts` (which today answers
CopyInResponse with CopyFail).

## Files

- `inserts.bench.ts` — the ladder, measured end-to-end (rows-in-memory → COMMIT confirmed,
  client-side encoding inside the timed section). `bun playground/inserts/inserts.bench.ts [N,N,...]`
- `copy-client.ts` — minimal raw wire client: startup (trust/unix only), simple query,
  `copyIn(sql, chunks)` with drain-aware backpressure. Reuses `src/protocol.ts` W/Parser.
- `encode.ts` — the encode-side prototypes minipg lacks: text array literals (unnest path),
  COPY text rows, COPY binary rows. The COPY-binary per-field format (int32 len + big-endian
  value) is byte-identical to binary Bind params — one encoder table serves both.

Needs the local cluster from `bun run test:setup` (unix socket `/tmp/minipg_sock`, trust auth).

## Results (2026-07-06, M-series mac, PG 14.15, unix socket, table: int8 PK + text/int4/float8/bool/timestamptz)

Median rows/s; 100k tier has ±25% run-to-run variance (WAL/checkpoint noise) but ordering is stable.

| strategy | 1,000 rows | 10,000 rows | 100,000 rows |
|---|---:|---:|---:|
| minipg · seq prepared, autocommit | 29,928/s | 30,421/s | — |
| minipg · seq prepared, one tx | 84,101/s | 73,331/s | — |
| minipg · pipelined 1-row, one tx | 249,979/s | 272,802/s | 244,389/s |
| minipg · VALUES ×100, one tx | 371,471/s | 428,360/s | 400,678/s |
| minipg · VALUES ×1000, one tx | 332,419/s | 402,143/s | 247,911/s |
| minipg · unnest arrays, 1 stmt | 589,608/s | 599,718/s | 397,956/s |
| minipg · unnest ×10k chunks, one tx | 569,476/s | 603,406/s | 326,797/s |
| COPY text (raw prototype) | 446,753/s | 762,251/s | 522,652/s |
| COPY binary (raw prototype) | 528,634/s | 1,043,651/s | 674,715/s |
| pg · seq prepared, one tx | 93,795/s | 73,476/s | — |
| postgres.js · helper ×1000, one tx | 283,229/s | 402,100/s | 369,477/s |

Correctness spot-check: COPY text + binary round-trip verified via psql (tab/quote/backslash
escaping, negative ints, exact float8, bool, sub-ms timestamptz epoch math).

## Takeaways

1. **Every rung of the ladder is real.** autocommit (fsync-bound, 30k/s) → one tx (RTT-bound,
   80k/s, identical for minipg and pg — driver overhead is irrelevant when sequential) →
   pipelined (3.5×) → batched statements (~1.6× more) → COPY (~2× more).
2. **unnest is the best SQL-statement batch path**: ~600k rows/s, fastest non-COPY strategy at
   ≤10k rows, 1.5× postgres.js's multi-VALUES helper — with ONE immutable prepared statement
   (client statement cache, server plancache, and template-chunks cache all stay hot, and it
   works unprepared behind transaction poolers). Giant single statements degrade past ~10k rows
   (multi-MB array literals); chunking at ~10k holds the peak.
3. **VALUES ×100 beats ×1000** at every N — bigger chunks pay more in Bind processing and
   param flattening than they save in per-statement overhead. If multi-VALUES is used at all,
   chunk small.
4. **COPY binary is the ceiling**: ~1M rows/s at 10k-row batches, 675k/s at 100k (PK btree
   growth is then the bottleneck). COPY text is ~25-40% slower than binary but trivial to
   generate. Client-side row encoding is a negligible share of the time.
5. **Driver bug found** (fix in src/): pipelining N first-uses of the same *named* statement
   writes N Parse messages for that name — `Connection.prepared` only fills when the Describe
   response arrives — so the server kills the second with 42P05 "prepared statement already
   exists". Hits `pool.batch()` with named queries too. Clean fix: track names with an
   in-flight Parse; later queries in the burst skip Parse and Bind against the name directly
   (the server processes the pipeline in order, so the statement exists by the time their Bind
   runs). The bench works around it by priming each name once.

## src/ roadmap — items 1 + 4 SHIPPED (2026-07-06)

1. ~~Binary param encoding~~ **DONE** — write-through `encodeValueInto`/`writeBindWith` +
   ParameterDescription caching + binary plans on reuse + declared `paramTypes` (binary from
   the FIRST execution, unnamed/pooler-safe). See `playground/bind-encode/README.md`.
2. ~~`unnest` batch-insert helper + array encoding~~ **DONE** — binary array params (codec
   arrayEnc + text-literal fallback), `params: ['int8[]']` declared types, and
   `bulkInsert(table, columns, rows)` on Connection + Pool. **863k rows/s at 10k rows** —
   beats COPY text (724k) and VALUES ×100 (729k); 87% of the COPY-binary ceiling, in one call.
3. ~~CopyIn state machine + `copyFrom()` API~~ **DONE** — `copyFrom(sql, source)` (simple-'Q'
   copy state machine, solo gating like streams, drain-backpressured CopyData pump, always
   terminates with CopyDone/CopyFail) + `copyMany(table, columns, rows)` (binary row encoding
   reusing the param element encoders; auto-falls to text format for non-binary column types).
   **copyMany binary: 1.11M rows/s at 10k, 701k at 100k — above this playground's raw
   prototype on both tiers.** The raw client here stays as protocol documentation.
4. ~~Fix the 42P05 pipelined-named-statement race~~ **DONE** — `parseInflight` dedup: later
   first-uses in a burst skip Parse and Bind against the in-flight name. The priming block this
   bench needed is deleted; running un-primed is the live regression check.

**Ladder complete (2026-07-06, all through public driver API, 10k-row tier):** pipelined 284k →
VALUES ×100 737k → bulkInsert 825k → **copyMany binary 1.11M rows/s** (~3× postgres.js's
insert helper). Remaining perf lever on the shelf: the JIT scalar-row encoder
(playground/bind-encode/jit.bench.ts, 62 ns/row, not yet wired).

**CANONICAL rebench (2026-07-06 pt3, full ladder incl. COPY + a 1M-row tier — median rows/s):**

| strategy | 1,000 | 10,000 | 100,000 | 1,000,000 |
|---|---:|---:|---:|---:|
| minipg · seq prepared, autocommit | 29,709/s | 30,283/s | — | — |
| minipg · seq prepared, one tx | 89,269/s | 80,051/s | — | — |
| minipg · pipelined 1-row, one tx | 262,976/s | 293,272/s | 233,318/s | — |
| minipg · VALUES ×100, one tx | 576,120/s | 731,511/s | 457,223/s | 389,108/s |
| minipg · bulkInsert (unnest binary) | **759,085/s** | 827,079/s | 358,127/s | 98,141/s ⚠ |
| minipg · copyMany (binary) | 454,666/s | **1,119,560/s** | **686,874/s** | 451,102/s |
| minipg · copyMany (text) | 404,251/s | 847,538/s | 605,264/s | **486,848/s** |
| COPY binary (raw prototype) | 471,615/s | 971,554/s | 582,679/s | 545,725/s |
| postgres.js · helper ×1000, one tx | 251,850/s | 390,863/s | 296,482/s | 258,628/s |

**Crossover guidance from the 1M tier:** bulkInsert wins below ~5k rows/call (COPY pays a fixed
statement setup), copyMany wins from ~10k up. ⚠ single-statement unnest COLLAPSES at 1M rows
(98k/s — the server materializes six 1M-element arrays). copyMany stays fast at every scale;
at 1M the bottleneck is server-side (WAL + btree), where text and binary COPY converge (~470k)
and client encoding stops mattering.

**FINAL canonical matrix (2026-07-06 pt4, RUN HYGIENE: checkpoint + settle before every timed
run, so lanes measure reproducible post-checkpoint loading incl. full-page writes — uniformly
lower than the earlier back-to-back "steady-state" tables, which remain the hot upper bound):**

| strategy | 10,000 | 100,000 | 1,000,000 |
|---|---:|---:|---:|
| pipelined 1-row, one tx | 200,694/s | 187,534/s | — |
| VALUES ×100, one tx | 333,718/s | 558,289/s | 579,152/s |
| bulkInsert (auto-chunk ×1k, binary) | 384,592/s | 318,771/s | **457,251/s** |
| copyMany (binary, one COPY) | 467,179/s | **963,859/s** | 909,933/s |
| **copyMany (×100k chunks, atomic:false)** | 460,501/s | 909,724/s | **1,118,001/s** |
| COPY binary (raw prototype) | 377,122/s | 594,393/s | 687,895/s |
| postgres.js helper ×1000 | 220,128/s | 344,938/s | 301,044/s |

Findings under hygiene: (1) bulkInsert's default chunk moved 10k → **1k** after a checkpointed
chunk-size probe (10k-row array statements degrade past ~100 statements/tx: 136k/s at 1M vs
254k for 1k chunks; at small N the difference is noise) — the 1M collapse is gone (98k → 457k).
(2) **WAL-mode copyMany is the FASTEST 1M path: 1.12M rows/s, 23% above one giant COPY** —
committing every 100k rows lets WAL flush incrementally instead of racing one end-of-load
checkpoint. (3) FPW dominates short runs: the 10k tier compresses to 330-470k for everything;
per-tier comparisons are only valid within a hygiene regime, never across.

**Follow-up (shipped after this table):** bulkInsert now AUTO-CHUNKS at 10k rows/statement —
chunks pipeline inside one transaction (or the caller's), so the 1M single-statement collapse
above is no longer reachable through the API. Both bulkInsert and copyMany also grew the
WAL-friendly `atomic: false` mode: chunks run sequentially and each COMMITS on its own —
incremental WAL flushes and short transactions instead of one giant end-of-load flush; a
failure keeps prior chunks and the error carries `insertedRows`. (`copyMany` chunking is
opt-in via `chunk`; one COPY statement remains the throughput optimum.)

## WAL-lever matrix (`wal.bench.ts`, 2026-07-06 — 1M rows, hygienic, settings restored after)

| path | baseline | fpw=off | sync_commit=off | UNLOGGED | fsync=off |
|---|---:|---:|---:|---:|---:|
| VALUES ×100 | 632,881/s | 585,109/s | 470,465/s | 1,015,173/s | 864,438/s |
| bulkInsert | 511,981/s | 479,564/s | 543,454/s | 709,274/s | 787,096/s |
| copyMany (binary) | 1,051,845/s | 869,623/s | 1,162,829/s | **1,881,411/s** | 1,617,838/s |

Takeaways: (1) **UNLOGGED is the big lever** (+40-80%; copyMany hits 1.88M rows/s — the project
record) and even beats fsync=off, because fsync=off still GENERATES and writes all the WAL,
just without flushing — UNLOGGED skips generating data-page WAL entirely. The production
pattern: COPY into an UNLOGGED staging table, then `insert … select` into the real one.
(2) **synchronous_commit=off is ~neutral for single-transaction bulk loads** (one commit fsync
amortized over 1M rows); it's the lever for many-small-transaction workloads (our 30k/s
autocommit lane), not batches. (3) **full_page_writes=off does NOT help bulk inserts into
fresh/truncated tables** (all lanes ±noise-to-slower): freshly extended pages don't take FPW
images, so the WAL is tuple data either way — which also corrects our earlier framing: the
post-checkpoint "hygiene tax" on small tiers is mostly cold caches + checkpoint-aftermath I/O,
not FPW. (4) The ±10-25% cross-regime wiggles (e.g. VALUES under sync_commit=off) are the
usual laptop noise floor; only the big moves are signal.

## Chunk-size sweep (`chunk-sweep.bench.ts` + low-end probe, 2026-07-06 — hygienic, median of 3 with min..max spread)

| chunk | 10k rows | 100k rows | 1M rows |
|---:|---:|---:|---:|
| 50 | — | — | 704,232/s |
| 100 | — | — | **768,217/s** |
| 250 | 319,740/s | **627,862/s** | 761,232/s |
| 500 | 334,382/s | 608,451/s | 688,989/s |
| 1,000 | 343,209/s | 553,079/s | 635,865/s |
| 2,000 | 377,035/s | 554,342/s | 448,545/s |
| 5,000 | 322,504/s | 543,031/s | 334,273/s |
| 10,000 | 330,269/s | 547,901/s | 177,590/s |

The 10k tier is all-noise (spreads overlap across every chunk size — fixed post-checkpoint
costs dominate). At 100k+ the trend is clean and monotone: smaller chunks win until ~100,
where per-statement overhead starts to bite (chunk=50 dips). **Default moved 1000 → 250**
(mid-plateau: best at 100k, tied-with-100 at 1M, robust for wider tables / higher-RTT links).
Mechanism: small arrays keep array_recv materialization tiny and cache-friendly, and more
statements give the pipeline finer-grained client/server overlap; per-statement framing costs
only surface below ~100 rows.

## VALUES chunk sweep + head-to-head verdict (`values-sweep.bench.ts`, 2026-07-06)

VALUES rows-per-statement sweep (hygienic): optimum at **~100 rows/stmt** (the classic
convention), plateau 25-250, decline above (1M tier: 100→554k, 250→588k, 1000→428k,
2000→345k; the 10k tier is noise as always). Then the decisive INTERLEAVED head-to-head at 1M
(all lanes per round, drift hits everyone equally — spreads collapsed to ±1-2%):

| lane | median rows/s |
|---|---:|
| **unnest chunk=250 (bulkInsert default)** | **763,912/s** |
| VALUES ×100 (its optimum) | 672,182/s |
| VALUES ×250 | 654,491/s |
| copyMany binary | **1,187,704/s** |

**VERDICT — corrects the earlier "VALUES wins at scale" claim: that was a chunk-size artifact**
(tuned VALUES ×100 vs untuned unnest ×1k/×10k). With BOTH shapes at their optimum, the unnest
engine wins at every scale (+14% at 1M) — the EXPLAIN's 1.75× per-row executor gap is real for
big isolated statements, but at 250-row chunks array materialization is tiny and the pipeline
bottleneck is the whole path, where 6 dense binary arrays beat 1500 individually-framed params.
bulkInsert's engine + chunk=250 default is validated outright; a mode:'values' is dead.
Method note: INTERLEAVED rounds are how to bench on this machine — sequential lane blocks
carry ±30% drift, interleaved carry ±2%.

## Shape sweep: chunk optimum vs row width (`shape-sweep.bench.ts`, interleaved + hygienic)

| shape | optimum chunk | cells/stmt | ~KB/stmt | at optimum | fixed 256 costs |
|---|---:|---:|---:|---:|---:|
| narrow (2 cols, ~14B) | 512 | 1024 | 7 | 1,162k/s | -3% |
| standard (6 cols, ~60B) | 128-256 | 768-1536 | 8-15 | 752k/s | ~0% |
| wide (24 cols, ~150B) | 64 | 1536 | 9 | 304k/s | **-24%** |
| fat-text (6 cols, ~640B) | 64 | 384 | 40 | 137k/s | **-45%** |

The optimum is NOT constant rows: it spans 64-512 across shapes. Two constraints govern it —
**cells/statement (~1-1.5k; per-element array_recv overhead)** and **bytes/statement (~10-40KB;
materialization memcpy)** — whichever binds first. Row-count-fixed defaults lose badly on wide
and fat-text tables. Adaptive formula that lands within a few % of every measured optimum:
`chunk = clamp(min(1024/ncols, 32KB/estRowBytes), 16, 2048)` with row bytes estimated from a
few sampled rows. (Not yet shipped — default is fixed 256.)

## Adaptive vs fixed chunk verdict (`adaptive-chunk.bench.ts`) — SHIPPED as default

Fixed 256 vs the per-batch formula vs the sweep-grid oracle (interleaved + hygienic):
narrow ±0% (formula 512), standard +5% (171), wide **+32%** (43), fat-text **+115%** (48 —
beats the coarse grid's own "oracle", the formula found a better point than the 32/64 grid).
`bulkInsert` now defaults to `clamp(min(1024/ncols, 32KB/estRowBytes), 16, 2048)` computed
per batch from ~4 sampled rows; explicit `chunk` always overrides.

## Single-statement unnest sweep (`unnest-single.bench.ts`, 2026-07-06 — no chunking, binary arrays, hygienic)

| size | unnest SINGLE stmt | unnest ×1k chunks | copyMany binary |
|---:|---:|---:|---:|
| 1,000 | 217,484/s * | 111,583/s * | 130,642/s * |
| 10,000 | 372,040/s | 316,378/s | 438,641/s |
| 50,000 | 399,307/s | 533,049/s | 639,686/s |
| 100,000 | 395,279/s | 571,957/s | 945,626/s |
| 250,000 | 417,664/s | 618,377/s | 1,076,414/s |
| 500,000 | 275,645/s | 616,051/s | 1,151,827/s |
| 1,000,000 | 156,324/s | 605,258/s | 1,204,218/s |

\* the 1k tier is noise-dominated (both unnest lanes run the IDENTICAL single statement there
yet differ 2× — runs are ~5-9ms against ~10ms of fixed post-checkpoint cost).

Reading: single-statement binary unnest PLATEAUS at ~370-420k/s from 10k through 250k rows —
the earlier "degrades past ~10k" claim was about TEXT literals (client-side string cost);
binary arrays push the viable single-statement range to ~250k. The cliff is between 250k and
500k (417k → 276k → 156k): the server materializes ALL arrays via array_recv before the first
row inserts, and 6 multi-million-element arrays blow per-query memory/cache. Chunked ×1k beats
the single statement everywhere above ~30-50k anyway (pipelining overlaps client encode with
server execute; small arrays stay cache-friendly) and NEVER bends — validating the chunk=1000
default. copyMany climbs monotonically to 1.2M/s: streaming has no materialization cliff.

**Earlier post-change rebench (pt2, same method — median rows/s):**

| strategy | 1,000 rows | 10,000 rows | 100,000 rows |
|---|---:|---:|---:|
| minipg · seq prepared, autocommit | 30,160/s | 29,529/s | — |
| minipg · seq prepared, one tx | 88,043/s | 80,515/s | — |
| minipg · pipelined 1-row, one tx | 274,952/s | 297,460/s | 231,072/s |
| minipg · VALUES ×100, one tx | 618,924/s | 686,955/s | 451,784/s |
| minipg · VALUES ×1000, one tx | 434,854/s | 652,140/s | 360,923/s |
| minipg · unnest arrays, 1 stmt | 535,918/s | 559,852/s | 298,589/s |
| minipg · unnest ×10k chunks, one tx | 530,246/s | 599,079/s | 345,612/s |
| COPY text (raw prototype) | 427,602/s | 737,350/s | 516,998/s |
| COPY binary (raw prototype) | 534,486/s | 983,482/s | 673,225/s |
| pg · seq prepared, one tx | 78,127/s | 68,122/s | — |
| postgres.js · helper ×1000, one tx | 286,941/s | 397,598/s | 294,520/s |

VALUES ×100 went 428k → **~690-740k rows/s** at 10k rows (+60-74% across runs, ≈ COPY text,
1.7-1.9× postgres.js) and VALUES ×1000 closed the gap (402k → 652k) — the binary Bind path turned
chunked multi-VALUES into the fastest driver-native batch shape. unnest (~560-600k) is the
runner-up until array params get binary encoding (item 2). Pipelined 1-row moved only 273k →
~297k: per-statement server cost dominates there, exactly as the isolated bench predicted.
