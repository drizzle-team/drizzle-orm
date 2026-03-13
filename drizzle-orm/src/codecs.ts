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

export interface Codecs<TTypeSet extends string = string> {
	jsonCast: PartialWithUndefined<
		Record<
			TTypeSet,
			{
				array?: CastArrayCodec | undefined;
				item?: CastCodec | undefined;
			}
		>
	>;
	jsonNormalize: PartialWithUndefined<
		Record<
			TTypeSet,
			{
				array?: NormalizeArrayCodec | undefined;
				item?: NormalizeCodec | undefined;
			}
		>
	>;
	queryCast: PartialWithUndefined<
		Record<
			TTypeSet,
			{
				array?: CastArrayCodec | undefined;
				item?: CastCodec | undefined;
			}
		>
	>;
	queryNormalize: PartialWithUndefined<
		Record<
			TTypeSet,
			{
				array?: NormalizeArrayCodec | undefined;
				item?: NormalizeCodec | undefined;
			}
		>
	>;
	paramCast: PartialWithUndefined<
		Record<
			TTypeSet,
			{
				array?: CastArrayParamCodec | undefined;
				item?: CastParamCodec | undefined;
			}
		>
	>;
	paramNormalize: PartialWithUndefined<
		Record<
			TTypeSet,
			{
				array?: NormalizeArrayCodec | undefined;
				item?: NormalizeCodec | undefined;
			}
		>
	>;
}

export const noopCodecs: Codecs = {
	jsonCast: {},
	jsonNormalize: {},
	queryCast: {},
	queryNormalize: {},
	paramCast: {},
	paramNormalize: {},
};

export class CodecsCollection<TTypeSet extends string = string> {
	static readonly [entityKind]: string = 'CodecsCollection';

	constructor(protected resolveTypes: (type: string) => TTypeSet, readonly codecs: Codecs<TTypeSet> = noopCodecs) {}

	get<TCodecType extends keyof Codecs>(
		column: Column,
		type: TCodecType,
	):
		| Exclude<Codecs[TCodecType][TTypeSet], undefined>['array' | 'item']
		| undefined
	{
		const columnMeta = column.sqlTypeMeta;
		const sqlType = this.resolveTypes(columnMeta.type);

		return this.codecs[type]![sqlType]?.[columnMeta.arrayDimensions ? 'array' : 'item'] as any;
	}

	apply<TCodecType extends keyof Codecs>(
		column: Column,
		type: TCodecType,
		value: CastCodec | CastArrayCodec extends Exclude<Codecs[TCodecType][TTypeSet], undefined>['array' | 'item']
			? SQLChunk
			: CastParamCodec | CastArrayParamCodec extends Exclude<Codecs[TCodecType][TTypeSet], undefined>['array' | 'item']
				? string
			: unknown,
	): CastCodec | CastArrayCodec extends Exclude<Codecs[TCodecType][TTypeSet], undefined>['array' | 'item'] ? SQLChunk
		: CastParamCodec | CastArrayParamCodec extends Exclude<Codecs[TCodecType][TTypeSet], undefined>['array' | 'item']
			? string
		: unknown
	{
		const columnMeta = column.sqlTypeMeta;
		const sqlType = this.resolveTypes(columnMeta.type);

		const codec = this.codecs[type]![sqlType]?.[columnMeta.arrayDimensions ? 'array' : 'item'];
		return (codec ? codec(value as any, columnMeta.arrayDimensions) : value) as any;
	}
}

export function extendCodecs<TTypeSet extends string>(
	source: Codecs<TTypeSet>,
	extension: PartialWithUndefined<Codecs<TTypeSet>> = {},
): Codecs<TTypeSet> {
	const result: Codecs<TTypeSet> = {
		jsonCast: {},
		jsonNormalize: {},
		queryCast: {},
		queryNormalize: {},
		paramCast: {},
		paramNormalize: {},
	};

	const sections = Object.keys(result) as (keyof Codecs<TTypeSet>)[];

	for (const section of sections) {
		const aSection = source[section];

		if (!(section in extension)) {
			result[section] = Object.fromEntries(
				(Object.entries(aSection) as [
					TTypeSet,
					| {
						array?: NormalizeArrayCodec | undefined;
						item?: NormalizeCodec | undefined;
					}
					| {
						array?: CastArrayCodec | undefined;
						item?: CastCodec | undefined;
					}
					| {
						array?: CastArrayParamCodec | undefined;
						item?: CastParamCodec | undefined;
					}
					| undefined,
				][]).map(([k, v]) => [
					k,
					v
						? {
							array: v.array,
							item: v.item,
						}
						: v,
				]),
			) as any;
			continue;
		}

		const bSection = extension[section];
		if (bSection === undefined) {
			result[section] = {};
			continue;
		}

		const targetSection = result[section];

		const keys = new Set([
			...Object.keys(aSection) as TTypeSet[],
			...Object.keys(bSection) as TTypeSet[],
		]);

		for (const key of keys) {
			const aEntry = aSection[key];
			const bEntry = bSection[key];

			if (key in bSection) {
				if (bEntry === undefined) {
					targetSection[key] = undefined as typeof targetSection[TTypeSet];
					continue;
				}

				targetSection[key] = {
					array: 'array' in bEntry
						? bEntry.array
						: aEntry?.array,
					item: 'item' in bEntry
						? bEntry.item
						: aEntry?.item,
				} as typeof targetSection[TTypeSet];

				continue;
			}

			if (aEntry !== undefined) {
				targetSection[key] = {
					array: aEntry.array,
					item: aEntry.item,
				} as typeof targetSection[TTypeSet];
			}
		}
	}

	return result;
}
