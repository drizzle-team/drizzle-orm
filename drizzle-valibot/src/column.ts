import { is } from 'drizzle-orm';
import type { Column } from 'drizzle-orm';
import {
	MySqlBigInt53,
	MySqlChar,
	MySqlColumn,
	MySqlDecimal,
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
import {
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
	PgSparseVector,
	PgText,
	PgUUID,
	PgVarchar,
	PgVector,
} from 'drizzle-orm/pg-core';
import { SQLiteInteger, SQLiteReal, SQLiteText } from 'drizzle-orm/sqlite-core';
import * as v from 'valibot';
import { CONSTANTS } from './constants';
import { isAny, isWithEnum } from './utils';
import type { Json } from './utils';

export const literalSchema = v.union([v.string(), v.number(), v.boolean(), v.null()]);
export const jsonSchema: v.GenericSchema<Json> = v.union([
  literalSchema,
  v.array(v.lazy(() => jsonSchema)),
  v.record(v.string(), v.lazy(() => jsonSchema))
]);
export const bufferSchema: v.GenericSchema<Buffer> = v.custom<Buffer>((v) => v instanceof Buffer);

export function mapEnumValues(values: string[]) {
  return values.reduce((acc, value) => ({ ...acc, [value]: value }), {})
}

/** @internal */
export function columnToSchema(column: Column): v.GenericSchema {
	let schema!: v.GenericSchema;

	if (isWithEnum(column)) {
		schema = column.enumValues.length ? v.enum(mapEnumValues(column.enumValues)) : v.string();
	}

	if (!schema) {
		// Handle specific types
		if (isAny(column, [PgGeometry, PgPointTuple])) {
			schema = v.tuple([v.number(), v.number()]);
		} else if (isAny(column, [PgGeometryObject, PgPointObject])) {
			schema = v.object({ x: v.number(), y: v.number() });
		} else if (isAny(column, [PgHalfVector, PgVector])) {
			schema = v.array(v.number());
			schema = column.dimensions ? v.pipe((schema as v.ArraySchema<any, any>), v.length(column.dimensions)) : schema;
		} else if (is(column, PgLineTuple)) {
			schema = v.tuple([v.number(), v.number(), v.number()]);
      v.array(v.array(v.number()));
		} else if (is(column, PgLineABC)) {
			schema = v.object({ a: v.number(), b: v.number(), c: v.number() });
		} // Handle other types
		else if (is(column, PgArray)) {
			schema = v.array(columnToSchema(column.baseColumn));
			schema = column.size ? v.pipe((schema as v.ArraySchema<any, any>), v.length(column.size)) : schema;
		} else if (column.dataType === 'array') {
			schema = v.array(v.any());
		} else if (column.dataType === 'number') {
			schema = numberColumnToSchema(column);
		} else if (column.dataType === 'bigint') {
			schema = bigintColumnToSchema(column);
		} else if (column.dataType === 'boolean') {
			schema = v.boolean();
		} else if (column.dataType === 'date') {
			schema = v.date();
		} else if (column.dataType === 'string') {
			schema = stringColumnToSchema(column);
		} else if (column.dataType === 'json') {
			schema = jsonSchema;
		} else if (column.dataType === 'custom') {
			schema = v.any();
		} else if (column.dataType === 'buffer') {
			schema = bufferSchema;
		}
	}

	if (!schema) {
		schema = v.any();
	}

	return schema;
}

function numberColumnToSchema(column: Column): v.GenericSchema {
	const unsigned = column.getSQLType().includes('unsigned')
		|| (is(column, MySqlColumn) && column.getSQLType() === 'serial');
	let min!: number;
	let max!: number;
	let integer = false;

	if (is(column, MySqlTinyInt)) {
		min = unsigned ? 0 : CONSTANTS.INT8_MIN;
		max = unsigned ? CONSTANTS.INT8_UNSIGNED_MAX : CONSTANTS.INT8_MAX;
		integer = true;
	} else if (isAny(column, [PgSmallInt, PgSmallSerial, MySqlSmallInt])) {
		min = unsigned ? 0 : CONSTANTS.INT16_MIN;
		max = unsigned ? CONSTANTS.INT16_UNSIGNED_MAX : CONSTANTS.INT16_MAX;
		integer = true;
	} else if (isAny(column, [PgReal, MySqlFloat, MySqlMediumInt])) {
		min = unsigned ? 0 : CONSTANTS.INT24_MIN;
		max = unsigned ? CONSTANTS.INT24_UNSIGNED_MAX : CONSTANTS.INT24_MAX;
		integer = is(column, MySqlMediumInt);
	} else if (isAny(column, [PgInteger, PgSerial, MySqlInt])) {
		min = unsigned ? 0 : CONSTANTS.INT32_MIN;
		max = unsigned ? CONSTANTS.INT32_UNSIGNED_MAX : CONSTANTS.INT32_MAX;
		integer = true;
	} else if (isAny(column, [PgDoublePrecision, MySqlReal, MySqlDouble, SQLiteReal])) {
		min = unsigned ? 0 : CONSTANTS.INT48_MIN;
		max = unsigned ? CONSTANTS.INT48_UNSIGNED_MAX : CONSTANTS.INT48_MAX;
	} else if (isAny(column, [PgBigInt53, PgBigSerial53, MySqlBigInt53, MySqlSerial, SQLiteInteger])) {
		min = unsigned ? 0 : Number.MIN_SAFE_INTEGER;
		max = Number.MAX_SAFE_INTEGER;
		integer = true;
	} else if (is(column, MySqlYear)) {
		min = 1901;
		max = 2155;
		integer = true;
	} else {
		min = Number.MIN_SAFE_INTEGER;
		max = Number.MAX_SAFE_INTEGER;
	}

  const actions: any[] = [v.minValue(min), v.maxValue(max)];
  if (integer) {
    actions.push(v.integer());
  }
	return v.pipe(v.number(), ...actions);
}

function bigintColumnToSchema(column: Column): v.GenericSchema {
	const unsigned = column.getSQLType().includes('unsigned');
	let min = unsigned ? 0n : CONSTANTS.INT64_MIN;
	let max = unsigned ? CONSTANTS.INT64_UNSIGNED_MAX : CONSTANTS.INT64_MAX;

	return v.pipe(v.bigint(), v.minValue(min), v.maxValue(max));
}

function stringColumnToSchema(column: Column): v.GenericSchema {
	if (isAny(column, [PgChar, MySqlChar, PgText, PgVarchar, MySqlVarChar, MySqlText, SQLiteText]) && column.enumValues) {
		return v.enum(mapEnumValues(column.enumValues));
	}

	if (is(column, PgUUID)) {
		return v.pipe(v.string(), v.uuid());
	}

	let max: number | undefined;
	let regex: RegExp | undefined;
	let fixed = false;

	if (isAny(column, [PgVarchar, SQLiteText])) {
		max = column.length;
	} else if (is(column, MySqlVarChar)) {
		max = column.length ?? CONSTANTS.INT16_UNSIGNED_MAX;
	} else if (is(column, MySqlText)) {
		max = CONSTANTS.INT16_UNSIGNED_MAX;
	}

	if (isAny(column, [PgChar, MySqlChar])) {
		max = column.length;
		fixed = true;
	}

	if (is(column, PgBinaryVector)) {
		regex = /^[01]+$/;
		max = column.dimensions;
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
