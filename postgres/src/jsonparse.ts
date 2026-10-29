// Buffer-native, schema-less JSON parser for ARBITRARY json/jsonb values whose shape we
// don't know upfront. Reads straight from the wire bytes (no JSON.parse, no toString of the
// whole value) and — unlike JSON.parse — preserves integers outside the f64-safe range
// (|n| > 2^53) exactly, as their raw digit string or a BigInt, per `big`.
//
//   big = 'number' : every number -> JS number (lossy on bigints; equivalent to JSON.parse)
//   big = 'string' : integers beyond 2^53 -> exact digit string; everything else as usual
//   big = 'bigint' : integers beyond 2^53 -> BigInt;             everything else as usual
//
// Only *integers* are preserved (matching the source-reviver path); high-precision decimals
// still round to f64. Strings with escapes fall back to JSON.parse on the (small) quoted
// slice; escape-free strings and all structure are decoded directly from bytes.
import type { JsonBigints } from './decode.ts'

// 2^53-1 (max safe integer) has 16 digits; any integer that overflows f64 is >= 16 digits.
const MAX_SAFE_DIGITS = 16

/** Cheap pre-scan: true if b[start, end) MIGHT contain an integer literal JSON.parse would
 *  round (a run of >= 16 consecutive ASCII digits). No allocation, no parse, early-exit on the
 *  first hit. NEVER a false negative for a PG-rendered bigint (so correctness is preserved);
 *  false positives — a 16-digit-but-safe int, or a long digit run inside a string — only cost
 *  a slow path. Lets a decoder fast-path the common (no-bigint) case through native JSON.parse. */
export function mayHaveBigInt(b: Buffer, start: number, end: number): boolean {
  let run = 0
  for (let p = start; p < end; p++) {
    const c = b[p]!
    if (c >= 48 && c <= 57) { if (++run >= MAX_SAFE_DIGITS) return true }
    else run = 0
  }
  return false
}

/** Parse the JSON value in b[start, end) with bigint-safe integers. Trusts well-formed JSON. */
export function parseJsonBuffer(b: Buffer, start: number, end: number, big: JsonBigints = 'number'): unknown {
  let p = start

  const ws = () => { while (p < end) { const c = b[p]!; if (c === 32 || c === 9 || c === 10 || c === 13) p++; else break } }

  function string(): string {
    p++ // opening "
    const s = p
    let esc = false
    while (p < end) { const c = b[p]!; if (c === 92) { esc = true; p += 2; continue } if (c === 34) break; p++ }
    const out = esc ? JSON.parse(b.toString('utf8', s - 1, p + 1)) as string : b.toString('utf8', s, p)
    p++ // closing "
    return out
  }

  function number(): number | string | bigint {
    const s = p
    let isFloat = false
    if (b[p] === 45) p++ // leading '-'
    while (p < end) {
      const c = b[p]!
      if (c >= 48 && c <= 57) { p++; continue }
      if (c === 46 || c === 101 || c === 69 || c === 43 || c === 45) { isFloat = true; p++; continue } // . e E + -
      break
    }
    if (isFloat || big === 'number') return Number(b.toString('utf8', s, p))
    // pure integer: digit-parse to a number; if it stayed safe, it's exact — else preserve raw.
    let neg = false, q = s, x = 0
    if (b[q] === 45) { neg = true; q++ }
    for (; q < p; q++) x = x * 10 + (b[q]! - 48)
    if (neg) x = -x
    if (Number.isSafeInteger(x)) return x
    const raw = b.toString('utf8', s, p)
    return big === 'bigint' ? BigInt(raw) : raw
  }

  function array(): unknown[] {
    p++ // [
    const a: unknown[] = []
    ws(); if (b[p] === 93) { p++; return a } // ]
    for (;;) {
      a.push(value())
      ws()
      const c = b[p]
      if (c === 44) { p++; continue } // ,
      p++ // ] (or trailing)
      break
    }
    return a
  }

  function object(): Record<string, unknown> {
    p++ // {
    const o: Record<string, unknown> = {}
    ws(); if (b[p] === 125) { p++; return o } // }
    for (;;) {
      ws()
      const k = string()
      ws(); p++ // :
      const v = value()
      // match JSON.parse: a "__proto__" key is an OWN data property, NOT a prototype mutation
      // (o[k] = v would hit the __proto__ setter — divergent + a prototype-pollution vector)
      if (k === '__proto__') Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true })
      else o[k] = v
      ws()
      const c = b[p]
      if (c === 44) { p++; continue } // ,
      p++ // } (or trailing)
      break
    }
    return o
  }

  function value(): unknown {
    ws()
    const c = b[p]
    if (c === 123) return object()      // {
    if (c === 91) return array()        // [
    if (c === 34) return string()       // "
    if (c === 116) { p += 4; return true }  // true
    if (c === 102) { p += 5; return false } // false
    if (c === 110) { p += 4; return null }  // null
    return number()
  }

  return value()
}
