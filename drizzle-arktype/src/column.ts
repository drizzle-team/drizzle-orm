import { type Type, type } from 'arktype';
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

export const literalSchema = type.string.or(type.number).or(type.boolean).or(type.null);
export const jsonSchema = literalSchema.or(type.unknown.as<any>().array()).or(type.object.as<Record<string, any>>());
export const bufferSchema = type.unknown.narrow((value) => value instanceof Buffer).as<Buffer>().describe( // eslint-disable-line no-instanceof/no-instanceof
	'a Buffer instance',
);

export function columnToSchema(column: Column): Type {
	let schema!: Type;
	const { type: columnType, constraint } = extractExtendedColumnType(column);

	switch (columnType) {
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
			schema = type.boolean;
			break;
		}
		case 'string': {
			schema = stringColumnToSchema(column, constraint);
			break;
		}
		case 'custom': {
			schema = type.unknown;
			break;
		}
		default: {
			schema = type.unknown;
		}
	}

	return schema;
}

function numberColumnToSchema(column: Column, constraint: ColumnDataNumberConstraint | undefined): Type<number, any> {
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

	return (integer ? type.keywords.number.integer : type.number).atLeast(min).atMost(max);
}

function arrayColumnToSchema(
	column: Column,
	constraint: ColumnDataArrayConstraint | undefined,
): Type {
	switch (constraint) {
		case 'geometry':
		case 'point': {
			return type([type.number, type.number]);
		}
		case 'line': {
			return type([type.number, type.number, type.number]);
		}
		case 'vector':
		case 'halfvector': {
			const length = column.length;
			return length ? type.number.array().exactlyLength(length) : type.number.array();
		}
		case 'basecolumn': {
			const length = column.length;
			const schema = (<{ baseColumn?: Column }> column).baseColumn
				? columnToSchema((<{ baseColumn?: Column }> column).baseColumn!).array()
				: type.unknown.array();
			if (length) return schema.exactlyLength(length);
			return schema;
		}
		default: {
			return type.unknown.array();
		}
	}
}

function objectColumnToSchema(
	column: Column,
	constraint: ColumnDataObjectConstraint | undefined,
): Type {
	switch (constraint) {
		case 'buffer': {
			return bufferSchema;
		}
		case 'date': {
			return type.Date;
		}
		case 'geometry':
		case 'point': {
			return type({
				x: type.number,
				y: type.number,
			});
		}
		case 'json': {
			return jsonSchema;
		}
		case 'line': {
			return type({
				a: type.number,
				b: type.number,
				c: type.number,
			});
		}
		default: {
			return type({});
		}
	}
}

/** @internal */
export const unsignedBigintNarrow = (v: bigint, ctx: { mustBe: (expected: string) => false }) =>
	v < 0n ? ctx.mustBe('greater than') : v > CONSTANTS.INT64_UNSIGNED_MAX ? ctx.mustBe('less than') : true;

/** @internal */
export const bigintNarrow = (v: bigint, ctx: { mustBe: (expected: string) => false }) =>
	v < CONSTANTS.INT64_MIN ? ctx.mustBe('greater than') : v > CONSTANTS.INT64_MAX ? ctx.mustBe('less than') : true;

function bigintColumnToSchema(column: Column, constraint?: ColumnDataBigIntConstraint | undefined): Type {
	switch (constraint) {
		case 'int64': {
			return type.bigint.narrow(bigintNarrow);
		}
		case 'uint64': {
			return type.bigint.narrow(unsignedBigintNarrow);
		}
	}

	return type.bigint;
}

function stringColumnToSchema(column: Column, constraint: ColumnDataStringConstraint | undefined): Type {
	const { name: columnName, length, isLengthExact } = column;
	if (constraint === 'binary') {
		return type(`/^[01]${length ? `{${isLengthExact ? length : `0,${length}`}}` : '*'}$/`)
			.describe(
				`a string containing ones or zeros${
					length ? ` while being ${isLengthExact ? '' : 'up to '}${length} characters long` : ''
				}`,
			);
	}
	if (constraint === 'uuid') {
		return type(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu).describe('a RFC-4122-compliant UUID');
	}
	if (constraint === 'enum') {
		const enumValues = column.enumValues;
		if (!enumValues) {
			throw new Error(
				`Column "${getTableName(getColumnTable(column))}"."${columnName}" is of 'enum' type, but lacks enum values`,
			);
		}
		return type.enumerated(...enumValues);
	}

	return length && isLengthExact
		? type.string.exactlyLength(length)
		: length
		? type.string.atMostLength(length)
		: type.string;
}
