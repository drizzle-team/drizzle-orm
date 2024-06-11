export type PgSequenceOptions = {
	increment?: number;
	minValue?: number;
	maxValue?: number;
	startWith?: number;
	cache?: number;
	cycle?: boolean;
};

const isPgSequenceSym = Symbol.for('drizzle:isPgSequence');
export interface PgSequence {
	readonly seqName: string | undefined;
	readonly seqOptions: PgSequenceOptions | undefined;
	readonly schema: string | undefined;

	/** @internal */
	[isPgSequenceSym]: true;
}

export function pgSequence(
	name: string,
	options: PgSequenceOptions,
): PgSequence {
	return pgSequenceWithSchema(name, options, undefined);
}

/** @internal */
export function pgSequenceWithSchema(
	name: string,
	options: PgSequenceOptions,
	schema?: string,
): PgSequence {
	const sequenceInstance: PgSequence = Object.assign(
		{
			name,
			seqOptions: options,
			schema,
		} as const,
	);

	return sequenceInstance;
}

export function isPgSequence(obj: unknown): obj is PgSequence {
	return !!obj && typeof obj === 'function' && isPgSequenceSym in obj && obj[isPgSequenceSym] === true;
}
