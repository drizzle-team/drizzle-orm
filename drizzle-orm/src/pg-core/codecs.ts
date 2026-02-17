import type { CastArrayCodec, CastCodec, NormalizeArrayCodec, NormalizeCodec } from '~/codecs.ts';
import type { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Name, sql, type SQLChunk } from '~/sql/sql.ts';

export type PostgresOriginalType =
	// Numeric
	| 'smallint'
	| 'int'
	| 'bigint'
	| 'numeric'
	| 'float4'
	| 'float8'
	| 'money'
	| 'smallserial'
	| 'serial'
	| 'bigserial'
	// Text
	| 'char'
	| 'varchar'
	| 'text'
	// Binary
	| 'bytea'
	// Datetime
	| 'date'
	| 'time'
	| 'timetz'
	| 'timestamp'
	| 'timestamptz'
	| 'interval'
	// Boolean
	| 'bool'
	// Enumerated
	| 'enum'
	// Geometric
	| 'point'
	| 'line'
	| 'lseg'
	| 'box'
	| 'path'
	| 'polygon'
	| 'circle'
	// Network Address
	| 'cidr'
	| 'inet'
	| 'macaddr'
	| 'macaddr8'
	// Bit String
	| 'bit'
	| 'varbit'
	// Full-Text Search
	| 'tsvector'
	| 'tsquery'
	// UUID
	| 'uuid'
	// XML
	| 'xml'
	// JSON
	| 'json'
	| 'jsonb'
	// Range
	| 'int4range'
	| 'int8range'
	| 'numrange'
	| 'tsrange'
	| 'tstzrange'
	| 'daterange'
	// Multirange
	| 'int4multirange'
	| 'int8multirange'
	| 'nummultirange'
	| 'tsmultirange'
	| 'tstzmultirange'
	| 'datemultirange'
	// Object Identifier / System Reference
	| 'oid'
	| 'regproc'
	| 'regprocedure'
	| 'regoper'
	| 'regoperator'
	| 'regclass'
	| 'regtype'
	| 'regrole'
	| 'regnamespace'
	| 'regconfig'
	| 'regdictionary'
	// PostGIS
	| 'geometry'
	| 'geography'
	| 'box2d'
	| 'box3d'
	| 'raster'
	// pgvector
	| 'halfvec'
	| 'sparsevec'
	| 'vector';

// Some originals were swapped with aliases for simpler keys
export type PostgresAliasType =
	// Numeric
	| 'int2' // smallint
	| 'integer' // int
	| 'int4' // int
	| 'int8' // bigint
	| 'decimal' // numeric
	| 'real' // float4
	| 'double' // float8
	| 'double precision' // float8
	| 'serial2' // smallserial
	| 'serial4' // serial
	| 'serial8' // bigserial
	// Text
	| 'character' // char
	| 'character varying' // varchar
	// Datetime
	| 'time with time zone' // timetz
	| 'timestamp with time zone' // timestamptz
	// Boolean
	| 'boolean' // bool
	// Bit String
	| 'bit varying'; // varbit;

export type PostgresColumnType =
	| PostgresOriginalType
	| PostgresAliasType;

const PG_ALIAS_TO_TYPE_MAP: Record<PostgresAliasType, PostgresOriginalType> = {
	int2: 'smallint',
	integer: 'int',
	int4: 'int',
	int8: 'bigint',
	decimal: 'numeric',
	real: 'float4',
	double: 'float8',
	'double precision': 'float8',
	serial2: 'smallserial',
	serial4: 'serial',
	serial8: 'bigserial',
	character: 'char',
	'character varying': 'varchar',
	'time with time zone': 'timetz',
	'timestamp with time zone': 'timestamptz',
	boolean: 'bool',
	'bit varying': 'varbit',
};

export function resolvePgType(type: string) {
	return PG_ALIAS_TO_TYPE_MAP[type as keyof typeof PG_ALIAS_TO_TYPE_MAP] ?? type;
}

export interface PgCodecs {
	jsonCast: Partial<
		Record<
			PostgresOriginalType,
			{
				array?: CastArrayCodec | undefined;
				item?: CastCodec | undefined;
			}
		>
	>;
	jsonNormalize: Partial<
		Record<
			PostgresOriginalType,
			{
				array?: NormalizeArrayCodec | undefined;
				item?: NormalizeCodec | undefined;
			}
		>
	>;
	queryCast: Partial<
		Record<
			PostgresOriginalType,
			{
				array?: CastArrayCodec | undefined;
				item?: CastCodec | undefined;
			}
		>
	>;
	queryNormalize: Partial<
		Record<
			PostgresOriginalType,
			{
				array?: NormalizeArrayCodec | undefined;
				item?: NormalizeCodec | undefined;
			}
		>
	>;
}

export const noopPgCodecs: PgCodecs = {
	jsonCast: {},
	jsonNormalize: {},
	queryCast: {},
	queryNormalize: {},
};

export const castToText: CastCodec = (name) => sql`${name}::text`;
export const castToTextArr: CastArrayCodec = (name, arrayDimensions) =>
	sql`${name}::text${sql.raw('[]'.repeat(arrayDimensions))}`;

/** Used for cases when casting requires to unwrap and rebuild arrays
 *
 * @example
 * string_mtx::text[][] // can be casted to array directly
 *
 * encode(bytea_mtx, 'base64')[][] // invalid syntax, cast requires unwrapping and rebuilding array
 */
export const arrayCompatCast = (cast: CastCodec) =>
(
	name: SQLChunk,
	arrayDimensions: number | undefined,
): SQLChunk => {
	if (!arrayDimensions) return cast(name);

	const aliases: Name[] = [];
	for (let i = 0; i < arrayDimensions; i++) {
		aliases.push(sql.identifier(`s${i}`));
	}

	let indexed = name;
	for (const alias of aliases) {
		indexed = sql`${indexed}[${alias}]`;
	}

	let expression = sql`array(\
select ${cast(indexed)} \
from generate_subscripts(${name}, ${sql.raw(arrayDimensions.toString())}) ${aliases[arrayDimensions - 1]} \
order by ${aliases[arrayDimensions - 1]})`;

	for (let dim = arrayDimensions - 1; dim > 0; dim--) {
		expression = sql`array(\
select ${expression} \
from generate_subscripts(${name}, ${sql.raw(dim.toString())}) ${aliases[dim - 1]} \
order by ${aliases[dim - 1]})`;
	}

	// Otherwise null returns as []
	return sql`case when ${name} is null then null else ${expression} end`;
};

/** Used to recursively apply value normalizer to array of unknown dimensions
 */
export const arrayCompatNormalize = (normalize: NormalizeCodec) => {
	const loop: NormalizeArrayCodec = (value, arrayDimensions) => {
		const innerDimensions = arrayDimensions - 1;
		if (arrayDimensions > 1) {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				loop((value as unknown[][])[i]!, innerDimensions);
			}
		} else {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				value[i] = normalize((value as unknown[][])[i]!);
			}
		}

		return value;
	};

	return loop;
};

export const genericPgCodecs: PgCodecs = {
	jsonCast: {
		bytea: {
			item: (name) => sql`encode(${name}, 'base64')`,
			array: arrayCompatCast((name) => sql`encode(${name}, 'base64')`),
		},
		bigint: { item: castToText, array: castToTextArr },
		bigserial: { item: castToText, array: castToTextArr },
		geometry: { item: castToText, array: castToTextArr },
		interval: { array: castToTextArr },
		numeric: { item: castToText, array: castToTextArr },
		timestamp: { item: castToText, array: castToTextArr },
		timestamptz: { item: castToText, array: castToTextArr },
	},
	jsonNormalize: {
		bytea: {
			item: (v: string) => Buffer.from(v, 'base64'),
			array: arrayCompatNormalize((v: string) => Buffer.from(v, 'base64')),
		},
		bigint: { item: BigInt, array: arrayCompatNormalize(BigInt) },
		bigserial: { item: BigInt, array: arrayCompatNormalize(BigInt) },
	},
	queryCast: {
		timestamp: {
			array: castToTextArr,
		},
		timestamptz: {
			array: castToTextArr,
		},
		date: {
			array: castToTextArr,
		},
		numeric: {
			array: castToTextArr,
		},
		enum: {
			array: castToTextArr,
		},
		interval: {
			array: castToTextArr,
		},
	},
	queryNormalize: {},
};

export class PgCodecsCollection {
	static readonly [entityKind]: string = 'PgCodecsCollection';

	constructor(readonly codecs: PgCodecs = noopPgCodecs) {}

	get<TCodecType extends keyof PgCodecs>(
		column: Column,
		type: TCodecType,
	):
		| Exclude<PgCodecs[TCodecType][PostgresOriginalType], undefined>['array' | 'item']
		| undefined
	{
		const columnMeta = column.sqlTypeMeta;
		const sqlType = resolvePgType(columnMeta.type);

		return this.codecs[type]![sqlType]?.[columnMeta.arrayDimensions ? 'array' : 'item'] as any;
	}

	apply<TCodecType extends keyof PgCodecs>(
		column: Column,
		type: TCodecType,
		value: CastCodec | CastArrayCodec extends
			Exclude<PgCodecs[TCodecType][PostgresOriginalType], undefined>['array' | 'item'] ? SQLChunk
			: unknown,
	): CastCodec | CastArrayCodec extends Exclude<PgCodecs[TCodecType][PostgresOriginalType], undefined>['array' | 'item']
		? SQLChunk
		: unknown
	{
		const columnMeta = column.sqlTypeMeta;
		const sqlType = resolvePgType(columnMeta.type);

		const codec = this.codecs[type]![sqlType]?.[columnMeta.arrayDimensions ? 'array' : 'item'];
		return (codec ? codec(value as any, columnMeta.arrayDimensions) : value) as any;
	}
}

export function extendGenericPgCodecs(codecs: Partial<PgCodecs>): PgCodecs {
	const result: PgCodecs = {
		jsonCast: {},
		jsonNormalize: {},
		queryCast: {},
		queryNormalize: {},
	};

	const sections = Object.keys(noopPgCodecs) as (keyof PgCodecs)[];

	for (const section of sections) {
		const aSection = genericPgCodecs[section];
		const bSection = codecs[section];

		if (!bSection) {
			result[section] = Object.fromEntries(
				Object.entries(aSection).map(([k, v]) => [
					k,
					v
						? {
							array: v.array,
							item: v.item,
						}
						: v,
				]),
			);
			continue;
		}

		const targetSection = result[section];

		const keys = new Set([
			...Object.keys(aSection) as PostgresOriginalType[],
			...Object.keys(bSection) as PostgresOriginalType[],
		]);

		for (const key of keys) {
			const aEntry = aSection[key];
			const bEntry = bSection[key];

			if (key in bSection) {
				if (bEntry === undefined) {
					targetSection[key] = undefined;
					continue;
				}

				targetSection[key] = {
					array: 'array' in bEntry
						? bEntry.array
						: aEntry?.array,
					item: 'item' in bEntry
						? bEntry.item
						: aEntry?.item,
				};

				continue;
			}

			if (aEntry !== undefined) {
				targetSection[key] = {
					array: aEntry.array,
					item: aEntry.item,
				};
			}
		}
	}

	return result;
}
