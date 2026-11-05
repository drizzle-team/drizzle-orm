// PG temporal text -> epoch ms, shared by every text-side temporal decoder: array elements (string),
// interpreted scalars (Buffer), JIT scalars and the JIT json scanner (inline code). All three parse the
// same grammar and must stay bit-identical:
//
//   'infinity' | '-infinity'                                  -> NaN (no JS Date; matches binary)
//   Y+-MM-DD[( |T)HH:MM:SS[.f+][(+|-)HH[:MM[:SS]] | Z]][ BC]
//
// Years have 4+ digits (PG prints 5-6 digit years as-is); ' BC' maps N BC to the astronomical year 1-N.
// Naive values are UTC; the offset may carry seconds (LMT). Fraction digits past ms are truncated.
// Input that doesn't match yields `undefined` from the parsers (`ok = false` in the snippet) so the caller
// can pick NaN (wire text, always ISO) or a Date.parse fallback (json strings, which may be anything).
//
// Two Date.UTC pitfalls are avoided:
//  - it remaps years 0-99 to 1900-1999 — undoing that with setUTCFullYear after the fact breaks Feb 29
//    of year 0 (1900 isn't leap, so it already rolled to Mar 1); instead compute 400 years later (same
//    calendar) and subtract exactly 400 Gregorian years.
//  - it returns NaN as soon as the LOCAL fields fall outside ±8.64e15 ms — the offset is folded into the
//    seconds field so the instant, not the wall clock, is what gets range-checked.

export const PG_EPOCH_MS = 946684800000; // 2000-01-01 UTC in unix ms
export const Y400_MS = 12622780800000; // 146097 days: 400 Gregorian years, always exact

/** Inline-code version. Reads bytes `buf[start..end)` and assigns `out` (number, NaN for ±infinity) and
 *  `ok` (false when the text isn't the grammar above); `out`/`ok` must be declared by the caller. Locals
 *  live in a block, so the snippet can be spliced anywhere (generated mappers, json scanner). */
export function instantSnippet(buf: string, start: string, end: string, out: string, ok: string): string {
	const args: Record<string, string> = { '@buf': buf, '@start': start, '@end': end, '@out': out, '@ok': ok };
	return INSTANT_TEMPLATE.replace(/@(buf|start|end|out|ok)\b/g, (m) => args[m]!);
}
// Locals are $-prefixed so they can never shadow the caller's buf/start/end/out/ok expressions.
const INSTANT_TEMPLATE = instantTemplate('@buf', '@start', '@end', '@out', '@ok').replace(
	/\b(p|e|bc|Y|n|Mo|D|H|Mi|S|ms|off|sg|th|tm|tsc|f|k|c|yy|sh)\b/g,
	'$$$1',
);
function instantTemplate(B: string, start: string, end: string, out: string, ok: string): string {
	return `{ let p = ${start}, e = ${end}; ${ok} = true;
      if (${B}[p] === 105 || (${B}[p] === 45 && ${B}[p + 1] === 105)) { ${out} = NaN; ${ok} = e - p === (${B}[p] === 45 ? 9 : 8) } else {
      let bc = false; if (e - p >= 3 && ${B}[e - 1] === 67 && ${B}[e - 2] === 66 && ${B}[e - 3] === 32) { bc = true; e -= 3 }
      let Y = 0, n = 0; for (; p < e; p++) { const c = ${B}[p]; if (c < 48 || c > 57) break; Y = Y * 10 + (c - 48); n++ }
      if (n < 4 || ${B}[p] !== 45 || ${B}[p + 3] !== 45 || e - p < 6) ${ok} = false; p++;
      const Mo = (${B}[p] - 48) * 10 + (${B}[p + 1] - 48); p += 3;
      const D = (${B}[p] - 48) * 10 + (${B}[p + 1] - 48); p += 2;
      let H = 0, Mi = 0, S = 0, ms = 0, off = 0;
      if (p < e && (${B}[p] === 32 || ${B}[p] === 84)) { p++;
        if (e - p < 8 || ${B}[p + 2] !== 58 || ${B}[p + 5] !== 58) ${ok} = false;
        H = (${B}[p] - 48) * 10 + (${B}[p + 1] - 48); p += 3;
        Mi = (${B}[p] - 48) * 10 + (${B}[p + 1] - 48); p += 3;
        S = (${B}[p] - 48) * 10 + (${B}[p + 1] - 48); p += 2;
        if (p < e && ${B}[p] === 46) { p++; let f = 0, k = 0; for (; p < e && k < 3; p++) { const c = ${B}[p]; if (c < 48 || c > 57) break; f = f * 10 + (c - 48); k++ } while (k < 3) { f *= 10; k++ } ms = f; while (p < e) { const c = ${B}[p]; if (c < 48 || c > 57) break; p++ } }
        if (p < e && (${B}[p] === 43 || ${B}[p] === 45)) { const sg = ${B}[p] === 45 ? -1 : 1; p++; const th = (${B}[p] - 48) * 10 + (${B}[p + 1] - 48); p += 2; let tm = 0, tsc = 0; if (p < e && ${B}[p] === 58) { p++; tm = (${B}[p] - 48) * 10 + (${B}[p + 1] - 48); p += 2; if (p < e && ${B}[p] === 58) { p++; tsc = (${B}[p] - 48) * 10 + (${B}[p + 1] - 48); p += 2 } } off = sg * ((th * 60 + tm) * 60 + tsc) }
        else if (p < e && ${B}[p] === 90) p++;
      }
      if (p !== e) ${ok} = false;
      const yy = bc ? 1 - Y : Y, sh = yy >= 0 && yy <= 99 ? 400 : 0;
      ${out} = Date.UTC(yy + sh, Mo - 1, D, H, Mi, S - off, ms); if (sh !== 0) ${out} -= ${Y400_MS} } }`;
}

// Hand-written mirrors of instantSnippet for the no-eval paths (interpreted decoders, array leaves, the
// json walk). Keep the three in lockstep — test/unit/temporal.test.ts checks them against each other.

/** Buffer version: epoch ms, NaN for ±infinity, undefined when `b[o..o+l)` isn't PG ISO temporal text. */
export function instantFromBytes(b: Uint8Array, o: number, l: number): number | undefined {
	let p = o, e = o + l;
	if (b[p] === 105 || (b[p] === 45 && b[p + 1] === 105)) return l === (b[p] === 45 ? 9 : 8) ? NaN : undefined;
	let bc = false;
	if (e - p >= 3 && b[e - 1] === 67 && b[e - 2] === 66 && b[e - 3] === 32) {
		bc = true;
		e -= 3;
	}
	let Y = 0, n = 0;
	for (; p < e; p++) {
		const c = b[p]!;
		if (c < 48 || c > 57) break;
		Y = Y * 10 + (c - 48);
		n++;
	}
	if (n < 4 || b[p] !== 45 || b[p + 3] !== 45 || e - p < 6) return undefined;
	p++;
	const Mo = (b[p]! - 48) * 10 + (b[p + 1]! - 48);
	p += 3;
	const D = (b[p]! - 48) * 10 + (b[p + 1]! - 48);
	p += 2;
	let H = 0, Mi = 0, S = 0, ms = 0, off = 0;
	if (p < e && (b[p] === 32 || b[p] === 84)) {
		p++;
		if (e - p < 8 || b[p + 2] !== 58 || b[p + 5] !== 58) return undefined;
		H = (b[p]! - 48) * 10 + (b[p + 1]! - 48);
		p += 3;
		Mi = (b[p]! - 48) * 10 + (b[p + 1]! - 48);
		p += 3;
		S = (b[p]! - 48) * 10 + (b[p + 1]! - 48);
		p += 2;
		if (p < e && b[p] === 46) {
			p++;
			let f = 0, k = 0;
			for (; p < e && k < 3; p++) {
				const c = b[p]!;
				if (c < 48 || c > 57) break;
				f = f * 10 + (c - 48);
				k++;
			}
			while (k < 3) {
				f *= 10;
				k++;
			}
			ms = f;
			while (p < e) {
				const c = b[p]!;
				if (c < 48 || c > 57) break;
				p++;
			}
		}
		if (p < e && (b[p] === 43 || b[p] === 45)) {
			const sg = b[p] === 45 ? -1 : 1;
			p++;
			const th = (b[p]! - 48) * 10 + (b[p + 1]! - 48);
			p += 2;
			let tm = 0, tsc = 0;
			if (p < e && b[p] === 58) {
				p++;
				tm = (b[p]! - 48) * 10 + (b[p + 1]! - 48);
				p += 2;
				if (p < e && b[p] === 58) {
					p++;
					tsc = (b[p]! - 48) * 10 + (b[p + 1]! - 48);
					p += 2;
				}
			}
			off = sg * ((th * 60 + tm) * 60 + tsc);
		} else if (p < e && b[p] === 90) p++;
	}
	if (p !== e) return undefined;
	const yy = bc ? 1 - Y : Y, sh = yy >= 0 && yy <= 99 ? 400 : 0;
	const ems = Date.UTC(yy + sh, Mo - 1, D, H, Mi, S - off, ms);
	return sh !== 0 ? ems - Y400_MS : ems;
}

/** String version of instantFromBytes. */
export function instantFromString(s: string): number | undefined {
	let p = 0, e = s.length;
	if (s.charCodeAt(0) === 105 || (s.charCodeAt(0) === 45 && s.charCodeAt(1) === 105)) {
		return s === 'infinity' || s === '-infinity' ? NaN : undefined;
	}
	let bc = false;
	if (e >= 3 && s.charCodeAt(e - 1) === 67 && s.charCodeAt(e - 2) === 66 && s.charCodeAt(e - 3) === 32) {
		bc = true;
		e -= 3;
	}
	let Y = 0, n = 0;
	for (; p < e; p++) {
		const c = s.charCodeAt(p);
		if (c < 48 || c > 57) break;
		Y = Y * 10 + (c - 48);
		n++;
	}
	if (n < 4 || s.charCodeAt(p) !== 45 || s.charCodeAt(p + 3) !== 45 || e - p < 6) return undefined;
	p++;
	const Mo = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48);
	p += 3;
	const D = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48);
	p += 2;
	let H = 0, Mi = 0, S = 0, ms = 0, off = 0;
	if (p < e && (s.charCodeAt(p) === 32 || s.charCodeAt(p) === 84)) {
		p++;
		if (e - p < 8 || s.charCodeAt(p + 2) !== 58 || s.charCodeAt(p + 5) !== 58) return undefined;
		H = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48);
		p += 3;
		Mi = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48);
		p += 3;
		S = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48);
		p += 2;
		if (p < e && s.charCodeAt(p) === 46) {
			p++;
			let f = 0, k = 0;
			for (; p < e && k < 3; p++) {
				const c = s.charCodeAt(p);
				if (c < 48 || c > 57) break;
				f = f * 10 + (c - 48);
				k++;
			}
			while (k < 3) {
				f *= 10;
				k++;
			}
			ms = f;
			while (p < e) {
				const c = s.charCodeAt(p);
				if (c < 48 || c > 57) break;
				p++;
			}
		}
		if (p < e && (s.charCodeAt(p) === 43 || s.charCodeAt(p) === 45)) {
			const sg = s.charCodeAt(p) === 45 ? -1 : 1;
			p++;
			const th = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48);
			p += 2;
			let tm = 0, tsc = 0;
			if (p < e && s.charCodeAt(p) === 58) {
				p++;
				tm = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48);
				p += 2;
				if (p < e && s.charCodeAt(p) === 58) {
					p++;
					tsc = (s.charCodeAt(p) - 48) * 10 + (s.charCodeAt(p + 1) - 48);
					p += 2;
				}
			}
			off = sg * ((th * 60 + tm) * 60 + tsc);
		} else if (p < e && s.charCodeAt(p) === 90) p++;
	}
	if (p !== e) return undefined;
	const yy = bc ? 1 - Y : Y, sh = yy >= 0 && yy <= 99 ? 400 : 0;
	const ems = Date.UTC(yy + sh, Mo - 1, D, H, Mi, S - off, ms);
	return sh !== 0 ? ems - Y400_MS : ems;
}

/** int64 µs since 2000-01-01 (big-endian at b[o]) -> epoch ms, floored, exact over the whole Date range
 *  without BigInt: hi*2^32 = 1000*(hi*4294967) + hi*296, so the division only touches the small part.
 *  (hi*2^32 + lo as one double loses µs past 2^53 ≈ year 2285 and can round across a ms/second.)
 *  ±infinity (int64 max/min) and anything else past ±8.64e15 ms lands out of Date range. */
export function binTimestampMs(b: Uint8Array, o: number): number {
	const hi = (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!;
	const lo = ((b[o + 4]! << 24) | (b[o + 5]! << 16) | (b[o + 6]! << 8) | b[o + 7]!) >>> 0;
	return hi * 4294967 + Math.floor((hi * 296 + lo) / 1000) + PG_EPOCH_MS;
}
/** Inline-code version of binTimestampMs — an expression over the `hi`/`lo` locals declared by RD64. */
export const BIN_TS_MS_EXPR = `hi * 4294967 + Math.floor((hi * 296 + lo) / 1000) + ${PG_EPOCH_MS}`;
