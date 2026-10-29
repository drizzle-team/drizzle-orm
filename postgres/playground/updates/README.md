# Bulk UPDATE shapes — playground

`updates.bench.ts`: the update siblings of the insert ladder, against a 1M-row table
(int8 PK), updating 3 columns by id. Run hygiene: checkpoint + settle before every timed run.

## Results (2026-07-06, median of 3)

| shape | 10k of 1M | 100k of 1M |
|---|---:|---:|
| pipelined single UPDATEs, one tx | 76,578/s | — |
| **unnest-join ×1k chunks, one tx** | **109,961/s** | 176,626/s |
| VALUES-join ×100 chunks, one tx | 94,941/s | **194,093/s** |
| COPY temp + one join UPDATE, one tx | 100,972/s | 109,265/s |

## Takeaways

1. **Shape matters much less than for inserts** (spread ≤1.8× vs 5×): per-row UPDATE cost —
   index lookup, new MVCC tuple version, index maintenance, WAL — dominates transport and
   statement overhead. Any set-based shape ≈ 1.4-2.5× over pipelined singles.
2. **unnest-join is the right default engine**: fastest at 10k, close second at 100k, and it
   inherits every bulkInsert property (one immutable prepared statement, binary array params,
   no param ceiling, pooler-safe). The insert-side unnest-vs-VALUES crossover reappears but
   compressed — not worth a second engine.
3. **COPY-temp is NOT the scale king here** (unlike inserts): slowest at 100k. The one big
   join UPDATE flips to a different plan (likely seq-scan+hash at 10% selectivity; the temp
   table also had no ANALYZE), while small chunked statements stay on tidy index nested loops.
   Keep it as a documented recipe for multi-million-row updates, not the default.
4. Semantics to document in a future updateMany: input rows with DUPLICATE key values are
   indeterminate (UPDATE … FROM silently picks one winner — no server error); ids that match
   nothing simply don't count (rowCount < rows.length is the signal).

## SHIPPED (2026-07-06): `bulkUpdate` + `onProgress`

`bulkUpdate(table, columns, rows, { by, returning?, chunk?, atomic?, onProgress?, … })` on
Connection + Pool — unnest-join engine sharing bulkInsert's runner (binary arrays, adaptive
per-batch chunking, atomic default / `atomic:false` per-chunk commits with `updatedRows` on
the error, composite keys). Unnest columns use POSITIONAL aliases (_c0…_cn) so `returning`
can never be ambiguous. Validation bench (100k of 1M, interleaved + hygienic):
**bulkUpdate adaptive (256-row chunks) 261k rows/s** vs manual unnest ×1k 150k vs
bulkUpdate chunk=1000 135k — adaptive chunking transfers to updates (~1.8×), and beats every
shape in the original probe (incl. VALUES-join 194k). `onProgress` fires per confirmed chunk
with { rows, totalRows, affected, bytes (exact wire bytes), elapsedMs, chunk, chunks } on
bulkInsert/bulkUpdate/copyMany (COPY byte accounting fixed to include CopyData payloads).

Proposed API (not yet implemented): `updateMany(table, columns, rows, { by: 'id' | [...cols],
returning?, chunk?, atomic? })` — unnest-join engine, reusing bulkInsert's pivot/chunk/tx/
binary-array machinery; `columns` covers key + SET columns, `by` names the key subset.
