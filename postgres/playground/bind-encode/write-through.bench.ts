// Write-through text encoders vs the string-building versions they replaced. mitata .gc('inner') reports
// heap/iter, so the allocation win is visible directly. Byte-identity asserted at startup.
//   bun playground/bind-encode/write-through.bench.ts
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import { Writer } from '../../src/protocol.ts'
import { arrayLiteral, arrayLiteralInto, copyRowsText } from '../../src/encode.ts'

// ---- old string-building references (pre-refactor) ----
const escCopyText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
function oldCell(v: unknown): string {
  if (v == null) return '\\N'
  if (typeof v === 'string') return escCopyText(v)
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'boolean') return v ? 't' : 'f'
  if (v instanceof Date) return v.toISOString()
  if (Buffer.isBuffer(v)) return '\\\\x' + v.toString('hex')
  return escCopyText(typeof v === 'object' ? JSON.stringify(v) : String(v))
}
function* oldCopyRowsText(names: string[], rows: unknown[][], chunkBytes = 1 << 18): Generator<Buffer> {
  let parts: string[] = []; let size = 0
  for (const row of rows) {
    let line = ''
    for (let c = 0; c < names.length; c++) { if (c) line += '\t'; line += oldCell(row[c]) }
    line += '\n'; parts.push(line); size += line.length
    if (size >= chunkBytes) { yield Buffer.from(parts.join(''), 'utf8'); parts = []; size = 0 }
  }
  if (parts.length) yield Buffer.from(parts.join(''), 'utf8')
}

// ---- workloads ----
const ARR = [1, 2, 3, 'a,b', 'c"d\\e', null, [10, 20], 'plain', 999, 'more text here'] // mixed array param
const BASE = Date.UTC(2026, 0, 1)
const NAMES = ['id', 'name', 'qty', 'price', 'flag', 'ts']
const ROWS: unknown[][] = Array.from({ length: 10_000 }, (_, i) => [i, `name_${i}_${(i * 2654435761 % 1e5).toString(36)}`, i % 1000, (i % 9e4) + 0.25, i % 2 === 0, new Date(BASE + (i % 86400) * 1000)])

// byte-identity
{
  const wa = new Writer(1 << 16), wb = new Writer(1 << 16)
  wa.lpStr(arrayLiteral(ARR)); arrayLiteralInto(wb, ARR)
  if (!Buffer.from(wa.slice()).equals(Buffer.from(wb.slice()))) throw new Error('arrayLiteral NOT byte-identical')
  const oldC = Buffer.concat([...oldCopyRowsText(NAMES, ROWS)]), newC = Buffer.concat([...copyRowsText(NAMES, ROWS)])
  if (!oldC.equals(newC)) throw new Error('copyRowsText NOT byte-identical')
  console.log('byte-identity OK (arrayLiteralInto, copyRowsText)\n')
}

const w = new Writer(1 << 22)
summary(() => {
  group('array literal param (mixed 10-elem)', () => {
    bench('old: lpStr(arrayLiteral(arr))', () => { w.reset(); w.lpStr(arrayLiteral(ARR)); do_not_optimize(w) }).gc('inner')
    bench('new: arrayLiteralInto(w, arr)', () => { w.reset(); arrayLiteralInto(w, ARR); do_not_optimize(w) }).gc('inner')
  })
  group('COPY text, 10k rows × 6 cols', () => {
    bench('old: parts.join() strings', () => { do_not_optimize([...oldCopyRowsText(NAMES, ROWS)]) }).gc('inner')
    bench('new: write-through Writer', () => { do_not_optimize([...copyRowsText(NAMES, ROWS)]) }).gc('inner')
  })
})
await run()
