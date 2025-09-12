import {
	type Column,
	type ColumnDataArrayConstraint,
	type ColumnDataBigIntConstraint,
	type ColumnDataNumberConstraint,
	type ColumnDataObjectConstraint,
	type ColumnDataStringConstraint,
	extractExtendedColumnType,
	getColumnTable,
	getTableName,
} from 'drizzle-orm';
import { z as zod } from 'zod/v4';
import { CONSTANTS } from './constants.ts';
import type { CoerceOptions, FactoryOptions } from './schema.types.ts';
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
		| FactoryOptions
		| undefined,
): zod.ZodType {
	const z: typeof zod = factory?.zodInstance ?? zod;
	const coerce = factory?.coerce ?? {};
	let schema!: zod.ZodType;
	const { type, constraint } = extractExtendedColumnType(column);

	switch (type) {
		case 'array': {
			schema = arrayColumnToSchema(column, constraint, z, coerce);
			break;
		}
		case 'object': {
			schema = objectColumnToSchema(column, constraint, z, coerce);
			break;
		}
		case 'number': {
			schema = numberColumnToSchema(column, constraint, z, coerce);
			break;
		}
		case 'bigint': {
			schema = bigintColumnToSchema(column, constraint, z, coerce);
			break;
		}
		case 'boolean': {
			schema = coerce === true || coerce.boolean ? z.coerce.boolean() : z.boolean();
			break;
		}
		case 'string': {
			schema = stringColumnToSchema(column, constraint, z, coerce);
			break;
		}
		case 'custom': {
			schema = z.any();
			break;
		}
		default: {
			schema = z.any();
		}
	}

	return schema;
}

function numberColumnToSchema(
	column: Column,
	constraint: ColumnDataNumberConstraint | undefined,
	z: typeof zod,
	coerce: CoerceOptions,
): zod.ZodType {
	let min!: number;
	let max!: number;
	let integer = false;

	switch (constraint) {
		case 'int8': {
			min = CONSTANTS.INT8_MIN;
			max = CONSTANTS.INT8_MAX;
			integer = true;
			break;
		}
		case 'uint8': {
			min = 0;
			max = CONSTANTS.INT8_UNSIGNED_MAX;
			integer = true;
			break;
		}
		case 'int16': {
			min = CONSTANTS.INT16_MIN;
			max = CONSTANTS.INT16_MAX;
			integer = true;
			break;
		}
		case 'uint16': {
			min = 0;
			max = CONSTANTS.INT16_UNSIGNED_MAX;
			integer = true;
			break;
		}
		case 'int24': {
			min = CONSTANTS.INT24_MIN;
			max = CONSTANTS.INT24_MAX;
			integer = true;
			break;
		}
		case 'uint24': {
			min = 0;
			max = CONSTANTS.INT24_UNSIGNED_MAX;
			integer = true;
			break;
		}
		case 'int32': {
			min = CONSTANTS.INT32_MIN;
			max = CONSTANTS.INT32_MAX;
			integer = true;
			break;
		}
		case 'uint32': {
			min = 0;
			max = CONSTANTS.INT32_UNSIGNED_MAX;
			integer = true;
			break;
		}
		case 'int53': {
			min = Number.MIN_SAFE_INTEGER;
			max = Number.MAX_SAFE_INTEGER;
			integer = true;
			break;
		}
		case 'uint53': {
			min = 0;
			max = Number.MAX_SAFE_INTEGER;
			integer = true;
			break;
		}
		case 'float': {
			min = CONSTANTS.INT24_MIN;
			max = CONSTANTS.INT24_MAX;
			break;
		}
		case 'ufloat': {
			min = 0;
			max = CONSTANTS.INT24_UNSIGNED_MAX;
			break;
		}
		case 'double': {
			min = CONSTANTS.INT48_MIN;
			max = CONSTANTS.INT48_MAX;
			break;
		}
		case 'udouble': {
			min = 0;
			max = CONSTANTS.INT48_UNSIGNED_MAX;
			break;
		}
		case 'year': {
			min = 1901;
			max = 2155;
			integer = true;
			break;
		}
		default: {
			min = Number.MIN_SAFE_INTEGER;
			max = Number.MAX_SAFE_INTEGER;
			break;
		}
	}

	let schema = coerce === true || coerce?.number
		? integer ? z.coerce.number().int() : z.coerce.number()
		: integer
		? z.int()
		: z.number();
	schema = schema.gte(min).lte(max);
	return schema;
}

function bigintColumnToSchema(
	column: Column,
	constraint: ColumnDataBigIntConstraint | undefined,
	z: typeof zod,
	coerce: CoerceOptions,
): zod.ZodType {
	let min!: bigint | undefined;
	let max!: bigint | undefined;

	switch (constraint) {
		case 'int64': {
			min = CONSTANTS.INT64_MIN;
			max = CONSTANTS.INT64_MAX;
			break;
		}
		case 'uint64': {
			min = 0n;
			max = CONSTANTS.INT64_UNSIGNED_MAX;
			break;
		}
	}

	let schema = coerce === true || coerce?.bigint ? z.coerce.bigint() : z.bigint();

	if (min !== undefined) schema = schema.min(min);
	if (max !== undefined) schema = schema.max(max);
	return schema;
}

function arrayColumnToSchema(
	column: Column,
	constraint: ColumnDataArrayConstraint | undefined,
	z: typeof zod,
	coerce: CoerceOptions,
): zod.ZodType {
	switch (constraint) {
		case 'geometry':
		case 'point': {
			return z.tuple([z.number(), z.number()]);
		}
		case 'line': {
			return z.tuple([z.number(), z.number(), z.number()]);
		}
		case 'vector':
		case 'halfvector': {
			const length = column.length;
			return length
				? z.array(z.number()).length(length)
				: z.array(z.number());
		}
		case 'basecolumn': {
			const length = column.length;
			const schema = (<{ baseColumn?: Column }> column).baseColumn
				? z.array(columnToSchema((<{ baseColumn?: Column }> column).baseColumn!, {
					zodInstance: z,
					coerce,
				}))
				: z.array(z.any());
			if (length) return schema.length(length);
			return schema;
		}
		default: {
			return z.array(z.any());
		}
	}
}

function objectColumnToSchema(
	column: Column,
	constraint: ColumnDataObjectConstraint | undefined,
	z: typeof zod,
	coerce: CoerceOptions,
): zod.ZodType {
	switch (constraint) {
		case 'buffer': {
			return bufferSchema;
		}
		case 'date': {
			return coerce === true || coerce?.date ? z.coerce.date() : z.date();
		}
		case 'geometry':
		case 'point': {
			return z.object({
				x: z.number(),
				y: z.number(),
			});
		}
		case 'json': {
			return jsonSchema;
		}
		case 'line': {
			return z.object({
				a: z.number(),
				b: z.number(),
				c: z.number(),
			});
		}
		default: {
			return z.looseObject({});
		}
	}
}

function stringColumnToSchema(
	column: Column<any>,
	constraint: ColumnDataStringConstraint | undefined,
	z: typeof zod,
	coerce: CoerceOptions,
): zod.ZodType {
	const { name: columnName, length, isLengthExact } = column;
	let regex: RegExp | undefined;

	if (constraint === 'binary') {
		regex = /^[01]*$/;
	}
	if (constraint === 'uuid') return z.uuid();
	if (constraint === 'enum') {
		const enumValues = column.enumValues;
		if (!enumValues) {
			throw new Error(
				`Column "${getTableName(getColumnTable(column))}"."${columnName}" is of 'enum' type, but lacks enum values`,
			);
		}
		return z.enum(enumValues);
	}

	let schema = coerce === true || coerce?.string ? z.coerce.string() : z.string();
	schema = regex ? schema.regex(regex) : schema;
	return length && isLengthExact ? schema.length(length) : length ? schema.max(length) : schema;
}
