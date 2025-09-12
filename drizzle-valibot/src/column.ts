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
			schema = bigintColumnToSchema(column, constraint);
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

	const actions: any[] = [v.minValue(min), v.maxValue(max)];
	if (integer) {
		actions.push(v.integer());
	}
	return v.pipe(v.number(), ...actions);
}

function bigintColumnToSchema(column: Column, constraint: ColumnDataBigIntConstraint | undefined): v.GenericSchema {
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

	const actions: any[] = [];
	if (min !== undefined) actions.push(v.minValue(min));
	if (max !== undefined) actions.push(v.maxValue(max));

	return actions.length > 0 ? v.pipe(v.bigint(), ...actions) : v.bigint();
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
			const { length } = column;
			return length
				? v.pipe(v.array(v.number()), v.length(length))
				: v.array(v.number());
		}
		case 'basecolumn': {
			const { length } = column;
			const schema = (<{ baseColumn?: Column }> column).baseColumn
				? v.array(columnToSchema((<{ baseColumn?: Column }> column).baseColumn!))
				: v.array(v.any());
			if (length) return v.pipe(schema, v.length(length));
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
	const { name: columnName, length, isLengthExact } = column;
	let regex: RegExp | undefined;

	if (constraint === 'binary') {
		regex = /^[01]*$/;
	}
	if (constraint === 'uuid') return v.pipe(v.string(), v.uuid());
	if (constraint === 'enum') {
		const enumValues = column.enumValues;
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
	if (length && isLengthExact) {
		actions.push(v.length(length));
	} else if (length) {
		actions.push(v.maxLength(length));
	}
	return actions.length > 0 ? v.pipe(v.string(), ...actions) : v.string();
}
