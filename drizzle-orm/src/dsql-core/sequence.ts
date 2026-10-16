import { entityKind, is } from '~/entity.ts';

/**
 * DSQL sequence options.
 *
 * DSQL-specific requirements:
 * - `cache` is REQUIRED (unlike PostgreSQL where it's optional)
 * - Valid cache values: exactly `1` OR `>= 65536` (no intermediate values)
 * - Only BIGINT data type is supported for sequences
 */
export type DSQLSequenceOptions = {
	increment?: number | string;
	minValue?: number | string;
	maxValue?: number | string;
	startWith?: number | string;
	/**
	 * DSQL-specific: CACHE is required and must be either 1 or >= 65536.
	 * Defaults to 65536 for high-concurrency use cases.
	 */
	cache?: number | string;
	cycle?: boolean;
};

/**
 * Default cache value for DSQL sequences.
 * DSQL requires cache to be either 1 or >= 65536.
 * 65536 is the recommended default for high-concurrency workloads.
 */
export const DSQL_DEFAULT_CACHE = 65536;

/**
 * Validates DSQL cache value.
 * DSQL requires cache to be exactly 1 or >= 65536.
 *
 * @param cache The cache value to validate
 * @throws Error if cache value is invalid
 */
export function validateDSQLCache(cache: number | string | undefined): void {
	if (cache === undefined) return;

	const cacheNum = typeof cache === 'string' ? parseInt(cache, 10) : cache;

	if (isNaN(cacheNum)) {
		throw new Error(`Invalid DSQL sequence cache value: ${cache}. Cache must be a number.`);
	}

	if (cacheNum !== 1 && cacheNum < 65536) {
		throw new Error(
			`Invalid DSQL sequence cache value: ${cache}. `
				+ `DSQL requires cache to be exactly 1 or >= 65536 (got ${cacheNum}).`,
		);
	}
}

export class DSQLSequence {
	static readonly [entityKind]: string = 'DSQLSequence';

	constructor(
		public readonly seqName: string | undefined,
		public readonly seqOptions: DSQLSequenceOptions | undefined,
		public readonly schema: string | undefined,
	) {
		// Validate cache value at construction time
		if (seqOptions?.cache !== undefined) {
			validateDSQLCache(seqOptions.cache);
		}
	}
}

/**
 * Creates a DSQL sequence.
 *
 * DSQL-specific requirements:
 * - `cache` defaults to 65536 (DSQL requires cache to be 1 or >= 65536)
 * - Only BIGINT data type is supported
 *
 * @example
 * ```ts
 * // Create a sequence with default cache (65536)
 * const mySeq = dsqlSequence('my_sequence');
 *
 * // Create a sequence with cache = 1 (for strict ordering)
 * const orderedSeq = dsqlSequence('ordered_sequence', { cache: 1 });
 *
 * // Create a sequence with custom options
 * const customSeq = dsqlSequence('custom_sequence', {
 *   startWith: 1000,
 *   increment: 10,
 *   cache: 65536,
 * });
 * ```
 */
export function dsqlSequence(
	name: string,
	options?: DSQLSequenceOptions,
): DSQLSequence {
	return dsqlSequenceWithSchema(name, options, undefined);
}

/** @internal */
export function dsqlSequenceWithSchema(
	name: string,
	options?: DSQLSequenceOptions,
	schema?: string,
): DSQLSequence {
	return new DSQLSequence(name, options, schema);
}

/**
 * Type guard for DSQLSequence.
 */
export function isDSQLSequence(obj: unknown): obj is DSQLSequence {
	return is(obj, DSQLSequence);
}
