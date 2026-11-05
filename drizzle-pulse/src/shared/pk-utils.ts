/**
 * PK comparison and validation shared by the merge cores, the pull handlers (sdk.ts), and the
 * HTTP client's range tracking, so all three agree on the monotonic invariant.
 */

/**
 * Compare two PK values consistently across string/number types.
 *
 * Precondition: both inputs are comparable PKs (string | number) — enforced at the
 * boundary where PKs enter from the DB (handlers.subscribe) and guarded before every
 * merge-core comparison. Composite/exotic PK types are unsupported.
 *
 * @returns -1 if left < right, 1 if left > right, 0 if equal
 */
/** @internal */
export function comparePkValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  return (left as string | number) < (right as string | number) ? -1 : 1;
}

/**
 * Type guard to check if a value is a comparable PK type (string or number).
 */
/** @internal */
export function isPkComparable(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * Monotonic-PK invariant:
 * - desc streams: new inserts have strictly greater PK than previously seen values,
 * - asc streams: new inserts have strictly smaller PK than previously seen values.
 *
 * Under this invariant, even if range boundaries lag temporarily due to removals,
 * valid prepend inserts are not hidden by this predicate.
 *
 * rangeStart/rangeEnd are comparable PKs or null (see comparePkValues precondition).
 */
/** @internal */
export function isInsertPrepend(
  order: 'asc' | 'desc',
  pkValue: unknown,
  rangeStart: unknown | null,
  rangeEnd: unknown | null,
): boolean {
  if (rangeStart === null || rangeEnd === null) {
    return true;
  }

  if (!isPkComparable(pkValue)) {
    return false;
  }

  if (order === 'desc') {
    return comparePkValues(pkValue, rangeEnd as string | number) > 0;
  }

  return comparePkValues(pkValue, rangeStart as string | number) < 0;
}
