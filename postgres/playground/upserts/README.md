# Upsert exploration — playground

`upserts.bench.ts`: semantics probes + throughput bench for `INSERT … ON CONFLICT` through the
unnest engine, vs COPY-staging + merge. 1M-row table, 100k-row upsert batches, interleaved +
vacuum/checkpoint hygiene.

## Semantics (probed, PG 14)

1. **DO UPDATE + duplicate key in ONE statement → error 21000** ("cannot affect row a second
   time"). With chunking this is chunk-boundary-dependent: dups in the same chunk fail, dups in
   different chunks silently last-win. ⇒ the API must dedupe client-side by default.
2. **DO NOTHING is dup-safe** within a statement (second occurrence skipped) and across chunks
   (first wins consistently). No dedupe needed.
3. rowCount: DO UPDATE counts inserted+updated; DO NOTHING counts ONLY inserted.
4. `returning (xmax = 0) as inserted` distinguishes inserted (true) from updated (false) rows.

## Throughput (100k rows into 1M, median of 3)

| conflict ratio | unnest DO UPDATE ×256 | unnest DO NOTHING ×256 | COPY staging + merge |
|---:|---:|---:|---:|
| 0% | 506,522/s | 488,719/s | 537,505/s |
| 50% | 237,766/s | 450,449/s | 312,842/s |
| 100% | 172,217/s | 865,483/s | 226,228/s |

Reading: at 0% all paths ≈ plain-insert territory (arbiter check is cheap). As conflicts rise,
DO UPDATE converges to bulkUpdate-like cost (each conflict = an update); DO NOTHING gets
FASTER (skipping is cheaper than inserting). Staging+merge leads by ~30% at ≥50% conflicts
(COPY ingest + one set-based merge) but needs one whole transaction and shows wider variance.

## Proposed API (awaiting go-ahead)

```ts
bulkInsert(table, columns, rows, {
  onConflict: 'ignore'                                    // ON CONFLICT DO NOTHING
  onConflict: { target: 'id' }                            // targeted DO NOTHING
  onConflict: { target: ['a','b'], update: 'all' }        // DO UPDATE SET <all non-target> = excluded.*
  onConflict: { target: 'id', update: ['name','qty'],     // validated subset
                where?: 'raw fragment',                   // conditional update (e.g. newer-wins)
                dedupe?: 'last' | 'first' | false },      // DEFAULT 'last' for update mode:
})                                                        //   prevents chunk-dependent 21000s
```
`returning` (incl. the xmax trick), `chunk`, `atomic`, `onProgress` all inherit. The staging
merge stays a documented recipe for huge high-conflict loads (copyMany + one SQL).
