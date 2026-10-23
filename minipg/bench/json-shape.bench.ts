// ISOLATED exploration — NOT wired to src/. Question: when a json/jsonb column's object shape is
// known upfront (e.g. `{ id, name, active, score }`), can we beat `readString + JSON.parse` by
// codegen'ing a positional parser that walks the bytes in declared field order and returns ONE
// monomorphic object literal `{ id: v0, name: v1, ... }` (stable hidden class every row)?
//
// Everything here is self-contained: a tiny shape->parser codegen, the scanner primitives, and the
// input builders. Cells are raw JSON byte buffers (the json column's TEXT value); each strategy is
// handed (buffer, offset, length) so we time DECODE ONLY — no framing, no socket, no string prep.
//   bun bench/json-shape.bench.ts   (or: bun run bench:json-shape)   — run on node too for V8 vs JSC
import { run, bench, group, summary, do_not_optimize } from 'mitata'

// Buffer slice methods (Node/Bun internal fast paths); fall back to toString if a runtime lacks them.
const HAS_U8 = typeof (Buffer.prototype as { utf8Slice?: unknown }).utf8Slice === 'function'
const HAS_L1 = typeof (Buffer.prototype as { latin1Slice?: unknown }).latin1Slice === 'function'
const U8 = (s: string, e: string) => (HAS_U8 ? `b.utf8Slice(${s}, ${e})` : `b.toString('utf8', ${s}, ${e})`)
const L1 = (s: string, e: string) => (HAS_L1 ? `b.latin1Slice(${s}, ${e})` : `b.toString('latin1', ${s}, ${e})`)

// ---------------------------------------------------------------------------------------------
// Shape codegen. A field is [key, type]; type picks how its value is read from the bytes:
//   int  -> JS number, digit-parsed straight from ASCII (no intermediate string)
//   num  -> JS number via Number(<token slice>) — floats/decimals
//   str  -> JS string; fast path slices between the quotes, escapes fall back to JSON.parse
//   bool -> true/false from the first byte
//   raw  -> the number token as an EXACT string (what you'd want for int8/numeric past 2^53)
// The generated fn is `(cells) => rows[]`: it loops the whole result set and, per cell, skips each
// key positionally (order is known, so we never match key text) and emits the monomorphic literal.
type FType = 'int' | 'num' | 'str' | 'bool' | 'raw'
type Shape = ReadonlyArray<readonly [string, FType]>

// cursor: byte buffer `b`, position `p`, end `e`. Each snippet reads one value into vN, leaving p
// just past it. Every value tolerates a literal JSON `null` (bytes 'null') first.
function readSnippet(t: FType, v: string): string {
  const guard = (body: string) => `if (b[p] === 110) { ${v} = null; p += 4 } else { ${body} }`
  switch (t) {
    case 'int':
      return guard(`let ng = false; if (b[p] === 45) { ng = true; p++ } let x = 0; while (p < e) { const c = b[p]; if (c < 48 || c > 57) break; x = x * 10 + (c - 48); p++ } ${v} = ng ? -x : x`)
    case 'num':
      return guard(`const s = p; if (b[p] === 45) p++; while (p < e) { const c = b[p]; if ((c >= 48 && c <= 57) || c === 46 || c === 43 || c === 45 || c === 101 || c === 69) p++; else break } ${v} = Number(${L1('s', 'p')})`)
    case 'raw':
      return guard(`const s = p; if (b[p] === 45) p++; while (p < e) { const c = b[p]; if ((c >= 48 && c <= 57) || c === 46 || c === 43 || c === 45 || c === 101 || c === 69) p++; else break } ${v} = ${L1('s', 'p')}`)
    case 'bool':
      return guard(`${v} = b[p] === 116; p += ${v} ? 4 : 5`)
    case 'str':
      // value MUST be a quoted string here (guarded null handled above). Fast path: no backslash ->
      // slice raw bytes; else re-parse the exact quoted token so escapes/\uXXXX are correct.
      return guard(`p++; const s = p; let esc = false; while (p < e) { const c = b[p]; if (c === 92) { esc = true; p += 2; continue } if (c === 34) break; p++ } ${v} = esc ? JSON.parse(b.toString('utf8', s - 1, p + 1)) : ${U8('s', 'p')}; p++`)
  }
}

function compileShape(shape: Shape): (cells: Buffer[]) => unknown[] {
  const skipWs = 'while (p < e && (b[p] === 32 || b[p] === 9 || b[p] === 10 || b[p] === 13)) p++;'
  const skipKey = "p++; while (p < e) { const c = b[p]; if (c === 92) { p += 2; continue } if (c === 34) { p++; break } p++ }" // skip a quoted key
  const lines: string[] = []
  shape.forEach(([, t], i) => {
    lines.push(`      ${skipWs}                       // -> key`)
    lines.push(`      ${skipKey}                      // skip "key"`)
    lines.push(`      ${skipWs} p++; ${skipWs}        // ':'`)
    lines.push(`      ${readSnippet(t, 'v' + i)};`)
    lines.push(`      ${skipWs} if (b[p] === 44) p++;  // optional ','`)
  })
  const ret = '{ ' + shape.map(([k], i) => (k === '__proto__' ? `["__proto__"]: v${i}` : `${JSON.stringify(k)}: v${i}`)).join(', ') + ' }'
  const decl = shape.map((_, i) => `v${i} = null`).join(', ')
  const src = `function rows(arr) {
  "use strict";
  const n = arr.length, res = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = arr[i]; let p = 0; const e = b.length;
    ${skipWs}
    if (b[p] === 110) { res[i] = null; continue }   // top-level JSON null
    p++;                                            // '{'
    let ${decl};
${lines.join('\n')}
    res[i] = ${ret};
  }
  return res;
}`
  if (process.env.SHAPE_DEBUG) console.error('\n' + src + '\n')
  return new Function(`return (${src})`)() as (cells: Buffer[]) => unknown[]
}

// Same idea, but each cell is a JSON ARRAY of objects (json_agg style). The object parse is inlined INTO
// the array loop — no per-element function call. Returns `(cells) => (row[])[]` (one array per cell).
function compileArrayShape(shape: Shape): (cells: Buffer[]) => unknown[] {
  const skipWs = 'while (p < e && (b[p] === 32 || b[p] === 9 || b[p] === 10 || b[p] === 13)) p++;'
  const skipKey = "p++; while (p < e) { const c = b[p]; if (c === 92) { p += 2; continue } if (c === 34) { p++; break } p++ }"
  const obj: string[] = []
  shape.forEach(([, t], i) => {
    obj.push(`        ${skipWs} ${skipKey} ${skipWs} p++; ${skipWs}   // "key":`)
    obj.push(`        ${readSnippet(t, 'v' + i)};`)
    obj.push(`        ${skipWs} if (b[p] === 44) p++;`)
  })
  const ret = '{ ' + shape.map(([k], i) => (k === '__proto__' ? `["__proto__"]: v${i}` : `${JSON.stringify(k)}: v${i}`)).join(', ') + ' }'
  const decl = shape.map((_, i) => `v${i} = null`).join(', ')
  const src = `function rows(arr) {
  "use strict";
  const n = arr.length, res = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = arr[i]; let p = 0; const e = b.length;
    ${skipWs}
    if (b[p] === 110) { res[i] = null; continue }   // top-level JSON null
    p++;                                            // '['
    const out = [];
    ${skipWs}
    if (b[p] === 93) { res[i] = out; continue }     // '[]'
    while (p < e) {
      ${skipWs} p++;                                // '{'
      let ${decl};
${obj.join('\n')}
      while (p < e && b[p] !== 125) p++; p++;       // past this object's '}'
      out.push(${ret});
      ${skipWs}
      if (b[p] === 44) { p++; continue }            // ',' -> next element
      if (b[p] === 93) { p++; break }               // ']' -> done
      break;
    }
    res[i] = out;
  }
  return res;
}`
  if (process.env.SHAPE_DEBUG) console.error('\n' + src + '\n')
  return new Function(`return (${src})`)() as (cells: Buffer[]) => unknown[]
}

// ---------------------------------------------------------------------------------------------
// Baselines that operate on the same cell buffers.
const jpUtf8 = (c: Buffer[]) => { const o = new Array(c.length); for (let i = 0; i < c.length; i++) o[i] = JSON.parse(c[i]!.toString('utf8')); return o } // readString(utf8) + JSON.parse
const jpU8Sl = (c: Buffer[]) => { const o = new Array(c.length); for (let i = 0; i < c.length; i++) { const b = c[i]!; o[i] = JSON.parse(HAS_U8 ? (b as any).utf8Slice(0, b.length) : b.toString('utf8')) } return o }
const jpLat1 = (c: Buffer[]) => { const o = new Array(c.length); for (let i = 0; i < c.length; i++) { const b = c[i]!; o[i] = JSON.parse(HAS_L1 ? (b as any).latin1Slice(0, b.length) : b.toString('latin1')) } return o } // ASCII-only shortcut

// ---------------------------------------------------------------------------------------------
// Scenarios: [name, shape, json-for-row(i), asciiOnly]. Shapes chosen so JSON.parse and the shaped
// parser produce EQUAL objects (safe-range numbers, no bigint) — parity is asserted before timing.
type Scenario = { name: string; shape: Shape; json: (i: number) => string; ascii: boolean }
const SCENARIOS: Scenario[] = [
  {
    name: 'small · 3 fields (id,name,active)',
    shape: [['id', 'int'], ['name', 'str'], ['active', 'bool']],
    json: (i) => `{"id":${i},"name":"user_${i}","active":${i % 2 === 0}}`,
    ascii: true,
  },
  {
    name: 'mixed · 6 fields (num/str/bool)',
    shape: [['id', 'int'], ['name', 'str'], ['active', 'bool'], ['price', 'num'], ['seats', 'int'], ['ts', 'str']],
    json: (i) => `{"id":${i},"name":"acct ${i}","active":${i % 3 === 0},"price":${(i % 1000) + 0.99},"seats":${i % 64},"ts":"2024-01-01T00:00:0${i % 10}Z"}`,
    ascii: true,
  },
  {
    name: 'number-heavy · 6 numeric fields',
    shape: [['a', 'int'], ['b', 'int'], ['c', 'num'], ['d', 'num'], ['e', 'int'], ['f', 'num']],
    json: (i) => `{"a":${i},"b":${i * 7},"c":${i + 0.5},"d":${i * 1.25},"e":${-i},"f":${i / 3}}`,
    ascii: true,
  },
  {
    name: 'string-heavy · 5 text fields (utf8)',
    shape: [['first', 'str'], ['last', 'str'], ['city', 'str'], ['note', 'str'], ['tag', 'str']],
    json: (i) => `{"first":"Иван ${i}","last":"Petrov","city":"São Paulo","note":"café №${i}","tag":"t${i}"}`,
    ascii: false,
  },
]

// input builder (module scope; never timed): one JSON cell buffer per row
const cellsFor = (s: Scenario, n: number) => Array.from({ length: n }, (_, i) => Buffer.from(s.json(i), 'utf8'))

// -------- correctness: shaped parser must equal JSON.parse for every scenario (safe shapes) --------
console.log('parity (shaped vs JSON.parse, first row):')
for (const s of SCENARIOS) {
  const c = cellsFor(s, 3)
  const shaped = compileShape(s.shape)(c)
  const parsed = c.map((b) => JSON.parse(b.toString('utf8')))
  const ok = JSON.stringify(shaped) === JSON.stringify(parsed)
  console.log(`  ${ok ? 'OK ' : 'MISMATCH'}  ${s.name}`)
  if (!ok) { console.log('    shaped:', JSON.stringify(shaped[0])); console.log('    parse :', JSON.stringify(parsed[0])); throw new Error(`parity failed: ${s.name}`) }
}

// bonus correctness note: the precision win JSON.parse can't give. int8 past 2^53 as 'raw' string.
{
  const bigShape: Shape = [['id', 'raw'], ['n', 'str']]
  const big = Buffer.from('{"id":9007199254740993,"n":"x"}', 'utf8')
  const shaped = (compileShape(bigShape)([big])[0] as any).id
  const parsed = (JSON.parse(big.toString('utf8')) as any).id
  console.log(`\nprecision: raw='${shaped}'  vs  JSON.parse=${parsed}  (JSON.parse ${shaped === '9007199254740993' && parsed !== 9007199254740993 ? 'LOSES' : ''} the low digits)\n`)
}

// -------- benchmarks --------
for (const s of SCENARIOS) {
  const shaped = compileShape(s.shape)
  for (const n of [1, 100, 1000]) {
    const c = cellsFor(s, n)
    group(`${s.name} · ${n} rows`, () => {
      summary(() => {
        bench('readString(utf8) + JSON.parse', () => do_not_optimize(jpUtf8(c))).gc('inner')
        bench('utf8Slice + JSON.parse', () => do_not_optimize(jpU8Sl(c))).gc('inner')
        if (s.ascii) bench('latin1Slice + JSON.parse', () => do_not_optimize(jpLat1(c))).gc('inner')
        bench('shaped positional (monomorphic)', () => do_not_optimize(shaped(c))).gc('inner')
      })
    })
  }
}

// -------- array-of-objects (json_agg style): each cell is [ {6 fields}, {6 fields}, ... ] --------
const ARR_SHAPE: Shape = [['id', 'int'], ['name', 'str'], ['active', 'bool'], ['price', 'num'], ['seats', 'int'], ['ts', 'str']]
const arrObj = (i: number) => `{"id":${i},"name":"acct ${i}","active":${i % 3 === 0},"price":${(i % 1000) + 0.99},"seats":${i % 64},"ts":"2024-01-01T00:00:0${i % 10}Z"}`
const arrCell = (count: number) => (i: number) => '[' + Array.from({ length: count }, (_, j) => arrObj(i * count + j)).join(',') + ']'
const arrScanner = compileArrayShape(ARR_SHAPE)

console.log('\narray-of-objects parity (scanner vs JSON.parse):')
{
  const cells = Array.from({ length: 3 }, (_, i) => Buffer.from(arrCell(4)(i), 'utf8'))
  const ok = JSON.stringify(arrScanner(cells)) === JSON.stringify(cells.map((c) => JSON.parse(c.toString('utf8'))))
  console.log(`  ${ok ? 'OK' : 'MISMATCH'}  (4 objects/cell)`)
  if (!ok) throw new Error('array parity failed')
}

for (const count of [1, 3, 10, 50]) {
  const cells = Array.from({ length: 100 }, (_, i) => Buffer.from(arrCell(count)(i), 'utf8'))
  group(`array · ${count} object(s)/cell · 100 cells · 6-field objects`, () => {
    summary(() => {
      bench('JSON.parse per cell', () => do_not_optimize(cells.map((c) => JSON.parse(c.toString('utf8'))))).gc('inner')
      bench('shaped array scanner (inlined, one pass)', () => do_not_optimize(arrScanner(cells))).gc('inner')
    })
  })
}

await run()
