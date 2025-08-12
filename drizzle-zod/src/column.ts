import {
	type Column,
	type ColumnDataConstraint,
	extractExtendedColumnType,
	getColumnTable,
	getTableName,
} from 'drizzle-orm';
import type { MySqlChar, MySqlText, MySqlVarChar } from 'drizzle-orm/mysql-core';
import type { PgBinaryVector, PgChar, PgVarchar } from 'drizzle-orm/pg-core';
import type { SingleStoreChar, SingleStoreText, SingleStoreVarChar } from 'drizzle-orm/singlestore-core';
import type { SQLiteText } from 'drizzle-orm/sqlite-core';
import { z as zod } from 'zod/v4';
import { CONSTANTS } from './constants.ts';
import type { CreateSchemaFactoryOptions } from './schema.types.ts';
import { isColumnType } from './utils.ts';
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
		| CreateSchemaFactoryOptions<
			Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
		>
		| undefined,
): zod.ZodType {
	const z: typeof zod = factory?.zodInstance ?? zod;
	const coerce = factory?.coerce ?? {};
	let schema!: zod.ZodType;
	const { type, constraint } = extractExtendedColumnType(column);

	switch (type) {
		case 'enum': {
			const enumValues = (<{ enumValues?: string[] }> column).enumValues;
			if (!enumValues) {
				throw new Error(
					`Column "${getTableName(getColumnTable(column))}"."${column.name}" is of 'enum' type, but lacks enum values`,
				);
			}
			schema = z.enum(enumValues);
			break;
		}
		case 'pointTuple':
		case 'geoTuple': {
			schema = z.tuple([z.number(), z.number()]);
			break;
		}
		case 'geoObject':
		case 'pointObject': {
			schema = z.object({ x: z.number(), y: z.number() });
			break;
		}
		case 'vector': {
			const dimensions = (<{ dimensions?: number }> column).dimensions;
			schema = dimensions
				? z.array(z.number()).length(dimensions)
				: z.array(z.number());
			break;
		}
		case 'lineTuple': {
			schema = z.tuple([z.number(), z.number(), z.number()]);
			break;
		}
		case 'lineABC': {
			schema = z.object({
				a: z.number(),
				b: z.number(),
				c: z.number(),
			});
			break;
		}
		case 'array': {
			schema = (<{ baseColumn?: Column }> column).baseColumn
				? z.array(columnToSchema((<{ baseColumn?: Column }> column).baseColumn!, factory))
				: z.array(z.any());
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
		case 'date': {
			schema = coerce === true || coerce.date ? z.coerce.date() : z.date();
			break;
		}
		case 'string': {
			schema = stringColumnToSchema(column, constraint, z, coerce);
			break;
		}
		case 'json': {
			schema = jsonSchema;
			break;
		}
		case 'custom': {
			schema = z.any();
			break;
		}
		case 'buffer': {
			schema = bufferSchema;
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
	constraint: ColumnDataConstraint | undefined,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>['coerce'],
): zod.ZodType {
	const unsigned = constraint === 'uint' || column.getSQLType().includes('unsigned');
	let min!: number;
	let max!: number;
	let integer = false;

	switch (constraint) {
		case 'integer': {
			min = unsigned ? 0 : Number.MIN_SAFE_INTEGER;
			max = Number.MAX_SAFE_INTEGER;
			integer = true;
			break;
		}
		case 'tinyint': {
			min = unsigned ? 0 : CONSTANTS.INT8_MIN;
			max = unsigned ? CONSTANTS.INT8_UNSIGNED_MAX : CONSTANTS.INT8_MAX;
			integer = true;
			break;
		}
		case 'smallint': {
			min = unsigned ? 0 : CONSTANTS.INT16_MIN;
			max = unsigned ? CONSTANTS.INT16_UNSIGNED_MAX : CONSTANTS.INT16_MAX;
			integer = true;
			break;
		}
		case 'mediumint': {
			min = unsigned ? 0 : CONSTANTS.INT24_MIN;
			max = unsigned ? CONSTANTS.INT24_UNSIGNED_MAX : CONSTANTS.INT24_MAX;
			integer = true;
			break;
		}
		case 'float': {
			min = unsigned ? 0 : CONSTANTS.INT24_MIN;
			max = unsigned ? CONSTANTS.INT24_UNSIGNED_MAX : CONSTANTS.INT24_MAX;
			break;
		}
		case 'real': {
			if (column.dialect === 'pg') {
				min = unsigned ? 0 : CONSTANTS.INT24_MIN;
				max = unsigned ? CONSTANTS.INT24_UNSIGNED_MAX : CONSTANTS.INT24_MAX;
				break;
			}

			min = unsigned ? 0 : CONSTANTS.INT48_MIN;
			max = unsigned ? CONSTANTS.INT48_UNSIGNED_MAX : CONSTANTS.INT48_MAX;
			break;
		}
		case 'double': {
			min = unsigned ? 0 : CONSTANTS.INT48_MIN;
			max = unsigned ? CONSTANTS.INT48_UNSIGNED_MAX : CONSTANTS.INT48_MAX;
			break;
		}
		case 'uint': {
			min = 0;
			max = Number.MAX_SAFE_INTEGER;
			integer = true;
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
	constraint: ColumnDataConstraint | undefined,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>['coerce'],
): zod.ZodType {
	const unsigned = column.getSQLType().includes('unsigned');
	const min = unsigned ? 0n : CONSTANTS.INT64_MIN;
	const max = unsigned ? CONSTANTS.INT64_UNSIGNED_MAX : CONSTANTS.INT64_MAX;

	const schema = coerce === true || coerce?.bigint ? z.coerce.bigint() : z.bigint();
	return schema.gte(min).lte(max);
}

function stringColumnToSchema(
	column: Column<any>,
	constraint: ColumnDataConstraint | undefined,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>['coerce'],
): zod.ZodType {
	if (constraint === 'uuid') return z.uuid();

	let max: number | undefined;
	let regex: RegExp | undefined;
	let fixed = false;

	if (isColumnType<PgVarchar<any> | SQLiteText<any>>(column, ['PgVarchar', 'SQLiteText'])) {
		max = column.length;
	} else if (
		isColumnType<MySqlVarChar<any> | SingleStoreVarChar<any>>(column, ['MySqlVarChar', 'SingleStoreVarChar'])
	) {
		max = column.length ?? CONSTANTS.INT16_UNSIGNED_MAX;
	} else if (isColumnType<MySqlText<any> | SingleStoreText<any>>(column, ['MySqlText', 'SingleStoreText'])) {
		if (column.textType === 'longtext') {
			max = CONSTANTS.INT32_UNSIGNED_MAX;
		} else if (column.textType === 'mediumtext') {
			max = CONSTANTS.INT24_UNSIGNED_MAX;
		} else if (column.textType === 'text') {
			max = CONSTANTS.INT16_UNSIGNED_MAX;
		} else {
			max = CONSTANTS.INT8_UNSIGNED_MAX;
		}
	}

	if (
		isColumnType<PgChar<any> | MySqlChar<any> | SingleStoreChar<any>>(column, [
			'PgChar',
			'MySqlChar',
			'SingleStoreChar',
		])
	) {
		max = column.length;
		fixed = true;
	}

	if (isColumnType<PgBinaryVector<any>>(column, ['PgBinaryVector'])) {
		regex = /^[01]+$/;
		max = column.dimensions;
	}

	let schema = coerce === true || coerce?.string ? z.coerce.string() : z.string();
	schema = regex ? schema.regex(regex) : schema;
	return max && fixed ? schema.length(max) : max ? schema.max(max) : schema;
}
