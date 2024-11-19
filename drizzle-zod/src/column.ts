import { z } from 'zod';
import { is } from 'drizzle-orm';
import { PgArray, PgBigInt53, PgBigSerial53, PgBinaryVector, PgChar, PgDoublePrecision, PgGeometry, PgGeometryObject, PgHalfVector, PgInteger, PgLineABC, PgLineTuple, PgPointObject, PgPointTuple, PgReal, PgSerial, PgSmallInt, PgSmallSerial, PgSparseVector, PgText, PgUUID, PgVarchar, PgVector } from 'drizzle-orm/pg-core';
import { MySqlBigInt53, MySqlChar, MySqlColumn, MySqlDecimal, MySqlDouble, MySqlFloat, MySqlInt, MySqlMediumInt, MySqlReal, MySqlSerial, MySqlSmallInt, MySqlText, MySqlTinyInt, MySqlVarChar, MySqlYear } from 'drizzle-orm/mysql-core';
import { SQLiteInteger, SQLiteReal, SQLiteText } from 'drizzle-orm/sqlite-core';
import { isAny, isWithEnum } from './utils';
import { CONSTANTS } from './constants';
import type { z as zod } from 'zod';
import type { Column } from 'drizzle-orm';
import type { Json } from './utils';

export const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
	z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)])
);
export const bufferSchema: z.ZodType<Buffer> = z.custom<Buffer>((v) => v instanceof Buffer);

/** @internal */
export function columnToSchema(column: Column, z: typeof zod): z.ZodTypeAny {
  let schema!: z.ZodTypeAny;

  if (isWithEnum(column)) {
		schema = column.enumValues.length ? z.enum(column.enumValues) : z.string();
	}

  if (!schema) {
    // Handle specific types
    if (is(column, PgGeometry)) {
      schema = z.tuple([z.number(), z.number()]);
    } else if (is(column, PgGeometryObject)) {
      schema = z.object({ x: z.number(), y: z.number() });
    } else if (isAny(column, [PgHalfVector, PgVector])) {
      schema = z.array(z.number());
      schema = column.dimensions ? (schema as z.ZodArray<any>).length(column.dimensions) : schema;
    } else if (is(column, PgPointTuple)) {
      schema = z.tuple([z.number(), z.number(), z.number()]);
    } else if (is(column, PgPointObject)) {
      schema = z.object({ a: z.number(), b: z.number(), c: z.number() });
    }
    // Handle other types
    else if (is(column, PgArray)) {
      schema = z.array(columnToSchema(column.baseColumn, z));
      schema = column.size ? (schema as z.ZodArray<any>).length(column.size) : schema;
    } else if (column.dataType === 'array') {
      schema = arrayColumnToSchema(column, z);
    } else if (column.dataType === 'number') {
      schema = numberColumnToSchema(column, z);
    } else if (column.dataType === 'bigint') {
      schema = bigintColumnToSchema(column, z);
    } else if (column.dataType === 'boolean') {
      schema = z.boolean()
    } else if (column.dataType === 'date') {
      schema = z.date();
    } else if (column.dataType === 'string') {
      schema = stringColumnToSchema(column, z);
    } else if (column.dataType === 'json') {
      schema = jsonColumnToSchema(column, z);
    } else if (column.dataType === 'custom') {
      schema = z.any();
    } else if (column.dataType === 'buffer') {
      schema = bufferSchema;
    }
  }

  if (!schema) {
    schema = z.any();
  }

  return schema;
}

function numberColumnToSchema(column: Column, z: typeof zod): z.ZodTypeAny {
  const unsigned = column.getSQLType().includes('unsigned') || (is(column, MySqlColumn) && column.getSQLType() === 'serial');
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

  const schema = z.number().min(min).max(max)
  return integer ? schema.int() : schema;
}

function bigintColumnToSchema(column: Column, z: typeof zod): z.ZodTypeAny {
  const unsigned = column.getSQLType().includes('unsigned');
  let min = unsigned ? 0n : CONSTANTS.INT64_MIN;
  let max = unsigned ? CONSTANTS.INT64_UNSIGNED_MAX : CONSTANTS.INT64_MAX;

  return z.bigint().min(min).max(max);
}

function stringColumnToSchema(column: Column, z: typeof zod): z.ZodTypeAny {
  if (isAny(column, [PgChar, MySqlChar, PgText, PgVarchar, MySqlVarChar, MySqlText, SQLiteText]) && column.enumValues) {
    return z.enum(column.enumValues as any);
  }

  if (is(column, PgUUID)) {
    return z.string().uuid();
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

  let schema = z.string();
  schema = regex !== undefined ? schema.regex(regex) : schema;
  return max !== undefined && fixed ? schema.length(max) : max !== undefined ? schema.max(max) : schema;
}

function arrayColumnToSchema(column: Column, z: typeof zod): z.ZodTypeAny {
  let schema!: z.ZodTypeAny;

  if (is(column, PgLineTuple)) {
    schema = z.tuple([
      z.number(),
      z.number(),
      z.number()
    ]);
  } else if (isAny(column, [PgPointTuple, PgGeometry])) {
    schema = z.tuple([
      z.number(),
      z.number()
    ]);
  } else if (isAny(column, [PgHalfVector, PgVector])) {
    schema = z.array(z.number());
  } else {
    schema = z.array(z.any());
  }

  return schema;
}

function jsonColumnToSchema(column: Column, z: typeof zod): z.ZodTypeAny {
  let schema!: z.ZodTypeAny;

  if (is(column, PgLineABC)) {
    schema = z.object({
      a: z.number(),
      b: z.number(),
      c: z.number()
    });
  } else if (isAny(column, [PgPointObject, PgGeometry])) {
    schema = z.object({
      x: z.number(),
      y: z.number()
    });
  } else {
    schema = jsonSchema;
  }

  return schema;
}
