import { entityKind, is } from '~/entity.ts';

export type PgSequenceOptions = {
	increment?: number | string;
	minValue?: number | string;
	maxValue?: number | string;
	startWith?: number | string;
	cache?: number | string;
	cycle?: boolean;
};

export class PgSequence {
	static readonly [entityKind]: string = 'PgSequence';

	constructor(
		public readonly seqName: string | undefined,
		public readonly seqOptions: PgSequenceOptions | undefined,
		public readonly schema: string | undefined,
	) {
	}
}

export function pgSequence(
	name: string,
	options?: PgSequenceOptions,
): PgSequence {
	return pgSequenceWithSchema(name, options, undefined);
}

/** @internal */
export function pgSequenceWithSchema(
	name: string,
	options?: PgSequenceOptions,
	schema?: string,
): PgSequence {
	return new PgSequence(name, options, schema);
}

export function isPgSequence(obj: unknown): obj is PgSequence {
	return is(obj, PgSequence);
}
