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

type SnakeToCamelCase<S extends string> = S extends `${infer T}${'_' | '-'}${infer U}`
	? `${T}${Capitalize<SnakeToCamelCase<U>>}`
	: S;

type ToSnakeCase<S extends string> = S extends `${infer T}${'' | '-'}${infer U}`
	? `${T extends Capitalize<T> ? Lowercase<T> extends Capitalize<T> ? '' : '_' : ''}${Lowercase<T>}${ToSnakeCase<U>}`
	: S;

function toCamelCase(value: string): string {
	return value.replace(/([-_][a-z])/gi, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''));
}

function toSnakeCase(value: string): string {
	return value.replace(/([A-Z])/g, ($1) => `_${$1.toLowerCase()}`);
}

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

type ConvertKeyName<K extends string, TCase extends 'snake' | 'camel' | undefined> = undefined extends TCase ? K
	: 'snake' extends TCase ? ToSnakeCase<K>
	: SnakeToCamelCase<K>;

export type BuildInsertSchema<
	TTable extends AnyPgTable,
	TCase extends 'snake' | 'camel' | undefined,
	TRefine extends Record<string, z.ZodTypeAny | undefined>,
	TNoOptional extends boolean = false,
> = TTable['_']['columns'] extends infer TColumns extends Record<string, AnyPgColumn> ? {
		[K in keyof TColumns & string as ConvertKeyName<K, TCase>]: MaybeOptional<
			TColumns[K],
			ConvertKeyName<K, TCase> extends keyof TRefine
				? TRefine[ConvertKeyName<K, TCase>] extends z.ZodTypeAny ? TRefine[ConvertKeyName<K, TCase>]
				: GetZodType<TColumns[K]>
				: GetZodType<TColumns[K]>,
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

export type Refine<
	TTable extends AnyPgTable,
	TCase extends 'snake' | 'camel' | undefined,
	TRefine extends {
		[K in keyof BuildInsertSchema<TTable, TCase, {}>]?: z.ZodTypeAny;
	},
> =
	| { [K in keyof TRefine]: K extends keyof BuildInsertSchema<TTable, TCase, {}> ? TRefine[K] : never }
	| ((
		fields: BuildInsertSchema<TTable, TCase, {}, true>,
	) => { [K in keyof TRefine]: K extends keyof BuildInsertSchema<TTable, TCase, {}> ? TRefine[K] : never });

export function createInsertSchema<TTable extends AnyPgTable>(
	table: TTable,
): z.ZodObject<BuildInsertSchema<TTable, undefined, {}>>;
export function createInsertSchema<
	TTable extends AnyPgTable,
	TCase extends 'snake' | 'camel',
>(
	table: TTable,
	/**
	 * @param convertToCase Convert keys to snake_case or camelCase
	 */
	convertToCase: TCase,
): z.ZodObject<BuildInsertSchema<TTable, TCase, {}>>;
export function createInsertSchema<
	TTable extends AnyPgTable,
	TRefine extends {
		[K in keyof BuildInsertSchema<TTable, undefined, {}>]?: z.ZodTypeAny;
	},
>(
	table: TTable,
	/**
	 * @param refine Refine schema fields
	 */
	refine: Refine<TTable, undefined, TRefine>,
): z.ZodObject<BuildInsertSchema<TTable, undefined, TRefine>>;
export function createInsertSchema<
	TTable extends AnyPgTable,
	TCase extends 'snake' | 'camel',
	TRefine extends {
		[K in keyof BuildInsertSchema<TTable, TCase, {}>]?: z.ZodTypeAny;
	},
>(
	table: TTable,
	/**
	 * @param convertToCase convert keys to snake_case or camelCase
	 */
	convertToCase: TCase,
	/**
	 * @param refine Refine schema fields
	 */
	refine: Refine<TTable, TCase, TRefine>,
): z.ZodObject<BuildInsertSchema<TTable, TCase, TRefine>>;
export function createInsertSchema<
	TTable extends AnyPgTable,
	TCase extends 'snake' | 'camel',
	TRefine extends {
		[K in keyof BuildInsertSchema<TTable, TCase, {}>]?: z.ZodTypeAny;
	},
>(
	table: AnyPgTable,
	...rest: [] | [TCase] | [Refine<TTable, TCase, TRefine>] | [TCase, Refine<TTable, TCase, TRefine>]
): z.AnyZodObject {
	const { convertToCase, refine } = (() => {
		if (rest.length === 0) {
			return { convertToCase: undefined, refine: undefined };
		}

		if (rest.length === 1) {
			if (typeof rest[0] === 'string') {
				return { convertToCase: rest[0], refine: undefined };
			}

			return { convertToCase: undefined, refine: rest[0] };
		}

		return { convertToCase: rest[0], refine: rest[1] };
	})();

	const columns = getTableColumns(table);
	const columnEntries = Object.entries(columns);
	const fieldNamesMap: Record<string, string> = {};

	let schemaEntries = Object.fromEntries(columnEntries.map(([name, column]) => {
		let type: z.ZodTypeAny | undefined;

		if ('enum' in column) {
			const _enum = (column as unknown as { enum: [string, ...string[]] }).enum;
			if (Array.isArray(_enum)) {
				type = z.enum(_enum);
			} else {
				type = z.enum(_enum);
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

		fieldNamesMap[name] = convertToCase === 'camel'
			? toCamelCase(name)
			: convertToCase === 'snake'
			? toSnakeCase(name)
			: name;

		return [
			fieldNamesMap[name],
			type,
		];
	}));

	if (refine) {
		schemaEntries = Object.assign(
			schemaEntries,
			typeof refine === 'function' ? refine(schemaEntries) : refine,
		);
	}

	columnEntries.forEach(([name, column]) => {
		if (column.hasDefault) {
			schemaEntries[fieldNamesMap[name]!] = schemaEntries[fieldNamesMap[name]!].optional();
		}
	});

	return z.object(schemaEntries);
}
