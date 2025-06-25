import { Kind, Type as t, TypeRegistry } from '@sinclair/typebox';
import type { StringOptions, TSchema, Type as typebox } from '@sinclair/typebox';
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
import type { BigIntStringModeSchema, BufferSchema, JsonSchema } from './utils.ts';

export const literalSchema = t.Union([t.String(), t.Number(), t.Boolean(), t.Null()]);
export const jsonSchema: JsonSchema = t.Union([literalSchema, t.Array(t.Any()), t.Record(t.String(), t.Any())]) as any;
TypeRegistry.Set('Buffer', (_, value) => value instanceof Buffer); // eslint-disable-line no-instanceof/no-instanceof
export const bufferSchema: BufferSchema = { [Kind]: 'Buffer', type: 'buffer' } as any;

export function mapEnumValues(values: string[]) {
	return Object.fromEntries(values.map((value) => [value, value]));
}

export function columnToSchema(column: Column, t: typeof typebox): TSchema {
	let schema!: TSchema;

	if (isWithEnum(column)) {
		schema = column.enumValues.length ? t.Enum(mapEnumValues(column.enumValues)) : t.String();
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
			schema = t.Tuple([t.Number(), t.Number()]);
		} else if (
			isColumnType<PgPointObject<any> | PgGeometryObject<any> | CockroachGeometryObject<any>>(column, [
				'PgGeometryObject',
				'PgPointObject',
				'CockroachGeometryObject',
			])
		) {
			schema = t.Object({ x: t.Number(), y: t.Number() });
		} else if (
			isColumnType<PgHalfVector<any> | PgVector<any> | SingleStoreVector<any> | CockroachVector<any>>(column, [
				'PgHalfVector',
				'PgVector',
				'SingleStoreVector',
				'CockroachVector',
			])
		) {
			schema = t.Array(
				t.Number(),
				column.dimensions
					? {
						minItems: column.dimensions,
						maxItems: column.dimensions,
					}
					: undefined,
			);
		} else if (isColumnType<PgLineTuple<any>>(column, ['PgLine'])) {
			schema = t.Tuple([t.Number(), t.Number(), t.Number()]);
		} else if (isColumnType<PgLineABC<any>>(column, ['PgLineABC'])) {
			schema = t.Object({
				a: t.Number(),
				b: t.Number(),
				c: t.Number(),
			});
		} // Handle other types
		else if (isColumnType<PgArray<any, any> | CockroachArray<any, any>>(column, ['PgArray', 'CockroachArray'])) {
			schema = t.Array(
				columnToSchema(column.baseColumn, t),
				column.size
					? {
						minItems: column.size,
						maxItems: column.size,
					}
					: undefined,
			);
		} else if (column.dataType === 'array') {
			schema = t.Array(t.Any());
		} else if (column.dataType === 'number') {
			schema = numberColumnToSchema(column, t);
		} else if (column.dataType === 'bigint') {
			schema = bigintColumnToSchema(column, t);
		} else if (column.dataType === 'boolean') {
			schema = t.Boolean();
		} else if (column.dataType === 'date') {
			schema = t.Date();
		} else if (column.dataType === 'string') {
			schema = stringColumnToSchema(column, t);
		} else if (column.dataType === 'json') {
			schema = jsonSchema;
		} else if (column.dataType === 'custom') {
			schema = t.Any();
		} else if (column.dataType === 'buffer') {
			schema = bufferSchema;
		}
	}

	if (!schema) {
		schema = t.Any();
	}

	return schema;
}

function numberColumnToSchema(column: Column, t: typeof typebox): TSchema {
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

	const key = integer ? 'Integer' : 'Number';
	return t[key]({
		minimum: min,
		maximum: max,
	});
}

TypeRegistry.Set('BigIntStringMode', (_, value) => {
	if (typeof value !== 'string' || !(/^-?\d+$/.test(value))) {
		return false;
	}

	const bigint = BigInt(value);
	if (bigint < CONSTANTS.INT64_MIN || bigint > CONSTANTS.INT64_MAX) {
		return false;
	}

	return true;
});
/** @internal */
export const bigintStringModeSchema: BigIntStringModeSchema = {
	[Kind]: 'BigIntStringMode',
	type: 'string',
} as any;

function bigintColumnToSchema(column: Column, t: typeof typebox): TSchema {
	if (isColumnType<MsSqlBigInt<any>>(column, ['MsSqlBigInt'])) {
		if (column.mode === 'string') {
			return bigintStringModeSchema;
		} else if (column.mode === 'number') {
			return numberColumnToSchema(column, t);
		}
	}

	const unsigned = column.getSQLType().includes('unsigned');
	const min = unsigned ? 0n : CONSTANTS.INT64_MIN;
	const max = unsigned ? CONSTANTS.INT64_UNSIGNED_MAX : CONSTANTS.INT64_MAX;

	return t.BigInt({
		minimum: min,
		maximum: max,
	});
}

function stringColumnToSchema(column: Column, t: typeof typebox): TSchema {
	if (
		isColumnType<
			PgUUID<ColumnBaseConfig<'string', 'PgUUID'>> | CockroachUUID<ColumnBaseConfig<'string', 'CockroachUUID'>>
		>(column, ['PgUUID', 'CockroachUUID'])
	) {
		return t.String({ format: 'uuid' });
	} else if (
		isColumnType<PgBinaryVector<any> | CockroachBinaryVector<any>>(column, ['PgBinaryVector', 'CockroachBinaryVector'])
	) {
		return t.RegExp(/^[01]+$/, column.dimensions ? { maxLength: column.dimensions } : undefined);
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

	const options: Partial<StringOptions> = {};

	if (max !== undefined && fixed) {
		options.minLength = max;
		options.maxLength = max;
	} else if (max !== undefined) {
		options.maxLength = max;
	}

	return t.String(Object.keys(options).length > 0 ? options : undefined);
}
