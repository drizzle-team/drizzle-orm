import {
	TAny,
	TArray,
	TBigInt,
	TBoolean,
	TDate,
	TLiteral,
	TLiteralValue,
	TNull,
	TNumber,
	TObject,
	TOptional,
	TSchema,
	TString,
	TThis,
	TUnion,
	Type,
} from '@sinclair/typebox';
import {
	type AnyColumn,
	type Assume,
	type DrizzleTypeError,
	type Equal,
	getTableColumns,
	is,
	type Simplify,
	type Table,
	type WithEnum,
} from 'drizzle-orm';
import {
	MySqlBigInt53,
	MySqlBigInt64,
	MySqlBinary,
	MySqlBoolean,
	MySqlChar,
	MySqlCustomColumn,
	MySqlDate,
	MySqlDateString,
	MySqlDateTime,
	MySqlDateTimeString,
	MySqlDecimal,
	MySqlDouble,
	MySqlFloat,
	MySqlInt,
	MySqlJson,
	MySqlMediumInt,
	MySqlReal,
	MySqlSerial,
	MySqlSmallInt,
	MySqlText,
	MySqlTime,
	MySqlTimestamp,
	MySqlTimestampString,
	MySqlTinyInt,
	MySqlVarBinary,
	MySqlVarChar,
	MySqlYear,
} from 'drizzle-orm/mysql-core';
import {
	PgArray,
	PgBigInt53,
	PgBigInt64,
	PgBigSerial53,
	PgBigSerial64,
	PgBoolean,
	PgChar,
	PgCidr,
	PgCustomColumn,
	PgDate,
	PgDateString,
	PgDoublePrecision,
	PgInet,
	PgInteger,
	PgInterval,
	PgJson,
	PgJsonb,
	PgMacaddr,
	PgMacaddr8,
	PgNumeric,
	PgReal,
	PgSerial,
	PgSmallInt,
	PgSmallSerial,
	PgText,
	PgTime,
	PgTimestamp,
	PgUUID,
	PgVarchar,
} from 'drizzle-orm/pg-core';
import {
	SQLiteBigInt,
	SQLiteBlobJson,
	SQLiteBoolean,
	SQLiteCustomColumn,
	SQLiteInteger,
	SQLiteNumeric,
	SQLiteReal,
	SQLiteText,
	SQLiteTimestamp,
} from 'drizzle-orm/sqlite-core';

type TUnionLiterals<T extends TLiteralValue[]> = T extends readonly [
	infer U extends TLiteralValue,
	...infer Rest extends TLiteralValue[]
]
	? [TLiteral<U>, ...TUnionLiterals<Rest>]
	: [];

const literalSchema = Type.Union([
	Type.String(),
	Type.Number(),
	Type.Boolean(),
	Type.Null(),
]);

type Json =  typeof jsonSchema

export const jsonSchema = Type.Recursive((Self: TThis) =>
	Type.Union([
		literalSchema,
		Type.Array(Self),
		Type.Record(Type.String(), Self),
	])
);

type TNullable<TType extends TSchema> = TUnion<[TType, TNull]>;

type MapInsertColumnToTypebox<
	TColumn extends AnyColumn,
	TType extends TSchema
> = TColumn['_']['notNull'] extends false
	? TOptional<TNullable<TType>>
	: TColumn['_']['hasDefault'] extends true
	? TOptional<TType>
	: TType;

type MapSelectColumnToTypebox<
	TColumn extends AnyColumn,
	TType extends TSchema
> = TColumn['_']['notNull'] extends false ? TNullable<TType> : TType;

type MapColumnToTypebox<
	TColumn extends AnyColumn,
	TType extends TSchema,
	TMode extends 'insert' | 'select'
> = TMode extends 'insert'
	? MapInsertColumnToTypebox<TColumn, TType>
	: MapSelectColumnToTypebox<TColumn, TType>;

type MaybeOptional<
	TColumn extends AnyColumn,
	TType extends TSchema,
	TMode extends 'insert' | 'select',
	TNoOptional extends boolean
> = TNoOptional extends true
	? TType
	: MapColumnToTypebox<TColumn, TType, TMode>;

type GetTypeboxType<TColumn extends AnyColumn> =
	TColumn['_']['data'] extends infer TType
		? TColumn extends
				| PgCustomColumn<any>
				| SQLiteCustomColumn<any>
				| MySqlCustomColumn<any>
			? TAny
			: TColumn extends
					| PgJson<any>
					| PgJsonb<any>
					| SQLiteBlobJson<any>
					| MySqlJson<any>
			? Json
			: TColumn extends WithEnum
			? Equal<TColumn['enumValues'], [string, ...string[]]> extends true
				? TString
				: TUnion<TUnionLiterals<TColumn['enumValues']>>
			: TColumn extends PgArray<any>
			? TArray<
					GetTypeboxType<
						Assume<
							TColumn['_'],
							{ baseColumn: AnyColumn }
						>['baseColumn']
					>
			  >
			: TType extends bigint
			? TBigInt
			: TType extends number
			? TNumber
			: TType extends string
			? TString
			: TType extends boolean
			? TBoolean
			: TType extends Date
			? TDate
			: TSchema
		: never;

type ValueOrUpdater<T, TUpdaterArg> = T | ((arg: TUpdaterArg) => T);

type UnwrapValueOrUpdater<T> = T extends ValueOrUpdater<infer U, any>
	? U
	: never;

export type Refine<TTable extends Table, TMode extends 'select' | 'insert'> = {
	[K in keyof TTable['_']['columns']]?: ValueOrUpdater<
		TSchema,
		TMode extends 'select'
			? BuildSelectSchema<TTable, {}, true>
			: BuildInsertSchema<TTable, {}, true>
	>;
};

export type BuildInsertSchema<
	TTable extends Table,
	TRefine extends Refine<TTable, 'insert'> | {},
	TNoOptional extends boolean = false
> = TTable['_']['columns'] extends infer TColumns extends Record<
	string,
	AnyColumn
>
	? {
			[K in keyof TColumns & string]: MaybeOptional<
				TColumns[K],
				K extends keyof TRefine
					? Assume<UnwrapValueOrUpdater<TRefine[K]>, TSchema>
					: GetTypeboxType<TColumns[K]>,
				'insert',
				TNoOptional
			>;
	  }
	: never;

export type BuildSelectSchema<
	TTable extends Table,
	TRefine extends Refine<TTable, 'select'>,
	TNoOptional extends boolean = false
> = Simplify<{
	[K in keyof TTable['_']['columns']]: MaybeOptional<
		TTable['_']['columns'][K],
		K extends keyof TRefine
			? Assume<UnwrapValueOrUpdater<TRefine[K]>, TSchema>
			: GetTypeboxType<TTable['_']['columns'][K]>,
		'select',
		TNoOptional
	>;
}>;

export const Nullable = <T extends TSchema>(schema: T) =>
	Type.Union([schema, Type.Null()]);

export function createInsertSchema<
	TTable extends Table,
	TRefine extends Refine<TTable, 'insert'> = Refine<TTable, 'insert'>
>(
	table: TTable,
	/**
	 * @param refine Refine schema fields
	 */
	refine?: {
		[K in keyof TRefine]: K extends keyof TTable['_']['columns']
			? TRefine[K]
			: DrizzleTypeError<`Column '${K &
					string}' does not exist in table '${TTable['_']['name']}'`>;
	}
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
		})
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
									>
							  )
							: refineColumn,
					];
				})
			)
		);
	}

	for (const [name, column] of columnEntries) {
		if (!column.notNull) {
			// schemaEntries[name] = schemaEntries[name]!.nullable().optional();
			schemaEntries[name] = Type.Optional(Nullable(schemaEntries[name]!));
		} else if (column.hasDefault) {
			schemaEntries[name] = Type.Optional(schemaEntries[name]!);
		}
	}

	return Type.Object(schemaEntries) as any;
}

export function createSelectSchema<
	TTable extends Table,
	TRefine extends Refine<TTable, 'select'> = Refine<TTable, 'select'>
>(
	table: TTable,
	/**
	 * @param refine Refine schema fields
	 */
	refine?: {
		[K in keyof TRefine]: K extends keyof TTable['_']['columns']
			? TRefine[K]
			: DrizzleTypeError<`Column '${K &
					string}' does not exist in table '${TTable['_']['name']}'`>;
	}
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
		})
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
									>
							  )
							: refineColumn,
					];
				})
			)
		);
	}

	for (const [name, column] of columnEntries) {
		if (!column.notNull) {
			schemaEntries[name] = Nullable(schemaEntries[name]!);
		}
	}

	return Type.Object(schemaEntries) as any;
}

function isWithEnum(column: AnyColumn): column is typeof column & WithEnum {
	return (
		'enumValues' in column &&
		Array.isArray(column.enumValues) &&
		column.enumValues.length > 0
	);
}

const uuidPattern =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function mapColumnToSchema(column: AnyColumn): TSchema {
	let type: TSchema | undefined;

	if (isWithEnum(column)) {
		type = column.enumValues.length
			? Type.Union(column.enumValues.map((value) => Type.Literal(value)))
			: Type.String();
	}

	if (!type) {
		if (
			is(column, PgCustomColumn) ||
			is(column, SQLiteCustomColumn) ||
			is(column, MySqlCustomColumn)
		) {
			type = Type.Any();
		} else if (
			is(column, PgJson) ||
			is(column, PgJsonb) ||
			is(column, SQLiteBlobJson) ||
			is(column, MySqlJson)
		) {
			// @ts-ignore
			type = jsonSchema;
		} else if (is(column, PgArray)) {
			type = Type.Array(mapColumnToSchema(column.baseColumn));
		} else if (
			is(column, PgBigInt53) ||
			is(column, PgInteger) ||
			is(column, PgSmallInt) ||
			is(column, PgSerial) ||
			is(column, PgBigSerial53) ||
			is(column, PgSmallSerial) ||
			is(column, PgDoublePrecision) ||
			is(column, PgReal) ||
			is(column, SQLiteInteger) ||
			is(column, SQLiteReal) ||
			is(column, MySqlInt) ||
			is(column, MySqlBigInt53) ||
			is(column, MySqlDouble) ||
			is(column, MySqlFloat) ||
			is(column, MySqlMediumInt) ||
			is(column, MySqlSmallInt) ||
			is(column, MySqlTinyInt) ||
			is(column, MySqlSerial) ||
			is(column, MySqlReal) ||
			is(column, MySqlYear)
		) {
			type = Type.Number();
		} else if (
			is(column, PgBigInt64) ||
			is(column, PgBigSerial64) ||
			is(column, MySqlBigInt64) ||
			is(column, SQLiteBigInt)
		) {
			type = Type.BigInt();
		} else if (
			is(column, PgBoolean) ||
			is(column, MySqlBoolean) ||
			is(column, SQLiteBoolean)
		) {
			type = Type.Boolean();
		} else if (
			is(column, PgDate) ||
			is(column, PgTimestamp) ||
			is(column, SQLiteTimestamp) ||
			is(column, MySqlDate) ||
			is(column, MySqlDateTime) ||
			is(column, MySqlTimestamp)
		) {
			type = Type.Date();
		} else if (
			is(column, PgInterval) ||
			is(column, PgNumeric) ||
			is(column, PgChar) ||
			is(column, PgCidr) ||
			is(column, PgInet) ||
			is(column, PgMacaddr) ||
			is(column, PgMacaddr8) ||
			is(column, PgText) ||
			is(column, PgTime) ||
			is(column, PgDateString) ||
			is(column, PgVarchar) ||
			is(column, SQLiteNumeric) ||
			is(column, SQLiteText) ||
			is(column, MySqlDateString) ||
			is(column, MySqlDateTimeString) ||
			is(column, MySqlDecimal) ||
			is(column, MySqlText) ||
			is(column, MySqlTime) ||
			is(column, MySqlTimestampString) ||
			is(column, MySqlVarChar) ||
			is(column, MySqlBinary) ||
			is(column, MySqlVarBinary) ||
			is(column, MySqlChar)
		) {
			let sType = Type.String();

			if (
				(is(column, PgChar) ||
					is(column, PgVarchar) ||
					is(column, MySqlVarChar) ||
					is(column, MySqlVarBinary) ||
					is(column, MySqlChar) ||
					is(column, SQLiteText)) &&
				typeof column.length === 'number'
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
