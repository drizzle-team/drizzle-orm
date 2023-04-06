import { type AnyColumn, type Table } from 'drizzle-orm';
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
	PgDoublePrecision,
	PgEnumColumn,
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
	SQLiteBlobJson,
	SQLiteCustomColumn,
	SQLiteInteger,
	SQLiteNumeric,
	SQLiteReal,
	SQLiteText,
	SQLiteTimestamp,
} from 'drizzle-orm/sqlite-core';
import {
	type Assume,
	type DrizzleTypeError,
	type Equal,
	getTableColumns,
	type Or,
	type Simplify,
} from 'drizzle-orm/utils';
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
	? TColumn extends PgCustomColumn<any> | SQLiteCustomColumn<any> ? z.ZodAny
	: TColumn extends PgJson<any> | PgJsonb<any> | SQLiteBlobJson<any> ? z.ZodType<Json>
	: TColumn['_']['config'] extends { enum: [string, ...string[]] } ? Or<
			Equal<[string, ...string[]], TColumn['_']['config']['enum']>,
			Equal<string[], TColumn['_']['config']['enum']>
		> extends true ? z.ZodString : z.ZodEnum<TColumn['_']['config']['enum']>
	: TColumn extends PgArray<any> ? z.ZodArray<GetZodType<Assume<TColumn['_'], { baseColumn: AnyColumn }>['baseColumn']>>
	: TType extends number ? z.ZodNumber
	: TType extends string ? z.ZodString
	: TType extends boolean ? z.ZodBoolean
	: TType extends Date ? z.ZodDate
	: z.ZodAny
	: never;

type ValueOrUpdater<T, TUpdaterArg> = T | ((arg: TUpdaterArg) => T);

type UnwrapValueOrUpdater<T> = T extends ValueOrUpdater<infer T, any> ? T : never;

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
	TRefine extends Refine<TTable, 'select'> | {},
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
	TRefine extends Refine<TTable, 'insert'> = {},
>(
	table: TTable,
	/**
	 * @param refine Refine schema fields
	 */
	refine?: {
		[K in keyof TRefine]: K extends keyof TTable['_']['columns'] ? TRefine[K]
			: DrizzleTypeError<`Column '${K & string}' does not exist in table '${TTable['_']['name']}'`>;
	},
): z.ZodObject<BuildInsertSchema<TTable, TRefine>> {
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

	columnEntries.forEach(([name, column]) => {
		if (!column.notNull) {
			schemaEntries[name] = schemaEntries[name]!.nullable().optional();
		} else if (column.hasDefault) {
			schemaEntries[name] = schemaEntries[name]!.optional();
		}
	});

	return z.object(schemaEntries) as z.ZodObject<BuildInsertSchema<TTable, TRefine>>;
}

export function createSelectSchema<
	TTable extends Table,
	TRefine extends Refine<TTable, 'select'> = {},
>(
	table: TTable,
	/**
	 * @param refine Refine schema fields
	 */
	refine?: {
		[K in keyof TRefine]: K extends keyof TTable['_']['columns'] ? TRefine[K]
			: DrizzleTypeError<`Column '${K & string}' does not exist in table '${TTable['_']['name']}'`>;
	},
): z.ZodObject<BuildSelectSchema<TTable, TRefine>> {
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

	columnEntries.forEach(([name, column]) => {
		if (!column.notNull) {
			schemaEntries[name] = schemaEntries[name]!.nullable();
		}
	});

	return z.object(schemaEntries) as z.ZodObject<BuildSelectSchema<TTable, TRefine>>;
}

function mapColumnToSchema(column: AnyColumn): z.ZodTypeAny {
	let type: z.ZodTypeAny | undefined;

	if ('enum' in column) {
		const _enum = (column as unknown as { enum: [string, ...string[]] }).enum;
		if (_enum.length) {
			type = z.enum(_enum);
		} else {
			type = z.string();
		}
	}

	if (!type) {
		if (column instanceof PgCustomColumn || column instanceof SQLiteCustomColumn) {
			type = z.any();
		} else if (column instanceof PgJson || column instanceof PgJsonb || column instanceof SQLiteBlobJson) {
			type = jsonSchema;
		} else if (column instanceof PgArray) {
			type = z.array(mapColumnToSchema(column.baseColumn));
		} else if (
			column instanceof PgBigInt53 || column instanceof PgInteger || column instanceof PgSmallInt
			|| column instanceof PgSerial || column instanceof PgBigSerial53 || column instanceof PgSmallSerial
			|| column instanceof PgDoublePrecision || column instanceof PgReal || column instanceof SQLiteInteger
			|| column instanceof SQLiteReal
		) {
			type = z.number();
		} else if (column instanceof PgBigInt64 || column instanceof PgBigSerial64) {
			type = z.bigint();
		} else if (column instanceof PgBoolean) {
			type = z.boolean();
		} else if (column instanceof PgDate || column instanceof PgTimestamp || column instanceof SQLiteTimestamp) {
			type = z.date();
		} else if (column instanceof PgEnumColumn) {
			type = z.enum(column.enum.enumValues as [string, ...string[]]);
		} else if (
			column instanceof PgInterval || column instanceof PgNumeric || column instanceof PgChar
			|| column instanceof PgCidr || column instanceof PgInet || column instanceof PgMacaddr
			|| column instanceof PgMacaddr8
			|| column instanceof PgText || column instanceof PgTime || column instanceof PgVarchar
			|| column instanceof SQLiteNumeric || column instanceof SQLiteText
		) {
			type = z.string();
		} else if (column instanceof PgUUID) {
			type = z.string().uuid();
		}
	}

	if (!type) {
		type = z.any();
	}

	return type;
}
