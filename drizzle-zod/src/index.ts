import {
	type AnyColumn,
	type Assume,
	type DrizzleTypeError,
	type Equal,
	getTableColumns,
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
	return 'enumValues' in column && Array.isArray(column.enumValues) && column.enumValues.length > 0;
}

function mapColumnToSchema(column: AnyColumn): z.ZodTypeAny {
	let type: z.ZodTypeAny | undefined;

	if (isWithEnum(column)) {
		type = column.enumValues.length ? z.enum(column.enumValues) : z.string();
	}

	if (!type) {
		if (
			column instanceof PgCustomColumn || column instanceof SQLiteCustomColumn || column instanceof MySqlCustomColumn
		) {
			type = z.any();
		} else if (
			column instanceof PgJson || column instanceof PgJsonb || column instanceof SQLiteBlobJson
			|| column instanceof MySqlJson
		) {
			type = jsonSchema;
		} else if (column instanceof PgArray) {
			type = z.array(mapColumnToSchema(column.baseColumn));
		} else if (
			column instanceof PgBigInt53 || column instanceof PgInteger || column instanceof PgSmallInt
			|| column instanceof PgSerial || column instanceof PgBigSerial53 || column instanceof PgSmallSerial
			|| column instanceof PgDoublePrecision || column instanceof PgReal || column instanceof SQLiteInteger
			|| column instanceof SQLiteReal || column instanceof MySqlInt || column instanceof MySqlBigInt53
			|| column instanceof MySqlDouble || column instanceof MySqlFloat || column instanceof MySqlMediumInt
			|| column instanceof MySqlSmallInt || column instanceof MySqlTinyInt || column instanceof MySqlSerial
			|| column instanceof MySqlReal || column instanceof MySqlYear
		) {
			type = z.number();
		} else if (
			column instanceof PgBigInt64 || column instanceof PgBigSerial64 || column instanceof MySqlBigInt64
			|| column instanceof SQLiteBigInt
		) {
			type = z.bigint();
		} else if (column instanceof PgBoolean || column instanceof MySqlBoolean || column instanceof SQLiteBoolean) {
			type = z.boolean();
		} else if (
			column instanceof PgDate || column instanceof PgTimestamp || column instanceof SQLiteTimestamp
			|| column instanceof MySqlDate || column instanceof MySqlDateTime
			|| column instanceof MySqlTimestamp
		) {
			type = z.date();
		} else if (
			column instanceof PgInterval || column instanceof PgNumeric || column instanceof PgChar
			|| column instanceof PgCidr || column instanceof PgInet || column instanceof PgMacaddr
			|| column instanceof PgMacaddr8 || column instanceof PgText || column instanceof PgTime
			|| column instanceof PgDateString
			|| column instanceof PgVarchar || column instanceof SQLiteNumeric || column instanceof SQLiteText
			|| column instanceof MySqlDateString || column instanceof MySqlDateTimeString || column instanceof MySqlDecimal
			|| column instanceof MySqlText || column instanceof MySqlTime || column instanceof MySqlTimestampString
			|| column instanceof MySqlVarChar || column instanceof MySqlBinary
			|| column instanceof MySqlVarBinary || column instanceof MySqlChar
		) {
			let sType = z.string();

			if (
				(
					column instanceof PgChar
					|| column instanceof MySqlChar
				)
				&& typeof column.length === 'number'
			) {
				sType = sType.length(column.length);
			} else if (
				(
					column instanceof PgVarchar
					|| column instanceof MySqlVarChar
					|| column instanceof SQLiteText
				)
				&& typeof column.length === 'number'
			) {
				sType = sType.max(column.length);
			}

			type = sType;
		} else if (column instanceof PgUUID) {
			type = z.string().uuid();
		}
	}

	if (!type) {
		type = z.any();
	}

	return type;
}
