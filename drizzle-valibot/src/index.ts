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
	type ArrayIssue,
	type ArraySchema,
	type BaseIssue,
	type BaseSchema,
	bigint,
	type BigintSchema,
	boolean,
	type BooleanIssue,
	type BooleanSchema,
	date,
	type DateSchema,
	lazy,
	maxLength,
	type MaxLengthAction,
	null_,
	nullable,
	type NullableSchema,
	type NullIssue,
	number,
	type NumberIssue,
	type NumberSchema,
	object,
	type ObjectSchema,
	optional,
	type OptionalSchema,
	picklist,
	type PicklistSchema,
	record,
	type RecordIssue,
	pipe,
	type SchemaWithPipe,
	string,
	type StringIssue,
	type StringSchema,
	union,
	type UnionIssue,
	uuid,
} from 'valibot';

// TODO: I think types test would be great for this file to make sure types are inferred correctly

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
type LiteralIssue = StringIssue | NumberIssue | BooleanIssue | NullIssue;
type JsonIssue = LiteralIssue | ArrayIssue | RecordIssue;
type JsonSchema = BaseSchema<Json, Json, UnionIssue<JsonIssue> | JsonIssue>;
export const jsonSchema = lazy(() =>
	union([string(), number(), boolean(), null_(), array(jsonSchema), record(string(), jsonSchema)])
) as JsonSchema;

type MapInsertColumnToValibot<
	TColumn extends Column,
	TType extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
> = TColumn['_']['notNull'] extends false ? OptionalSchema<NullableSchema<TType, never>, never>
	: TColumn['_']['hasDefault'] extends true ? OptionalSchema<TType, never>
	: TType;

type MapSelectColumnToValibot<
	TColumn extends Column,
	TType extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
> = TColumn['_']['notNull'] extends false ? NullableSchema<TType, never> : TType;

type MapColumnToValibot<
	TColumn extends Column,
	TType extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
	TMode extends 'insert' | 'select',
> = TMode extends 'insert' ? MapInsertColumnToValibot<TColumn, TType>
	: MapSelectColumnToValibot<TColumn, TType>;

type MaybeOptional<
	TColumn extends Column,
	TType extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
	TMode extends 'insert' | 'select',
	TNoOptional extends boolean,
> = TNoOptional extends true ? TType
	: MapColumnToValibot<TColumn, TType, TMode>;

type GetValibotType<TColumn extends Column> = TColumn['_']['dataType'] extends infer TDataType
	? TDataType extends 'custom' ? AnySchema
	: TDataType extends 'json' ? JsonSchema
	: TColumn extends { enumValues: [string, ...string[]] }
		// TODO: Can we somehow check `.length` to know if it's a string schema with or without a max length check?
		? Equal<TColumn['enumValues'], [string, ...string[]]> extends true ? StringSchema<undefined> | SchemaWithPipe<[StringSchema<undefined>, MaxLengthAction<string, number, undefined>]>
		: PicklistSchema<TColumn['enumValues'], undefined>
	: TDataType extends 'array'
		? TColumn['_']['baseColumn'] extends Column ? ArraySchema<GetValibotType<TColumn['_']['baseColumn']>, undefined> : never
	: TDataType extends 'bigint' ? BigintSchema<undefined>
	: TDataType extends 'number' ? NumberSchema<undefined>
	// TODO: I think Drizzle's MySQL `varbinary` returns the wrong type
	: TDataType extends 'string' ? StringSchema<undefined>
	: TDataType extends 'boolean' ? BooleanSchema<undefined>
	: TDataType extends 'date' ? DateSchema<undefined>
	: AnySchema
	: never;

type ValueOrUpdater<T, TUpdaterArg> = T | ((arg: TUpdaterArg) => T);

type UnwrapValueOrUpdater<T> = T extends ValueOrUpdater<infer U, any> ? U
	: never;

export type Refine<TTable extends Table, TMode extends 'select' | 'insert'> = {
	[K in keyof TTable['_']['columns']]?: ValueOrUpdater<
		BaseSchema<unknown, unknown, BaseIssue<unknown>>,
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
			K extends keyof TRefine ? Assume<UnwrapValueOrUpdater<TRefine[K]>, BaseSchema<unknown, unknown, BaseIssue<unknown>>>
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
			K extends keyof TRefine ? Assume<UnwrapValueOrUpdater<TRefine[K]>, BaseSchema<unknown, unknown, BaseIssue<unknown>>>
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
	>,
	undefined
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
	>,
	undefined
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

// TODO: This function could be rewritten into a single return statement
function mapColumnToSchema(column: Column): BaseSchema<unknown, unknown, BaseIssue<unknown>> {
	let type: BaseSchema<unknown, unknown, BaseIssue<unknown>> | undefined;

	if (isWithEnum(column)) {
		// TODO: This is unnecessary because `isWithEnum` already checks for `column.enumValues.length`
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
			type = (is(column, PgChar)
					|| is(column, PgVarchar)
					|| is(column, MySqlVarChar)
					|| is(column, MySqlVarBinary)
					|| is(column, MySqlChar)
					|| is(column, SQLiteText))
				&& typeof column.length === 'number' ? pipe(string(), maxLength(column.length)) : string();
		} else if (is(column, PgUUID)) {
			type = pipe(string(), uuid());
		}
	}

	if (!type) {
		type = any();
	}

	return type;
}
