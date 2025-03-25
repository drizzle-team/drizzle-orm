import { type Type, type } from 'arktype';
import type { Column, ColumnBaseConfig } from 'drizzle-orm';
import type {
	MySqlBigInt53,
	MySqlChar,
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
	SingleStoreYear,
} from 'drizzle-orm/singlestore-core';
import type { SQLiteInteger, SQLiteReal, SQLiteText } from 'drizzle-orm/sqlite-core';
import { CONSTANTS } from './constants.ts';
import { isColumnType, isWithEnum } from './utils.ts';

export const literalSchema = type('string | number | boolean | null');
export const jsonSchema = literalSchema.or(type('unknown.any[] | Record<string, unknown.any>'));
export const bufferSchema = type.instanceOf(Buffer); // eslint-disable-line no-instanceof/no-instanceof

export function columnToSchema(column: Column): Type<any, any> {
	let schema!: Type<any, any>;

	if (isWithEnum(column)) {
		schema = column.enumValues.length ? type.enumerated(...column.enumValues) : type.string;
	}

	if (!schema) {
		// Handle specific types
		if (isColumnType<PgGeometry<any> | PgPointTuple<any>>(column, ['PgGeometry', 'PgPointTuple'])) {
			schema = type([type.number, type.number]);
		} else if (
			isColumnType<PgPointObject<any> | PgGeometryObject<any>>(column, ['PgGeometryObject', 'PgPointObject'])
		) {
			schema = type({
				x: type.number,
				y: type.number,
			});
		} else if (isColumnType<PgHalfVector<any> | PgVector<any>>(column, ['PgHalfVector', 'PgVector'])) {
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
		else if (isColumnType<PgArray<any, any>>(column, ['PgArray'])) {
			const arraySchema = columnToSchema(column.baseColumn).array();
			schema = column.size ? arraySchema.exactlyLength(column.size) : arraySchema;
		} else if (column.dataType === 'array') {
			schema = type('unknown.any').array();
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
			schema = type('unknown.any');
		} else if (column.dataType === 'buffer') {
			schema = bufferSchema;
		}
	}

	if (!schema) {
		schema = type('unknown.any');
	}

	return schema;
}

function numberColumnToSchema(column: Column): Type<any, any> {
	let unsigned = column.getSQLType().includes('unsigned');
	let min!: number;
	let max!: number;
	let integer = false;

	if (isColumnType<MySqlTinyInt<any> | SingleStoreTinyInt<any>>(column, ['MySqlTinyInt', 'SingleStoreTinyInt'])) {
		min = unsigned ? 0 : CONSTANTS.INT8_MIN;
		max = unsigned ? CONSTANTS.INT8_UNSIGNED_MAX : CONSTANTS.INT8_MAX;
		integer = true;
	} else if (
		isColumnType<PgSmallInt<any> | PgSmallSerial<any> | MySqlSmallInt<any> | SingleStoreSmallInt<any>>(column, [
			'PgSmallInt',
			'PgSmallSerial',
			'MySqlSmallInt',
			'SingleStoreSmallInt',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT16_MIN;
		max = unsigned ? CONSTANTS.INT16_UNSIGNED_MAX : CONSTANTS.INT16_MAX;
		integer = true;
	} else if (
		isColumnType<
			PgReal<any> | MySqlFloat<any> | MySqlMediumInt<any> | SingleStoreFloat<any> | SingleStoreMediumInt<any>
		>(column, [
			'PgReal',
			'MySqlFloat',
			'MySqlMediumInt',
			'SingleStoreFloat',
			'SingleStoreMediumInt',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT24_MIN;
		max = unsigned ? CONSTANTS.INT24_UNSIGNED_MAX : CONSTANTS.INT24_MAX;
		integer = isColumnType(column, ['MySqlMediumInt', 'SingleStoreMediumInt']);
	} else if (
		isColumnType<PgInteger<any> | PgSerial<any> | MySqlInt<any> | SingleStoreInt<any>>(column, [
			'PgInteger',
			'PgSerial',
			'MySqlInt',
			'SingleStoreInt',
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
		>(column, [
			'PgDoublePrecision',
			'MySqlReal',
			'MySqlDouble',
			'SingleStoreReal',
			'SingleStoreDouble',
			'SQLiteReal',
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
			| SingleStoreBigInt53<any>
			| SingleStoreSerial<any>
			| SQLiteInteger<any>
		>(
			column,
			[
				'PgBigInt53',
				'PgBigSerial53',
				'MySqlBigInt53',
				'MySqlSerial',
				'SingleStoreBigInt53',
				'SingleStoreSerial',
				'SQLiteInteger',
			],
		)
	) {
		unsigned = unsigned || isColumnType(column, ['MySqlSerial', 'SingleStoreSerial']);
		min = unsigned ? 0 : Number.MIN_SAFE_INTEGER;
		max = Number.MAX_SAFE_INTEGER;
		integer = true;
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

function bigintColumnToSchema(column: Column): Type<any, any> {
	const unsigned = column.getSQLType().includes('unsigned');
	return type.bigint.narrow(unsigned ? unsignedBigintNarrow : bigintNarrow);
}

function stringColumnToSchema(column: Column): Type<any, any> {
	if (isColumnType<PgUUID<ColumnBaseConfig<'string', 'PgUUID'>>>(column, ['PgUUID'])) {
		return type(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu);
	}
	if (
		isColumnType<
			PgBinaryVector<
				ColumnBaseConfig<'string', 'PgBinaryVector'> & {
					dimensions: number;
				}
			>
		>(column, ['PgBinaryVector'])
	) {
		return type(`/^[01]{${column.dimensions}}$/`);
	}

	let max: number | undefined;
	let fixed = false;

	if (isColumnType<PgVarchar<any> | SQLiteText<any>>(column, ['PgVarchar', 'SQLiteText'])) {
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

	if (
		isColumnType<PgChar<any> | MySqlChar<any> | SingleStoreChar<any>>(column, [
			'PgChar',
			'MySqlChar',
			'SingleStoreChar',
		])
	) {
		max = column.length;
		fixed = true;
	}

	return max && fixed ? type.string.exactlyLength(max) : max ? type.string.atMostLength(max) : type.string;
}
