import {
	type Column,
	type ColumnDataConstraint,
	extractExtendedColumnType,
	getColumnTable,
	getTableName,
} from 'drizzle-orm';
import { z as zod } from 'zod/v4';
import { CONSTANTS } from './constants.ts';
import type { CreateSchemaFactoryOptions } from './schema.types.ts';
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
			const size = (<{ size?: number }> column).size;
			schema = (<{ baseColumn?: Column }> column).baseColumn
				? z.array(columnToSchema((<{ baseColumn?: Column }> column).baseColumn!, factory))
				: z.array(z.any());
			if (size) schema = (<zod.ZodArray> schema).length(size);

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
	const { dialect } = column;

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
		regex = dialect === 'pg' ? /^[01]+$/ : /^[01]*$/;
		max = (<{ dimensions?: number }> column).dimensions ?? (<{ length?: number }> column).length;
	}

	let schema = coerce === true || coerce?.string ? z.coerce.string() : z.string();
	schema = regex ? schema.regex(regex) : schema;
	return max && fixed ? schema.length(max) : max ? schema.max(max) : schema;
}
