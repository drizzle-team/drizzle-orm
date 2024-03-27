export type PgSequenceOptions = {
	increment?: number;
	minValue?: number;
	maxValue?: number;
	startWith?: number;
	cache?: number;
	cycle?: boolean;
};

const isPgSeqSym = Symbol.for('drizzle:isPgSequence');

export interface PgSequence {
	readonly seqName: string;
	readonly seqOptions: PgSequenceOptions;
	readonly schema: string | undefined;
	/** @internal */
	[isPgSeqSym]: true;
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
			[isPgSeqSym]: true,
		} as const,
	);

	return sequenceInstance;
}
