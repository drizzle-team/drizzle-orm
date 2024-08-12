import {
	type Assume,
	type Column,
	type DrizzleTypeError,
	type Equal,
	getTableColumns,
	is,
	type Simplify,
	type Table,
} from 'drizzle-orm';
import { MySqlChar, MySqlVarBinary, MySqlVarChar } from 'drizzle-orm/mysql-core';
import { type PgArray, PgChar, PgUUID, PgVarchar } from 'drizzle-orm/pg-core';
import { SQLiteText } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type Literal = z.infer<typeof literalSchema>;
type Json = Literal | { [key: string]: Json } | Json[];
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
	z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)])
);

type MapInsertColumnToZod<TColumn extends Column, TType extends z.ZodTypeAny> = TColumn['_']['notNull'] extends false
	? z.ZodOptional<z.ZodNullable<TType>>
	: TColumn['_']['hasDefault'] extends true ? z.ZodOptional<TType>
	: TType;

type MapSelectColumnToZod<TColumn extends Column, TType extends z.ZodTypeAny> = TColumn['_']['notNull'] extends false
	? z.ZodNullable<TType>
	: TType;

type MapColumnToZod<TColumn extends Column, TType extends z.ZodTypeAny, TMode extends 'insert' | 'select'> =
	TMode extends 'insert' ? MapInsertColumnToZod<TColumn, TType> : MapSelectColumnToZod<TColumn, TType>;

type MaybeOptional<
	TColumn extends Column,
	TType extends z.ZodTypeAny,
	TMode extends 'insert' | 'select',
	TNoOptional extends boolean,
> = TNoOptional extends true ? TType
  : TColumn['_']['dataType'] extends 'array'
    ? MapColumnToZod<TColumn,
      TColumn extends { baseColumn: Column }
        ? z.ZodArray<GetZodType<TColumn['baseColumn']>>
        : TColumn['_']['baseColumn'] extends Column
          ? z.ZodArray<GetZodType<TColumn['_']['baseColumn']>>
          : z.ZodArray<z.ZodAny>,
      TMode>
    : MapColumnToZod<TColumn, TType, TMode>;

type GetZodType<TColumn extends Column> = TColumn['_']['dataType'] extends infer TDataType
	? TDataType extends 'custom' ? z.ZodAny
	: TDataType extends 'json' ? z.ZodType<Json>
	: TColumn extends { enumValues: [string, ...string[]] }
		? Equal<TColumn['enumValues'], [string, ...string[]]> extends true ? z.ZodString : z.ZodEnum<TColumn['enumValues']>
	: TDataType extends 'array' ? z.ZodArray<GetZodType<Assume<TColumn['_'], { baseColumn: Column }>['baseColumn']>>
	: TDataType extends 'bigint' ? z.ZodBigInt
	: TDataType extends 'number' ? z.ZodNumber
	: TDataType extends 'string' ? z.ZodString
	: TDataType extends 'boolean' ? z.ZodBoolean
	: TDataType extends 'date' ? z.ZodDate
	: z.ZodAny
	: never;

type ValueOrUpdater<T, TUpdaterArg> = T | ((arg: TUpdaterArg) => T);

type UnwrapValueOrUpdater<T> = T extends ValueOrUpdater<infer U, any> ? U : never;

export type Refine<TTable extends Table, TMode extends 'select' | 'insert'> = {
	[K in keyof TTable['_']['columns']]?: ValueOrUpdater<
		z.ZodTypeAny,
		TMode extends 'select' ? BuildSelectSchema<TTable, {}, true> : BuildInsertSchema<TTable, {}, true>
	>;
};

export type BuildInsertSchema<
	TTable extends Table,
	TRefine extends Refine<TTable, 'insert'> | {},
	TNoOptional extends boolean = false,
> = TTable['_']['columns'] extends infer TColumns extends Record<string, Column<any>> ? {
		[K in keyof TColumns & string]: MaybeOptional<
			TColumns[K],
			(K extends keyof TRefine ? Assume<UnwrapValueOrUpdater<TRefine[K]>, z.ZodTypeAny>
				: GetZodType<TColumns[K]>),
			'insert',
			TNoOptional
		>;
	}
	: never;

export type BuildSelectSchema<
	TTable extends Table,
	TRefine extends Refine<TTable, 'select'>,
	TNoOptional extends boolean = false,
> = Simplify<
	{
		[K in keyof TTable['_']['columns']]: MaybeOptional<
			TTable['_']['columns'][K],
			(K extends keyof TRefine ? Assume<UnwrapValueOrUpdater<TRefine[K]>, z.ZodTypeAny>
				: GetZodType<TTable['_']['columns'][K]>),
			'select',
			TNoOptional
		>;
	}
>;

export function createInsertSchema<
	TTable extends Table,
	TRefine extends Refine<TTable, 'insert'> = Refine<TTable, 'insert'>,
>(
	table: TTable,
	/**
	 * @param refine Refine schema fields
	 */
	refine?: {
		[K in keyof TRefine]: K extends keyof TTable['_']['columns'] ? TRefine[K]
			: DrizzleTypeError<`Column '${K & string}' does not exist in table '${TTable['_']['name']}'`>;
	},
): z.ZodObject<BuildInsertSchema<TTable, Equal<TRefine, Refine<TTable, 'insert'>> extends true ? {} : TRefine>> {
	const columns = getTableColumns(table);
	const columnEntries = Object.entries(columns);

	let schemaEntries = Object.fromEntries(columnEntries.map(([name, column]) => {
		return [name, mapColumnToSchema(column)];
	}));

	if (refine) {
		schemaEntries = Object.assign(
			schemaEntries,
			Object.fromEntries(
				Object.entries(refine).map(([name, refineColumn]) => {
					return [
						name,
						typeof refineColumn === 'function'
							? refineColumn(schemaEntries as BuildInsertSchema<TTable, {}, true>)
							: refineColumn,
					];
				}),
			),
		);
	}

	for (const [name, column] of columnEntries) {
		if (!column.notNull) {
			schemaEntries[name] = schemaEntries[name]!.nullable().optional();
		} else if (column.hasDefault) {
			schemaEntries[name] = schemaEntries[name]!.optional();
		}
	}

	return z.object(schemaEntries) as any;
}

export function createSelectSchema<
	TTable extends Table,
	TRefine extends Refine<TTable, 'select'> = Refine<TTable, 'select'>,
>(
	table: TTable,
	/**
	 * @param refine Refine schema fields
	 */
	refine?: {
		[K in keyof TRefine]: K extends keyof TTable['_']['columns'] ? TRefine[K]
			: DrizzleTypeError<`Column '${K & string}' does not exist in table '${TTable['_']['name']}'`>;
	},
): z.ZodObject<BuildSelectSchema<TTable, Equal<TRefine, Refine<TTable, 'select'>> extends true ? {} : TRefine>> {
	const columns = getTableColumns(table);
	const columnEntries = Object.entries(columns);

	let schemaEntries = Object.fromEntries(columnEntries.map(([name, column]) => {
		return [name, mapColumnToSchema(column)];
	}));

	if (refine) {
		schemaEntries = Object.assign(
			schemaEntries,
			Object.fromEntries(
				Object.entries(refine).map(([name, refineColumn]) => {
					return [
						name,
						typeof refineColumn === 'function'
							? refineColumn(schemaEntries as BuildSelectSchema<TTable, {}, true>)
							: refineColumn,
					];
				}),
			),
		);
	}

	for (const [name, column] of columnEntries) {
		if (!column.notNull) {
			schemaEntries[name] = schemaEntries[name]!.nullable();
		}
	}

	return z.object(schemaEntries) as any;
}

function isWithEnum(column: Column): column is typeof column & { enumValues: [string, ...string[]] } {
	return 'enumValues' in column && Array.isArray(column.enumValues) && column.enumValues.length > 0;
}

function mapColumnToSchema(column: Column): z.ZodTypeAny {
	let type: z.ZodTypeAny | undefined;

	if (isWithEnum(column)) {
		type = column.enumValues.length ? z.enum(column.enumValues) : z.string();
	}

	if (!type) {
		if (is(column, PgUUID)) {
			type = z.string().uuid();
		} else if (column.dataType === 'custom') {
			type = z.any();
		} else if (column.dataType === 'json') {
			type = jsonSchema;
		} else if (column.dataType === 'array') {
			type = z.array(mapColumnToSchema((column as PgArray<any, any>).baseColumn));
		} else if (column.dataType === 'number') {
			type = z.number();
		} else if (column.dataType === 'bigint') {
			type = z.bigint();
		} else if (column.dataType === 'boolean') {
			type = z.boolean();
		} else if (column.dataType === 'date') {
			type = z.date();
		} else if (column.dataType === 'string') {
			let sType = z.string();

			if (
				(is(column, PgChar) || is(column, PgVarchar) || is(column, MySqlVarChar)
					|| is(column, MySqlVarBinary) || is(column, MySqlChar) || is(column, SQLiteText))
				&& (typeof column.length === 'number')
			) {
				sType = sType.max(column.length);
			}

			type = sType;
		}
	}

	if (!type) {
		type = z.any();
	}

	return type;
}
