import vine from '@vinejs/vine';
import type { SchemaTypes } from '@vinejs/vine/types';
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

/**
 * VineJS does not natively support bigint values.
 * Bigint columns will produce a `vine.any()` schema at runtime.
 * Use the `refine` option to supply a custom schema if needed.
 */
export type VineBigIntUnsupported = ReturnType<typeof vine.any>;

/**
 * VineJS does not natively support Node.js Buffer values.
 * Buffer columns will produce a `vine.any()` schema at runtime.
 * Use the `refine` option to supply a custom schema if needed.
 */
export type VineBufferUnsupported = ReturnType<typeof vine.any>;

export function columnToSchema(column: Column): SchemaTypes {
	let schema!: SchemaTypes;

	if (isWithEnum(column)) {
		schema = column.enumValues.length
			? vine.enum(column.enumValues as [string, ...string[]])
			: vine.string();
	}

	if (!schema) {
		if (isColumnType<PgGeometry<any> | PgPointTuple<any>>(column, ['PgGeometry', 'PgPointTuple'])) {
			// VineJS has no native tuple — approximate with a fixed-length array of numbers
			schema = vine.array(vine.number()).fixedLength(2);
		} else if (
			isColumnType<PgPointObject<any> | PgGeometryObject<any>>(column, ['PgGeometryObject', 'PgPointObject'])
		) {
			schema = vine.object({ x: vine.number(), y: vine.number() });
		} else if (isColumnType<PgHalfVector<any> | PgVector<any>>(column, ['PgHalfVector', 'PgVector'])) {
			const arr = vine.array(vine.number());
			schema = column.dimensions ? arr.fixedLength(column.dimensions) : arr;
		} else if (isColumnType<PgLineTuple<any>>(column, ['PgLine'])) {
			// VineJS has no native tuple — approximate with a fixed-length array of numbers
			schema = vine.array(vine.number()).fixedLength(3);
		} else if (isColumnType<PgLineABC<any>>(column, ['PgLineABC'])) {
			schema = vine.object({ a: vine.number(), b: vine.number(), c: vine.number() });
		} else if (isColumnType<PgArray<any, any>>(column, ['PgArray'])) {
			const arr = vine.array(columnToSchema(column.baseColumn) as any);
			schema = column.size ? arr.fixedLength(column.size) : arr;
		} else if (column.dataType === 'array') {
			schema = vine.array(vine.any());
		} else if (column.dataType === 'number') {
			schema = numberColumnToSchema(column);
		} else if (column.dataType === 'bigint') {
			// VineJS has no native bigint support
			schema = vine.any();
		} else if (column.dataType === 'boolean') {
			schema = vine.boolean();
		} else if (column.dataType === 'date') {
			schema = vine.date();
		} else if (column.dataType === 'string') {
			schema = stringColumnToSchema(column);
		} else if (column.dataType === 'json') {
			// VineJS has no dedicated JSON schema — use any()
			schema = vine.any();
		} else if (column.dataType === 'custom') {
			schema = vine.any();
		} else if (column.dataType === 'buffer') {
			// VineJS has no native Buffer support
			schema = vine.any();
		}
	}

	if (!schema) {
		schema = vine.any();
	}

	return schema;
}

function numberColumnToSchema(column: Column): SchemaTypes {
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
			PgReal<any> | MySqlFloat<any> | MySqlMediumInt<any> | SingleStoreMediumInt<any> | SingleStoreFloat<any>
		>(column, [
			'PgReal',
			'MySqlFloat',
			'MySqlMediumInt',
			'SingleStoreMediumInt',
			'SingleStoreFloat',
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

	let schema = vine.number().min(min).max(max);
	if (integer) {
		schema = schema.withoutDecimals();
	}
	return schema;
}

function stringColumnToSchema(column: Column): SchemaTypes {
	if (isColumnType<PgUUID<ColumnBaseConfig<'string', 'PgUUID'>>>(column, ['PgUUID'])) {
		return vine.string().uuid();
	}

	let max: number | undefined;
	let regex: RegExp | undefined;
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

	if (isColumnType<PgBinaryVector<any>>(column, ['PgBinaryVector'])) {
		regex = /^[01]+$/;
		max = column.dimensions;
	}

	let schema = vine.string();
	if (regex) {
		schema = schema.regex(regex);
	}
	if (max !== undefined && fixed) {
		schema = schema.fixedLength(max);
	} else if (max !== undefined) {
		schema = schema.maxLength(max);
	}
	return schema;
}
