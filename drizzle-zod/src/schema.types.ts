import type { Table, View } from 'drizzle-orm';
import type { PgEnum } from 'drizzle-orm/pg-core';
import type { z } from 'zod/v4';
import type { BuildRefine, BuildSchema, NoUnknownKeys } from './schema.types.internal.ts';

/** Type representing a Zod-compatible library instance */
export type ZodInstance = typeof z;

/** Mode for handling unknown keys in the schema */
export type SchemaMode = 'strip' | 'strict' | 'passthrough';

export interface CreateSelectSchema<
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
> {
	<TTable extends Table>(table: TTable): BuildSchema<'select', TTable['_']['columns'], undefined, TCoerce>;
	<
		TTable extends Table,
		TRefine extends BuildRefine<TTable['_']['columns'], TCoerce>,
	>(
		table: TTable,
		refine?: NoUnknownKeys<TRefine, TTable['$inferSelect']>,
	): BuildSchema<'select', TTable['_']['columns'], TRefine, TCoerce>;

	<TView extends View>(view: TView): BuildSchema<'select', TView['_']['selectedFields'], undefined, TCoerce>;
	<
		TView extends View,
		TRefine extends BuildRefine<TView['_']['selectedFields'], TCoerce>,
	>(
		view: TView,
		refine: NoUnknownKeys<TRefine, TView['$inferSelect']>,
	): BuildSchema<'select', TView['_']['selectedFields'], TRefine, TCoerce>;

	<TEnum extends PgEnum<any>>(enum_: TEnum): z.ZodEnum<{ [K in TEnum['enumValues'][number]]: K }>;
}

export interface CreateInsertSchema<
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
> {
	<TTable extends Table>(table: TTable): BuildSchema<'insert', TTable['_']['columns'], undefined, TCoerce>;
	<
		TTable extends Table,
		TRefine extends BuildRefine<Pick<TTable['_']['columns'], keyof TTable['$inferInsert']>, TCoerce>,
	>(
		table: TTable,
		refine?: NoUnknownKeys<TRefine, TTable['$inferInsert']>,
	): BuildSchema<'insert', TTable['_']['columns'], TRefine, TCoerce>;
}

export interface CreateUpdateSchema<
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
> {
	<TTable extends Table>(table: TTable): BuildSchema<'update', TTable['_']['columns'], undefined, TCoerce>;
	<
		TTable extends Table,
		TRefine extends BuildRefine<Pick<TTable['_']['columns'], keyof TTable['$inferInsert']>, TCoerce>,
	>(
		table: TTable,
		refine?: TRefine,
	): BuildSchema<'update', TTable['_']['columns'], TRefine, TCoerce>;
}

export interface CreateSchemaFactoryOptions<
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
> {
	/** Custom Zod instance to use for schema generation (useful for custom Zod extensions) */
	zodInstance?: ZodInstance;
	/** Enable type coercion for specific types or all types */
	coerce?: TCoerce;
	/**
	 * Mode for handling unknown keys in the schema.
	 * - 'strip': Remove unknown keys (default for standalone functions)
	 * - 'strict': Reject unknown keys - prevents mass assignment attacks (default for factory)
	 * - 'passthrough': Allow unknown keys
	 */
	mode?: SchemaMode;
	/**
	 * Apply .trim() to string schemas to prevent whitespace bypass attacks.
	 * When enabled, also trims enum values before validation.
	 * @default true when using createSchemaFactory
	 */
	trim?: boolean;
	/**
	 * Default max length for unbounded text columns (prevents DoS via large payloads).
	 * Set to `false` to disable. Only applies to columns without explicit length.
	 * @default 65535 when using createSchemaFactory
	 */
	defaultTextMaxLength?: number | false;
}
