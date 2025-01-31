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
import { PgDialect } from 'drizzle-orm/pg-core';
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

type CheckConstraints = {
	min?: number;
	max?: number;
	minLength?: number;
	maxLength?: number;
	regex?: RegExp;
};

function parseCheckConstraints(sql: string, columnName: string): CheckConstraints | null {
	const constraints: CheckConstraints = {};

	const createConstraintRegex = (fnPrefix: string, pattern: string) => {
		const fnPart = fnPrefix
			? `${fnPrefix}\\(\\s*"?${columnName}"?\\s*\\)`
			: `"?${columnName}"?`;
		return new RegExp(`${fnPart}\\s+${pattern}`, 'i');
	};

	// Check length constraints
	const lengthBetweenMatch = createConstraintRegex('length', 'BETWEEN\\s+(\\d+)\\s+AND\\s+(\\d+)').exec(sql);
	if (lengthBetweenMatch) {
		return {
			minLength: Number(lengthBetweenMatch[1]),
			maxLength: Number(lengthBetweenMatch[2]),
		};
	}

	// Check numeric range constraints
	const numericBetweenMatch = createConstraintRegex('', 'BETWEEN\\s+(\\d+)\\s+AND\\s+(\\d+)').exec(sql);
	if (numericBetweenMatch) {
		return {
			min: Number(numericBetweenMatch[1]),
			max: Number(numericBetweenMatch[2]),
		};
	}

	// Check individual constraints
	const checkSingleConstraint = (regex: RegExp, handler: (value: string) => void) => {
		const match = regex.exec(sql);
		if (match?.[1]) handler(match[1]);
	};

	checkSingleConstraint(createConstraintRegex('', '>=\\s+(\\d+)'), (v) => constraints.min = Number(v));
	checkSingleConstraint(createConstraintRegex('', '<=\\s+(\\d+)'), (v) => constraints.max = Number(v));

	// Check pattern constraint
	const likeMatch = createConstraintRegex('', "LIKE\\s+'([^']+)'").exec(sql);
	if (likeMatch) {
		const pattern = likeMatch[1];
		if (pattern) {
			const regex = likeToRegex(pattern);
			if (regex) constraints.regex = regex;
		}
	}

	return Object.keys(constraints).length > 0 ? constraints : null;
}

function likeToRegex(likePattern: string): RegExp | undefined {
	try {
		let regexPattern = likePattern
			.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&') // Escape special regex characters
			.replace(/%/g, '.*') // Replace SQL wildcard % with .*
			.replace(/_/g, '.'); // Replace SQL wildcard _ with .

		// Add anchors if not already present
		if (!regexPattern.startsWith('.*')) {
			regexPattern = `^${regexPattern}`;
		}
		if (!regexPattern.endsWith('.*')) {
			regexPattern = `${regexPattern}$`;
		}

		return new RegExp(regexPattern, 'i');
	} catch {
		return undefined;
	}
}

export function applyConstraints<T extends z.ZodTypeAny>(schema: T, constraints: CheckConstraints): z.ZodTypeAny {
	const typeName = schema._def.typeName;

	if (typeName === 'ZodString') {
		let newSchema = schema as unknown as z.ZodString;
		if (constraints.minLength !== undefined) newSchema = newSchema.min(constraints.minLength);
		if (constraints.maxLength !== undefined) newSchema = newSchema.max(constraints.maxLength);
		if (constraints.regex !== undefined) newSchema = newSchema.regex(constraints.regex);
		return newSchema;
	}

	if (typeName === 'ZodNumber') {
		let newSchema = schema as unknown as z.ZodNumber;
		if (constraints.min !== undefined) newSchema = newSchema.min(constraints.min);
		if (constraints.max !== undefined) newSchema = newSchema.max(constraints.max);
		return newSchema;
	}

	if (typeName === 'ZodBigInt') {
		let newSchema = schema as unknown as z.ZodBigInt;
		if (constraints.min !== undefined) newSchema = newSchema.min(BigInt(constraints.min));
		if (constraints.max !== undefined) newSchema = newSchema.max(BigInt(constraints.max));
		return newSchema;
	}
	return schema;
}

export function columnToSchema(column: Column, factory: CreateSchemaFactoryOptions | undefined): z.ZodTypeAny {
	const z = factory?.zodInstance ?? zod;
	const coerce = factory?.coerce ?? {};
	let schema!: z.ZodTypeAny;

	if (isWithEnum(column)) {
		schema = column.enumValues.length ? z.enum(column.enumValues) : z.string();
	}

	if (!schema) {
		// Handle specific types
		if (isColumnType<PgGeometry<any> | PgPointTuple<any>>(column, ['PgGeometry', 'PgPointTuple'])) {
			schema = z.tuple([z.number(), z.number()]);
		} else if (
			isColumnType<PgPointObject<any> | PgGeometryObject<any>>(column, ['PgGeometryObject', 'PgPointObject'])
		) {
			schema = z.object({ x: z.number(), y: z.number() });
		} else if (isColumnType<PgHalfVector<any> | PgVector<any>>(column, ['PgHalfVector', 'PgVector'])) {
			schema = z.array(z.number());
			schema = column.dimensions ? (schema as z.ZodArray<any>).length(column.dimensions) : schema;
		} else if (isColumnType<PgLineTuple<any>>(column, ['PgLine'])) {
			schema = z.tuple([z.number(), z.number(), z.number()]);
		} else if (isColumnType<PgLineABC<any>>(column, ['PgLineABC'])) {
			schema = z.object({
				a: z.number(),
				b: z.number(),
				c: z.number(),
			});
		} // Handle other types
		else if (isColumnType<PgArray<any, any>>(column, ['PgArray'])) {
			schema = z.array(columnToSchema(column.baseColumn, z));
			schema = column.size ? (schema as z.ZodArray<any>).length(column.size) : schema;
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

	if (column.checkConstraints) {
		for (const checkConstraint of column.checkConstraints) {
			const dialect = new PgDialect();
			const checkSql = dialect.sqlToQuery(checkConstraint.value).sql;
			const constraints = parseCheckConstraints(checkSql, column.name);

			if (constraints) {
				schema = applyConstraints(schema, constraints);
			}
		}
	}

	return schema;
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
