import { entityKind, is } from '~/entity.ts';

export type CockroachDbSequenceOptions = {
	increment?: number | string;
	minValue?: number | string;
	maxValue?: number | string;
	startWith?: number | string;
	cache?: number | string;
};

export class CockroachDbSequence {
	static readonly [entityKind]: string = 'CockroachDbSequence';

	constructor(
		public readonly seqName: string | undefined,
		public readonly seqOptions: CockroachDbSequenceOptions | undefined,
		public readonly schema: string | undefined,
	) {
	}
}

export function cockroachdbSequence(
	name: string,
	options?: CockroachDbSequenceOptions,
): CockroachDbSequence {
	return cockroachdbSequenceWithSchema(name, options, undefined);
}

/** @internal */
export function cockroachdbSequenceWithSchema(
	name: string,
	options?: CockroachDbSequenceOptions,
	schema?: string,
): CockroachDbSequence {
	return new CockroachDbSequence(name, options, schema);
}

export function isCockroachDbSequence(obj: unknown): obj is CockroachDbSequence {
	return is(obj, CockroachDbSequence);
}
