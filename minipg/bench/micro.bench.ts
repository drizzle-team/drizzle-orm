// Micro-benchmarks of minipg's hot paths, comparing the LIVE src against frozen
// version snapshots in ./variants (e.g. protocol_v1, codec_v1). No database.
//   bun bench/micro.bench.ts
// As you optimize a module, snapshot the old one (cp src/protocol.ts bench/variants/protocol_v2.ts)
// and add it as another bench line below so every version is comparable across machines.
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import { W as Wlive, Parser as ParserLive } from '../src/protocol.ts'
import { W as Wv1, Parser as ParserV1 } from './variants/protocol_v1.ts'
import { encodeParam } from '../src/encode.ts'
import { buildDecoders as bdLive, decoderFor as dfLive } from '../src/decode.ts'
import { buildDecoders as bdV1, decoderFor as dfV1 } from './variants/codec_v1.ts'

// ---------- write path: serialize one extended-query packet ----------
function packet(W: typeof Wlive): Buffer {
  const enc = [encodeParam(42), encodeParam('hello world'), encodeParam(true)]
  return Buffer.concat([
    W.parse('', 'select $1::int, $2::text, $3::bool'),
    W.describe('S', ''), W.bind('', '', enc, 0), W.execute('', 0), W.sync(),
  ])
}
group('write: serialize extended-query packet', () => {
  summary(() => {
    bench('live', () => { do_not_optimize(packet(Wlive)) })
    bench('v1', () => { do_not_optimize(packet(Wv1)) })
  })
})

// ---------- decode path: decode one mixed-type row ----------
const cells: Array<[number, Buffer]> = [
  [23, Buffer.from('123456')],            // int4 -> number
  [20, Buffer.from('9007199254740993')],  // int8 -> string
  [25, Buffer.from('a longer text value')], // text
  [16, Buffer.from('t')],                 // bool
  [1700, Buffer.from('1234.56')],         // numeric -> string
  [3802, Buffer.from('{"a":1,"b":[1,2,3]}')], // jsonb
]
const mapLive = bdLive(); const mapV1 = bdV1()
function decodeRow(df: typeof dfLive, map: ReturnType<typeof bdLive>): void {
  for (const [oid, buf] of cells) do_not_optimize(df(oid, map)(buf))
}
group('decode: one mixed-type row (per-cell decoderFor + decode)', () => {
  summary(() => {
    bench('live', () => { decodeRow(dfLive, mapLive) })
    bench('v1', () => { decodeRow(dfV1, mapV1) })
  })
})

// ---------- read path: frame a 100-row server response ----------
const u16 = (n: number) => { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(n); return b }
const i32 = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeInt32BE(n); return b }
const cstr = (s: string) => Buffer.concat([Buffer.from(s), Buffer.from([0])])
const be = (t: string, p: Buffer) => Buffer.concat([Buffer.from(t), i32(p.length + 4), p])
function serverResponse(rows: number): Buffer {
  const T = be('T', Buffer.concat([u16(3), ...['id', 'name', 'v'].map((nm) => Buffer.concat([cstr(nm), i32(0), u16(0), i32(23), u16(4), i32(-1), u16(0)]))]))
  const v = Buffer.from('123456')
  const D = be('D', Buffer.concat([u16(3), i32(v.length), v, i32(v.length), v, i32(v.length), v]))
  const parts = [T]; for (let k = 0; k < rows; k++) parts.push(D)
  parts.push(be('C', cstr(`SELECT ${rows}`)), be('Z', Buffer.from('I')))
  return Buffer.concat(parts)
}
const resp = serverResponse(100)
group('read: frame a 100-row server response (Parser)', () => {
  summary(() => {
    bench('live', () => { do_not_optimize(new ParserLive().push(resp)) })
    bench('v1', () => { do_not_optimize(new ParserV1().push(resp)) })
  })
})

await run()
process.exit(0)
