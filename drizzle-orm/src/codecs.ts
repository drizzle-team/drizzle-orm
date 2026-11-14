import type { Column } from './column.ts';
import { entityKind, is } from './entity.ts';
import { DrizzleError } from './errors.ts';
import type { SQLChunk } from './sql/sql.ts';
import type { Writable } from './utils.ts';

export type NormalizeCodec = (value: any) => any;
export type NormalizeArrayCodec = (value: any, arrayDimensions: number) => any;
export type CastCodec = (name: SQLChunk) => SQLChunk;
export type CastArrayCodec = (name: SQLChunk, arrayDimensions: number) => SQLChunk;
export type CastParamCodec = (name: string, column: Column) => string;
export type CastArrayParamCodec = (name: string, column: Column, arrayDimensions: number) => string;

export interface Codec {
	readonly castInJson?: CastCodec | undefined;
	readonly castArrayInJson?: CastArrayCodec | undefined;
	readonly castParam?: CastParamCodec | undefined;
	readonly castArrayParam?: CastArrayParamCodec | undefined;
	readonly normalize?: NormalizeCodec | undefined;
	readonly normalizeArray?: NormalizeArrayCodec | undefined;
	readonly normalizeInJson?: NormalizeCodec | undefined;
	readonly normalizeArrayInJson?: NormalizeArrayCodec | undefined;
	readonly normalizeParam?: NormalizeCodec | undefined;
	readonly normalizeParamArray?: NormalizeArrayCodec | undefined;
}

export type Codecs<TTypeSet extends string = string> = {
	readonly [K in TTypeSet]?: Codec | undefined;
};

export const noopCodecs: Codecs = {};

export const unsupportedColumnTypeError = (type: string, driver: string, reason: string) =>
	new DrizzleError({ message: `Column type "${type}" is not supported with the ${driver} driver: ${reason}` });

/**
 * Normalizer for a column type that a driver can't return without losing data, and that can't be requested from it
 * in a lossless form per query - throws on every non-null value
 */
export const unsupportedCodec = (type: string, driver: string, reason: string): NormalizeCodec => () => {
	throw unsupportedColumnTypeError(type, driver, reason);
};

const unsafeIntegerReason = 'the driver returned an integer outside of the safe integer range as a number, '
	+ 'which has already lost precision; configure the client to return such values as strings or bigints';

/** `bigint` from a driver value that is a `bigint`, integer text or, depending on client options, a `number` */
export const bigintFromIntegerValue =
	(type: string, driver: string): NormalizeCodec => (value: bigint | string | number) => {
		if (typeof value === 'number') {
			if (Number.isSafeInteger(value)) return BigInt(value);
			throw unsupportedColumnTypeError(type, driver, unsafeIntegerReason);
		}
		return BigInt(value);
	};

/** Holds array-type codecs for array columns */
export interface ResolvedCodecs {
	readonly castInJson: CastCodec | CastArrayCodec | undefined;
	readonly castParam: CastParamCodec | CastArrayParamCodec | undefined;
	readonly normalize: NormalizeCodec | NormalizeArrayCodec | undefined;
	readonly normalizeInJson: NormalizeCodec | NormalizeArrayCodec | undefined;
	readonly normalizeParam: NormalizeCodec | NormalizeArrayCodec | undefined;
}

const noCodecs: ResolvedCodecs = {
	castInJson: undefined,
	castParam: undefined,
	normalize: undefined,
	normalizeInJson: undefined,
	normalizeParam: undefined,
};

const arrayToItemTypeCodecNameMap = {
	castInJson: 'castInJson',
	castArrayInJson: 'castInJson',
	castParam: 'castParam',
	castArrayParam: 'castParam',
	normalize: 'normalize',
	normalizeArray: 'normalize',
	normalizeInJson: 'normalizeInJson',
	normalizeArrayInJson: 'normalizeInJson',
	normalizeParam: 'normalizeParam',
	normalizeParamArray: 'normalizeParam',
} as const satisfies Record<keyof Codec, keyof Codec>;

export type ItemToArrayTypeCodecNameMap = {
	castInJson: 'castArrayInJson';
	castArrayInJson: 'castArrayInJson';
	castParam: 'castArrayParam';
	castArrayParam: 'castArrayParam';
	normalize: 'normalizeArray';
	normalizeArray: 'normalizeArray';
	normalizeInJson: 'normalizeArrayInJson';
	normalizeArrayInJson: 'normalizeArrayInJson';
	normalizeParam: 'normalizeParamArray';
	normalizeParamArray: 'normalizeParamArray';
};

export class CodecsCollection<TTypeSet extends string = string> {
	static readonly [entityKind]: string = 'CodecsCollection';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(protected resolveTypes: (type: string) => string, readonly codecs: Codecs<TTypeSet> = noopCodecs) {}

	private itemCodecsCache: Map<string, ResolvedCodecs> = new Map();
	private arrayCodecsCache: Map<string, ResolvedCodecs> = new Map();

	/** @internal */
	codecsOf(column: Column, override?: TTypeSet): ResolvedCodecs {
		const sqlType = (override ?? column.codec) as TTypeSet | undefined;
		if (!sqlType) return noCodecs;

		const isArray = !!(<any> column).dimensions;
		const cache = isArray ? this.arrayCodecsCache : this.itemCodecsCache;
		let resolved = cache.get(sqlType);
		if (resolved === undefined) {
			const codec = this.codecs[sqlType];
			resolved = codec
				? isArray
					? {
						castInJson: codec.castArrayInJson,
						castParam: codec.castArrayParam,
						normalize: codec.normalizeArray,
						normalizeInJson: codec.normalizeArrayInJson,
						normalizeParam: codec.normalizeParamArray,
					}
					: {
						castInJson: codec.castInJson,
						castParam: codec.castParam,
						normalize: codec.normalize,
						normalizeInJson: codec.normalizeInJson,
						normalizeParam: codec.normalizeParam,
					}
				: noCodecs;
			cache.set(sqlType, resolved);
		}

		return resolved;
	}

	get<TCodecType extends keyof Codec>(
		column: Column,
		type: TCodecType,
		override?: TTypeSet,
	):
		| Codec[typeof arrayToItemTypeCodecNameMap[TCodecType]]
		| Codec[ItemToArrayTypeCodecNameMap[TCodecType]]
	{
		return this.codecsOf(column, override)[arrayToItemTypeCodecNameMap[type]] as any;
	}

	apply<TCodecType extends keyof Codec>(
		column: Column,
		type: TCodecType,
		value: Codec[TCodecType] extends ((v: infer TValue, ...rest: any[]) => any) ? TValue : unknown,
		override?: TTypeSet,
	): ReturnType<Exclude<Codec[TCodecType], undefined>> {
		const codecType = arrayToItemTypeCodecNameMap[type];
		const codec = this.codecsOf(column, override)[codecType];
		if (!codec) return value as any;

		if (codecType === 'castParam') {
			return (<CastParamCodec | CastArrayParamCodec> codec)(value as string, column, (<any> column).dimensions) as any;
		}

		return (<NormalizeCodec | NormalizeArrayCodec | CastCodec | CastArrayCodec> codec)(
			value as any,
			(<any> column).dimensions,
		);
	}
}

export function refineCodecs<TTypeSet extends string>(
	source: Codecs<TTypeSet>,
	extension: Codecs<TTypeSet> = {},
): Codecs<TTypeSet> {
	const keys = new Set<TTypeSet>([...Object.keys(source), ...Object.keys(extension)] as TTypeSet[]).values();
	const result: { [K in TTypeSet]?: Writable<Codec> | undefined } = {};

	for (const k of keys) {
		if (!(k in extension)) {
			result[k] = source[k] ? { ...source[k] } : undefined;
			continue;
		}

		if (!(k in source) || (extension[k] === undefined)) {
			result[k] = extension[k] ? { ...extension[k] } : undefined;
			continue;
		}

		const innerKeys = new Set<keyof Codec>(
			[...Object.keys(extension[k]), ...(Object.keys(source[k] ?? {}))] as (keyof Codec)[],
		).values();

		result[k] = {};
		for (const ik of innerKeys) {
			result[k][ik] = (ik in extension[k] ? extension[k][ik] : source[k]?.[ik]) as any;
		}
	}

	return result;
}
