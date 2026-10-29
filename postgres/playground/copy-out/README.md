# COPY-based reading — investigated and REJECTED

`probe.ts`: can COPY TO STDOUT beat the DECLARE/FETCH cursor for bulk reads?

Answer: **no, by a wide margin** (1M-row drain, interleaved, median of 3):

| lane | rows/s |
|---|---:|
| cursor fetchSize=20000 (fully decoded objects) | 3,859,614 |
| cursor fetchSize=5000 (fully decoded objects) | 3,609,830 |
| single SELECT * (all in memory) | 3,210,902 |
| COPY TO text (transport only, no decode) | 2,897,156 |
| COPY TO text (line+field split, strings only) | 1,761,055 |

The cursor wins while doing MORE work (typed decode vs newline counting). Reads have no
per-statement machinery for COPY to skip; DataRow's length-prefixed fields decode faster than
COPY's escaped tab-text can even be split. Plus COPY reading would have had: no bind params
(verified: COPY rejects $n, unlike DECLARE), no demand pacing, abort-by-cancel-only, and no
RowDescription (shape required). cursor() is the read path; COPY stays write-only.

# Backfill read-path tuning

`backfill-tuning.ts`: which cursor levers actually pay? (1M rows × 6 cols
int8/text/int4/float8/bool/timestamptz, interleaved, median of 3):

| lane | rows/s |
|---|---:|
| **cursor + shape (binary decode), 20k** | **4,880,150** |
| cursor object, 20k (baseline) | 3,664,160 |
| cursor array, 20k | 3,663,375 |
| 2 range-split cursors on 2 connections | 3,529,719 |
| 4 range-split cursors on 4 connections | 3,463,738 |

- **shape is the one big lever: +33%.** Shapes auto-request binary for fast types
  (int8/float8/timestamptz/bool decode from fixed-width bytes instead of text parse).
- **array mode buys nothing** — the JIT row mapper makes object keys effectively free.
- **parallel range cursors are a LOSS on one process.** All lanes bottleneck on the single
  JS thread doing the decode; extra connections just add scheduling overhead. Range-splitting
  only pays across worker threads / processes, each with its own connection. Pin them to one
  exported snapshot (`pg_export_snapshot()` → `cursor({ snapshot })`) for a consistent view.
