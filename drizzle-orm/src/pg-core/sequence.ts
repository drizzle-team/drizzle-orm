import { entityKind } from '~/entity';

export type PgSequenceOptions = {
	increment?: number;
	minValue?: number;
	maxValue?: number;
	startWith?: number;
	cache?: number;
	cycle?: boolean;
};

export class PgSequence {
	static readonly [entityKind]: string = 'PgSequence';

	readonly seqName: string | undefined;
	readonly seqOptions: PgSequenceOptions | undefined;
	readonly schema: string | undefined;
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
