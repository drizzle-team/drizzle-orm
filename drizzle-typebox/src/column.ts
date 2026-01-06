import { Kind, Type as t, TypeRegistry } from '@sinclair/typebox';
import type { BigIntOptions, StringOptions, TSchema, Type as typebox } from '@sinclair/typebox';
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
import { CONSTANTS } from './constants.ts';
import type { BigIntStringModeSchema, BufferSchema, JsonSchema } from './utils.ts';

export const literalSchema = t.Union([t.String(), t.Number(), t.Boolean(), t.Null()]);
export const jsonSchema: JsonSchema = t.Union([literalSchema, t.Array(t.Any()), t.Record(t.String(), t.Any())]) as any;
TypeRegistry.Set('Buffer', (_, value) => value instanceof Buffer);
export const bufferSchema: BufferSchema = { [Kind]: 'Buffer', type: 'buffer' } as any;

export function mapEnumValues(values: string[]) {
	return Object.fromEntries(values.map((value) => [value, value]));
}

export function columnToSchema(column: Column, t: typeof typebox): TSchema {
	let schema!: TSchema;

	// Check for PG array columns (have dimensions property instead of changing dataType)
	const dimensions = (<{ dimensions?: number }> column).dimensions;
	if (typeof dimensions === 'number' && dimensions > 0) {
		return pgArrayColumnToSchema(column, dimensions, t);
	}

	const { type, constraint } = extractExtendedColumnType(column);

	switch (type) {
		case 'array': {
			schema = arrayColumnToSchema(column, constraint, t);
			break;
		}
		case 'object': {
			schema = objectColumnToSchema(column, constraint, t);
			break;
		}
		case 'number': {
			schema = numberColumnToSchema(column, constraint, t);
			break;
		}
		case 'bigint': {
			schema = bigintColumnToSchema(column, constraint, t);
			break;
		}
		case 'boolean': {
			schema = t.Boolean();
			break;
		}
		case 'string': {
			schema = stringColumnToSchema(column, constraint, t);
			break;
		}
		case 'custom': {
			schema = t.Any();
			break;
		}
		default: {
			schema = t.Any();
		}
	}

	return schema;
}

function numberColumnToSchema(
	column: Column,
	constraint: ColumnDataNumberConstraint | undefined,
	t: typeof typebox,
): TSchema {
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
		case 'unsigned': {
			min = 0;
			max = Number.MAX_SAFE_INTEGER;
			break;
		}
		default: {
			min = Number.MIN_SAFE_INTEGER;
			max = Number.MAX_SAFE_INTEGER;
			break;
		}
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

TypeRegistry.Set('UnsignedBigIntStringMode', (_, value) => {
	if (typeof value !== 'string' || !(/^\d+$/.test(value))) {
		return false;
	}

	const bigint = BigInt(value);
	if (bigint < 0 || bigint > CONSTANTS.INT64_MAX) {
		return false;
	}

	return true;
});
/** @internal */
export const bigintStringModeSchema: BigIntStringModeSchema = {
	[Kind]: 'BigIntStringMode',
	type: 'string',
} as any;

/** @internal */
export const unsignedBigintStringModeSchema: BigIntStringModeSchema = {
	[Kind]: 'UnsignedBigIntStringMode',
	type: 'string',
} as any;

function pgArrayColumnToSchema(
	column: Column,
	dimensions: number,
	t: typeof typebox,
): TSchema {
	// PG style: the column IS the base type, with dimensions indicating array depth
	// Get the base schema from the column's own dataType
	const [baseType, baseConstraint] = column.dataType.split(' ');
	let baseSchema: TSchema;

	switch (baseType) {
		case 'number':
			baseSchema = numberColumnToSchema(column, baseConstraint as ColumnDataNumberConstraint, t);
			break;
		case 'bigint':
			baseSchema = bigintColumnToSchema(column, baseConstraint as ColumnDataBigIntConstraint, t);
			break;
		case 'boolean':
			baseSchema = t.Boolean();
			break;
		case 'string':
			baseSchema = stringColumnToSchema(column, baseConstraint as ColumnDataStringConstraint, t);
			break;
		case 'object':
			baseSchema = objectColumnToSchema(column, baseConstraint as ColumnDataObjectConstraint, t);
			break;
		case 'array':
			// Handle array types like point, line, etc.
			baseSchema = arrayColumnToSchema(column, baseConstraint as ColumnDataArrayConstraint, t);
			break;
		default:
			baseSchema = t.Any();
	}

	// Wrap in arrays based on dimensions
	// Note: For PG arrays, column.length is the base type's length (e.g., varchar(10)), not array size
	let schema: TSchema = t.Array(baseSchema);
	for (let i = 1; i < dimensions; i++) {
		schema = t.Array(schema);
	}
	return schema;
}

function arrayColumnToSchema(
	column: Column,
	constraint: ColumnDataArrayConstraint | undefined,
	t: typeof typebox,
): TSchema {
	switch (constraint) {
		case 'geometry':
		case 'point': {
			return t.Tuple([t.Number(), t.Number()]);
		}
		case 'line': {
			return t.Tuple([t.Number(), t.Number(), t.Number()]);
		}
		case 'vector':
		case 'halfvector': {
			const length = column.length;
			const sizeParam = length
				? {
					minItems: length,
					maxItems: length,
				}
				: undefined;
			return t.Array(t.Number(), sizeParam);
		}
		case 'int64vector': {
			const length = column.length;
			const sizeParam = length
				? {
					minItems: length,
					maxItems: length,
				}
				: undefined;
			return t.Array(
				t.BigInt({
					minimum: CONSTANTS.INT64_MIN,
					maximum: CONSTANTS.INT64_MAX,
				}),
				sizeParam,
			);
		}
		case 'basecolumn': {
			// CockroachDB/GEL style: has a separate baseColumn
			const baseColumn = (<{ baseColumn?: Column }> column).baseColumn;
			if (baseColumn) {
				const size = column.length;
				const sizeParam = size
					? {
						minItems: size,
						maxItems: size,
					}
					: undefined;
				return t.Array(columnToSchema(baseColumn, t), sizeParam);
			}
			return t.Array(t.Any());
		}
		default: {
			return t.Array(t.Any());
		}
	}
}

function objectColumnToSchema(
	column: Column,
	constraint: ColumnDataObjectConstraint | undefined,
	t: typeof typebox,
): TSchema {
	switch (constraint) {
		case 'buffer': {
			return bufferSchema;
		}
		case 'date': {
			return t.Date();
		}
		case 'geometry':
		case 'point': {
			return t.Object({
				x: t.Number(),
				y: t.Number(),
			});
		}
		case 'json': {
			return jsonSchema;
		}
		case 'line': {
			return t.Object({
				a: t.Number(),
				b: t.Number(),
				c: t.Number(),
			});
		}
		default: {
			return t.Object({});
		}
	}
}

function bigintColumnToSchema(
	column: Column,
	constraint: ColumnDataBigIntConstraint | undefined,
	t: typeof typebox,
): TSchema {
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

	const options: Partial<BigIntOptions> = {};

	if (min !== undefined) {
		options.minimum = min;
	}
	if (max !== undefined) {
		options.maximum = max;
	}

	return t.BigInt(Object.keys(options).length > 0 ? options : undefined);
}

function stringColumnToSchema(
	column: Column,
	constraint: ColumnDataStringConstraint | undefined,
	t: typeof typebox,
): TSchema {
	const { name: columnName, length, isLengthExact } = column;
	let regex: RegExp | undefined;

	if (constraint === 'binary') {
		regex = /^[01]*$/;
	}
	if (constraint === 'uuid') {
		return t.String({
			format: 'uuid',
		});
	}
	if (constraint === 'enum') {
		const enumValues = column.enumValues;
		if (!enumValues) {
			throw new Error(
				`Column "${getTableName(getColumnTable(column))}"."${columnName}" is of 'enum' type, but lacks enum values`,
			);
		}
		return t.Enum(mapEnumValues(enumValues));
	}
	if (constraint === 'int64') {
		return bigintStringModeSchema;
	}
	if (constraint === 'uint64') {
		return unsignedBigintStringModeSchema;
	}

	const options: Partial<StringOptions> = {};

	if (length !== undefined && isLengthExact) {
		options.minLength = length;
		options.maxLength = length;
	} else if (length !== undefined) {
		options.maxLength = length;
	}

	return regex
		? t.RegExp(regex, Object.keys(options).length > 0 ? options : undefined)
		: t.String(Object.keys(options).length > 0 ? options : undefined);
}
