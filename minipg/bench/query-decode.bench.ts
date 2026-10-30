// Compare decoding minipg's real users+subscriptions LATERAL json_agg query three ways:
//   1. interpreted   — per-column CellDecoder loop; the json column via JSON.parse
//   2. jit           — compiled monomorphic mapper; the json column via JSON.parse
//   3. jit + shape   — compiled mapper with the positional JSON scanner for the declared subscriptions shape
// Decode-isolated: the DataRow buffers are captured ONCE, then only the buffer->POJO mapping is timed
// (no network / DB in the loop). Requires the seeded DB (DATABASE_URL, default local port 58524).
import { connect, JsonArray } from '../src/index.ts'
import { buildMapperFactory } from '../src/mapper.ts'
import { buildDecoders } from '../src/decode.ts'
import { shapeCols } from '../src/spec.ts'
import type { CodegenCol } from '../src/decode.ts'
import { run, bench, group, summary, do_not_optimize } from 'mitata'

const URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:58524/postgres'
const SQL = `
select u.id, u.name,
  coalesce(json_agg(row_to_json(s.*) order by s.id) filter (where s.id is not null), '[]') as subscriptions
from users u left join subscriptions s on s.user_id = u.id
group by u.id, u.name order by u.id`

// --- capture the raw DataRow bodies once (mode:'raw' returns each row's undecoded body) ---
const db = await connect(URL)
const bodies = (await db.query(SQL, [], { mode: 'raw' })).rows as unknown as Buffer[]
await db.end()

const decoders = buildDecoders()
// no-shape plan: id int8(20) -> string, name text(25), subscriptions json(114) -> JSON.parse
const plain: CodegenCol[] = [{ name: 'id', oid: 20 }, { name: 'name', oid: 25 }, { name: 'subscriptions', oid: 114 }]
// shape plan: typed columns + positional scanner over the subscriptions array (timestamps -> epoch)
const shaped = shapeCols({
  id: 'int8:number', name: 'text',
  subscriptions: JsonArray({
    id: 'int8:number', user_id: 'int8:number', plan: 'text', status: 'text',
    price: 'numeric:number', seats: 'int4',
    started_at: 'timestamptz:ms', renews_at: 'timestamptz:ms', canceled_at: 'timestamptz:ms',
  }),
})

// scanner WITHOUT :ms (exact bigint/numeric, timestamps left as ISO strings) — isolates Date.parse cost
const shapedExact = shapeCols({
  id: 'int8', name: 'text',
  subscriptions: JsonArray({
    id: 'int8', user_id: 'int8', plan: 'text', status: 'text',
    price: 'numeric', seats: 'int4',
    started_at: 'timestamptz', renews_at: 'timestamptz', canceled_at: 'timestamptz',
  }),
})

const interp = buildMapperFactory('interpreted')(plain, 'object', decoders)
const jit = buildMapperFactory('jit')(plain, 'object', decoders)
const shape = buildMapperFactory('jit')(shaped, 'object', decoders)
const shapeExact = buildMapperFactory('jit')(shapedExact, 'object', decoders)

// EXPERIMENT: the same shape, but the json scanner INLINED — skipWs/readStr/readNum spliced at each
// field site (no skipWs()/__jN() calls), matching bench/json-shape.bench's flat-inline approach.
const SW = 'while (p < e) { const w = b[p]; if (w === 32 || w === 9 || w === 10 || w === 13) p++; else break }'
const SK = 'p++; while (p < e) { const k = b[p]; if (k === 92) { p += 2; continue } if (k === 34) { p++; break } p++ }'
const rNum = (v: string) => `if (b[p] === 110) { ${v} = null; p += 4 } else if (b[p] === 34) { p++; const s = p; while (p < e && b[p] !== 34) p++; ${v} = Number(b.utf8Slice(s, p)); p++ } else { const s = p; if (b[p] === 45) p++; while (p < e) { const c = b[p]; if ((c>=48&&c<=57)||c===46||c===43||c===45||c===101||c===69) p++; else break } ${v} = Number(b.latin1Slice(s, p)) }`
const rStr = (v: string) => `if (b[p] === 110) { ${v} = null; p += 4 } else { p++; const s = p; let esc = false; while (p < e) { const c = b[p]; if (c === 92) { esc = true; p += 2; continue } if (c === 34) break; p++ } ${v} = esc ? JSON.parse(b.toString('utf8', s - 1, p + 1)) : b.utf8Slice(s, p); p++ }`
// :ms via Date.parse (allocates the ISO string first)
const rEpDate = (v: string) => `if (b[p] === 110) { ${v} = null; p += 4 } else { p++; const s = p; while (p < e && b[p] !== 34) p++; ${v} = Date.parse(b.utf8Slice(s, p)); p++ }`
// :ms via a fixed-format ISO byte parse (no string alloc, no Date.parse) — YYYY-MM-DDTHH:MM:SS[.fff][±HH:MM|Z]
const rEpFast = (v: string) => `if (b[p] === 110) { ${v} = null; p += 4 } else { p++;
  const Y=(b[p]-48)*1000+(b[p+1]-48)*100+(b[p+2]-48)*10+(b[p+3]-48), Mo=(b[p+5]-48)*10+(b[p+6]-48), D=(b[p+8]-48)*10+(b[p+9]-48);
  const H=(b[p+11]-48)*10+(b[p+12]-48), Mi=(b[p+14]-48)*10+(b[p+15]-48), S=(b[p+17]-48)*10+(b[p+18]-48);
  let q=p+19, ms=0;
  if (b[q]===46){ q++; let f=0,k=0; while(k<3&&b[q]>=48&&b[q]<=57){f=f*10+(b[q]-48);q++;k++} while(k<3){f*=10;k++} ms=f; while(b[q]>=48&&b[q]<=57)q++ }
  let off=0; const sg=b[q]; if(sg===43||sg===45){ q++; const oh=(b[q]-48)*10+(b[q+1]-48); q+=2; let om=0; if(b[q]===58){q++;om=(b[q]-48)*10+(b[q+1]-48);q+=2} off=(sg===45?-1:1)*(oh*60+om)*60000 } else if (b[q]===90) q++;
  ${v} = Date.UTC(Y,Mo-1,D,H,Mi,S,ms)-off; p=q; while (p<e && b[p]!==34) p++; p++ }`
function compileInline(rEp: (v: string) => string): (b: Buffer) => unknown {
  const F: Array<[string, (v: string) => string]> = [['id', rNum], ['user_id', rNum], ['plan', rStr], ['status', rStr], ['price', rNum], ['seats', rNum], ['started_at', rEp], ['renews_at', rEp], ['canceled_at', rEp]]
  const objBody = F.map(([, rd], i) => `${SW} ${SK} ${SW} p++; ${SW} ${rd('o' + i)} ${SW} if (b[p] === 44) p++;`).join('\n          ')
  const objLit = '{ ' + F.map(([k], i) => `${JSON.stringify(k)}: o${i}`).join(', ') + ' }'
  const src = `return function row(b) {
    let o = 2, l, e;
    l = (b[o] << 24) | (b[o+1] << 16) | (b[o+2] << 8) | b[o+3]; o += 4; let id = null;
    if (l !== -1) { let p = o, s = false, x = 0; const en = o + l; if (b[p] === 45) { s = true; p++ } for (; p < en; p++) x = x * 10 + (b[p] - 48); id = s ? -x : x; o += l }
    l = (b[o] << 24) | (b[o+1] << 16) | (b[o+2] << 8) | b[o+3]; o += 4; let name = null;
    if (l !== -1) { name = b.utf8Slice(o, o + l); o += l }
    l = (b[o] << 24) | (b[o+1] << 16) | (b[o+2] << 8) | b[o+3]; o += 4; let subs = null;
    if (l !== -1) {
      let p = o; e = o + l;
      ${SW}
      if (b[p] === 110) { subs = null; p += 4 } else {
        p++; subs = [];
        ${SW}
        if (b[p] === 93) { p++ } else {
          while (p < e) {
            ${SW} p++;
            let ${F.map((_, i) => `o${i}=null`).join(', ')};
            ${objBody}
            while (p < e && b[p] !== 125) p++; p++;
            subs.push(${objLit});
            ${SW}
            if (b[p] === 44) { p++; continue }
            if (b[p] === 93) { p++; break }
            break;
          }
        }
      }
      o += l;
    }
    return { id: id, name: name, subscriptions: subs };
  }`
  return new Function(src)() as (b: Buffer) => unknown
}
// timestamps kept as STRINGS, read via latin1 (ISO is ASCII) — the ':latin1' target
const rLat1 = (v: string) => `if (b[p] === 110) { ${v} = null; p += 4 } else { p++; const s = p; let esc = false; while (p < e) { const c = b[p]; if (c === 92) { esc = true; p += 2; continue } if (c === 34) break; p++ } ${v} = esc ? JSON.parse(b.toString('utf8', s - 1, p + 1)) : b.latin1Slice(s, p); p++ }`
const inlineMapper = compileInline(rEpDate)   // inlined scanner, :ms via Date.parse
const inlineFast = compileInline(rEpFast)     // inlined scanner, :ms via fixed-format byte parse
const inlineLat1 = compileInline(rLat1)       // inlined scanner, timestamps as latin1 STRINGS (same output as JSON.parse)

// APPLES-TO-APPLES: JSON.parse doesn't return epochs — to match the shape's output you must ALSO visit
// every subscription and convert its 3 timestamp strings. This is the real cost of "JSON.parse + epochs".
const jitThenEpoch = (arr: Buffer[]) => {
  const rows = arr.map(jit) as Array<{ subscriptions: Array<Record<string, unknown>> }>
  for (let i = 0; i < rows.length; i++) {
    const subs = rows[i]!.subscriptions
    for (let j = 0; j < subs.length; j++) {
      const s = subs[j]!
      if (s.started_at != null) s.started_at = Date.parse(s.started_at as string)
      if (s.renews_at != null) s.renews_at = Date.parse(s.renews_at as string)
      if (s.canceled_at != null) s.canceled_at = Date.parse(s.canceled_at as string)
    }
  }
  return rows
}

// parity: both inlined variants must equal the production scanner for every row
{
  const ref = JSON.stringify(bodies.map(shape))
  console.log('inline (Date.parse) == production?', JSON.stringify(bodies.map(inlineMapper)) === ref)
  const fastEq = JSON.stringify(bodies.map(inlineFast)) === ref
  console.log('inline (fast ISO)   == production?', fastEq)
  if (!fastEq) { console.log('  fast[0]:', JSON.stringify((inlineFast(bodies[0]!) as any).subscriptions?.[0])); console.log('  ref [0]:', JSON.stringify((shape(bodies[0]!) as any).subscriptions?.[0])) }
}

// sanity: what each produces for the first row's first subscription
const s0 = (shape(bodies[0]!) as { subscriptions: Array<{ started_at: unknown }> }).subscriptions[0]
console.log(`captured ${bodies.length} rows`)
console.log('  interpreted subscriptions ->', typeof (interp(bodies[0]!) as { subscriptions: unknown }).subscriptions, '(JSON.parse: array of objects, ISO-string timestamps)')
console.log('  shape started_at          ->', s0?.started_at, `(${typeof s0?.started_at}, epoch ms)`)

// parity: latin1-string variant must equal the plain JSON.parse mapper (identical output)
console.log('inline (latin1 str) == jit JSON.parse?', JSON.stringify(bodies.map(inlineLat1)) === JSON.stringify(bodies.map(jit)))

group('SAME OUTPUT (string timestamps): JSON.parse vs shape scanner (latin1 strings)', () => {
  summary(() => {
    bench('jit — json via JSON.parse', () => { do_not_optimize(bodies.map(jit)) }).gc('inner')
    bench('shape scanner, INLINED, timestamps as latin1 strings', () => { do_not_optimize(bodies.map(inlineLat1)) }).gc('inner')
  })
})

group('SAME OUTPUT (epoch timestamps): shape scanner vs JSON.parse + convert', () => {
  summary(() => {
    bench('JSON.parse + walk arrays + Date.parse timestamps', () => { do_not_optimize(jitThenEpoch(bodies)) }).gc('inner')
    bench('shape scanner, INLINED + fast ISO (exact bigint too)', () => { do_not_optimize(bodies.map(inlineFast)) }).gc('inner')
    bench('shape scanner, production (function calls + Date.parse)', () => { do_not_optimize(bodies.map(shape)) }).gc('inner')
  })
})

group('decode users+subscriptions (28 rows, LATERAL json_agg) — whole result', () => {
  summary(() => {
    bench('interpreted (json via JSON.parse, lossy bigint, STRING ts)', () => { do_not_optimize(bodies.map(interp)) }).gc('inner')
    bench('jit (json via JSON.parse, lossy bigint, STRING ts)', () => { do_not_optimize(bodies.map(jit)) }).gc('inner')
    bench('jit + shape, exact bigint/numeric (scanner, string ts)', () => { do_not_optimize(bodies.map(shapeExact)) }).gc('inner')
    bench('jit + shape + :ms (scanner + Date.parse, function-call helpers)', () => { do_not_optimize(bodies.map(shape)) }).gc('inner')
    bench('jit + shape + :ms, INLINED scanner + Date.parse', () => { do_not_optimize(bodies.map(inlineMapper)) }).gc('inner')
    bench('jit + shape + :ms, INLINED scanner + fast ISO parse', () => { do_not_optimize(bodies.map(inlineFast)) }).gc('inner')
  })
})
await run()
process.exit(0)
