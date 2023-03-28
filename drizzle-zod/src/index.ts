import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';
import {
	PgBigInt53,
	PgBigInt64,
	PgBigSerial53,
	PgBigSerial64,
	PgBoolean,
	PgDate,
	PgDoublePrecision,
	PgEnumColumn,
	PgInteger,
	PgInterval,
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
import { type Equal, getTableColumns, type Or, type Simplify } from 'drizzle-orm/utils';
import { z } from 'zod';

type MaybeOptional<TColumn extends AnyPgColumn, TType extends z.ZodTypeAny, TNoOptional extends boolean = false> =
	TNoOptional extends true ? TType
		: TColumn['_']['hasDefault'] extends true ? z.ZodOptional<TType>
		: TType;

type GetZodType<TColumn extends AnyPgColumn> = TColumn['_']['data'] extends infer TType
	? TColumn['_']['config'] extends { enum: [string, ...string[]] } ? Or<
			Equal<[string, ...string[]], TColumn['_']['config']['enum']>,
			Equal<string[], TColumn['_']['config']['enum']>
		> extends true ? z.ZodString : z.ZodEnum<TColumn['_']['config']['enum']>
	: TType extends number ? z.ZodNumber
	: TType extends string ? z.ZodString
	: TType extends boolean ? z.ZodBoolean
	: TType extends Date ? z.ZodDate
	: z.ZodAny
	: never;

type ValueOrUpdater<T, TUpdaterArg> = T | ((arg: TUpdaterArg) => T);

type UnwrapValueOrUpdater<T> = T extends ValueOrUpdater<infer T, any> ? T : never;

export type Refine<TTable extends AnyPgTable> = ValueOrUpdater<
	{
		[K in keyof TTable['_']['columns']]: GetZodType<TTable['_']['columns'][K]>;
	},
	BuildInsertSchema<TTable, {}, true>
>;

export type BuildInsertSchema<
	TTable extends AnyPgTable,
	TRefine extends Refine<TTable> | {},
	TNoOptional extends boolean = false,
> = TTable['_']['columns'] extends infer TColumns extends Record<string, AnyPgColumn> ? {
		[K in keyof TColumns & string]: MaybeOptional<
			TColumns[K],
			(K extends keyof TRefine
				? (UnwrapValueOrUpdater<TRefine[K]> extends z.ZodTypeAny ? UnwrapValueOrUpdater<TRefine[K]> : never)
				: GetZodType<TColumns[K]>),
			TNoOptional
		>;
	}
	: never;

// TODO: remove
export type GetRequiredConfigFields<T extends AnyPgTable> = T['_']['columns'] extends
	infer TColumns extends Record<string, AnyPgColumn> ? {
		[K in keyof TColumns]: never;
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

export function createInsertSchema<
	TTable extends AnyPgTable,
	TRefine extends Refine<TTable> | {} = {},
>(
	table: TTable,
	/**
	 * @param refine Refine schema fields
	 */
	refine?: ValueOrUpdater<TRefine, BuildInsertSchema<TTable, {}, true>>,
): z.ZodObject<BuildInsertSchema<TTable, TRefine>> {
	const columns = getTableColumns(table);
	const columnEntries = Object.entries(columns);

	let schemaEntries = Object.fromEntries(columnEntries.map(([name, column]) => {
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
