import { entityKind, is } from '~/entity.ts';

export type GelSequenceOptions = {
	increment?: number | string;
	minValue?: number | string;
	maxValue?: number | string;
	startWith?: number | string;
	cache?: number | string;
	cycle?: boolean;
};

export class GelSequence {
	static readonly [entityKind]: string = 'GelSequence';

	constructor(
		public readonly seqName: string | undefined,
		public readonly seqOptions: GelSequenceOptions | undefined,
		public readonly schema: string | undefined,
	) {
	}
}

export function gelSequence(
	name: string,
	options?: GelSequenceOptions,
): GelSequence {
	return gelSequenceWithSchema(name, options, undefined);
}

/** @internal */
export function gelSequenceWithSchema(
	name: string,
	options?: GelSequenceOptions,
	schema?: string,
): GelSequence {
	return new GelSequence(name, options, schema);
}

export function isGelSequence(obj: unknown): obj is GelSequence {
	return is(obj, GelSequence);
}
