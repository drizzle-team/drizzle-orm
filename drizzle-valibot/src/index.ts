import {
	type AnyColumn,
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

import {
	any,
	type AnySchema,
	array,
	type ArraySchema,
	type BaseSchema,
	bigint,
	type BigintSchema,
	boolean,
	type BooleanSchema,
	date,
	type DateSchema,
	maxLength,
	null_,
	nullable,
	type NullableSchema,
	number,
	type NumberSchema,
	object,
	type ObjectSchema,
	optional,
	type OptionalSchema,
	picklist,
	type PicklistSchema,
	record,
	string,
	type StringSchema,
	union,
	uuid,
} from 'valibot';

const literalSchema = union([string(), number(), boolean(), null_()]);

type Json = typeof jsonSchema;

export const jsonSchema = union([literalSchema, array(any()), record(any())]);

type MapInsertColumnToValibot<
	TColumn extends Column,
	TType extends BaseSchema<any, any>,
> = TColumn['_']['notNull'] extends false ? OptionalSchema<NullableSchema<TType>>
	: TColumn['_']['hasDefault'] extends true ? OptionalSchema<TType>
	: TType;

type MapSelectColumnToValibot<
	TColumn extends Column,
	TType extends BaseSchema<any, any>,
> = TColumn['_']['notNull'] extends false ? NullableSchema<TType> : TType;

type MapColumnToValibot<
	TColumn extends Column,
	TType extends BaseSchema<any, any>,
	TMode extends 'insert' | 'select',
> = TMode extends 'insert' ? MapInsertColumnToValibot<TColumn, TType>
	: MapSelectColumnToValibot<TColumn, TType>;

type MaybeOptional<
	TColumn extends Column,
	TType extends BaseSchema<any, any>,
	TMode extends 'insert' | 'select',
	TNoOptional extends boolean,
> = TNoOptional extends true ? TType
	: MapColumnToValibot<TColumn, TType, TMode>;

type GetValibotType<TColumn extends Column> = TColumn['_']['dataType'] extends infer TDataType
	? TDataType extends 'custom' ? AnySchema
	: TDataType extends 'json' ? Json
	: TColumn extends { enumValues: [string, ...string[]] }
		? Equal<TColumn['enumValues'], [string, ...string[]]> extends true ? StringSchema
		: PicklistSchema<TColumn['enumValues']>
	: TDataType extends 'array' ? ArraySchema<GetValibotType<Assume<TColumn['_']['baseColumn'], Column>>>
	: TDataType extends 'bigint' ? BigintSchema
	: TDataType extends 'number' ? NumberSchema
	: TDataType extends 'string' ? StringSchema
	: TDataType extends 'boolean' ? BooleanSchema
	: TDataType extends 'date' ? DateSchema
	: AnySchema
	: never;

type ValueOrUpdater<T, TUpdaterArg> = T | ((arg: TUpdaterArg) => T);

type UnwrapValueOrUpdater<T> = T extends ValueOrUpdater<infer U, any> ? U
	: never;

export type Refine<TTable extends Table, TMode extends 'select' | 'insert'> = {
	[K in keyof TTable['_']['columns']]?: ValueOrUpdater<
		BaseSchema<any, any>,
		TMode extends 'select' ? BuildSelectSchema<TTable, {}, true>
			: BuildInsertSchema<TTable, {}, true>
	>;
};

export type BuildInsertSchema<
	TTable extends Table,
	TRefine extends Refine<TTable, 'insert'> | {},
	TNoOptional extends boolean = false,
> = TTable['_']['columns'] extends infer TColumns extends Record<
	string,
	Column<any>
> ? {
		[K in keyof TColumns & string]: MaybeOptional<
			TColumns[K],
			K extends keyof TRefine ? Assume<UnwrapValueOrUpdater<TRefine[K]>, BaseSchema<any>>
				: GetValibotType<TColumns[K]>,
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
			K extends keyof TRefine ? Assume<UnwrapValueOrUpdater<TRefine[K]>, BaseSchema<any, any>>
				: GetValibotType<TTable['_']['columns'][K]>,
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
			: DrizzleTypeError<
				`Column '${
					& K
					& string}' does not exist in table '${TTable['_']['name']}'`
			>;
	},
	//
): ObjectSchema<
	BuildInsertSchema<
		TTable,
		Equal<TRefine, Refine<TTable, 'insert'>> extends true ? {} : TRefine
	>
> {
	const columns = getTableColumns(table);
	const columnEntries = Object.entries(columns);

	let schemaEntries = Object.fromEntries(
		columnEntries.map(([name, column]) => {
			return [name, mapColumnToSchema(column)];
		}),
	);

	if (refine) {
		schemaEntries = Object.assign(
			schemaEntries,
			Object.fromEntries(
				Object.entries(refine).map(([name, refineColumn]) => {
					return [
						name,
						typeof refineColumn === 'function'
							? refineColumn(
								schemaEntries as BuildInsertSchema<
									TTable,
									{},
									true
								>,
							)
							: refineColumn,
					];
				}),
			),
		);
	}

	for (const [name, column] of columnEntries) {
		if (!column.notNull) {
			schemaEntries[name] = optional(nullable(schemaEntries[name]!));
		} else if (column.hasDefault) {
			schemaEntries[name] = optional(schemaEntries[name]!);
		}
	}

	return object(schemaEntries) as any;
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
			: DrizzleTypeError<
				`Column '${
					& K
					& string}' does not exist in table '${TTable['_']['name']}'`
			>;
	},
): ObjectSchema<
	BuildSelectSchema<
		TTable,
		Equal<TRefine, Refine<TTable, 'select'>> extends true ? {} : TRefine
	>
> {
	const columns = getTableColumns(table);
	const columnEntries = Object.entries(columns);

	let schemaEntries = Object.fromEntries(
		columnEntries.map(([name, column]) => {
			return [name, mapColumnToSchema(column)];
		}),
	);

	if (refine) {
		schemaEntries = Object.assign(
			schemaEntries,
			Object.fromEntries(
				Object.entries(refine).map(([name, refineColumn]) => {
					return [
						name,
						typeof refineColumn === 'function'
							? refineColumn(
								schemaEntries as BuildSelectSchema<
									TTable,
									{},
									true
								>,
							)
							: refineColumn,
					];
				}),
			),
		);
	}

	for (const [name, column] of columnEntries) {
		if (!column.notNull) {
			schemaEntries[name] = nullable(schemaEntries[name]!);
		}
	}

	return object(schemaEntries) as any;
}

function isWithEnum(
	column: AnyColumn,
): column is typeof column & { enumValues: [string, ...string[]] } {
	return (
		'enumValues' in column
		&& Array.isArray(column.enumValues)
		&& column.enumValues.length > 0
	);
}

function mapColumnToSchema(column: Column): BaseSchema<any, any> {
	let type: BaseSchema<any, any> | undefined;

	if (isWithEnum(column)) {
		type = column.enumValues?.length
			? picklist(column.enumValues)
			: string();
	}

	if (!type) {
		if (column.dataType === 'custom') {
			type = any();
		} else if (column.dataType === 'json') {
			type = jsonSchema;
		} else if (column.dataType === 'array') {
			type = array(
				mapColumnToSchema((column as PgArray<any, any>).baseColumn),
			);
		} else if (column.dataType === 'number') {
			type = number();
		} else if (column.dataType === 'bigint') {
			type = bigint();
		} else if (column.dataType === 'boolean') {
			type = boolean();
		} else if (column.dataType === 'date') {
			type = date();
		} else if (column.dataType === 'string') {
			let sType = string();

			if (
				(is(column, PgChar)
					|| is(column, PgVarchar)
					|| is(column, MySqlVarChar)
					|| is(column, MySqlVarBinary)
					|| is(column, MySqlChar)
					|| is(column, SQLiteText))
				&& typeof column.length === 'number'
			) {
				sType = string([maxLength(column.length)]);
			}

			type = sType;
		} else if (is(column, PgUUID)) {
			type = string([uuid()]);
		}
	}

	if (!type) {
		type = any();
	}

	return type;
}
