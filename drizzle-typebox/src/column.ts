import { Kind, Type as t, TypeRegistry } from '@sinclair/typebox';
import type { StringOptions, TSchema, Type as typebox } from '@sinclair/typebox';
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
import type { BufferSchema, JsonSchema } from './utils.ts';

export const literalSchema = t.Union([t.String(), t.Number(), t.Boolean(), t.Null()]);
export const jsonSchema: JsonSchema = t.Union([literalSchema, t.Array(t.Any()), t.Record(t.String(), t.Any())]) as any;
TypeRegistry.Set('Buffer', (_, value) => value instanceof Buffer); // eslint-disable-line no-instanceof/no-instanceof
export const bufferSchema: BufferSchema = { [Kind]: 'Buffer', type: 'buffer' } as any;

export function mapEnumValues(values: string[]) {
	return Object.fromEntries(values.map((value) => [value, value]));
}

export function columnToSchema(column: Column, t: typeof typebox): TSchema {
	let schema!: TSchema;

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
			schema = bigintColumnToSchema(column, t);
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

	const key = integer ? 'Integer' : 'Number';
	return t[key]({
		minimum: min,
		maximum: max,
	});
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
			const dimensions = (<{ dimensions?: number }> column).dimensions;
			const sizeParam = dimensions
				? {
					minItems: dimensions,
					maxItems: dimensions,
				}
				: undefined;
			return t.Array(t.Number(), sizeParam);
		}
		case 'basecolumn': {
			const size = (<{ size?: number }> column).size;
			const sizeParam = size
				? {
					minItems: size,
					maxItems: size,
				}
				: undefined;
			return (<{ baseColumn?: Column }> column).baseColumn
				? t.Array(
					columnToSchema((<{ baseColumn?: Column }> column).baseColumn!, t),
					sizeParam,
				)
				: t.Array(
					t.Any(),
					sizeParam,
				);
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

function bigintColumnToSchema(column: Column, t: typeof typebox): TSchema {
	const unsigned = column.getSQLType().includes('unsigned');
	const min = unsigned ? 0n : CONSTANTS.INT64_MIN;
	const max = unsigned ? CONSTANTS.INT64_UNSIGNED_MAX : CONSTANTS.INT64_MAX;

	return t.BigInt({
		minimum: min,
		maximum: max,
	});
}

function stringColumnToSchema(
	column: Column,
	constraint: ColumnDataStringConstraint | undefined,
	t: typeof typebox,
): TSchema {
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
		return t.RegExp(/^[01]*$/, length ? { maxLength: length, minLength: length } : undefined);
	} else if (constraint === 'varbinary') {
		const length = (<{ dimensions?: number }> column).dimensions ?? (<{ length?: number }> column).length;
		return t.RegExp(/^[01]*$/, length ? { maxLength: length } : undefined);
	} else if (constraint === 'uuid') {
		return t.String({ format: 'uuid' });
	} else if (
		constraint === 'enum'
	) {
		const enumValues = (<{ enumValues?: string[] }> column).enumValues;
		if (!enumValues) {
			throw new Error(
				`Column "${getTableName(getColumnTable(column))}"."${columnName}" is of 'enum' type, but lacks enum values`,
			);
		}
		return t.Enum(mapEnumValues(enumValues));
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
