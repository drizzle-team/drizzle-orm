# values[] → socket — isolated Bind-path bench

Companion to `playground/inserts/` (the end-to-end ladder). This isolates ONLY the client
write path — param encode → Bind+Execute+Sync serialization → flush → socket write — against a
discard unix-socket server, so no Postgres costs pollute the numbers. Zero `src/` changes.

- `bind-direct.ts` — the write-through encoder prototype (`BindWriter`): values serialize
  straight into the outbound buffer with back-patched int32 length slots; no `EncodedParam`
  wrappers, no intermediate strings/Buffers. Binary variant uses a per-column encoder plan
  (what cached ParameterDescription OIDs enable on prepared reuse — encode-side mirror of the
  decode JIT mappers). `lpAsciiInt` writes integer digits without `String(v)`; `lpI64` writes
  int8/timestamptz as hi/lo halves without BigInt allocation.
- `bench.ts` — mitata groups + manual end-to-end loop. At startup it PROVES the direct-text
  encoder emits byte-identical wire bytes to today's `encodeParam` + `writeBind`.

## Results (2026-07-06, Apple M4, Bun 1.3.14; 6-param insert row: int8, text, int4, float8, bool, timestamptz)

**Serialize one row (Bind+Execute+Sync):**

| variant | per row | heap/iter |
|---|---:|---:|
| current (`encodeParam` + `writeBind`) | 705 ns | ~9.5 B avg, 880 B spikes |
| direct-text (byte-identical output) | 302 ns | ~0 |
| direct-binary (per-column plan) | 157 ns | 0 |

**Serialize 10k-row batch:** current 7.82 ms · direct-text 4.28 ms · direct-binary 1.64 ms
(**4.8× faster, ZERO reported heap allocation** — mitata gc column reads 0.00 b). Binary row
is also smaller on the wire: 87 B vs 95 B.

**Flush strategy (what to do with the filled writer):** copy 64 KB (`Buffer.from`, today's
FLUSH_THRESHOLD reality) = 1.85 µs · copy 1.2 MB (CopyIn-sized) = 20.5 µs · swap = ~14 ns.
⇒ the defensive flush copy in `flushWrites()` is **noise at pipeline batch sizes** (~µs per
64 KB); only CopyIn-scale payloads justify owned-buffer/swap plumbing.

**End-to-end, 10k rows → discard socket (median of 20):**

| variant | 10k rows | rows/s |
|---|---:|---:|
| current + copy flush | 11.54 ms | 867k |
| direct-text + copy flush | 3.75 ms | 2.67M |
| direct-text + swap | 3.74 ms | 2.67M (copy ≙ noise, confirmed) |
| direct-binary + swap | 1.86 ms | 5.37M |

## Conclusions

1. **The per-value allocation chain is the whole story**: value → `String()` → `Buffer.from`
   → `{format,bytes}` wrapper → outbuf costs ~550 ns/row of the 705 ns; write-through text
   removes it for byte-identical output. The flush copy everyone suspects is ~0.2% of the cost.
2. **Binary params ≈ another 2.6×** on top: no text formatting at all (digits loop, ISO
   strings, float→string are what direct-text still pays). Requires known param OIDs ⇒ only on
   prepared-statement REUSE ⇒ same first-text-then-upgrade lifecycle as `reuseBinaryOids`.
3. Client serialization ceiling after the fix (2.7–5.4M rows/s) is far above what the server
   absorbs (~270k/s pipelined single-row, ~1M/s COPY): the encoder stops being a meaningful
   CPU term in inserts, and the freed cycles matter most under pipelining where client and
   server work overlap.
4. src/ shape implied: `Writer` grows `lpStr/lpAsciiInt/lpI64/f8` primitives; `serializeTask`
   calls a write-through `encodeInto(w, value)` (text, generic) and — when the statement is
   reused and ParameterDescription OIDs are cached — a per-column binary plan compiled once
   per statement, exactly like decode mappers. `encodeParam` stays only as the fallback for
   exotic values.

## SHIPPED to src/ (2026-07-06)

Implemented as designed: `Writer.lpStr/lpAsciiInt/lpI64/lpI64Big/lpF8/patch16` +
`writeBindWith` (protocol.ts), `encodeValueInto` + `compileParamPlan` (codec.ts), wired in
`serializeTask` with ParameterDescription caching; plans compile on prepared REUSE (server-echoed
OIDs win) or upfront from a declared `paramTypes` query option (OIDs also pinned in Parse, so
first executions and unnamed/pooler statements go binary safely). Byte-identity of the text path
is pinned by `test/unit/bind-encode.test.ts` (incl. fast-check property); behavior by
`test/integration/binary-params.test.ts`. End-to-end effect: VALUES ×100 inserts 428k → ~690-740k
rows/s (see `playground/inserts/README.md`).

## JIT exploration (`jit.bench.ts`, 2026-07-06 — NOT wired into src)

When the param shape is known upfront (declared `params`, bulkInsert, prepared reuse), a
per-statement codegen'd encoder (new Function) collapses the Bind framing into one constant
Buffer memcpy (portal/statement/format-codes/count never change), inlines per-column guards +
writes straight-line, and appends Execute+Sync as a second constant memcpy. Byte-identity vs
the shipped paths asserted at startup. Results (6-param row):

| lane | 1 row | 10k batch |
|---|---:|---:|
| shipped text (generic dispatch) | 337 ns | — |
| JIT text | 200 ns | — |
| shipped binary plan (closure/column) | 193 ns | 2.05 ms |
| **JIT binary** | **62 ns** | **689 µs** |

3.1× over the shipped plan, below the hand-written 164 ns floor — the constant-prefix memcpy
is the dominant win. **Counterpoint: the array path gains NOTHING** (10k-elem int8[]: 42.5 µs
shipped vs 42.4 µs JIT) — the element loop is already monomorphic and memory-bound, so
bulkInsert/unnest is NOT a JIT customer. If wired, the jit tier belongs in compileParamPlan
behind the same eval-availability gate as the decode mappers ('jit' | 'interpreted'), and pays
off on scalar-row traffic: single-row prepared inserts, VALUES chunks, ORM per-row queries
(~130 ns/row ≈ ~10% of the VALUES ×100 client budget).

**Rebench of the shipped lanes (this bench, 2026-07-06):** the src Bind message is asserted
byte-identical to legacy at startup. Per 6-param row: legacy 717 ns → **src text 325 ns → src
binary plan 222 ns** (prototype floors: 311/164 — the shipped generic plan pays its per-value
guards). 10k-row batch: legacy 7.84 ms → src text 3.89 ms (faster than the prototype) → src
binary 2.35 ms. End-to-end to the discard socket: 872k → **2.23M (text) → 3.75M rows/s (binary)**.
