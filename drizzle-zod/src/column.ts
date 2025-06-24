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
import { z as zod } from 'zod/v4';
import { CONSTANTS } from './constants.ts';
import type { CreateSchemaFactoryOptions } from './schema.types.ts';
import { isColumnType, isWithEnum } from './utils.ts';
import type { Json } from './utils.ts';

export const literalSchema = zod.union([zod.string(), zod.number(), zod.boolean(), zod.null()]);
export const jsonSchema: zod.ZodType<Json> = zod.union([
	literalSchema,
	zod.record(zod.string(), zod.any()),
	zod.array(zod.any()),
]);
export const bufferSchema: zod.ZodType<Buffer> = zod.custom<Buffer>((v) => v instanceof Buffer); // eslint-disable-line no-instanceof/no-instanceof

export function columnToSchema(
	column: Column,
	factory:
		| CreateSchemaFactoryOptions<
			Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
		>
		| undefined,
): zod.ZodType {
	const z: typeof zod = factory?.zodInstance ?? zod;
	const coerce = factory?.coerce ?? {};
	let schema!: zod.ZodType;

	if (isWithEnum(column)) {
		schema = column.enumValues.length ? z.enum(column.enumValues) : z.string();
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
			schema = z.tuple([z.number(), z.number()]);
		} else if (
			isColumnType<PgPointObject<any> | PgGeometryObject<any> | CockroachGeometryObject<any>>(column, [
				'PgGeometryObject',
				'PgPointObject',
				'CockroachGeometryObject',
			])
		) {
			schema = z.object({ x: z.number(), y: z.number() });
		} else if (
			isColumnType<PgHalfVector<any> | PgVector<any> | SingleStoreVector<any> | CockroachVector<any>>(column, [
				'PgHalfVector',
				'PgVector',
				'SingleStoreVector',
				'CockroachVector',
			])
		) {
			schema = z.array(z.number());
			schema = column.dimensions ? (schema as zod.ZodArray<any>).length(column.dimensions) : schema;
		} else if (isColumnType<PgLineTuple<any>>(column, ['PgLine'])) {
			schema = z.tuple([z.number(), z.number(), z.number()]);
		} else if (isColumnType<PgLineABC<any>>(column, ['PgLineABC'])) {
			schema = z.object({
				a: z.number(),
				b: z.number(),
				c: z.number(),
			});
		} // Handle other types
		else if (isColumnType<PgArray<any, any> | CockroachArray<any, any>>(column, ['PgArray', 'CockroachArray'])) {
			schema = z.array(columnToSchema(column.baseColumn, factory));
			schema = column.size ? (schema as zod.ZodArray<any>).length(column.size) : schema;
		} else if (column.dataType === 'array') {
			schema = z.array(z.any());
		} else if (column.dataType === 'number') {
			schema = numberColumnToSchema(column, z, coerce);
		} else if (column.dataType === 'bigint') {
			schema = bigintColumnToSchema(column, z, coerce);
		} else if (column.dataType === 'boolean') {
			schema = coerce === true || coerce.boolean ? z.coerce.boolean() : z.boolean();
		} else if (column.dataType === 'date') {
			schema = coerce === true || coerce.date ? z.coerce.date() : z.date();
		} else if (column.dataType === 'string') {
			schema = stringColumnToSchema(column, z, coerce);
		} else if (column.dataType === 'json') {
			schema = jsonSchema;
		} else if (column.dataType === 'custom') {
			schema = z.any();
		} else if (column.dataType === 'buffer') {
			schema = bufferSchema;
		}
	}

	if (!schema) {
		schema = z.any();
	}

	return schema;
}

function numberColumnToSchema(
	column: Column,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>['coerce'],
): zod.ZodType {
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
			| SingleStoreMediumInt<any>
			| SingleStoreFloat<any>
			| MsSqlReal<any>
			| CockroachReal<any>
		>(column, [
			'PgReal',
			'MySqlFloat',
			'MySqlMediumInt',
			'SingleStoreMediumInt',
			'SingleStoreFloat',
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

	let schema = coerce === true || coerce?.number
		? integer ? z.coerce.number().int() : z.coerce.number()
		: integer
		? z.int()
		: z.number();
	schema = schema.gte(min).lte(max);
	return schema;
}

/** @internal */
export const bigintStringModeSchema = zod.string().regex(/^-?\d+$/).transform(BigInt).pipe(
	zod.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
).transform(String);

function bigintColumnToSchema(
	column: Column,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>['coerce'],
): zod.ZodType {
	if (isColumnType<MsSqlBigInt<any>>(column, ['MsSqlBigInt'])) {
		if (column.mode === 'string') {
			return bigintStringModeSchema;
		} else if (column.mode === 'number') {
			return numberColumnToSchema(column, z, coerce);
		}
	}

	const unsigned = column.getSQLType().includes('unsigned');
	const min = unsigned ? 0n : CONSTANTS.INT64_MIN;
	const max = unsigned ? CONSTANTS.INT64_UNSIGNED_MAX : CONSTANTS.INT64_MAX;

	const schema = coerce === true || coerce?.bigint ? z.coerce.bigint() : z.bigint();
	return schema.gte(min).lte(max);
}

function stringColumnToSchema(
	column: Column,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>['coerce'],
): zod.ZodType {
	if (
		isColumnType<
			PgUUID<ColumnBaseConfig<'string', 'PgUUID'>> | CockroachUUID<ColumnBaseConfig<'string', 'CockroachUUID'>>
		>(column, ['PgUUID', 'CockroachUUID'])
	) {
		return z.uuid();
	}

	let max: number | undefined;
	let regex: RegExp | undefined;
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

	if (
		isColumnType<PgBinaryVector<any> | CockroachBinaryVector<any>>(column, ['PgBinaryVector', 'CockroachBinaryVector'])
	) {
		regex = /^[01]+$/;
		max = column.dimensions;
	}

	let schema = coerce === true || coerce?.string ? z.coerce.string() : z.string();
	schema = regex ? schema.regex(regex) : schema;
	return max && fixed ? schema.length(max) : max ? schema.max(max) : schema;
}
