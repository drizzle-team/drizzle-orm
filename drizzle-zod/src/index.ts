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
	SQLiteCustomColumn,
	SQLiteInteger,
	SQLiteNumeric,
	SQLiteReal,
	SQLiteText,
	SQLiteTimestamp,
} from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type Literal = z.infer<typeof literalSchema>;
type Json = Literal | { [key: string]: Json } | Json[];
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
	z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)])
);

type MapInsertColumnToZod<TColumn extends AnyColumn, TType extends z.ZodTypeAny> = TColumn['_']['notNull'] extends false
	? z.ZodOptional<z.ZodNullable<TType>>
	: TColumn['_']['hasDefault'] extends true ? z.ZodOptional<TType>
	: TType;

type MapSelectColumnToZod<TColumn extends AnyColumn, TType extends z.ZodTypeAny> = TColumn['_']['notNull'] extends false
	? z.ZodNullable<TType>
	: TType;

type MapColumnToZod<TColumn extends AnyColumn, TType extends z.ZodTypeAny, TMode extends 'insert' | 'select'> =
	TMode extends 'insert' ? MapInsertColumnToZod<TColumn, TType> : MapSelectColumnToZod<TColumn, TType>;

type MaybeOptional<
	TColumn extends AnyColumn,
	TType extends z.ZodTypeAny,
	TMode extends 'insert' | 'select',
	TNoOptional extends boolean,
> = TNoOptional extends true ? TType
	: MapColumnToZod<TColumn, TType, TMode>;

type GetZodType<TColumn extends AnyColumn> = TColumn['_']['data'] extends infer TType
	? TColumn extends PgCustomColumn<any> | SQLiteCustomColumn<any> | MySqlCustomColumn<any> ? z.ZodAny
	: TColumn extends PgJson<any> | PgJsonb<any> | SQLiteBlobJson<any> | MySqlJson<any> ? z.ZodType<Json>
	: TColumn extends WithEnum
		? Equal<TColumn['enumValues'], [string, ...string[]]> extends true ? z.ZodString : z.ZodEnum<TColumn['enumValues']>
	: TColumn extends PgArray<any> ? z.ZodArray<GetZodType<Assume<TColumn['_'], { baseColumn: AnyColumn }>['baseColumn']>>
	: TType extends bigint ? z.ZodBigInt
	: TType extends number ? z.ZodNumber
	: TType extends string ? z.ZodString
	: TType extends boolean ? z.ZodBoolean
	: TType extends Date ? z.ZodDate
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
> = TTable['_']['columns'] extends infer TColumns extends Record<string, AnyColumn> ? {
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

function isWithEnum(column: AnyColumn): column is typeof column & WithEnum {
	return 'enumValues' in column && Array.isArray(column.enumValues);
}

function mapColumnToSchema(column: AnyColumn): z.ZodTypeAny {
	let type: z.ZodTypeAny | undefined;

	if (isWithEnum(column)) {
		type = column.enumValues.length ? z.enum(column.enumValues) : z.string();
	}

	if (!type) {
		if (
			is(column, PgCustomColumn) || is(column, SQLiteCustomColumn) || is(column, MySqlCustomColumn)
		) {
			type = z.any();
		} else if (
			is(column, PgJson) || is(column, PgJsonb) || is(column, SQLiteBlobJson)
			|| is(column, MySqlJson)
		) {
			type = jsonSchema;
		} else if (is(column, PgArray)) {
			type = z.array(mapColumnToSchema(column.baseColumn));
		} else if (
			is(column, PgBigInt53) || is(column, PgInteger) || is(column, PgSmallInt)
			|| is(column, PgSerial) || is(column, PgBigSerial53) || is(column, PgSmallSerial)
			|| is(column, PgDoublePrecision) || is(column, PgReal) || is(column, SQLiteInteger)
			|| is(column, SQLiteReal) || is(column, MySqlInt) || is(column, MySqlBigInt53)
			|| is(column, MySqlDouble) || is(column, MySqlFloat) || is(column, MySqlMediumInt)
			|| is(column, MySqlSmallInt) || is(column, MySqlTinyInt) || is(column, MySqlSerial)
			|| is(column, MySqlReal) || is(column, MySqlYear)
		) {
			type = z.number();
		} else if (
			is(column, PgBigInt64) || is(column, PgBigSerial64) || is(column, MySqlBigInt64)
			|| is(column, SQLiteBigInt)
		) {
			type = z.bigint();
		} else if (is(column, PgBoolean) || is(column, MySqlBoolean)) {
			type = z.boolean();
		} else if (
			is(column, PgDate) || is(column, PgTimestamp) || is(column, SQLiteTimestamp)
			|| is(column, MySqlDate) || is(column, MySqlDateTime)
			|| is(column, MySqlTimestamp)
		) {
			type = z.date();
		} else if (
			is(column, PgInterval) || is(column, PgNumeric) || is(column, PgChar)
			|| is(column, PgCidr) || is(column, PgInet) || is(column, PgMacaddr)
			|| is(column, PgMacaddr8) || is(column, PgText) || is(column, PgTime) || is(column, PgDateString)
			|| is(column, PgVarchar) || is(column, SQLiteNumeric) || is(column, SQLiteText)
			|| is(column, MySqlDateString) || is(column, MySqlDateTimeString) || is(column, MySqlDecimal)
			|| is(column, MySqlText) || is(column, MySqlTime) || is(column, MySqlTimestampString)
			|| is(column, MySqlVarChar) || is(column, MySqlBinary)
			|| is(column, MySqlVarBinary) || is(column, MySqlChar)
		) {
			let sType = z.string();
			if (
				(is(column, PgChar) || is(column, PgVarchar) || is(column, MySqlVarChar)
					|| is(column, MySqlVarBinary) || is(column, MySqlChar) || is(column, SQLiteText))
				&& (typeof column.length === 'number')
			) {
				sType = sType.length(column.length);
			}
			type = sType;
		} else if (is(column, PgUUID)) {
			type = z.string().uuid();
		}
	}

	if (!type) {
		type = z.any();
	}

	return type;
}
