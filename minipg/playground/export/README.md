# Export pipeline exploration — cursor → transform → CSV/JSONL/JSON/SQL

`proto.ts`: formatters as **batch-stream transformers** (`AsyncIterable<Row[]> → AsyncIterable<string>`),
composable with any source (`cursor.batches()`, arrays, replication events). Transform stages are plain
generators between source and formatter. Constant memory by construction: one output chunk per input
batch, backpressure via the sink's awaited write.

## Measured (1M rows × 6 cols, cursor fetchSize=20k + shape source, Bun file sink)

| lane | wall | rows/s | output | peak RSS Δ |
|---|---:|---:|---:|---:|
| transform (filter+project) → CSV | 267ms | 3.74M | 8.3MB | 6MB |
| CSV (header, RFC4180 quoting) | 587ms | 1.70M | 57MB | 47MB |
| SQL inserts (256 rows/stmt) | 673ms | 1.49M | 71MB | 16MB |
| JSONL | 1006ms | 0.99M | 107MB | 17MB |
| JSON (one streamed array) | 1022ms | 0.98M | 107MB | 0MB |

- Source ceiling is the cursor itself (4.88M rows/s decoded) — string building is the cost, JSON quoting
  the most expensive. All lanes are flat-memory (the 47MB CSV blip is GC timing, not accumulation).
- Value rules: BigInt → exact digits (JSON.stringify would throw), Date → ISO, Buffer → `\x` hex,
  null → ''/null/NULL per format; CSV quotes only when needed; SQL literals `''`-escaped.
- `toInserts` re-chunks across batch boundaries (fetchSize and rows-per-statement decouple).

## Proposed public API (NOT in src yet)

```ts
import { toCSV, toJSONL, toJSON, toInserts } from 'minipg/export'  // pure, tree-shakeable

for await (const chunk of toCSV(cur.batches(), { header: true })) await sink.write(chunk)

// cursor sugar over the same functions:
await pool.cursor({ sql, fetchSize: 20_000, shape })
  .map(r => ({ id: r.id, total: r.qty * r.price }))   // null = drop row
  .pipeTo(toCSV, Bun.file('out.csv').writer())
```

## Not prototyped, part of the design space

- **`copyOut(sql)` raw lane:** `COPY (select …) TO STDOUT (FORMAT csv, HEADER)` = server-generated CSV
  at transport speed (~2.9M rows/s, zero decode/re-encode) for the no-transform case. Needs CopyOut
  ('H' + CopyData receive) support in the driver — the earlier COPY-read rejection was for *decoded
  rows*; raw passthrough is a different (legitimate) use. Same trick gives server-side JSONL:
  `COPY (select row_to_json(t) from …) TO STDOUT`.
- **DB-to-DB:** no formatter needed — `for await (const b of cur.batches()) await pool2.bulkInsert(...)
  / copyMany(table, types, b)` is already a streaming table copy with transform in the middle.
