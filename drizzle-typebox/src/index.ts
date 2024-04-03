import type {
	TAny,
	TArray,
	TBigInt,
	TBoolean,
	TDate,
	TLiteral,
	TNull,
	TNumber,
	TObject,
	TOptional,
	TSchema,
	TString,
	TUnion,
	TUnsafe,
} from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
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

type TUnionLiterals<T extends string[]> = T extends readonly [
	infer U extends string,
	...infer Rest extends string[],
] ? [TLiteral<U>, ...TUnionLiterals<Rest>]
	: [];

const literalSchema = Type.Union([
	Type.String(),
	Type.Number(),
	Type.Boolean(),
	Type.Null(),
]);

type Json = typeof jsonSchema;

export const jsonSchema = Type.Union([
	literalSchema,
	Type.Array(Type.Any()),
	Type.Record(Type.String(), Type.Any()),
]);

type TNullable<TType extends TSchema> = TUnion<[TType, TNull]>;

type MapInsertColumnToTypebox<
	TColumn extends Column,
	TType extends TSchema,
> = TColumn['_']['notNull'] extends false ? TOptional<TNullable<TType>>
	: TColumn['_']['hasDefault'] extends true ? TOptional<TType>
	: TType;

type MapSelectColumnToTypebox<
	TColumn extends Column,
	TType extends TSchema,
> = TColumn['_']['notNull'] extends false ? TNullable<TType> : TType;

type MapColumnToTypebox<
	TColumn extends Column,
	TType extends TSchema,
	TMode extends 'insert' | 'select',
> = TMode extends 'insert' ? MapInsertColumnToTypebox<TColumn, TType>
	: MapSelectColumnToTypebox<TColumn, TType>;

type MaybeOptional<
	TColumn extends Column,
	TType extends TSchema,
	TMode extends 'insert' | 'select',
	TNoOptional extends boolean,
> = TNoOptional extends true ? TType
	: MapColumnToTypebox<TColumn, TType, TMode>;

	type GetTypeboxType<TColumn extends Column> = TColumn['_']['dataType'] extends infer TDataType
	? TDataType extends 'custom' ? TAny
	: TDataType extends 'json' ? Json
	: TColumn extends { enumValues: [string, ...string[]] }
		? Equal<TColumn['enumValues'], [string, ...string[]]> extends true ? TString
		: TUnion<TUnionLiterals<TColumn['enumValues']>>
	: TDataType extends 'array' ? TArray<
			GetTypeboxType<
				Assume<
					TColumn['_'],
					{ baseColumn: Column }
				>['baseColumn']
			>
		>
	: TDataType extends 'bigint' ? TBigInt
	: TDataType extends 'number' ? TNumber
	: TDataType extends 'string' ? TString
	: TDataType extends 'boolean' ? TBoolean
	: TDataType extends 'date' ? TDate
	: TDataType extends 'buffer' ? TUnion<[TString, TUnsafe<Buffer>]>
	: TAny
	: never;

type ValueOrUpdater<T, TUpdaterArg> = T | ((arg: TUpdaterArg) => T);

type UnwrapValueOrUpdater<T> = T extends ValueOrUpdater<infer U, any> ? U
	: never;

export type Refine<TTable extends Table, TMode extends 'select' | 'insert'> = {
	[K in keyof TTable['_']['columns']]?: ValueOrUpdater<
		TSchema,
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
			K extends keyof TRefine ? Assume<UnwrapValueOrUpdater<TRefine[K]>, TSchema>
				: GetTypeboxType<TColumns[K]>,
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
			K extends keyof TRefine ? Assume<UnwrapValueOrUpdater<TRefine[K]>, TSchema>
				: GetTypeboxType<TTable['_']['columns'][K]>,
			'select',
			TNoOptional
		>;
	}
>;

export const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);

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
): TObject<
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
			schemaEntries[name] = Type.Optional(Nullable(schemaEntries[name]!));
		} else if (column.hasDefault) {
			schemaEntries[name] = Type.Optional(schemaEntries[name]!);
		}
	}

	return Type.Object(schemaEntries) as any;
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
): TObject<
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
			schemaEntries[name] = Nullable(schemaEntries[name]!);
		}
	}

	return Type.Object(schemaEntries) as any;
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

const uuidPattern = /^[\dA-Fa-f]{8}(?:-[\dA-Fa-f]{4}){3}-[\dA-Fa-f]{12}$/;

function mapColumnToSchema(column: Column): TSchema {
	let type: TSchema | undefined;

	if (isWithEnum(column)) {
		type = column.enumValues?.length
			? Type.Union(column.enumValues.map((value) => Type.Literal(value)))
			: Type.String();
	}

	if (!type) {
		if (column.dataType === 'custom') {
			type = Type.Any();
		} else if (column.dataType === 'json') {
			type = jsonSchema;
		} else if (column.dataType === 'array') {
			type = Type.Array(
				mapColumnToSchema((column as PgArray<any, any>).baseColumn),
			);
		} else if (column.dataType === 'number') {
			type = Type.Number();
		} else if (column.dataType === 'bigint') {
			type = Type.BigInt();
		} else if (column.dataType === 'boolean') {
			type = Type.Boolean();
		} else if (column.dataType === 'date') {
			type = Type.Date();
		} else if (column.dataType === 'string') {
			const sType = Type.String();

			if (
				(is(column, PgChar)
					|| is(column, PgVarchar)
					|| is(column, MySqlVarChar)
					|| is(column, MySqlVarBinary)
					|| is(column, MySqlChar)
					|| is(column, SQLiteText))
				&& typeof column.length === 'number'
			) {
				sType.maxLength = column.length;
			}

			type = sType;
		} else if (is(column, PgUUID)) {
			type = Type.RegEx(uuidPattern);
		}
	}

	if (!type) {
		type = Type.Any();
	}

	return type;
}
