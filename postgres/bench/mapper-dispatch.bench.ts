// Does a JIT row-mapper that CALLS shared per-column decode functions (distinct named closure params)
// match one that INLINES the decode? This decides the merge: if "direct calls" ≈ "inlined", the JIT and
// interpreted mappers can share ONE catalog of decode functions (no duplicated inline snippets).
//
// Decode-isolated (no DB): 1000 DataRow bodies of shape [int4,int4,int4,text,bool] (text wire format),
// object mode. All four mappers are parity-checked before timing. Run under BOTH engines:
//   bun bench/mapper-dispatch.bench.ts                         # JSC
//   node --experimental-strip-types bench/mapper-dispatch.bench.ts   # V8
import { run, bench, group, summary, do_not_optimize } from 'mitata'

// ---- test data: 1000 DataRow bodies, shape [int4,int4,int4,text,bool] (text format) ----
function dataRow(cells: (string | null)[]): Buffer {
  const parts: Buffer[] = []
  const h = Buffer.allocUnsafe(2); h.writeInt16BE(cells.length, 0); parts.push(h)
  for (const c of cells) {
    if (c === null) { const n = Buffer.allocUnsafe(4); n.writeInt32BE(-1, 0); parts.push(n) }
    else { const v = Buffer.from(c, 'utf8'); const len = Buffer.allocUnsafe(4); len.writeInt32BE(v.length, 0); parts.push(len, v) }
  }
  return Buffer.concat(parts)
}
const N = 1000
const bodies = Array.from({ length: N }, (_, i) => { const g = i + 1; return dataRow([String(g), String(g * 2), String(g * 3), 'name_' + g, g % 2 === 0 ? 't' : 'f']) })

// ---- shared catalog: offset CellDecoders (the ONE source of truth) ----
type L1 = { latin1Slice(s: number, e: number): string }
const txtInt = (b: Buffer, o: number, l: number): number => { let p = o, x = 0; const e = o + l; if (b[o] === 45) { for (p = o + 1; p < e; p++) x = x * 10 + (b[p]! - 48); return -x } for (; p < e; p++) x = x * 10 + (b[p]! - 48); return x }
const txtLatin1 = (b: Buffer, o: number, l: number): string => (b as unknown as L1).latin1Slice(o, o + l)
const txtBool = (b: Buffer, o: number): boolean => b[o] === 116
type Row = { id: number | null; a: number | null; b: number | null; name: string | null; ok: boolean | null }

// ---- 1. INTERPRETED: per-column fns[] + loop (polymorphic dispatch) ----
const NAMES = ['id', 'a', 'b', 'name', 'ok'] as const
const FNS = [txtInt, txtInt, txtInt, txtLatin1, txtBool] as Array<(b: Buffer, o: number, l: number) => unknown>
function interp(b: Buffer): Record<string, unknown> {
  let o = 2; const row: Record<string, unknown> = {}
  for (let i = 0; i < 5; i++) { const l = (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!; o += 4; if (l === -1) row[NAMES[i]!] = null; else { row[NAMES[i]!] = FNS[i]!(b, o, l); o += l } }
  return row
}

const RD = (v: string) => `const ${v}=(b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3];o+=4`
const INT = (v: string, l: string) => `let p=o,x=0;const e=o+${l};if(b[o]===45){for(p=o+1;p<e;p++)x=x*10+(b[p]-48);${v}=-x}else{for(;p<e;p++)x=x*10+(b[p]-48);${v}=x}o+=${l}`

// ---- 2. JIT INLINED (today's approach): decode emitted directly ----
const inlined = new Function(`return function(b){let o=2;
  ${RD('l0')};let v0=null;if(l0!==-1){${INT('v0', 'l0')}}
  ${RD('l1')};let v1=null;if(l1!==-1){${INT('v1', 'l1')}}
  ${RD('l2')};let v2=null;if(l2!==-1){${INT('v2', 'l2')}}
  ${RD('l3')};let v3=null;if(l3!==-1){v3=b.latin1Slice(o,o+l3);o+=l3}
  ${RD('l4')};let v4=null;if(l4!==-1){v4=b[o]===116;o+=l4}
  return {id:v0,a:v1,b:v2,name:v3,ok:v4}}`)() as (b: Buffer) => Row

// ---- 3. JIT DIRECT CALLS: same object literal, decode via distinct NAMED closure params ----
const direct = new Function('m0', 'm1', 'm2', 'm3', 'm4', `return function(b){let o=2;
  ${RD('l0')};let v0=null;if(l0!==-1){v0=m0(b,o,l0);o+=l0}
  ${RD('l1')};let v1=null;if(l1!==-1){v1=m1(b,o,l1);o+=l1}
  ${RD('l2')};let v2=null;if(l2!==-1){v2=m2(b,o,l2);o+=l2}
  ${RD('l3')};let v3=null;if(l3!==-1){v3=m3(b,o,l3);o+=l3}
  ${RD('l4')};let v4=null;if(l4!==-1){v4=m4(b,o,l4);o+=l4}
  return {id:v0,a:v1,b:v2,name:v3,ok:v4}}`)(txtInt, txtInt, txtInt, txtLatin1, txtBool) as (b: Buffer) => Row

// ---- 4. JIT INDEXED d[i] (the megamorphic trap) ----
const indexed = new Function('d', `return function(b){let o=2;
  ${RD('l0')};let v0=null;if(l0!==-1){v0=d[0](b,o,l0);o+=l0}
  ${RD('l1')};let v1=null;if(l1!==-1){v1=d[1](b,o,l1);o+=l1}
  ${RD('l2')};let v2=null;if(l2!==-1){v2=d[2](b,o,l2);o+=l2}
  ${RD('l3')};let v3=null;if(l3!==-1){v3=d[3](b,o,l3);o+=l3}
  ${RD('l4')};let v4=null;if(l4!==-1){v4=d[4](b,o,l4);o+=l4}
  return {id:v0,a:v1,b:v2,name:v3,ok:v4}}`)(FNS) as (b: Buffer) => Row

// ---- 5. JIT DESTRUCTURED: const [m0..m4]=d in the OUTER scope, call m0..m4 in the row fn ----
const destructured = new Function('d', `const [m0,m1,m2,m3,m4]=d; return function(b){let o=2;
  ${RD('l0')};let v0=null;if(l0!==-1){v0=m0(b,o,l0);o+=l0}
  ${RD('l1')};let v1=null;if(l1!==-1){v1=m1(b,o,l1);o+=l1}
  ${RD('l2')};let v2=null;if(l2!==-1){v2=m2(b,o,l2);o+=l2}
  ${RD('l3')};let v3=null;if(l3!==-1){v3=m3(b,o,l3);o+=l3}
  ${RD('l4')};let v4=null;if(l4!==-1){v4=m4(b,o,l4);o+=l4}
  return {id:v0,a:v1,b:v2,name:v3,ok:v4}}`)(FNS) as (b: Buffer) => Row

// ---- parity: all must agree before timing ----
const ref = JSON.stringify(inlined(bodies[0]!))
for (const [name, m] of [['direct', direct], ['interp', interp], ['indexed', indexed], ['destructured', destructured]] as const) {
  if (JSON.stringify(m(bodies[0]!)) !== ref) { console.error(`MISMATCH ${name}:`, m(bodies[0]!), 'vs', ref); process.exit(1) }
}
console.log('parity OK:', ref)

const only = process.argv[2] // run ONE variant in isolation (own process) to kill cross-variant tiering noise
const want = (n: string) => !only || only === n
group(`decode ${N} rows · [int4,int4,int4,text,bool] · object mode${only ? ' · ' + only : ''}`, () => {
  summary(() => {
    if (want('inlined')) bench('JIT inlined (decode emitted)', () => { do_not_optimize(bodies.map(inlined)) }).gc('inner')
    if (want('direct')) bench('JIT direct calls (m0..m4 params)', () => { do_not_optimize(bodies.map(direct)) }).gc('inner')
    if (want('destructured')) bench('JIT destructured (const [m0..]=d)', () => { do_not_optimize(bodies.map(destructured)) }).gc('inner')
    if (want('indexed')) bench('JIT indexed d[i]', () => { do_not_optimize(bodies.map(indexed)) }).gc('inner')
    if (want('interp')) bench('interpreted loop (fns[i])', () => { do_not_optimize(bodies.map(interp)) }).gc('inner')
  })
})
await run()
