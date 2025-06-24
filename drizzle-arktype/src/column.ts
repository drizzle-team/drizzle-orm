import { type Type, type } from 'arktype';
import type { Column, ColumnBaseConfig } from 'drizzle-orm';
import type {
	CockroachArray,
	CockroachBigInt53,
	CockroachBinaryVector,
	CockroachChar,
	CockroachFloat,
	CockroachGeometry,
	CockroachGeometryObject,
	CockroachInteger,
	CockroachReal,
	CockroachSmallInt,
	CockroachString,
	CockroachUUID,
	CockroachVarchar,
	CockroachVector,
} from 'drizzle-orm/cockroach-core';
import type {
	MsSqlBigInt,
	MsSqlChar,
	MsSqlFloat,
	MsSqlInt,
	MsSqlReal,
	MsSqlSmallInt,
	MsSqlTinyInt,
	MsSqlVarChar,
} from 'drizzle-orm/mssql-core';
import type {
	MySqlBigInt53,
	MySqlChar,
	MySqlDecimalNumber,
	MySqlDouble,
	MySqlFloat,
	MySqlInt,
	MySqlMediumInt,
	MySqlReal,
	MySqlSerial,
	MySqlSmallInt,
	MySqlText,
	MySqlTinyInt,
	MySqlVarChar,
	MySqlYear,
} from 'drizzle-orm/mysql-core';
import type {
	PgArray,
	PgBigInt53,
	PgBigSerial53,
	PgBinaryVector,
	PgChar,
	PgDoublePrecision,
	PgGeometry,
	PgGeometryObject,
	PgHalfVector,
	PgInteger,
	PgLineABC,
	PgLineTuple,
	PgPointObject,
	PgPointTuple,
	PgReal,
	PgSerial,
	PgSmallInt,
	PgSmallSerial,
	PgUUID,
	PgVarchar,
	PgVector,
} from 'drizzle-orm/pg-core';
import type {
	SingleStoreBigInt53,
	SingleStoreChar,
	SingleStoreDecimalNumber,
	SingleStoreDouble,
	SingleStoreFloat,
	SingleStoreInt,
	SingleStoreMediumInt,
	SingleStoreReal,
	SingleStoreSerial,
	SingleStoreSmallInt,
	SingleStoreText,
	SingleStoreTinyInt,
	SingleStoreVarChar,
	SingleStoreVector,
	SingleStoreYear,
} from 'drizzle-orm/singlestore-core';
import type { SQLiteInteger, SQLiteReal, SQLiteText } from 'drizzle-orm/sqlite-core';
import { CONSTANTS } from './constants.ts';
import { isColumnType, isWithEnum } from './utils.ts';

export const literalSchema = type.string.or(type.number).or(type.boolean).or(type.null);
export const jsonSchema = literalSchema.or(type.unknown.as<any>().array()).or(type.object.as<Record<string, any>>());
export const bufferSchema = type.unknown.narrow((value) => value instanceof Buffer).as<Buffer>().describe( // eslint-disable-line no-instanceof/no-instanceof
	'a Buffer instance',
);

export function columnToSchema(column: Column): Type {
	let schema!: Type;

	if (isWithEnum(column)) {
		schema = column.enumValues.length ? type.enumerated(...column.enumValues) : type.string;
	}

	if (!schema) {
		// Handle specific types
		if (
			isColumnType<PgGeometry<any> | PgPointTuple<any> | CockroachGeometry<any>>(column, [
				'PgGeometry',
				'PgPointTuple',
				'CockroachGeometry',
			])
		) {
			schema = type([type.number, type.number]);
		} else if (
			isColumnType<PgPointObject<any> | PgGeometryObject<any> | CockroachGeometryObject<any>>(column, [
				'PgGeometryObject',
				'PgPointObject',
				'CockroachGeometryObject',
			])
		) {
			schema = type({
				x: type.number,
				y: type.number,
			});
		} else if (
			isColumnType<PgHalfVector<any> | PgVector<any> | SingleStoreVector<any> | CockroachVector<any>>(column, [
				'PgHalfVector',
				'PgVector',
				'SingleStoreVector',
				'CockroachVector',
			])
		) {
			schema = column.dimensions
				? type.number.array().exactlyLength(column.dimensions)
				: type.number.array();
		} else if (isColumnType<PgLineTuple<any>>(column, ['PgLine'])) {
			schema = type([type.number, type.number, type.number]);
		} else if (isColumnType<PgLineABC<any>>(column, ['PgLineABC'])) {
			schema = type({
				a: type.number,
				b: type.number,
				c: type.number,
			});
		} // Handle other types
		else if (isColumnType<PgArray<any, any> | CockroachArray<any, any>>(column, ['PgArray', 'CockroachArray'])) {
			const arraySchema = columnToSchema(column.baseColumn).array();
			schema = column.size ? arraySchema.exactlyLength(column.size) : arraySchema;
		} else if (column.dataType === 'array') {
			schema = type.unknown.array();
		} else if (column.dataType === 'number') {
			schema = numberColumnToSchema(column);
		} else if (column.dataType === 'bigint') {
			schema = bigintColumnToSchema(column);
		} else if (column.dataType === 'boolean') {
			schema = type.boolean;
		} else if (column.dataType === 'date') {
			schema = type.Date;
		} else if (column.dataType === 'string') {
			schema = stringColumnToSchema(column);
		} else if (column.dataType === 'json') {
			schema = jsonSchema;
		} else if (column.dataType === 'custom') {
			schema = type.unknown;
		} else if (column.dataType === 'buffer') {
			schema = bufferSchema;
		}
	}

	if (!schema) {
		schema = type.unknown;
	}

	return schema;
}

function numberColumnToSchema(column: Column): Type<number, any> {
	let unsigned = column.getSQLType().includes('unsigned') || isColumnType(column, ['MsSqlTinyInt']);
	let min!: number;
	let max!: number;
	let integer = false;

	if (
		isColumnType<MySqlTinyInt<any> | SingleStoreTinyInt<any> | MsSqlTinyInt<any>>(column, [
			'MySqlTinyInt',
			'SingleStoreTinyInt',
			'MsSqlTinyInt',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT8_MIN;
		max = unsigned ? CONSTANTS.INT8_UNSIGNED_MAX : CONSTANTS.INT8_MAX;
		integer = true;
	} else if (
		isColumnType<
			| PgSmallInt<any>
			| PgSmallSerial<any>
			| MySqlSmallInt<any>
			| SingleStoreSmallInt<any>
			| MsSqlSmallInt<any>
			| CockroachSmallInt<any>
		>(column, [
			'PgSmallInt',
			'PgSmallSerial',
			'MySqlSmallInt',
			'SingleStoreSmallInt',
			'MsSqlSmallInt',
			'CockroachSmallInt',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT16_MIN;
		max = unsigned ? CONSTANTS.INT16_UNSIGNED_MAX : CONSTANTS.INT16_MAX;
		integer = true;
	} else if (
		isColumnType<
			| PgReal<any>
			| MySqlFloat<any>
			| MySqlMediumInt<any>
			| SingleStoreFloat<any>
			| SingleStoreMediumInt<any>
			| MsSqlReal<any>
			| CockroachReal<any>
		>(column, [
			'PgReal',
			'MySqlFloat',
			'MySqlMediumInt',
			'SingleStoreFloat',
			'SingleStoreMediumInt',
			'MsSqlReal',
			'CockroachReal',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT24_MIN;
		max = unsigned ? CONSTANTS.INT24_UNSIGNED_MAX : CONSTANTS.INT24_MAX;
		integer = isColumnType(column, ['MySqlMediumInt', 'SingleStoreMediumInt']);
	} else if (
		isColumnType<
			PgInteger<any> | PgSerial<any> | MySqlInt<any> | SingleStoreInt<any> | MsSqlInt<any> | CockroachInteger<any>
		>(column, [
			'PgInteger',
			'PgSerial',
			'MySqlInt',
			'SingleStoreInt',
			'MsSqlInt',
			'CockroachInteger',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT32_MIN;
		max = unsigned ? CONSTANTS.INT32_UNSIGNED_MAX : CONSTANTS.INT32_MAX;
		integer = true;
	} else if (
		isColumnType<
			| PgDoublePrecision<any>
			| MySqlReal<any>
			| MySqlDouble<any>
			| SingleStoreReal<any>
			| SingleStoreDouble<any>
			| SQLiteReal<any>
			| MsSqlFloat<any>
			| CockroachFloat<any>
		>(column, [
			'PgDoublePrecision',
			'MySqlReal',
			'MySqlDouble',
			'SingleStoreReal',
			'SingleStoreDouble',
			'SQLiteReal',
			'MsSqlFloat',
			'CockroachFloat',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT48_MIN;
		max = unsigned ? CONSTANTS.INT48_UNSIGNED_MAX : CONSTANTS.INT48_MAX;
	} else if (
		isColumnType<
			| PgBigInt53<any>
			| PgBigSerial53<any>
			| MySqlBigInt53<any>
			| MySqlSerial<any>
			| MySqlDecimalNumber<any>
			| SingleStoreBigInt53<any>
			| SingleStoreSerial<any>
			| SingleStoreDecimalNumber<any>
			| SQLiteInteger<any>
			| CockroachBigInt53<any>
		>(
			column,
			[
				'PgBigInt53',
				'PgBigSerial53',
				'MySqlBigInt53',
				'MySqlSerial',
				'MySqlDecimalNumber',
				'SingleStoreBigInt53',
				'SingleStoreSerial',
				'SingleStoreDecimalNumber',
				'SQLiteInteger',
				'CockroachBigInt53',
			],
		)
		|| (isColumnType<MsSqlBigInt<any>>(column, ['MsSqlBigInt']) && (column as MsSqlBigInt<any>).mode === 'number')
	) {
		unsigned = unsigned || isColumnType(column, ['MySqlSerial', 'SingleStoreSerial']);
		min = unsigned ? 0 : Number.MIN_SAFE_INTEGER;
		max = Number.MAX_SAFE_INTEGER;
		integer = !isColumnType(column, ['MySqlDecimalNumber', 'SingleStoreDecimalNumber']);
	} else if (isColumnType<MySqlYear<any> | SingleStoreYear<any>>(column, ['MySqlYear', 'SingleStoreYear'])) {
		min = 1901;
		max = 2155;
		integer = true;
	} else {
		min = Number.MIN_SAFE_INTEGER;
		max = Number.MAX_SAFE_INTEGER;
	}

	return (integer ? type.keywords.number.integer : type.number).atLeast(min).atMost(max);
}

/** @internal */
export const unsignedBigintNarrow = (v: bigint, ctx: { mustBe: (expected: string) => false }) =>
	v < 0n ? ctx.mustBe('greater than') : v > CONSTANTS.INT64_UNSIGNED_MAX ? ctx.mustBe('less than') : true;

/** @internal */
export const bigintNarrow = (v: bigint, ctx: { mustBe: (expected: string) => false }) =>
	v < CONSTANTS.INT64_MIN ? ctx.mustBe('greater than') : v > CONSTANTS.INT64_MAX ? ctx.mustBe('less than') : true;

/** @internal */
export const bigintStringModeSchema = type.string.narrow((v, ctx) => {
	if (typeof v !== 'string') {
		return ctx.mustBe('a string');
	}
	if (!(/^-?\d+$/.test(v))) {
		return ctx.mustBe('a string representing a number');
	}

	const bigint = BigInt(v);
	if (bigint < CONSTANTS.INT64_MIN) {
		return ctx.mustBe('greater than');
	}
	if (bigint > CONSTANTS.INT64_MAX) {
		return ctx.mustBe('less than');
	}

	return true;
});

function bigintColumnToSchema(column: Column): Type {
	if (isColumnType<MsSqlBigInt<any>>(column, ['MsSqlBigInt'])) {
		if (column.mode === 'string') {
			return bigintStringModeSchema;
		} else if (column.mode === 'number') {
			return numberColumnToSchema(column);
		}
	}

	const unsigned = column.getSQLType().includes('unsigned');
	return type.bigint.narrow(unsigned ? unsignedBigintNarrow : bigintNarrow);
}

function stringColumnToSchema(column: Column): Type {
	if (
		isColumnType<
			PgUUID<ColumnBaseConfig<'string', 'PgUUID'>> | CockroachUUID<ColumnBaseConfig<'string', 'CockroachUUID'>>
		>(column, ['PgUUID', 'CockroachUUID'])
	) {
		return type(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu).describe('a RFC-4122-compliant UUID');
	}
	if (
		isColumnType<
			| PgBinaryVector<
				ColumnBaseConfig<'string', 'PgBinaryVector'> & {
					dimensions: number;
				}
			>
			| CockroachBinaryVector<
				ColumnBaseConfig<'string', 'CockroachBinaryVector'> & {
					dimensions: number;
				}
			>
		>(column, ['PgBinaryVector', 'CockroachBinaryVector'])
	) {
		return type(`/^[01]{${column.dimensions}}$/`)
			.describe(`a string containing ones or zeros while being ${column.dimensions} characters long`);
	}

	let max: number | undefined;
	let fixed = false;

	// Char columns are padded to a fixed length. The input can be equal or less than the set length
	if (
		isColumnType<
			| PgVarchar<any>
			| SQLiteText<any>
			| PgChar<any>
			| MySqlChar<any>
			| SingleStoreChar<any>
			| MsSqlChar<any>
			| MsSqlVarChar<any>
			| CockroachChar<any>
			| CockroachVarchar<any>
			| CockroachString<any>
		>(column, [
			'PgVarchar',
			'SQLiteText',
			'PgChar',
			'MySqlChar',
			'SingleStoreChar',
			'MsSqlChar',
			'MsSqlVarChar',
			'CockroachChar',
			'CockroachVarchar',
			'CockroachString',
		])
	) {
		max = column.length;
	} else if (
		isColumnType<MySqlVarChar<any> | SingleStoreVarChar<any>>(column, ['MySqlVarChar', 'SingleStoreVarChar'])
	) {
		max = column.length ?? CONSTANTS.INT16_UNSIGNED_MAX;
	} else if (isColumnType<MySqlText<any> | SingleStoreText<any>>(column, ['MySqlText', 'SingleStoreText'])) {
		if (column.textType === 'longtext') {
			max = CONSTANTS.INT32_UNSIGNED_MAX;
		} else if (column.textType === 'mediumtext') {
			max = CONSTANTS.INT24_UNSIGNED_MAX;
		} else if (column.textType === 'text') {
			max = CONSTANTS.INT16_UNSIGNED_MAX;
		} else {
			max = CONSTANTS.INT8_UNSIGNED_MAX;
		}
	}

	return max && fixed ? type.string.exactlyLength(max) : max ? type.string.atMostLength(max) : type.string;
}
