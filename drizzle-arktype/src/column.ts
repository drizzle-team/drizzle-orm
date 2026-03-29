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
import { ColumnConversionError } from './errors.ts';

export const literalSchema = type.string.or(type.number).or(type.boolean).or(type.null);
export const jsonSchema = literalSchema.or(type.unknown.as<any>().array()).or(type.object.as<Record<string, any>>());
export const bufferSchema = type.unknown.narrow((value) => value instanceof Buffer).as<Buffer>().describe(
	'a Buffer instance',
);

function safeConvertNumberRange(column: Column): Type<number> {
	try {
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
			>(column, [
				'PgBigInt53',
				'PgBigSerial53',
				'MySqlBigInt53',
				'MySqlSerial',
				'SingleStoreBigInt53',
				'SingleStoreSerial',
				'SQLiteInteger',
			])
		) {
			// BigInt types are handled separately
			return type.bigint;
		} else if (
			isColumnType<SQLiteInteger<any>>(column, ['SQLiteInteger'])
		) {
			min = unsigned ? 0 : Number.MIN_SAFE_INTEGER;
			max = unsigned ? Number.MAX_SAFE_INTEGER : CONSTANTS.INT64_MAX;
			integer = true;
		} else {
			throw new ColumnConversionError(
				column.name,
				column.getSQLType(),
				new Error('Unsupported number column type'),
			);
		}

		if (integer) {
			return type.number.int().between(min, max);
		}
		return type.number.finite().between(min, max);
	} catch (error) {
		throw new ColumnConversionError(
			column.name,
			column.getSQLType(),
			error,
		);
	}
}

export function columnToSchema(column: Column): Type {
	try {
		let schema!: Type;

		if (isWithEnum(column)) {
			schema = column.enumValues.length ? type.enumerated(...column.enumValues) : type.string;
		}

		if (!schema) {
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
			} else if (isColumnType<PgArray<any, any>>(column, ['PgArray'])) {
				const arraySchema = columnToSchema(column.baseColumn).array();
				schema = column.size ? arraySchema.exactlyLength(column.size) : arraySchema;
			} else if (column.dataType === 'array') {
				schema = type.unknown.array();
			} else if (column.dataType === 'number') {
				schema = safeConvertNumberRange(column);
			} else if (column.dataType === 'bigint') {
				schema = type.bigint;
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
	} catch (error) {
		throw new ColumnConversionError(
			column.name,
			column.getSQLType(),
			error,
		);
	}
}

function stringColumnToSchema(column: Column): Type<string> {
	try {
		if (isColumnType<PgChar<any> | MySqlChar<any> | SingleStoreChar<any>>(column, ['PgChar', 'MySqlChar', 'SingleStoreChar'])) {
			return type.string.fixedLength(column.length ?? 1);
		}
		if (isColumnType<PgVarchar<any> | MySqlVarChar<any> | SingleStoreVarChar<any>>(column, ['PgVarchar', 'MySqlVarChar', 'SingleStoreVarChar'])) {
			return type.string.maxLength(column.length ?? 255);
		}
		if (isColumnType<SQLiteText<any>>(column, ['SQLiteText'])) {
			return type.string;
		}
		if (isColumnType<MySqlText<any> | SingleStoreText<any>>(column, ['MySqlText', 'SingleStoreText'])) {
			return type.string;
		}
		return type.string;
	} catch (error) {
		throw new ColumnConversionError(
			column.name,
			column.getSQLType(),
			error,
		);
	}
}