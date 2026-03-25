import type { Column } from './column.ts';
import { entityKind } from './entity.ts';
import type { SQLChunk } from './sql/sql.ts';
import type { PartialWithUndefined } from './utils.ts';

export type NormalizeCodec = (value: any) => any;
export type NormalizeArrayCodec = (value: any, arrayDimensions: number) => any;
export type CastCodec = (name: SQLChunk) => SQLChunk;
export type CastArrayCodec = (name: SQLChunk, arrayDimensions: number) => SQLChunk;
export type CastParamCodec = (name: string) => string;
export type CastArrayParamCodec = (name: string, arrayDimensions: number) => string;

export interface Codec {
	cast?: CastCodec | undefined;
	castArray?: CastArrayCodec | undefined;
	castInJson?: CastCodec | undefined;
	castArrayInJson?: CastArrayCodec | undefined;
	castParam?: CastParamCodec | undefined;
	castArrayParam?: CastArrayParamCodec | undefined;
	normalize?: NormalizeCodec | undefined;
	normalizeArray?: NormalizeArrayCodec | undefined;
	normalizeInJson?: NormalizeCodec | undefined;
	normalizeArrayInJson?: NormalizeArrayCodec | undefined;
	normalizeParam?: NormalizeCodec | undefined;
	normalizeParamArray?: NormalizeArrayCodec | undefined;
}

export type Codecs<TTypeSet extends string = string> = PartialWithUndefined<Record<TTypeSet, Codec>>;

export const noopCodecs: Codecs = {};

const arrayToItemTypeCodecNameMap = {
	cast: 'cast',
	castArray: 'cast',
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

const itemToArrayTypeCodecNameMap = {
	cast: 'castArray',
	castArray: 'castArray',
	castInJson: 'castArrayInJson',
	castArrayInJson: 'castArrayInJson',
	castParam: 'castArrayParam',
	castArrayParam: 'castArrayParam',
	normalize: 'normalizeArray',
	normalizeArray: 'normalizeArray',
	normalizeInJson: 'normalizeArrayInJson',
	normalizeArrayInJson: 'normalizeArrayInJson',
	normalizeParam: 'normalizeParamArray',
	normalizeParamArray: 'normalizeParamArray',
} as const satisfies Record<keyof Codec, keyof Codec>;

export class CodecsCollection<TTypeSet extends string = string> {
	static readonly [entityKind]: string = 'CodecsCollection';

	constructor(protected resolveTypes: (type: string) => TTypeSet, readonly codecs: Codecs<TTypeSet> = noopCodecs) {}

	get<TCodecType extends keyof Codec>(
		column: Column,
		type: TCodecType,
	):
		| Codec[typeof arrayToItemTypeCodecNameMap[TCodecType]]
		| Codec[typeof itemToArrayTypeCodecNameMap[TCodecType]]
	{
		const columnMeta = column.sqlTypeMeta;
		const sqlType = this.resolveTypes(columnMeta.type) as TTypeSet;
		const codecType = columnMeta.arrayDimensions
			? itemToArrayTypeCodecNameMap[type]
			: arrayToItemTypeCodecNameMap[type];

		return this.codecs[sqlType]?.[codecType];
	}

	apply<TCodecType extends keyof Codec>(
		column: Column,
		type: TCodecType,
		value: Codec[TCodecType] extends ((v: infer TValue, ...rest: any[]) => any) ? TValue : unknown,
	): ReturnType<Exclude<Codec[TCodecType], undefined>> {
		const columnMeta = column.sqlTypeMeta;
		const sqlType = this.resolveTypes(columnMeta.type);
		const codecType = columnMeta.arrayDimensions
			? itemToArrayTypeCodecNameMap[type]
			: arrayToItemTypeCodecNameMap[type];

		const codec = this.codecs[sqlType]?.[codecType];
		return (codec ? codec(value as any, columnMeta.arrayDimensions) : value) as any;
	}
}

export function refineCodecs<TTypeSet extends string>(
	source: Codecs<TTypeSet>,
	extension: Codecs<TTypeSet> = {},
): Codecs<TTypeSet> {
	const keys = new Set<TTypeSet>([...Object.keys(source), ...Object.keys(extension)] as TTypeSet[]).values();
	const result: Codecs<TTypeSet> = {};

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
