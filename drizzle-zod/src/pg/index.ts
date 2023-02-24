import { GetColumnConfig } from 'drizzle-orm';
import {
	AnyPgColumn,
	AnyPgTable,
	GetTableConfig,
	PgBigInt53,
	PgBigInt64,
	PgBigSerial53,
	PgBigSerial64,
	PgBoolean,
	PgDate,
	PgDoublePrecision,
	PgEnumColumn,
	PgEnumColumnConfig,
	PgInteger,
	PgInterval,
	PgNumeric,
	PgReal,
	PgSerial,
	PgSmallInt,
	PgSmallSerial,
	PgText,
	PgTextConfig,
	PgTime,
	PgTimestamp,
	PgUUID,
	PgVarchar,
} from 'drizzle-orm/pg-core';
import { getTableColumns } from 'drizzle-orm/pg-core/utils';
import { Assume, Simplify } from 'drizzle-orm/utils';
import { z } from 'zod';

type MaybeOptional<TColumn extends AnyPgColumn, TType extends z.ZodTypeAny, TNoOptional extends boolean = false> =
	TNoOptional extends true ? TType
		: GetColumnConfig<TColumn, 'hasDefault'> extends true ? z.ZodOptional<TType>
		: TType;

type GetZodType<TColumn extends AnyPgColumn> = GetColumnConfig<TColumn, 'data'> extends infer TType
	? TColumn extends PgEnumColumn<PgEnumColumnConfig & { values: infer TValues extends [string, ...string[]] }>
		? z.ZodEnum<TValues>
	: TType extends number ? z.ZodNumber
	: TType extends string ? z.ZodString
	: TType extends boolean ? z.ZodBoolean
	: TType extends Date ? z.ZodDate
	: z.ZodAny
	: never;

type IsUnion<T, U = T> = T extends T ? [U] extends [T] ? false : true : true;

type ValueOrUpdater<T, TUpdaterArg> = T | ((arg: TUpdaterArg) => T);

type UnwrapValueOrUpdater<T> = T extends ValueOrUpdater<infer T, any> ? T : never;

export type Refine<TTable extends AnyPgTable> = GetTableConfig<TTable, 'columns'> extends
	infer TColumns extends Record<string, AnyPgColumn> ? {
		[K in keyof TColumns & string]?: ValueOrUpdater<
			TColumns[K] extends PgText<PgTextConfig & { data: infer TData extends string }>
				? IsUnion<TData> extends true ? z.ZodEnum<[TData, ...TData[]]>
				: GetZodType<TColumns[K]>
				: GetZodType<TColumns[K]>,
			BuildInsertSchema<TTable, {}, true>[K]
		>;
	}
	: never;

export type BuildInsertSchema<
	TTable extends AnyPgTable,
	TRefine extends Refine<TTable> | {},
	TNoOptional extends boolean = false,
> = GetTableConfig<TTable, 'columns'> extends infer TColumns extends Record<string, AnyPgColumn> ? {
		[K in keyof TColumns & string]: MaybeOptional<
			TColumns[K],
			(K extends keyof TRefine
				? (UnwrapValueOrUpdater<TRefine[K]> extends z.ZodTypeAny ? UnwrapValueOrUpdater<TRefine[K]> : never)
				: GetZodType<TColumns[K]>),
			TNoOptional
		>;
	}
	: never;

export type GetRequiredConfigFields<T extends AnyPgTable> = GetTableConfig<T, 'columns'> extends
	infer TColumns extends Record<string, AnyPgColumn> ? {
		[K in keyof TColumns]: TColumns[K] extends PgText<PgTextConfig & { values: infer TValues }>
			? [string, ...string[]] extends TValues ? never : TValues
			: never;
	}
	: never;

export type RequiredFieldsConfig<
	TTable extends AnyPgTable,
> = Simplify<
	{
		[K in keyof GetRequiredConfigFields<TTable> as [GetRequiredConfigFields<TTable>[K]] extends [never] ? never : K]: {
			anyString: true;
		} | { enum: GetRequiredConfigFields<TTable>[K] };
	}
>;

export function createInsertSchema<TTable extends AnyPgTable>(
	table: TTable,
): z.ZodObject<BuildInsertSchema<TTable, {}>>;
export function createInsertSchema<
	TTable extends AnyPgTable,
	TRefine extends {
		[K in keyof Refine<TTable>]: K extends keyof GetTableConfig<TTable, 'columns'> ? Refine<TTable>[K]
			: never;
	},
>(
	table: TTable,
	/**
	 * @param refine Refine schema fields
	 */
	refine: TRefine,
): z.ZodObject<BuildInsertSchema<TTable, TRefine>>;
export function createInsertSchema<
	TTable extends AnyPgTable,
	TRefine extends Refine<TTable> | {} = {},
>(
	table: TTable,
	/**
	 * @param refine Refine schema fields
	 */
	refine?:
		| { [K in keyof TRefine]: K extends keyof GetTableConfig<TTable, 'columns'> ? TRefine[K] : never }
		| (
			(
				fields: BuildInsertSchema<TTable, {}, true>,
			) => { [K in keyof TRefine]: K extends keyof GetTableConfig<TTable, 'columns'> ? TRefine[K] : never }
		),
): z.ZodObject<BuildInsertSchema<TTable, TRefine>> {
	const columns = getTableColumns(table);
	const columnEntries = Object.entries(columns);

	let schemaEntries = Object.fromEntries(columnEntries.map(([name, column]) => {
		let type: z.ZodTypeAny | undefined;

		if (
			column instanceof PgBigInt53 || column instanceof PgInteger || column instanceof PgSmallInt
			|| column instanceof PgSerial || column instanceof PgBigSerial53 || column instanceof PgSmallSerial
			|| column instanceof PgDoublePrecision || column instanceof PgReal
		) {
			type = z.number();
		} else if (column instanceof PgBigInt64 || column instanceof PgBigSerial64) {
			type = z.bigint();
		} else if (column instanceof PgBoolean) {
			type = z.boolean();
		} else if (column instanceof PgDate || column instanceof PgTimestamp) {
			type = z.date();
		} else if (column instanceof PgEnumColumn) {
			type = z.enum(column.enum.enumValues as [string, ...string[]]);
		} else if (
			column instanceof PgInterval || column instanceof PgNumeric || column instanceof PgText
			|| column instanceof PgTime || column instanceof PgVarchar
		) {
			type = z.string();
		} else if (column instanceof PgUUID) {
			type = z.string().uuid();
		}

		if (!type) {
			type = z.any();
		}

		return [name, type];
	}));

	if (refine) {
		schemaEntries = Object.assign(
			schemaEntries,
			typeof refine === 'function' ? refine(schemaEntries as BuildInsertSchema<TTable, {}, true>) : refine,
		);
	}

	columnEntries.forEach(([name, column]) => {
		if (column.hasDefault) {
			schemaEntries[name] = schemaEntries[name]!.optional();
		}
	});

	return z.object(schemaEntries) as z.ZodObject<BuildInsertSchema<TTable, TRefine>>;
}
