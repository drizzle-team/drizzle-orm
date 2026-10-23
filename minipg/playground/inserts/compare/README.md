# Bulk-insert cross-language comparison — minipg vs Go/pgx vs Rust/tokio-postgres

Three programs insert **1M rows** into the SAME 6-column table via the SAME mechanism — ONE prepared
`insert into bulk_bench (...) select * from unnest($1::int8[], …)` statement, executed per chunk inside a
single transaction (**NO COPY**). Same schema, same row generator, same chunk size, same tuned Postgres.
Each measures the portable metrics: wall, throughput, CPU user/sys (getrusage), peak RSS (getrusage maxrss).

- `../bulk-1m-resources.bench.ts` — minipg (Bun). Also reports JS-only event-loop lag + GC heap delta.
- `go/main.go` — Go + `jackc/pgx/v4` (v5 needs go ≥1.21; the box has go 1.17).
- `rust/src/main.rs` — Rust + `tokio-postgres` (+ chrono).

## 1. Start a hard-tuned Postgres (unlock its throughput)

Default Postgres bottlenecks bulk insert on WAL/fsync (client CPU was only ~27% of wall). We remove that so
the numbers reflect the **drivers**, not the DB: `UNLOGGED` table + fsync/synchronous_commit/full_page_writes
off + minimal WAL + big buffers.

```bash
docker run -d --name pgperf -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16 \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off \
  -c wal_level=minimal -c max_wal_senders=0 -c archive_mode=off \
  -c shared_buffers=2GB -c max_wal_size=8GB -c min_wal_size=1GB -c checkpoint_timeout=60min \
  -c autovacuum=off -c work_mem=256MB -c maintenance_work_mem=1GB -c max_connections=20
```

## 2. Run all three (same DB, same chunk)

```bash
export DBU='postgres://postgres@127.0.0.1:5432/postgres'
MINIPG_URL="$DBU" NO_PIPELINE=1 bun playground/inserts/bulk-1m-resources.bench.ts   # minipg, sequential (fair)
MINIPG_URL="$DBU"               bun playground/inserts/bulk-1m-resources.bench.ts   # minipg, pipelined (default)
( cd go   && DATABASE_URL="$DBU" go run . )
( cd rust && DATABASE_URL="$DBU" cargo run --release )
# tune with N / RUNS / BULK_CHUNK env (defaults 1000000 / 3 / 1000)
```

## Results — 1M rows, chunk=1000, tuned PG, Apple M4, median of 3

All three run the SAME unnest prepared statement, chunked in one transaction, pipelined up to
`PIPELINE_DEPTH` in flight (`=100`; set `1`/`NO_PIPELINE=1` for the sequential column).

| driver | seq wall | **pipelined wall** | pipelined throughput | pipelined CPU | peak RSS¹ |
|---|--:|--:|--:|--:|--:|
| **minipg** (Bun 1.3) | 801 ms | **505 ms** | 1.98 M/s | 163 ms | 485 MB |
| **Rust** / tokio-postgres | 976 ms | **501 ms** | 2.00 M/s | **128 ms** | 89 MB |
| **Go** / pgx **v4** | 892 ms | 688 ms | 1.45 M/s | 342 ms | 191 MB |

**Read it carefully:**
- **Pipelined, minipg ≈ Rust** (505 vs 501 ms — within noise, both ~2 M rows/s); **Go/pgx-v4 trails** at
  688 ms. Pipelining helped the most latency-bound runner (Rust) the most (2× vs its sequential 976 ms).
- **CPU total** is the cleanest client-efficiency signal (wall is ~26–50% CPU, still part DB-bound): Rust's
  binary encoder is leanest (128 ms), minipg's write-through encoder is very close (163 ms) — notable for a
  JS runtime — and pgx-v4 is ~2.7× heavier (342 ms).
- ¹ **peak RSS is NOT a driver metric** — it's how each language represents 1M rows (Rust `Vec<struct>` 89 MB
  ≪ JS boxed arrays + `Date` 485 MB). The driver's transient cost is **RSS *delta***: minipg ≈ 0 MB
  (zero-alloc write-through).
- **Go uses pgx v4** (v5 needs go ≥1.21; box has go 1.17). pgx v5 is materially more optimized — the Go line
  would improve with a newer toolchain.

Net: with the DB no longer the wall and pipelining on both sides, minipg is a dead heat with
Rust/tokio-postgres on this workload and clearly ahead of Go/pgx-v4.

## Unix socket vs TCP — and a minipg bug it exposed

All three CAN use a unix socket: pgx `host=/socket/dir`, tokio-postgres `host=/socket/dir`, minipg `path=` /
`{ path }`. On macOS you **cannot** socket to the `pgperf` docker container (Docker Desktop's Linux VM =
cross-kernel); a socket run needs a native host PG (the `test:setup` cluster, tuned the same way). Go here
uses **go 1.26 + pgx v5** (v5 is lighter than v4: TCP CPU 342→279 ms).

Same native cluster, 1M rows, pipelined depth 100 (**post-fix** — see below).

Note on chunk: minipg's `bulkInsert` picks the chunk size ADAPTIVELY (here `min(1024/cols, 32768/rowBytes)` =
**171** for this 6-col table). `BULK_CHUNK` forces a fixed size so Go/Rust (no auto-chunk) do identical work.

**At minipg's adaptive default (171), all three matched at 171:**
| driver | socket | native-TCP |
|---|--:|--:|
| **minipg** (adaptive) | 600 ms | 583 ms |
| Rust / tokio-postgres | 606 ms | 584 ms |
| Go / pgx v5 | 709 ms | 678 ms |

**At forced chunk=1000** (fewer round-trips — ~10% faster for all three on this fast server):
| driver | socket wall / CPU | native-TCP wall / CPU |
|---|--:|--:|
| Rust / tokio-postgres | 565 ms / 95 ms | 520 ms / 89 ms |
| **minipg** | 593 ms / 176 ms | 524 ms / 163 ms |
| Go / pgx v5 | 689 ms / 301 ms | 618 ms / 266 ms |

Out-of-box, minipg is a dead heat with Rust and clearly ahead of Go/pgx-v5. Bigger chunks favour Rust slightly,
minipg's own adaptive pick favours minipg. CPU: Rust leanest, minipg second, pgx-v5 ~2.7×. minipg's adaptive
171 is a touch conservative for narrow tables on a fast server (~1000 is ~10% quicker *here*), but that cells
cap protects fat-text / wide tables where huge chunks blow up server-side `array_recv`.

### The socket bug this uncovered, and the fix
Originally minipg was **1059 ms / 616 ms over the socket** — ~1.8× slower + 2.6× CPU vs TCP, and *only* when
pipelining (sequential socket was fine). Root cause: minipg's pipeline was bounded by query COUNT
(`pipelineDepth=100`), so ~100 × 67 KB chunks = **6.7 MB** was shoved into an ~8 KB unix-socket send buffer,
piling into Bun's userspace write queue. Not reads (read counts matched TCP), not per-write size (splitting to
8 KB didn't help) — it was total in-flight bytes. And the optimal in-flight is the bandwidth-delay product, so
it's **latency-dependent**: a remote Neon link (~30 ms RTT) *needs* a deep pipeline (throughput scales 4.6×
with depth), while a local socket wants it shallow.

**Fix (shipped in `src/connection.ts`): backpressure-aware dispatch** — observe `socket.write()`'s return
value, pause dispatching new pipelined tasks while the write buffer is backed up, resume on `'drain'`. No fixed
byte/RTT constant; the socket's own flow-control encodes transport + BDP, so it self-tunes: local socket
1059→**593 ms** (CPU 616→176), local TCP 580→**524 ms**, and **Neon deep-pipeline throughput preserved**
(0.447 M/s vs sequential 0.03). See memory `pipelined-socket-regression`.
