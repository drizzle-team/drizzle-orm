# In-process PGlite with `@drizzle-team/postgres`

Running PGlite **in the same process** as the application and talking to it with Drizzle's own Postgres
driver through a small mock socket. No TCP, no Unix socket, no `pglite-socket` server. The driver speaks the
wire protocol straight into `pg.execProtocolRawStream()`.

The numbers come from a real workload: a 1C:Enterprise 7.7 accounting database (2.35M rows, 93 tables) ported
to Postgres, and a replay that re-posts 55,784 historical documents and diffs every register movement.

**Environment:** Apple M4 (10 cores), macOS, Bun 1.4.4, PGlite 0.5.13, `@drizzle-team/postgres` 0.4.4 and the
rc6 preview (`pkg.pr.new/…/@drizzle-team/postgres@e7e2cb7`), Node 24 for the V8 comparison. Each latency figure
is the best of 3 rounds of 20,000–30,000 calls after warm-up.

---

## TL;DR

| One point lookup (`SELECT * … WHERE id = $1`, 23 columns) | µs / query |
|---|---|
| Bun.SQL → `pglite-socket` over TCP, unprepared | 74 |
| Bun.SQL → TCP, prepared statements, 1 connection | 38.3 |
| Bun.SQL → Unix socket, prepared | 20.5 |
| postgres.js → in-process mock socket | 11.9 |
| `@drizzle-team/postgres` 0.4.4 → in-process mock socket, named statement | 10.5 |
| **`@drizzle-team/postgres` rc6 → in-process mock socket, named statement** | **7.9–8.4** |
| *reference:* native Postgres 14 over TCP (Bun.SQL, prepared) | 26 |
| *reference:* SQLite (`bun:sqlite`) | 1.05 |

The same transport change applied to a real write workload (3,000 document postings, about 35 statements each):

| Transport | Posting time |
|---|---|
| Bun.SQL · TCP · unprepared | 12.0 s |
| `@drizzle-team/postgres` · TCP | 8.33 s |
| `@drizzle-team/postgres` · Unix socket | 6.27 s |
| **`@drizzle-team/postgres` · in-process mock socket** | **3.64 s** |

The full replay (55,784 postings) runs in **235 s** in-process, with results identical to the out-of-process
runs.

In short: **PGlite's WASM engine is not the bottleneck. Transport and JS glue are.** In-process with named
prepared statements, Drizzle's driver puts a point lookup within 2× of the raw-protocol floor, and well below
native Postgres over TCP.

---

## The transport: a socket whose far end is PGlite

`@drizzle-team/postgres` accepts `config.socket`, a factory returning anything that satisfies `PostgresSocket`
(`on('data' | 'error' | 'close')`, `write`, `end`, and optionally `destroy`, `pause` and `resume`). That is all
an in-process transport needs:

```ts
import { EventEmitter } from "node:events";

interface PGliteLike {
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;
  execProtocolRawStream(message: Uint8Array, opts: { onRawData: (d: Uint8Array) => void }): Promise<unknown>;
}

/** A Postgres socket whose far end is an in-process PGlite. */
export class PgliteSocket extends EventEmitter {
  private chain: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(private readonly pg: PGliteLike) { super(); }

  write(data: Uint8Array): boolean {
    const msg = data.slice(); // the driver may reuse its buffer
    // Terminate ('X'): a real server hangs up; the driver waits for that before it considers the socket closed
    if (msg.length === 5 && msg[0] === 0x58) { this.chain = this.chain.then(() => this.close()); return true; }
    this.chain = this.chain
      .then(() => this.pg.runExclusive(() =>
        this.pg.execProtocolRawStream(msg, { onRawData: (d) => { if (!this.closed) this.emit("data", d.slice()); } })))
      .then(() => {}, (e) => { this.emit("error", e as Error); });
    return true;
  }
  end(cb?: () => void) { this.close(); cb?.(); }
  destroy() { this.close(); }
  pause() {}
  resume() {}
  private close() { if (this.closed) return; this.closed = true; queueMicrotask(() => this.emit("close")); }
}
```

```ts
import { PGlite } from "@electric-sql/pglite";
import { createPool } from "@drizzle-team/postgres";

const pg = await PGlite.create();
const pool = createPool({ socket: () => new PgliteSocket(pg), user: "postgres", database: "postgres", max: 1 });

const { rows } = await pool.query("SELECT * FROM t WHERE id = $1", [id], { name: "t_by_id", mode: "object" });
await pool.transaction(async (tx) => { await tx.query("UPDATE t SET n = n + 1 WHERE id = $1", [id]); });
```

PGlite handles the startup packet and authentication itself, so the socket just forwards bytes. No SSL
negotiation happens with a `socket` factory.

### Why `max: 1`

- **One backend, one statement at a time.** PGlite is a single-user Postgres backend. More connections never
  run in parallel. PGlite's own multiplexing interleaves them, and so does `pglite-socket`'s `maxConnections`.
- **Prepared statement names are session-wide.** Every "connection" shares PGlite's single session, so two
  connections preparing `s1` collide (`prepared statement "P0" already exists` with Bun.SQL, for example).
  With one connection, named statements are safe again.
- **Transactions need exclusivity.** On a single connection, `pool.transaction()` reserves it and other queries
  queue behind it. With several logical connections sharing one session, a statement from connection B can land
  *inside* connection A's open transaction.
- **Bulk loads beside a live app:** if you also call `pg.query()` / `COPY` directly, gate those calls so they
  never run while a pool transaction is open (a shared/exclusive lock around pool work vs. direct calls).

### Named statements matter most

| rc6 over the mock socket | µs / query |
|---|---|
| unnamed (Parse + plan on every call) | 24.1–24.5 |
| named (`{ name }`: Parse once, then Bind/Execute) | 7.9–8.4 |

We give every statement a name derived from a hash of its SQL text, using a bounded number of slots. The
driver transparently re-prepares when a slot is reused by different SQL.

### Pipelining: keep the default

| Over the mock socket (µs/query) | 0.4.4 seq · named | 0.4.4 burst (200 at once) | rc6 seq · named | rc6 burst |
|---|---|---|---|---|
| default (microtask flush) | 10.5 | **8.6** | 8.4 | **6.4** |
| `pipeline: { flush: "sync" }` | 10.3 | 10.0 | 7.9 | 7.6 |
| `pipeline: false` | 10.4 | 10.9 | 7.9 | 8.2 |

Sequential latency is the same in every mode. For bursts the default wins: queries issued in the same tick
are coalesced into one write, so one `execProtocolRawStream` call answers several of them.

---

## Where the time goes (rc6, in-process, one lookup)

Measured by peeling layers off from the top:

| Layer | µs / query | Added |
|---|---|---|
| `pg.execProtocolRawStream(prebuilt Bind/Execute/Sync)` (PGlite JS wrapper + WASM engine) | 5.71 | 5.7 |
| + mock socket | 6.13 | 0.4 |
| + driver (encode, parse, JIT row mapper → object rows) | 7.95 | 1.8 |
| + pool of 1 | 8.15 | 0.2 |
| + a thin tagged-template adapter (statement naming + text building) | 8.83 | 0.7 |

About 65% is inside PGlite. A CPU profile of that layer puts roughly 70% in the WASM engine and 30% in
PGlite's JS (copies into and out of the WASM heap). The WASM build is stripped of function names, so the
engine cannot be split further without a custom build.

For comparison, `pg.execProtocolRawSync()` with the same bytes is *slower* (7.26 µs) than the streaming call.

---

## Threading (all in one process)

| PGlite placement | one query at a time | 8 concurrent requests (20 µs JS + a query each) |
|---|---|---|
| **same thread as the app** (mock socket) | **9.3 µs** | 29.1 µs / request |
| Worker thread, `postMessage` (transferred buffers) | 20.2 µs | 24.4 µs / request |
| Worker thread, `SharedArrayBuffer` + `Atomics.waitAsync` | 23.5 µs | 41.6 µs / request |

A worker only helps when requests overlap. The `postMessage` hop costs about as much as a Unix socket. With
shared memory it is worse in Bun, because `Atomics.waitAsync` wake-ups are slow in JSC and the worker must use
the slower sync API. For sequential work (transactions, postings) the same thread is fastest.

PGlite is a single Postgres backend in single-user mode. Neither a native build (`libpglite`, draft upstream)
nor multithreaded WASM makes queries run in parallel; Postgres itself has no intra-backend threads. Parallelism
needs several backends: native Postgres, or several PGlite copies of the data.

**Bun vs Node:** Bun (JSC) runs PGlite 1.3–2× faster than Node 24 (V8). For example, 20,000 point lookups take
1.50 s vs 2.93 s, and a COPY of 860k rows 1.49 s vs 2.34 s.

---

## PGlite findings (upstream candidates)

Found by profiling `pg.query()` (70.8 µs per lookup) against the raw-protocol floor (10.2 µs). We applied the
first two locally with `bun patch`.

1. **The whole parser map is copied on every result.** The result builder does
   `m = { ...defaultParsers, ...options?.parsers }` per query; that was **27% of `pg.query()` time**.
   Any caller passing `parsers` per query always pays it. The drizzle-orm PGlite driver did, before rc6 removed
   per-query parser overrides. Caching the merged map per `parsers` object fixes it: **70.8 → 48.1 µs**
   (Drizzle-shaped calls 65.3 → 42.7 µs).
2. **Text fields are copied before decoding.** The protocol reader's `string()` calls `bytes()`, which does
   `buffer.slice()` and then `TextDecoder.decode()`. Decoding from a zero-copy `Uint8Array` view is equivalent:
   **48.1 → 42.5 µs**.
3. **`#private` fields are down-levelled to `WeakMap` helpers** by the build target, costing about 8% of
   `pg.query()` in the reader's hot loop. A modern target (ES2022) would remove that.
4. **`PGlite.create()` runs `initdb` every time** (≈ 500 ms for an in-memory database). Dumping a freshly
   initialised empty cluster once (`dumpDataDir("gzip")`, 4.5 MB, catalogs only) and booting with
   `loadDataDir` takes **48–64 ms**. Worth a built-in "template cluster" option.
5. **The process lingers ≈ 10 s after work ends** unless `pg.close()` is called (Emscripten runtime
   keep-alive). Scripts should always close.
6. **MEMFS grows files by 12.5% steps above 1 MB**, copying the whole file each time. We saw transient
   memory peaks (around 1.5 GB for a ~300 MB database) while 800k-row tables loaded, settling afterwards. This
   growth policy is the likely cause; we did not isolate it.

Even with all of these fixed, the floor for `pg.query()` is unnamed statements: Parse + plan every call.
Drivers that want speed should use named statements over the raw protocol, which is what
`@drizzle-team/postgres` does through the socket above.

### For the drizzle-orm `pglite` driver

The prepared query's `name` is currently ignored and every call goes through `client.query()`. A version that
sends Parse once and then Bind/Execute/Sync through `execProtocolRaw*`, decoding rows with the driver's own
mappers, measured **65 → 10 µs** for the same lookup in a hand-written prototype (6×). Alternatively the pglite
driver could reuse `@drizzle-team/postgres` with the socket above.

---

## Bulk loading into in-memory PGlite

- **Use `COPY … FROM '/dev/blob'`, not parameterised INSERTs.** Multi-row INSERTs with about 20,000 parameters
  ran PGlite out of WASM memory (`out of memory … memory context "CachedPlan"`): each batch shape is a new
  cached plan. COPY loaded 2.35M rows in about 12 s single-threaded.
- **Decode in a worker, COPY on the main thread.** Overlapping JS decoding with WASM COPY, and decoding only the
  columns actually loaded (−43% on parsing), gave **5.4 s for 2.35M rows + 0.95 s for keys**.
- **Create primary keys and indexes after COPY:** −17% on two 800k-row tables (4.83 s → 3.51 s COPY + 0.51 s
  index build).
- **Keep the WAL small** when the WAL itself lives in memory: `wal_level = minimal`, `max_wal_size = 64MB`,
  `min_wal_size = 32MB`, `full_page_writes = off` (via `postgresqlconf`), then `CHECKPOINT` after the load.
  Settled process memory for the same data went from 867 MB to 454 MB.
- **`ANALYZE` after loading.** There is no autovacuum in single-user mode, so tables loaded or grown at runtime
  never get statistics unless you run it. Without them the planner can pick whole-period scans over index
  lookups.

---

## Driver notes

- **`int8` decodes to `BigInt`** (e.g. `count(*)`, `sum(int)`). Bun.SQL returns strings. To keep string
  semantics: `types: { 20: (b) => b.toString("latin1") }`.
- **Errors carry the SQLSTATE in `code`.** Code written for Bun.SQL checks `errno`.
- **`@drizzle-team/postgres` is marked internal ("not supported for outside use")**, so pin an exact version or
  commit.

---

## Summary

| Change | Effect (measured) |
|---|---|
| Prepared statements on one connection (vs unprepared) | 74 → 38 µs per lookup; replay 12.0 → 8.2 s |
| TCP → Unix socket | 38 → 20.5 µs |
| Unix socket → in-process mock socket with `@drizzle-team/postgres` | 20.5 → 8 µs; replay 6.3 → 3.6 s |
| PGlite parser-map cache + zero-copy strings (`pg.query()` path) | 70.8 → 42.5 µs |
| Boot from a dumped empty cluster instead of `initdb` | ~500 → ~50 ms |
| Worker decode + COPY, indexes after load | 13.8 → 5.4 s for 2.35M rows (+0.95 s keys) |

Remaining per-query cost is mostly the Postgres engine itself (about 4 µs in WASM for a 23-column point
lookup). Past that point, faster still means an in-process engine with cached plans and no protocol (SQLite:
about 1 µs), or a native build of PGlite once `libpglite` stabilises.
