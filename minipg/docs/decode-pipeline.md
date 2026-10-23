# Decode pipeline: socket bytes → JS objects

This documents the hot read path — from raw TCP bytes off the socket to the JS row objects a
`query()` resolves with. There are two decode strategies that share the same front-end framing:

- **Interpreted** (`src/`, shipped): per-column cached decoders + a fused decode loop. No `new Function`.
- **Codegen / JIT** (`src/inline`, variant): one `new Function`-generated row builder per result shape.

Notation: **N** = rows, **M** = columns. "view" = `Buffer.subarray` (a small Buffer header into
existing bytes — no payload copy).

---

## The wire bytes

A `SELECT id, name FROM t` response is a stream of length-prefixed messages; TCP delivers them as
arbitrary chunks that don't align to message boundaries:

```
RowDescription  'T' │ Int32 len │ Int16 fieldCount │ per field: name\0 · tableOid(4) · colId(2) · typeOid(4) · size(2) · typmod(4) · format(2)
DataRow         'D' │ Int32 len │ Int16 colCount   │ per col:  Int32 valueLen │ <valueLen bytes>   (valueLen = -1 → SQL NULL)
DataRow         'D' │ ...
CommandComplete 'C' │ Int32 len │ "SELECT 2\0"
ReadyForQuery   'Z' │ Int32 len │ 'I'
```

---

## ① + ② Shared front-end: framing + dispatch (both paths)

```ts
// connection.ts — socket listener (installed in afterTransport)
sock.on('data', (c: Buffer) => this.onData(c))

private onData(chunk: Buffer): void {
  let messages
  try { messages = this.parser.push(chunk) } catch (e) { return this.onSocketDown(e as Error) }
  for (const m of messages) {
    try { this.handle(m.type, m.body) } catch (e) { return this.onSocketDown(e as Error) }
  }
}
```
```ts
// protocol.ts — incremental framing
push(chunk: Buffer): RawMessage[] {
  this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk  // concat ONLY if a partial msg is pending
  const out: RawMessage[] = []; let off = 0
  while (this.buf.length - off >= 5) {
    const len = this.buf.readInt32BE(off + 1); const total = len + 1
    if (this.buf.length - off < total) break                            // not fully arrived → leftover
    out.push({ type: String.fromCharCode(this.buf[off]!),
               body: this.buf.subarray(off + 5, off + total) })         // body = zero-copy VIEW
    off += total
  }
  this.buf = off === this.buf.length ? Buffer.alloc(0) : this.buf.subarray(off)
  return out
}
```
**Allocations:** `out[]` + one `RawMessage` per message; each `body` is a **view** (no copy). One
`Buffer.concat` **only** when a message straddles two reads. `handle()` then switches on the type byte:
`'T'` row shape, `'D'` a row, `'C'` command tag + rowCount, `'Z'` end-of-query.

---

## Interpreted path (`src/`)

### ③ `'T'` RowDescription → resolve shape + cache decoders (once)
```ts
case 'T': if (this.current) {
  const fields = parseRowDescription(body)
  const decoders = fields.map((f) => decoderFor(f.dataTypeOid, this.cfg.decoders)) // CellDecoder[] resolved ONCE
  this.current.fields = fields; this.current.decoders = decoders
  if (this.current._cacheName) this.prepared.set(this.current._cacheName, { sql, fields, decoders })
} return
```
Once per query — or **zero** on prepared-statement reuse (pulled from `this.prepared`). Builds `fields[]`,
M `Field` objects, M name strings, `decoders[]` (cached fn refs). No per-row OID lookup afterwards.

### ④ `'D'` DataRow → buffer the view (decode deferred)
```ts
private dataRow(body: Buffer): void {
  const t = this.current
  if (!t || t.cancelled || t.error || t.settled) return
  if (t.stream) { /* decode now for backpressure */ t.onRow!(decodeRow(body, t.mode, t.fields ?? [], t.decoders ?? [])) }
  else t.bodies.push(body)   // query(): stash the zero-copy view; decode the whole set at the end
}
```
Per row (for `query()`): **no allocation** — just push the existing view (it pins its chunk until decode).

### ⑤ `'Z'` ReadyForQuery → `finishTask` → batch-decode into a pre-sized array
```ts
const fields = t.fields ?? [], decoders = t.decoders ?? [], bodies = t.bodies, n = bodies.length
const rows = new Array(n)                                          // exact, no growth
for (let i = 0; i < n; i++) rows[i] = decodeRow(bodies[i]!, t.mode, fields, decoders)
t.resolve?.({ rows, columns: fields.map((f) => f.name), rowCount: t.rowCount ?? null, command: t.command ?? null })
```

### ⑥ `decodeRow` → fused parse+decode of one body → one JS object
```ts
function decodeRow(body, mode, fields, decoders): unknown {
  if (mode === 'raw') return Buffer.from(body)
  const n = fields.length; let o = 2                 // skip Int16 column count
  if (mode === 'object') {
    const row = {}                                    // plain {} → V8 fast hidden class (NOT Object.create(null))
    for (let i = 0; i < n; i++) {
      const l = body.readInt32BE(o); o += 4
      const name = fields[i].name; let v = null
      if (l !== -1) { v = decoders[i](body, o, l); o += l }   // OFFSET decode — no per-cell subarray
      if (name === '__proto__') Object.defineProperty(row, name, { value: v, writable: true, enumerable: true, configurable: true })
      else row[name] = v
    }
    return row
  }
  /* 'buffer' → allocUnsafe+copy per cell · 'array' → new Array(n) + r[i] = decoders[i](body,o,l) */
}
```

### ⑦ The decoders (resolved in ③, called in ⑥) — read in place
```ts
const asInt    = (b, o = 0, l = b.length) => { let p=o,x=0; const e=o+l; if(b[o]===45){for(p=o+1;p<e;p++)x=x*10+(b[p]-48);return -x} for(;p<e;p++)x=x*10+(b[p]-48); return x }
const asString = (b, o = 0, l = b.length) => b.toString('utf8', o, o + l)
const asBool   = (b, o = 0)               => b[o] === 0x74
const asJson   = (b, o = 0, l = b.length) => JSON.parse(b.toString('utf8', o, o + l))
// 16→asBool · 21/23/26→asInt · 700/701→Number(toString) · 114/3802→asJson · 20/1700/text→asString
```
**Per-row allocations (object mode):** 1 row object + 1 string per *textual* column (ints/bools allocate
nothing). Each cell is one `decoders[i](body, o, l)` **closure call** + one keyed property write `row[name]=v`.

---

## Codegen path (`src/inline`)

Front-end (① + ②) is identical. The difference is steps ③–⑦ collapse into **one generated function**
per result shape.

### ③′ `'T'` → compile (and cache) a row builder for this exact shape
```ts
private builderFor(fields, mode): RowBuilder | undefined {
  if (mode !== 'array' && mode !== 'object') return undefined
  const key = mode + '|' + fields.map((f) => f.name + ':' + f.dataTypeOid).join(',')
  let b = this.rowCache.get(key)
  if (!b) { b = compileRow(fields.map((f) => ({ name: f.name, oid: f.dataTypeOid })), mode, this.cfg.decoders); this.rowCache.set(key, b) }
  return b   // cached per (mode, column-shape)
}
```
`compileRow` emits source text, then `new Function('d', 'return (' + source + ')')(helpers)` — `d` is a
helper-closure array used only for non-inlined OIDs (arrays, user `config.types`, unknown). For a shape of
`id int4, name text, active bool, big int8` the **generated function is** (production form):

```js
function row(b) {
  "use strict";
  let o = 2, l;
  l = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4; let v0 = null;
  if (l !== -1) { { let p = o, s = false, x = 0; const e = o + l; if (b[p] === 45) { s = true; p++ } for (; p < e; p++) x = x * 10 + (b[p] - 48); v0 = s ? -x : x }; o += l }
  l = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4; let v1 = null;
  if (l !== -1) { v1 = b.utf8Slice(o, o + l); o += l }
  l = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4; let v2 = null;
  if (l !== -1) { v2 = b[o] === 116; o += l }
  l = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4; let v3 = null;
  if (l !== -1) { v3 = b.utf8Slice(o, o + l); o += l }
  return { "id": v0, "name": v1, "active": v2, "big": v3 };   // ← object LITERAL: baked keys, one fixed hidden class
}
```
Notice what's gone vs the interpreted loop: **no `for` over fields** (unrolled), **no `decoders[i]` closure
call** (each decode is inlined — the int digit-parse, the string slice, the `b[o]===116`), **no per-cell name
lookup** (`v0…v3` locals), and the result is an **object literal** with the column names baked in. The only
runtime indirection left is `d[k](b,o,l)` for OIDs that aren't inlined.

**Source-level micro-opts baked into the emission** (each measured on Node/V8 + Bun/JSC, decode-isolated):
- **`"use strict";`** — directive on the generated fn (no measurable delta, but free + correct under strict).
- **Manual int32 length read** — `(b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3]` instead of `b.readInt32BE(o)`,
  skipping the method call + bounds check. Exact for PG lengths (0..2³¹−1, or `0xFFFFFFFF` → −1 for NULL).
  ~1.15× V8 / ~1.08× JSC.
- **`b.utf8Slice(o, e)`** instead of `b.toString('utf8', o, e)` — the underlying primitive, skipping toString's
  encoding-name lookup + arg coercion. Feature-detected (`typeof Buffer.prototype.utf8Slice === 'function'`),
  falls back to `toString`. Biggest single win: ~1.19× JSC / ~1.08× V8. Applied to string/float/json/bytea decodes.
- **Comments stripped** from the compiled source (zero runtime cost — the fn compiles once — purely smaller/cleaner
  source). `MINIPG_CODEGEN_DEBUG=1` re-adds the per-column `// name oid=… (kind)` annotations and prints each builder.

Combined, these take the generated builder ~**1.24× faster** end-to-end on both engines vs the prior
`readInt32BE` + `toString` emission, with byte-identical results across NULL / empty / multibyte-UTF-8 / negative /
bigint-as-string / float / bytea / json fast-path / shaped-JSON-scanner cases.

### ④′ `'D'` → run the generated builder (per row)
```ts
private dataRow(body: Buffer): void {
  const t = this.current
  if (!t || t.cancelled || t.error || t.settled) return
  let row: unknown
  try { row = t.builder ? t.builder(body) : makeRow(parseDataRow(body), body, t.mode, t.fields ?? [], this.cfg.decoders) }
  catch (e) { t.error = e as Error; return }
  if (t.onRow) t.onRow(row); else t.rows.push(row)   // per-row builder + push (NOT batched here)
}
```
### ⑤′ `'Z'` → `finishTask` resolves `t.rows`
```ts
t.resolve?.({ rows: t.rows, columns: (t.fields ?? []).map((f) => f.name), rowCount: t.rowCount ?? null, command: t.command ?? null })
```
**Per-row allocations:** 1 row object (the literal) + 1 string per textual column — same inherent minimum as
interpreted, but produced by direct slot stores into a fixed hidden class with zero dispatch.

---

## Side-by-side: where the two diverge

| step | interpreted (`src/`) | codegen (`src/inline`) |
|---|---|---|
| framing ① / dispatch ② | identical | identical |
| shape resolution ③ | `decoderFor` → `decoders[]` (cached) | `compileRow` → generated fn (cached per shape) |
| per-cell decode | `decoders[i](body, o, l)` — **closure call** | **inlined** into the function (no call) |
| per-cell key | `row[name] = v` — keyed-store IC | baked into the **object literal** |
| loop | `for i < M` over fields | **unrolled** |
| accumulation | buffer views → `new Array(N)` batch | per-row `t.builder(body)` → `rows.push` |
| row object | plain `{}` + keyed writes | object **literal** (fixed hidden class) |

Everything else — zero-copy framing, offset reads (no per-cell subarray), int-from-bytes, bool single-byte,
int8/numeric as strings — is the **same** in both; codegen just removes the dispatch, the loop, and the
keyed-store by specializing to the shape.

---

## Allocation & performance summary

Per `query()` of N rows × M cols, both paths bottom out at the same inherent minimum:
**N row objects + the result array + one string per textual cell** (integers/bools allocate nothing; no
per-cell subarrays; no intermediate `cells[]`). The write path is separately near-allocation-free (reusable
`Writer`, params encoded in place).

Measured (decode-isolated, 1000 rows, 3 int + text + bool):

| | instructions | notes |
|---|--:|---|
| codegen (object) | ~3.9M | inlined decode + literal object |
| interpreted (array) | ~4.7M | ~codegen-parity (index writes, no keyed-store) |
| interpreted (object) | ~6.0M | the +~1.3× is the keyed-store / dispatch the literal removes |
| `pg` | ~10.8M | eager full-row strings + spread-clone row |
| `postgres.js` | ~10.3M | string-per-field + dynamic-key object |

So **interpreted is ~1.5–1.95× fewer instructions than the incumbents**, and codegen closes the last ~1.3×
on object mode. Array mode is already at codegen parity.

### Engine notes (benchmark on both)
V8 (Node) and JSC (Bun) invert depending on the hot op:
- **Object literals** (the codegen path): V8 is faster (~1.3×) — it clones a precompiled "boilerplate".
- **Dynamic keyed writes** (the interpreted `{}` path): JSC is faster (~2.8×).
- **`Object.create(null)`**: a V8 dictionary-mode trap (~100× at scale); fine on JSC — this is why object
  mode uses plain `{}`, not null-proto.
- **`Object.fromEntries` / clone-template**: slower than `{}` on both; `fromEntries` is a V8 dictionary trap.

The only portable winner for object mode is the **literal**, i.e. codegen — so the intended shipped shape is
**feature-detect `new Function`; use the codegen builder when available, fall back to the interpreted
`decodeRow` under strict CSP / edge runtimes.**
