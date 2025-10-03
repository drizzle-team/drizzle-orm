import { entityKind, is } from '~/entity.ts';

export type CockroachSequenceOptions = {
	increment?: number | string;
	minValue?: number | string;
	maxValue?: number | string;
	startWith?: number | string;
	cache?: number | string;
};

export class CockroachSequence {
	static readonly [entityKind]: string = 'CockroachSequence';

	constructor(
		public readonly seqName: string,
		public readonly seqOptions: CockroachSequenceOptions | undefined,
		public readonly schema: string | undefined,
	) {
	}
}

export function cockroachSequence(
	name: string,
	options?: CockroachSequenceOptions,
): CockroachSequence {
	return cockroachSequenceWithSchema(name, options, undefined);
}

/** @internal */
export function cockroachSequenceWithSchema(
	name: string,
	options?: CockroachSequenceOptions,
	schema?: string,
): CockroachSequence {
	return new CockroachSequence(name, options, schema);
}

export function isCockroachSequence(obj: unknown): obj is CockroachSequence {
	return is(obj, CockroachSequence);
}
