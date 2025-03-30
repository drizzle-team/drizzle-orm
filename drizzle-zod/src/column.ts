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
import { z, z as zod } from 'zod';
import { CONSTANTS } from './constants.ts';
import type { CreateSchemaFactoryOptions } from './schema.types.ts';
import { isColumnType, isWithEnum } from './utils.ts';
import type { Json } from './utils.ts';

export const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const jsonSchema: z.ZodType<Json> = z.union([literalSchema, z.record(z.any()), z.array(z.any())]);
export const bufferSchema: z.ZodType<Buffer> = z.custom<Buffer>((v) => v instanceof Buffer); // eslint-disable-line no-instanceof/no-instanceof

export function columnToSchema(column: Column, factory: CreateSchemaFactoryOptions | undefined): z.ZodTypeAny {
	const z = factory?.zodInstance ?? zod;
	const coerce = factory?.coerce ?? {};

	// Handle specific types
	if (isWithEnum(column)) {
		return column.enumValues.length ? z.enum(column.enumValues) : z.string();
	}
	if (isColumnType<PgGeometry<any> | PgPointTuple<any>>(column, ['PgGeometry', 'PgPointTuple'])) {
		return z.tuple([z.number(), z.number()]);
	}
	if (isColumnType<PgPointObject<any> | PgGeometryObject<any>>(column, ['PgGeometryObject', 'PgPointObject'])) {
		return z.object({ x: z.number(), y: z.number() });
	}
	if (isColumnType<PgHalfVector<any> | PgVector<any>>(column, ['PgHalfVector', 'PgVector'])) {
		const schema = z.array(z.number());
		return column.dimensions ? schema.length(column.dimensions) : schema;
	}
	if (isColumnType<PgLineTuple<any>>(column, ['PgLine'])) {
		return z.tuple([z.number(), z.number(), z.number()]);
	}
	if (isColumnType<PgLineABC<any>>(column, ['PgLineABC'])) {
		return z.object({
			a: z.number(),
			b: z.number(),
			c: z.number(),
		});
	}

	// Handle other types
	if (isColumnType<PgArray<any, any>>(column, ['PgArray'])) {
		const schema = z.array(columnToSchema(column.baseColumn, z));
		return column.size ? schema.length(column.size) : schema;
	}
	if (column.dataType === 'array') {
		return z.array(z.any());
	}
	if (column.dataType === 'number') {
		return numberColumnToSchema(column, z, coerce);
	}
	if (column.dataType === 'bigint') {
		return bigintColumnToSchema(column, z, coerce);
	}
	if (column.dataType === 'boolean') {
		return coerce === true || coerce.boolean ? z.coerce.boolean() : z.boolean();
	}
	if (column.dataType === 'date') {
		return coerce === true || coerce.date ? z.coerce.date() : z.date();
	}
	if (column.dataType === 'string') {
		return stringColumnToSchema(column, z, coerce);
	}
	if (column.dataType === 'json') {
		return jsonSchema;
	}
	if (column.dataType === 'custom') {
		return z.any();
	}
	if (column.dataType === 'buffer') {
		return bufferSchema;
	}

	return z.any();
}

function numberColumnToSchema(
	column: Column,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions['coerce'],
): z.ZodTypeAny {
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

	let schema = coerce === true || coerce?.number ? z.coerce.number() : z.number();
	schema = schema.min(min).max(max);
	return integer ? schema.int() : schema;
}

function bigintColumnToSchema(
	column: Column,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions['coerce'],
): z.ZodTypeAny {
	const unsigned = column.getSQLType().includes('unsigned');
	const min = unsigned ? 0n : CONSTANTS.INT64_MIN;
	const max = unsigned ? CONSTANTS.INT64_UNSIGNED_MAX : CONSTANTS.INT64_MAX;

	const schema = coerce === true || coerce?.bigint ? z.coerce.bigint() : z.bigint();
	return schema.min(min).max(max);
}

function stringColumnToSchema(
	column: Column,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions['coerce'],
): z.ZodTypeAny {
	if (isColumnType<PgUUID<ColumnBaseConfig<'string', 'PgUUID'>>>(column, ['PgUUID'])) {
		return z.string().uuid();
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

	let schema = coerce === true || coerce?.string ? z.coerce.string() : z.string();
	schema = regex ? schema.regex(regex) : schema;
	return max && fixed ? schema.length(max) : max ? schema.max(max) : schema;
}
