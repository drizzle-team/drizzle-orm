# Benchmarks

Powered by [mitata](https://github.com/evanwashere/mitata). Two suites, non-gating
(measurement only — use `bun test` for correctness):

```bash
bun run test:setup     # start the local cluster on :54329 (drivers bench needs it)
bun run bench          # bench/drivers.bench.ts — minipg vs node-postgres (pg) vs postgres.js, end-to-end
bun run bench:micro    # bench/micro.bench.ts   — minipg hot paths, LIVE src vs frozen variants (no DB)
```

## Driver comparison (`drivers.bench.ts`)
The same logical query through each driver against the same cluster: simple `SELECT 1`,
parameterized `SELECT $1`, a 100-row result (minipg array vs object, vs pg/postgres.js
objects), and prepared/named reuse. Note: `postgres.js` auto-prepares by default; `pg`
and minipg prepare only when a statement is named.

## Micro + versioning (`micro.bench.ts`, `variants/`)
Micro-benches the three hot paths — **write** (serialize an extended-query packet),
**decode** (per-cell `decoderFor` + decode), **read** (frame a server response) —
comparing the **live** `src/` against **frozen snapshots** in `variants/`.

**Versioning workflow** (so iterations are comparable across machines):
1. `variants/protocol_v1.ts` and `variants/codec_v1.ts` are the current baselines (frozen copies of `src/`, imports repointed to `../../src/...`).
2. Before changing a module, snapshot it: `cp src/protocol.ts bench/variants/protocol_v2.ts` and repoint its imports.
3. Optimize `src/<module>.ts` in place — it becomes the "live" version.
4. Add a `bench('v2', …)` line in `micro.bench.ts` so live vs v2 vs v1 all show side by side; `summary()` prints the relative speedup.

Each variant is a self-contained module, so the same bench file yields comparable numbers
on any machine. Record baselines per machine class / Bun version / Postgres major before iterating.
