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
import * as v from 'valibot';
import { CONSTANTS } from './constants.ts';
import type { Json } from './utils.ts';

export const literalSchema = v.union([v.string(), v.number(), v.boolean(), v.null()]);
export const jsonSchema: v.GenericSchema<Json> = v.union([
	literalSchema,
	v.array(v.any()),
	v.record(v.string(), v.any()),
]);
export const bufferSchema: v.GenericSchema<Buffer> = v.custom<Buffer>((v) => v instanceof Buffer); // eslint-disable-line no-instanceof/no-instanceof

export function mapEnumValues(values: string[]) {
	return Object.fromEntries(values.map((value) => [value, value]));
}

export function columnToSchema(column: Column): v.GenericSchema {
	let schema!: v.GenericSchema;
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
			schema = bigintColumnToSchema(column);
			break;
		}
		case 'boolean': {
			schema = v.boolean();
			break;
		}
		case 'string': {
			schema = stringColumnToSchema(column, constraint);
			break;
		}
		case 'custom': {
			schema = v.any();
			break;
		}
		default: {
			schema = v.any();
		}
	}

	return schema;
}

function numberColumnToSchema(column: Column, constraint: ColumnDataNumberConstraint | undefined): v.GenericSchema {
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

	const actions: any[] = [v.minValue(min), v.maxValue(max)];
	if (integer) {
		actions.push(v.integer());
	}
	return v.pipe(v.number(), ...actions);
}

function bigintColumnToSchema(column: Column): v.GenericSchema {
	const unsigned = column.getSQLType().includes('unsigned');
	const min = unsigned ? 0n : CONSTANTS.INT64_MIN;
	const max = unsigned ? CONSTANTS.INT64_UNSIGNED_MAX : CONSTANTS.INT64_MAX;

	return v.pipe(v.bigint(), v.minValue(min), v.maxValue(max));
}

function arrayColumnToSchema(column: Column, constraint: ColumnDataArrayConstraint | undefined): v.GenericSchema {
	switch (constraint) {
		case 'geometry':
		case 'point': {
			return v.tuple([v.number(), v.number()]);
		}
		case 'line': {
			return v.tuple([v.number(), v.number(), v.number()]);
		}
		case 'vector':
		case 'halfvector': {
			const dimensions = (<{ dimensions?: number }> column).dimensions;
			return dimensions
				? v.pipe(v.array(v.number()), v.length(dimensions))
				: v.array(v.number());
		}
		case 'basecolumn': {
			const size = (<{ size?: number }> column).size;
			const schema = (<{ baseColumn?: Column }> column).baseColumn
				? v.array(columnToSchema((<{ baseColumn?: Column }> column).baseColumn!))
				: v.array(v.any());
			if (size) return v.pipe(schema, v.length(size));
			return schema;
		}
		default: {
			return v.array(v.any());
		}
	}
}

function objectColumnToSchema(column: Column, constraint: ColumnDataObjectConstraint | undefined): v.GenericSchema {
	switch (constraint) {
		case 'buffer': {
			return bufferSchema;
		}
		case 'date': {
			return v.date();
		}
		case 'geometry':
		case 'point': {
			return v.object({
				x: v.number(),
				y: v.number(),
			});
		}
		case 'json': {
			return jsonSchema;
		}
		case 'line': {
			return v.object({
				a: v.number(),
				b: v.number(),
				c: v.number(),
			});
		}
		default: {
			return v.looseObject({});
		}
	}
}

function stringColumnToSchema(column: Column, constraint: ColumnDataStringConstraint | undefined): v.GenericSchema {
	const { dialect, name: columnName } = column;

	let max: number | undefined;
	let regex: RegExp | undefined;
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
		regex = /^[01]*$/;
		max = (<{ dimensions?: number }> column).dimensions ?? (<{ length?: number }> column).length;
		fixed = true;
	} else if (constraint === 'varbinary') {
		regex = /^[01]*$/;
		max = (<{ dimensions?: number }> column).dimensions ?? (<{ length?: number }> column).length;
	} else if (constraint === 'uuid') return v.pipe(v.string(), v.uuid());
	else if (
		constraint === 'enum'
	) {
		const enumValues = (<{ enumValues?: string[] }> column).enumValues;
		if (!enumValues) {
			throw new Error(
				`Column "${getTableName(getColumnTable(column))}"."${columnName}" is of 'enum' type, but lacks enum values`,
			);
		}
		return v.enum(mapEnumValues(enumValues));
	}

	const actions: any[] = [];
	if (regex) {
		actions.push(v.regex(regex));
	}
	if (max && fixed) {
		actions.push(v.length(max));
	} else if (max) {
		actions.push(v.maxLength(max));
	}
	return actions.length > 0 ? v.pipe(v.string(), ...actions) : v.string();
}
