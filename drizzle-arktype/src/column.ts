import { type Type, type } from 'arktype';
import {
	type Column,
	type ColumnDataArrayConstraint,
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
			schema = bigintColumnToSchema(column);
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
	const unsigned = constraint === 'uint53' || column.getSQLType().includes('unsigned');
	let min!: number;
	let max!: number;
	let integer = false;

	switch (constraint) {
		case 'int8': {
			min = CONSTANTS.INT8_MIN;
			max = unsigned ? CONSTANTS.INT8_UNSIGNED_MAX : CONSTANTS.INT8_MAX;
			integer = true;
			break;
		}
		case 'int16': {
			min = CONSTANTS.INT16_MIN;
			max = unsigned ? CONSTANTS.INT16_UNSIGNED_MAX : CONSTANTS.INT16_MAX;
			integer = true;
			break;
		}
		case 'int24': {
			min = CONSTANTS.INT24_MIN;
			max = unsigned ? CONSTANTS.INT24_UNSIGNED_MAX : CONSTANTS.INT24_MAX;
			integer = true;
			break;
		}
		case 'int32': {
			min = CONSTANTS.INT32_MIN;
			max = unsigned ? CONSTANTS.INT32_UNSIGNED_MAX : CONSTANTS.INT32_MAX;
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
			max = unsigned ? CONSTANTS.INT24_UNSIGNED_MAX : CONSTANTS.INT24_MAX;
			break;
		}
		case 'real24': {
			min = CONSTANTS.INT24_MIN;
			max = unsigned ? CONSTANTS.INT24_UNSIGNED_MAX : CONSTANTS.INT24_MAX;
			break;
		}
		case 'real48': {
			min = CONSTANTS.INT48_MIN;
			max = unsigned ? CONSTANTS.INT48_UNSIGNED_MAX : CONSTANTS.INT48_MAX;
			break;
		}
		case 'double': {
			min = CONSTANTS.INT48_MIN;
			max = unsigned ? CONSTANTS.INT48_UNSIGNED_MAX : CONSTANTS.INT48_MAX;
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

	min = unsigned ? 0 : min;

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
			const dimensions = (<{ dimensions?: number }> column).dimensions;
			return dimensions ? type.number.array().exactlyLength(dimensions) : type.number.array();
		}
		case 'basecolumn': {
			const size = (<{ size?: number }> column).size;
			const schema = (<{ baseColumn?: Column }> column).baseColumn
				? columnToSchema((<{ baseColumn?: Column }> column).baseColumn!).array()
				: type.unknown.array();
			if (size) return schema.exactlyLength(size);
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

function bigintColumnToSchema(column: Column): Type {
	const unsigned = column.getSQLType().includes('unsigned');
	return type.bigint.narrow(unsigned ? unsignedBigintNarrow : bigintNarrow);
}

function stringColumnToSchema(column: Column, constraint: ColumnDataStringConstraint | undefined): Type {
	const { dialect, name: columnName } = column;

	let max: number | undefined;
	let fixed = false;

	if ((dialect === 'pg' && constraint === 'varchar') || (dialect === 'sqlite' && constraint === 'text')) {
		max = (<{ length?: number }> column).length;
	} else if ((dialect === 'singlestore' || dialect === 'mysql') && constraint === 'varchar') {
		max = (<{ length?: number }> column).length ?? CONSTANTS.INT16_UNSIGNED_MAX;
	} else if ((dialect === 'singlestore' || dialect === 'mysql') && constraint === 'text') {
		const textType = (<{ textType?: 'text' | 'tinytext' | 'mediumtext' | 'longtext' }> column).textType!;

		if (textType === 'longtext') {
			max = CONSTANTS.INT32_UNSIGNED_MAX;
		} else if (textType === 'mediumtext') {
			max = CONSTANTS.INT24_UNSIGNED_MAX;
		} else if (textType === 'text') {
			max = CONSTANTS.INT16_UNSIGNED_MAX;
		} else {
			max = CONSTANTS.INT8_UNSIGNED_MAX;
		}
	} else if (constraint === 'char') {
		max = (<{ length?: number }> column).length;
		fixed = true;
	} else if (constraint === 'binary') {
		const length = (<{ dimensions?: number }> column).dimensions ?? (<{ length?: number }> column).length;
		return type(`/^[01]${length ? `{${length}}` : dialect === 'pg' ? '+' : '*'}$/`)
			.describe(`a string containing ones or zeros${length ? ` while being ${length} characters long` : ''}`);
	} else if (constraint === 'varbinary') {
		const length = (<{ dimensions?: number }> column).dimensions ?? (<{ length?: number }> column).length;
		return type(`/^[01]${length ? `{0,${length}}` : '*'}$/`)
			.describe(`a string containing ones or zeros${length ? ` while being up to ${length} characters long` : ''}`);
	} else if (constraint === 'uuid') {
		return type(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu).describe('a RFC-4122-compliant UUID');
	} else if (constraint === 'enum') {
		const enumValues = (<{ enumValues?: string[] }> column).enumValues;
		if (!enumValues) {
			throw new Error(
				`Column "${getTableName(getColumnTable(column))}"."${columnName}" is of 'enum' type, but lacks enum values`,
			);
		}
		return type.enumerated(...enumValues);
	}

	return max && fixed ? type.string.exactlyLength(max) : max ? type.string.atMostLength(max) : type.string;
}
