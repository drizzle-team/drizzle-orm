import type { Table, View } from 'drizzle-orm';
import type { PgEnum } from 'drizzle-orm/pg-core';
import type { z } from 'zod/v4';
import type { BuildRefine, BuildSchema, NoUnknownKeys } from './schema.types.internal.ts';

/** Type representing a Zod-compatible library instance */
export type ZodInstance = typeof z;

/** Schema type for unified createSchema function */
export type SchemaType = 'select' | 'insert' | 'update';

/** Options with pick (mutually exclusive with omit) */
interface CreateSchemaOptionsWithPick<TColumns extends string> {
	/** Schema type: 'select', 'insert', or 'update' */
	type: SchemaType;
	/** Columns to include in the schema */
	pick: TColumns[];
	/** Cannot be used together with pick */
	omit?: never;
	/** Make all fields optional */
	allOptional?: boolean;
	/** Make all fields nullable */
	allNullable?: boolean;
}

/** Options with omit (mutually exclusive with pick) */
interface CreateSchemaOptionsWithOmit<TColumns extends string> {
	/** Schema type: 'select', 'insert', or 'update' */
	type: SchemaType;
	/** Cannot be used together with omit */
	pick?: never;
	/** Columns to exclude from the schema */
	omit: TColumns[];
	/** Make all fields optional */
	allOptional?: boolean;
	/** Make all fields nullable */
	allNullable?: boolean;
}

/** Options without filtering */
interface CreateSchemaOptionsNoFilter {
	/** Schema type: 'select', 'insert', or 'update' */
	type: SchemaType;
	/** Not using pick/omit */
	pick?: never;
	/** Not using pick/omit */
	omit?: never;
	/** Make all fields optional */
	allOptional?: boolean;
	/** Make all fields nullable */
	allNullable?: boolean;
}

/** Options for unified createSchema function */
export type CreateSchemaOptions<TColumns extends string = string> =
	| CreateSchemaOptionsWithPick<TColumns>
	| CreateSchemaOptionsWithOmit<TColumns>
	| CreateSchemaOptionsNoFilter;

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
	zodInstance?: any;
	coerce?: TCoerce;
}
