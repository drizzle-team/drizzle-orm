// ISOLATED float/double decode-strategy comparison. One float8 column, decoded straight into a
// number (no object construction) so we measure ONLY the parse. Five strategies × several value
// distributions, to find WHERE the direct byte->f64 parser wins and where it loses to the engine's
// native strtod (Number()/parseFloat). Buffers are pre-built; each strategy is compiled once.
//   bun bench/float-decode.bench.ts   (or: bun run bench:float)   — run on node too for V8 vs JSC
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import * as wire from '../test/helpers/wire.ts'

const N = 1000

// direct ASCII -> f64: sign, int+frac digits, exponent (Math.pow), NaN/Infinity. `v` is the target.
const DIRECT = `{ let p = o; const e = o + l; let neg = false; const c0 = b[p];
  if (c0 === 45) { neg = true; p++ } else if (c0 === 43) { p++ }
  if (b[p] === 78 || b[p] === 110) { v = NaN }
  else if (b[p] === 73 || b[p] === 105) { v = neg ? -Infinity : Infinity }
  else {
    let x = 0;
    for (; p < e; p++) { const c = b[p]; if (c < 48 || c > 57) break; x = x * 10 + (c - 48) }
    if (b[p] === 46) { p++; let f = 0, sc = 1; for (; p < e; p++) { const c = b[p]; if (c < 48 || c > 57) break; f = f * 10 + (c - 48); sc *= 10 } x += f / sc }
    if (b[p] === 101 || b[p] === 69) { p++; let es = 1; if (b[p] === 45) { es = -1; p++ } else if (b[p] === 43) { p++ } let ex = 0; for (; p < e; p++) { const c = b[p]; if (c < 48 || c > 57) break; ex = ex * 10 + (c - 48) } x *= Math.pow(10, es * ex) }
    v = neg ? -x : x
  } }`

const STRATS: Record<string, string> = {
  'Number(utf8Slice)': 'v = Number(b.utf8Slice(o, o + l))',
  'Number(latin1Slice)': 'v = Number(b.latin1Slice(o, o + l))',
  'parseFloat(latin1Slice)': 'v = parseFloat(b.latin1Slice(o, o + l))',
  '+latin1Slice': 'v = +b.latin1Slice(o, o + l)',
  'direct bytes->f64': DIRECT,
}

// compile a whole-result-set mapper for ONE float column using the given decode expression
function build(expr: string): (arr: Buffer[]) => number[] {
  const src = `function rows(arr){ "use strict"; const n = arr.length, res = new Array(n);
    for (let i = 0; i < n; i++) { const b = arr[i]; let o = 2;
      const l = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4;
      let v = null; if (l !== -1) { ${expr}; o += l } res[i] = v } return res }`
  return new Function(`return (${src})`)() as (arr: Buffer[]) => number[]
}
const builders = Object.entries(STRATS).map(([name, expr]) => [name, build(expr)] as const)

// value distributions — each stresses the parser differently
const CASES: Record<string, (i: number) => string> = {
  'short int (1-5 digits)': (i) => String(i % 100000),
  'simple decimal (x.xx)': (i) => (i % 1000) + '.' + (10 + (i % 89)),
  'long fraction (~16 sig)': (i) => '3.14159265358979' + (i % 10),
  'many digits (~19 sig)': (i) => '123456789' + (i % 10) + '.12345678' + (i % 10),
  'exponent (x.xEyy)': (i) => (1 + (i % 9)) + '.5e' + ((i % 300) - 150),
  'realistic money (x.xx)': (i) => (100 + (i % 100000)) + '.' + (10 + (i % 89)),
  'int 15-digit (no frac)': (i) => String(100000000000000 + (i % 1000000)),
  'huge numeric (~59 digits)': (i) => '12345678901234567890123456789012345678' + (i % 10) + '.1234567890123456789' + (i % 10),
}

// accuracy: the direct parser trades correctness for speed. Show the max relative error vs Number()
// per case, so we see WHERE (and how badly) direct diverges as digit count grows.
const numFn = build(STRATS['Number(latin1Slice)']!)
const dirFn = build(STRATS['direct bytes->f64']!)
console.log('accuracy — max relative error (direct vs Number) over N values:')
for (const [caseName, gen] of Object.entries(CASES)) {
  const bs = wire.dataRows(Array.from({ length: N }, (_, i) => [gen(i)] as wire.Cell[]))
  const a = numFn(bs), c = dirFn(bs)
  let maxRel = 0, worst = ''
  for (let i = 0; i < N; i++) {
    const x = a[i]!, y = c[i]!
    if (!Number.isFinite(x)) continue
    const rel = x === 0 ? Math.abs(y) : Math.abs((y - x) / x)
    if (rel > maxRel) { maxRel = rel; worst = gen(i) }
  }
  console.log(`  ${caseName.padEnd(28)} maxRelErr=${maxRel.toExponential(2)}  (e.g. ${worst})`)
}
console.log('')

for (const [caseName, gen] of Object.entries(CASES)) {
  const b = wire.dataRows(Array.from({ length: N }, (_, i) => [gen(i)] as wire.Cell[]))
  group(`float8 · ${caseName} · ${N} rows`, () => {
    summary(() => {
      for (const [name, fn] of builders) bench(name, () => do_not_optimize(fn(b))).gc('inner')
    })
  })
}

await run()
