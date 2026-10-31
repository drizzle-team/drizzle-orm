import type { Table, View } from 'drizzle-orm';
import type { PgEnum } from 'drizzle-orm/pg-core';
import type { z } from 'zod/v4';
import type { BuildRefine, BuildSchema, NoUnknownKeys } from './schema.types.internal.ts';

export type ZodInstance = typeof z;

export type SchemaType = 'select' | 'insert' | 'update';

type GetColumnsForRefine<
	TTable extends Table,
	TType extends SchemaType,
	TPick extends string | undefined,
	TOmit extends string | undefined,
> = TPick extends string ? Pick<TTable['_']['columns'], TPick & keyof TTable['_']['columns']>
	: TOmit extends string ? Omit<TTable['_']['columns'], TOmit & keyof TTable['_']['columns']>
	: TType extends 'select' ? TTable['_']['columns']
	: Pick<TTable['_']['columns'], keyof TTable['$inferInsert']>;

interface CreateSchemaOptionsBase<
	TColumns extends Record<string, any>,
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
	TRefine extends BuildRefine<TColumns, TCoerce>,
> {
	type: SchemaType;
	allOptional?: boolean;
	allNullable?: boolean;
	refine?: NoUnknownKeys<TRefine, { [K in keyof TColumns]: any }>;
}

interface CreateSchemaOptionsWithPick<
	TColumns extends string,
	TAllColumns extends Record<string, any>,
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
	TRefine extends BuildRefine<Pick<TAllColumns, TColumns & keyof TAllColumns>, TCoerce>,
> extends CreateSchemaOptionsBase<Pick<TAllColumns, TColumns & keyof TAllColumns>, TCoerce, TRefine> {
	pick: TColumns[];
	omit?: never;
}

interface CreateSchemaOptionsWithOmit<
	TColumns extends string,
	TAllColumns extends Record<string, any>,
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
	TRefine extends BuildRefine<Omit<TAllColumns, TColumns & keyof TAllColumns>, TCoerce>,
> extends CreateSchemaOptionsBase<Omit<TAllColumns, TColumns & keyof TAllColumns>, TCoerce, TRefine> {
	pick?: never;
	omit: TColumns[];
}

interface CreateSchemaOptionsNoFilter<
	TAllColumns extends Record<string, any>,
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
	TRefine extends BuildRefine<TAllColumns, TCoerce>,
> extends CreateSchemaOptionsBase<TAllColumns, TCoerce, TRefine> {
	pick?: never;
	omit?: never;
}

export type CreateTableSchemaOptions<
	TTable extends Table,
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
> =
	| CreateSchemaOptionsWithPick<
		keyof TTable['$inferSelect'] & string,
		TTable['_']['columns'],
		TCoerce,
		BuildRefine<TTable['_']['columns'], TCoerce>
	>
	| CreateSchemaOptionsWithOmit<
		keyof TTable['$inferSelect'] & string,
		TTable['_']['columns'],
		TCoerce,
		BuildRefine<TTable['_']['columns'], TCoerce>
	>
	| CreateSchemaOptionsNoFilter<TTable['_']['columns'], TCoerce, BuildRefine<TTable['_']['columns'], TCoerce>>;

export interface CreateViewSchemaOptions<
	TView extends View,
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
> {
	type?: 'select';
	allOptional?: boolean;
	allNullable?: boolean;
	refine?: NoUnknownKeys<
		BuildRefine<TView['_']['selectedFields'], TCoerce>,
		{ [K in keyof TView['$inferSelect']]: any }
	>;
}

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
