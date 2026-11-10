/**
 * LSN (Log Sequence Number) comparison utilities.
 *
 * Postgres wire-formats an LSN as "HHHHHHHH/LLLLLLLL" (hex high/low 32-bit halves).
 * Comparing two LSN strings lexically is a trap: "0/9" > "0/1A2B" as strings but is
 * numerically smaller — always go through parseLsn/compareLsn instead of `<`/`>` on
 * the raw string.
 *
 * This module is value-imported by the embedded entrypoint; it must import nothing.
 */

// Hand-rolled and staying that way — this module is value-imported by the embedded
// entrypoint, which the platform-imports guard bans minipg from reaching. Server-side modules
// (e.g. pulse-runtime.ts) use minipg's own lsnFromString instead; this shared module serves the
// client/shared paths and intentionally never will, for platform purity.

/**
 * Precondition: `lsn` matches the Postgres wire form "hex/hex". Throws on any other shape —
 * a garbage watermark must never silently become 0n and disable the exactly-once filter.
 */
/** @internal */
export function parseLsn(lsn: string): bigint {
  const parts = lsn.split('/');
  const hi = parts[0];
  const lo = parts[1];
  if (
    parts.length !== 2 ||
    !hi ||
    !lo ||
    !/^[0-9a-fA-F]+$/.test(hi) ||
    !/^[0-9a-fA-F]+$/.test(lo)
  ) {
    throw new Error(`Invalid LSN "${lsn}": expected "hex/hex" (e.g. "0/16B2D30")`);
  }
  return (BigInt(`0x${hi}`) << 32n) | BigInt(`0x${lo}`);
}

/** @internal */
export function compareLsn(a: string, b: string): -1 | 0 | 1 {
  const pa = parseLsn(a);
  const pb = parseLsn(b);
  if (pa === pb) return 0;
  return pa < pb ? -1 : 1;
}
