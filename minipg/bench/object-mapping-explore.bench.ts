// EXPLORATION: fast OBJECT-mode row construction when the column shape (names) is known upfront,
// WITHOUT codegen (new Function) — the goal is to close the interpreted object-mode gap vs the JIT
// literal for runtimes where `new Function` is unavailable (strict CSP / some edge runtimes).
//
// The decode cost is held constant (values are pre-decoded); we measure ONLY object construction.
// Run on BOTH engines — V8 and JSC optimize object building very differently:
//   bun bench/object-mapping-explore.bench.ts
//   node bench/object-mapping-explore.bench.ts        (sudo for cycles/instructions counters)
import { run, bench, group, summary, do_not_optimize } from 'mitata'

const names = ['id', 'name', 'age', 'active', 'score', 'note']
const M = names.length
const N = 1000
// pre-decoded values per row (varying), so we measure construction, not decoding
const data: unknown[][] = Array.from({ length: N }, (_, r) => [r, 'name_' + r, r % 99, r % 2 === 0, r * 7, 'note ' + r])

// 1. {} + keyed assign — the current interpreted path. Builds the hidden class via a transition
//    walk (empty -> +id -> +name -> ...) on every row; V8 caches the chain but still re-walks it.
const sPlain = () => { const out = new Array(N); for (let i = 0; i < N; i++) { const v = data[i]!; const o: Record<string, unknown> = {}; for (let j = 0; j < M; j++) o[names[j]!] = v[j]; out[i] = o } return out }

// 2. Object.create(null) — reference: V8 demotes null-proto to dictionary mode (the trap we fixed).
const sNull = () => { const out = new Array(N); for (let i = 0; i < N; i++) { const v = data[i]!; const o: Record<string, unknown> = Object.create(null); for (let j = 0; j < M; j++) o[names[j]!] = v[j]; out[i] = o } return out }

// 3. template clone via spread — start each row already in the full shape, then store to EXISTING
//    slots (no per-row transition walk). The clone preserves the template's hidden class.
const TMPL: Record<string, unknown> = {}; for (const n of names) TMPL[n] = undefined
const sSpread = () => { const out = new Array(N); for (let i = 0; i < N; i++) { const v = data[i]!; const o: Record<string, unknown> = { ...TMPL }; for (let j = 0; j < M; j++) o[names[j]!] = v[j]; out[i] = o } return out }

// 4. template clone via Object.assign (same idea, different clone primitive)
const sAssign = () => { const out = new Array(N); for (let i = 0; i < N; i++) { const v = data[i]!; const o = Object.assign({}, TMPL) as Record<string, unknown>; for (let j = 0; j < M; j++) o[names[j]!] = v[j]; out[i] = o } return out }

// 5. codegen literal via new Function — the JIT path, as the UPPER BOUND we're trying to approach.
const build = new Function('v', 'return {' + names.map((n, i) => JSON.stringify(n) + ':v[' + i + ']').join(',') + '}') as (v: unknown[]) => Record<string, unknown>
const sCodegen = () => { const out = new Array(N); for (let i = 0; i < N; i++) out[i] = build(data[i]!); return out }

// 6. hand-written literal for THIS exact shape — the absolute ceiling (what codegen emits).
const sLiteral = () => { const out = new Array(N); for (let i = 0; i < N; i++) { const v = data[i]!; out[i] = { id: v[0], name: v[1], age: v[2], active: v[3], score: v[4], note: v[5] } } return out }

// 7. Object.fromEntries — materialize from [k,v] pairs. Allocates M pair-arrays + 1 entries array per row.
const sFromEntries = () => { const out = new Array(N); for (let i = 0; i < N; i++) { const v = data[i]!; const e = new Array(M); for (let j = 0; j < M; j++) e[j] = [names[j], v[j]]; out[i] = Object.fromEntries(e) } return out }

// 8. Object.fromEntries with a REUSED entries array — pairs built ONCE, only values mutated per row.
//    Removes the per-row pair/entries allocations; the fromEntries object build still happens.
const reused: [string, unknown][] = names.map((n) => [n, undefined])
const sFromEntriesReuse = () => { const out = new Array(N); for (let i = 0; i < N; i++) { const v = data[i]!; for (let j = 0; j < M; j++) reused[j]![1] = v[j]; out[i] = Object.fromEntries(reused) } return out }

// sanity: every strategy yields the same row
const ref = JSON.stringify(sLiteral()[0])
console.log('all strategies equal:', [sPlain, sNull, sSpread, sAssign, sCodegen, sFromEntries, sFromEntriesReuse].every((f) => JSON.stringify(f()[0]) === ref), '\n')

group(`build ${N} objects x ${M} keys (shape known upfront)`, () => {
  summary(() => {
    bench('1. {} + keyed assign (current)', () => do_not_optimize(sPlain())).gc('inner')
    bench('2. Object.create(null) (V8 trap)', () => do_not_optimize(sNull())).gc('inner')
    bench('3. {...TMPL} clone + fill', () => do_not_optimize(sSpread())).gc('inner')
    bench('4. Object.assign({},TMPL) + fill', () => do_not_optimize(sAssign())).gc('inner')
    bench('5. new Function literal (codegen)', () => do_not_optimize(sCodegen())).gc('inner')
    bench('6. hand literal (ceiling)', () => do_not_optimize(sLiteral())).gc('inner')
    bench('7. Object.fromEntries', () => do_not_optimize(sFromEntries())).gc('inner')
    bench('8. Object.fromEntries (reused entries)', () => do_not_optimize(sFromEntriesReuse())).gc('inner')
  })
})
await run({ colors: false })
