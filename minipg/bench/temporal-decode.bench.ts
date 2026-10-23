// ISOLATED temporal decode-strategy exploration. PostgreSQL sends timestamp/timestamptz/date as text
// ('YYYY-MM-DD HH:MI:SS.ffffff±TZ'). minipg's default is the exact string (lossless — keeps micros +
// the offset as sent). ORMs usually want a JS Date, which forces two costs to reason about:
//   1) ACCURACY: JS Date is millisecond-only, so microseconds (PG's 4th-6th fractional digits) are lost.
//   2) CORRECTNESS: `new Date(pgText)` is unreliable — a no-offset `timestamp` is parsed as LOCAL time,
//      and PG's space-separated format is non-standard (engine-dependent). Direct construction via
//      Date.UTC with an explicit UTC policy is both correct and fast.
// Strategies: string (latin1) | new Date(text) | direct->epoch ms (number) | direct->Date.
//   bun bench/temporal-decode.bench.ts   (or: bun run bench:temporal)   — run node too for V8 vs JSC
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import * as wire from '../test/helpers/wire.ts'

const N = 1000

// direct parse of 'YYYY-MM-DD[ HH:MI:SS[.f...]][±TZ]' -> epoch ms in `ems` (UTC policy for no-offset).
// ms = first 3 fractional digits (micros truncated). Fields scanned from bytes; no string alloc.
const DIRECT_MS = `{ let p = o; const e = o + l;
    let Y = 0; for (; p < e; p++) { const c = b[p]; if (c < 48 || c > 57) break; Y = Y * 10 + (c - 48) } p++;
    const Mo = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 3;
    const D = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 2;
    let H = 0, Mi = 0, S = 0, ms = 0, off = 0;
    if (p < e && b[p] === 32) { p++;
      H = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 3;
      Mi = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 3;
      S = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 2;
      if (p < e && b[p] === 46) { p++; let f = 0, k = 0; for (; p < e && k < 3; p++) { const c = b[p]; if (c < 48 || c > 57) break; f = f * 10 + (c - 48); k++ } while (k < 3) { f *= 10; k++ } ms = f; while (p < e) { const c = b[p]; if (c < 48 || c > 57) break; p++ } }
      if (p < e && (b[p] === 43 || b[p] === 45)) { const sg = b[p] === 45 ? -1 : 1; p++; const th = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 2; let tm = 0; if (p < e && b[p] === 58) { p++; tm = (b[p] - 48) * 10 + (b[p + 1] - 48); p += 2 } off = sg * (th * 60 + tm) * 60000 }
    }
    ems = Date.UTC(Y, Mo - 1, D, H, Mi, S, ms) - off;
  }`

const STRATS: Record<string, string> = {
  'string (latin1)': 'v = b.latin1Slice(o, o + l)',
  'new Date(latin1)': 'v = new Date(b.latin1Slice(o, o + l))',
  'direct -> epoch ms': `${DIRECT_MS} v = ems`,
  'direct -> Date': `${DIRECT_MS} v = new Date(ems)`,
}

function build(expr: string): (arr: Buffer[]) => unknown[] {
  const src = `function rows(arr){ "use strict"; const n = arr.length, res = new Array(n);
    for (let i = 0; i < n; i++) { const b = arr[i]; let o = 2;
      const l = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4;
      let v = null, ems = 0; if (l !== -1) { ${expr}; o += l } res[i] = v } return res }`
  return new Function(`return (${src})`)() as (arr: Buffer[]) => unknown[]
}
const builders = Object.entries(STRATS).map(([name, expr]) => [name, build(expr)] as const)

const CASES: Record<string, (i: number) => string> = {
  'timestamptz +00': (i) => `2021-06-${String(1 + (i % 28)).padStart(2, '0')} 12:34:56.789+00`,
  'timestamptz +02': (i) => `2021-06-${String(1 + (i % 28)).padStart(2, '0')} 12:34:56.789+02`,
  'timestamp (no tz)': (i) => `2021-06-${String(1 + (i % 28)).padStart(2, '0')} 12:34:${String(i % 60).padStart(2, '0')}.789`,
  'timestamp w/ micros': (i) => `2021-06-01 12:34:${String(i % 60).padStart(2, '0')}.789012`,
  'date': (i) => `2021-06-${String(1 + (i % 28)).padStart(2, '0')}`,
}

// correctness snapshot: what each strategy yields, and whether direct matches the true instant
console.log('correctness (representative value per case):')
const iso = (x: unknown) => (x instanceof Date ? (isNaN(x.getTime()) ? 'Invalid Date' : x.toISOString()) : typeof x === 'number' ? new Date(x).toISOString() : String(x))
for (const [name, gen] of Object.entries(CASES)) {
  const s = gen(1), b = wire.dataRow([s])
  const out = builders.map(([sn, fn]) => `${sn.split(' ')[0]}=${iso(fn([b])[0])}`)
  console.log(`  ${name.padEnd(20)} ${s.padEnd(30)} | ${out.join('  ')}`)
}
console.log('  (note: micros are truncated to ms by every Date/epoch strategy; only the string keeps them)\n')

// assert: for timestamptz (offset present) direct-epoch == new Date(text).getTime() (both compute the instant)
{
  const dEpoch = build(STRATS['direct -> epoch ms']!)
  let mism = 0
  for (const gen of [CASES['timestamptz +00']!, CASES['timestamptz +02']!]) for (let i = 0; i < 500; i++) {
    const s = gen(i), b = wire.dataRow([s])
    const got = dEpoch([b])[0] as number, want = new Date(s).getTime()
    if (got !== want) { if (mism < 5) console.log('  INSTANT MISMATCH', s, 'direct', got, 'newDate', want); mism++ }
  }
  console.log(`  timestamptz direct-epoch vs new Date(text): ${mism === 0 ? 'MATCH (both correct)' : mism + ' mismatches'}\n`)
}

for (const [caseName, gen] of Object.entries(CASES)) {
  const b = wire.dataRows(Array.from({ length: N }, (_, i) => [gen(i)] as wire.Cell[]))
  group(`temporal · ${caseName} · ${N} rows`, () => {
    summary(() => {
      for (const [name, fn] of builders) bench(name, () => do_not_optimize(fn(b))).gc('inner')
    })
  })
}

// --- DB-side coalescing: instead of sending timestamptz TEXT, have PG send epoch-millis as a bigint,
//     e.g.  SELECT (extract(epoch from ts) * 1000)::bigint AS ts_ms .  The driver then just integer-
//     parses it — no field scanning, no tz logic, ~half the wire bytes. Compare that decode against
//     parsing the full timestamptz text. (epoch ms < 2^53 -> exact JS number.) ---
{
  const intMs = 'let q = o, x = 0; const e2 = o + l; let sg = false; if (b[q] === 45) { sg = true; q++ } for (; q < e2; q++) x = x * 10 + (b[q] - 48); const ims = sg ? -x : x;'
  const coalesced = [
    ['timestamptz TEXT -> epoch (field parse)', build(`${DIRECT_MS} v = ems`)],
    ['bigint ms -> number (intparse)', build(`{ ${intMs} v = ims }`)],
    ['bigint ms -> Date (intparse + new Date)', build(`{ ${intMs} v = new Date(ims) }`)],
  ] as const
  const inst = (i: number) => Date.UTC(2021, 5, 1 + (i % 28), 12, 34, i % 60, 789)
  const tzText = (i: number) => new Date(inst(i)).toISOString().replace('T', ' ').replace('Z', '+00') // 'YYYY-MM-DD HH:MI:SS.mmm+00'
  const msText = (i: number) => String(inst(i))
  // sanity: text field-parse and bigint intparse yield the same instant
  const tB = wire.dataRow([tzText(3)]), mB = wire.dataRow([msText(3)])
  console.log(`coalesce sanity: text->${(coalesced[0][1]([tB])[0])}  bigint->${(coalesced[1][1]([mB])[0])}  (expect ${inst(3)})\n`)
  for (const n of [100, 1000]) {
    const textB = wire.dataRows(Array.from({ length: n }, (_, i) => [tzText(i)] as wire.Cell[]))
    const msB = wire.dataRows(Array.from({ length: n }, (_, i) => [msText(i)] as wire.Cell[]))
    group(`DB-coalesced · ${n} rows · timestamptz text vs bigint epoch-ms`, () => {
      summary(() => {
        bench('timestamptz TEXT -> epoch (field parse)', () => do_not_optimize(coalesced[0][1](textB))).gc('inner')
        bench('bigint ms -> number (intparse)', () => do_not_optimize(coalesced[1][1](msB))).gc('inner')
        bench('bigint ms -> Date', () => do_not_optimize(coalesced[2][1](msB))).gc('inner')
      })
    })
  }
}

// --- timestamp_send(ts) path: PG serializes its internal int64 (MICROSECONDS since 2000-01-01 UTC)
//     as bytea (\x + 16 hex in text mode). Near-zero DB CPU (memcpy, no extract/numeric) AND micros-
//     precise. Driver hex-parses 8 bytes -> micros-since-2000, +946684800000000 -> unix micros.
//     Compare that decode vs the decimal (extract(epoch)*1000)::bigint decode. NOTE: number math is
//     exact only for post-2000 dates < ~year 2255 (<2^53 µs); pre-2000/far-future need BigInt. ---
{
  const PG_US = 946684800000000n            // 2000-01-01 in unix microseconds
  const usUnix = (i: number) => BigInt(Date.UTC(2021, 5, 1 + (i % 28), 12, 34, i % 60, 789)) * 1000n + 12n // + 12µs
  const decimalMs = (i: number) => String(usUnix(i) / 1000n)                                    // extract(epoch)*1000::bigint -> ms (drops µs)
  const byteaHex = (i: number) => { const buf = Buffer.alloc(8); buf.writeBigInt64BE(usUnix(i) - PG_US); return '\\x' + buf.toString('hex') } // timestamp_send

  const decMs = build('{ let q = o, x = 0; const e2 = o + l; for (; q < e2; q++) x = x * 10 + (b[q] - 48); v = x }')
  const hexMs = build('{ let q = o + 2, m = 0; const e2 = o + l; for (; q < e2; q++) { const c = b[q]; m = m * 16 + (c <= 57 ? c - 48 : (c <= 70 ? c - 55 : c - 87)) } v = Math.floor((m + 946684800000000) / 1000) }')
  const hexUs = build('{ let q = o + 2, m = 0; const e2 = o + l; for (; q < e2; q++) { const c = b[q]; m = m * 16 + (c <= 57 ? c - 48 : (c <= 70 ? c - 55 : c - 87)) } v = m + 946684800000000 }')

  const decB1 = wire.dataRow([decimalMs(5)]), hexB1 = wire.dataRow([byteaHex(5)])
  console.log(`send() sanity: decimal->${decMs([decB1])[0]}  bytea->${hexMs([hexB1])[0]}  bytea µs->${hexUs([hexB1])[0]} (want ms ${usUnix(5) / 1000n}, µs ${usUnix(5)})\n`)

  for (const n of [100, 1000]) {
    const decBodies = wire.dataRows(Array.from({ length: n }, (_, i) => [decimalMs(i)] as wire.Cell[]))
    const hexBodies = wire.dataRows(Array.from({ length: n }, (_, i) => [byteaHex(i)] as wire.Cell[]))
    group(`timestamp_send bytea vs decimal bigint · ${n} rows`, () => {
      summary(() => {
        bench('decimal ms bigint -> number', () => do_not_optimize(decMs(decBodies))).gc('inner')
        bench('timestamp_send bytea -> ms number', () => do_not_optimize(hexMs(hexBodies))).gc('inner')
        bench('timestamp_send bytea -> µs number (micros-precise)', () => do_not_optimize(hexUs(hexBodies))).gc('inner')
      })
    })
  }
}

await run()
