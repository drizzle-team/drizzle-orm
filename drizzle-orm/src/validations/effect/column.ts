import { Schema as S } from 'effect';
import type { Schema } from 'effect/Schema';
import {
	type ColumnDataArrayConstraint,
	type ColumnDataBigIntConstraint,
	type ColumnDataNumberConstraint,
	type ColumnDataObjectConstraint,
	type ColumnDataStringConstraint,
	extractExtendedColumnType,
} from '~/column-builder.ts';
import { type Column, getColumnTable } from '~/column.ts';
import { getTableName } from '~/table.ts';
import { CONSTANTS } from '../constants.ts';
import type { Json } from '../utils.ts';

export const literalSchema = S.Union(
	S.String,
	S.Number,
	S.Boolean,
	S.Null,
);

export const jsonSchema = S.Union(
	literalSchema,
	S.Record({
		key: S.String,
		value: S.Any,
	}),
	S.Array(S.Any),
) satisfies Schema<Json>;

export const bufferSchema = S.instanceOf(Buffer) satisfies Schema<Buffer>;

export function columnToSchema(
	column: Column,
): Schema.Any {
	let schema!: Schema.Any;

	// Check for PG array columns (have dimensions property instead of changing dataType)
	const dimensions = (<{ dimensions?: number }> column).dimensions;
	if (typeof dimensions === 'number' && dimensions > 0) {
		return pgArrayColumnToSchema(column, dimensions);
	}

	const { type, constraint } = extractExtendedColumnType(column);

	switch (type) {
		case 'array': {
			schema = arrayColumnToSchema(column, constraint);
			break;
		}
		case 'object': {
			schema = objectColumnToSchema(column, constraint);
			break;
		}
		case 'number': {
			schema = numberColumnToSchema(column, constraint);
			break;
		}
		case 'bigint': {
			schema = bigintColumnToSchema(column, constraint);
			break;
		}
		case 'boolean': {
			schema = S.Boolean;
			break;
		}
		case 'string': {
			schema = stringColumnToSchema(column, constraint);
			break;
		}
		case 'custom': {
			schema = S.Any;
			break;
		}
		default: {
			schema = S.Any;
		}
	}

	return schema;
}

function numberColumnToSchema(
	column: Column,
	constraint: ColumnDataNumberConstraint | undefined,
): Schema.Any {
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

	let schema = integer
		? S.Int
		: S.Number;
	schema = schema.pipe(
		S.greaterThanOrEqualTo(min),
		S.lessThanOrEqualTo(max),
	);
	return schema;
}

export const bigintStringModeSchema = S.BigInt.pipe(
	S.greaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
	S.lessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
);

export const unsignedBigintStringModeSchema = S.BigInt.pipe(
	S.greaterThanOrEqualToBigInt(0n),
	S.lessThanOrEqualToBigInt(CONSTANTS.INT64_UNSIGNED_MAX),
);

function bigintColumnToSchema(
	column: Column,
	constraint: ColumnDataBigIntConstraint | undefined,
): Schema.Any {
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

	let schema: Schema<bigint, bigint> = S.BigIntFromSelf;

	if (min !== undefined) schema = schema.pipe(S.greaterThanOrEqualToBigInt(min));
	if (max !== undefined) schema = schema.pipe(S.lessThanOrEqualToBigInt(max));
	return schema;
}

function pgArrayColumnToSchema(
	column: Column,
	dimensions: number,
): Schema.Any {
	// PG style: the column IS the base type, with dimensions indicating array depth
	// Get the base schema from the column's own dataType
	const [baseType, baseConstraint] = column.dataType.split(' ');
	let baseSchema: Schema.Any;

	switch (baseType) {
		case 'number':
			baseSchema = numberColumnToSchema(column, baseConstraint as ColumnDataNumberConstraint);
			break;
		case 'bigint':
			baseSchema = bigintColumnToSchema(column, baseConstraint as ColumnDataBigIntConstraint);
			break;
		case 'boolean':
			baseSchema = S.Boolean;
			break;
		case 'string':
			baseSchema = stringColumnToSchema(column, baseConstraint as ColumnDataStringConstraint);
			break;
		case 'object':
			baseSchema = objectColumnToSchema(column, baseConstraint as ColumnDataObjectConstraint);
			break;
		case 'array':
			// Handle array types like point, line, etc.
			baseSchema = arrayColumnToSchema(column, baseConstraint as ColumnDataArrayConstraint);
			break;
		default:
			baseSchema = S.Any;
	}

	// Wrap in arrays based on dimensions
	// Note: For PG arrays, column.length is the base type's length (e.g., varchar(10)), not array size
	let schema: Schema.Any = S.Array(baseSchema);
	for (let i = 1; i < dimensions; i++) {
		schema = S.Array(schema);
	}
	return schema;
}

function arrayColumnToSchema(
	column: Column,
	constraint: ColumnDataArrayConstraint | undefined,
): Schema.Any {
	switch (constraint) {
		case 'geometry':
		case 'point': {
			return S.Tuple(S.Number, S.Number);
		}
		case 'line': {
			return S.Tuple(S.Number, S.Number, S.Number);
		}
		case 'vector':
		case 'halfvector': {
			const length = column.length;
			const schema = S.Array(S.Number);
			return length
				? schema.pipe(S.itemsCount(length))
				: schema;
		}
		case 'int64vector': {
			const length = column.length;
			const schema = S.Array(
				S.BigIntFromSelf.pipe(
					S.greaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
					S.lessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
				),
			);
			return length
				? schema.pipe(S.itemsCount(length))
				: schema;
		}
		case 'basecolumn': {
			// CockroachDB/GEL style: has a separate baseColumn
			const baseColumn = (<{ baseColumn?: Column }> column).baseColumn;
			if (baseColumn) {
				const baseSchema = columnToSchema(baseColumn);
				// For CockroachDB style, column.length is the array size
				const length = column.length;
				const schema: Schema.Any = S.Array(baseSchema);
				if (length) {
					return schema.pipe(S.itemsCount(length));
				}
				return schema;
			}
			return S.Array(S.Any);
		}
		default: {
			return S.Array(S.Any);
		}
	}
}

function objectColumnToSchema(
	column: Column,
	constraint: ColumnDataObjectConstraint | undefined,
): Schema.Any {
	switch (constraint) {
		case 'buffer': {
			return bufferSchema;
		}
		case 'date': {
			return S.Date;
		}
		case 'geometry':
		case 'point': {
			return S.Struct({
				x: S.Number,
				y: S.Number,
			});
		}
		case 'json': {
			return jsonSchema;
		}
		case 'line': {
			return S.Struct({
				a: S.Number,
				b: S.Number,
				c: S.Number,
			});
		}
		default: {
			return S.Object;
		}
	}
}

function stringColumnToSchema(
	column: Column<any>,
	constraint: ColumnDataStringConstraint | undefined,
): Schema.Any {
	const { name: columnName, length, isLengthExact } = column;
	let regex: RegExp | undefined;

	if (constraint === 'binary') {
		regex = /^[01]*$/;
	}
	if (constraint === 'uuid') return S.UUID;
	if (constraint === 'enum') {
		const enumValues = column.enumValues as [string, ...string[]] | undefined;
		if (!enumValues) {
			throw new Error(
				`Column "${getTableName(getColumnTable(column))}"."${columnName}" is of 'enum' type, but lacks enum values`,
			);
		}
		return S.Literal(...enumValues);
	}
	if (constraint === 'int64') {
		return bigintStringModeSchema;
	}
	if (constraint === 'uint64') {
		return unsignedBigintStringModeSchema;
	}

	let schema = S.String;
	schema = regex ? schema.pipe(S.pattern(regex)) : schema;
	return length && isLengthExact
		? schema.pipe(S.length(length))
		: length
		? schema.pipe(S.maxLength(length))
		: schema;
}
