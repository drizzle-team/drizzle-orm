import type { Table, View } from 'drizzle-orm';
import type { PgEnum } from 'drizzle-orm/pg-core';
import type * as v from 'valibot';
import type { EnumValuesToEnum } from './column.types.ts';
import type { BuildRefine, BuildSchema, NoUnknownKeys } from './schema.types.internal.ts';

export interface CreateSelectSchema {
	<TTable extends Table>(table: TTable): BuildSchema<'select', TTable['_']['columns'], undefined>;
	<
		TTable extends Table,
		TRefine extends BuildRefine<TTable['_']['columns']>,
	>(
		table: TTable,
		refine?: NoUnknownKeys<TRefine, TTable['$inferSelect']>,
	): BuildSchema<'select', TTable['_']['columns'], TRefine>;

	<TView extends View>(view: TView): BuildSchema<'select', TView['_']['selectedFields'], undefined>;
	<
		TView extends View,
		TRefine extends BuildRefine<TView['_']['selectedFields']>,
	>(
		view: TView,
		refine: NoUnknownKeys<TRefine, TView['$inferSelect']>,
	): BuildSchema<'select', TView['_']['selectedFields'], TRefine>;

	<TEnum extends PgEnum<any>>(enum_: TEnum): v.EnumSchema<EnumValuesToEnum<TEnum['enumValues']>, undefined>;
}

export interface CreateInsertSchema {
	<TTable extends Table>(table: TTable): BuildSchema<'insert', TTable['_']['columns'], undefined>;
	<
		TTable extends Table,
		TRefine extends BuildRefine<Pick<TTable['_']['columns'], keyof TTable['$inferInsert']>>,
	>(
		table: TTable,
		refine?: NoUnknownKeys<TRefine, TTable['$inferInsert']>,
	): BuildSchema<'insert', TTable['_']['columns'], TRefine>;
}

export interface CreateUpdateSchema {
	<TTable extends Table>(table: TTable): BuildSchema<'update', TTable['_']['columns'], undefined>;
	<
		TTable extends Table,
		TRefine extends BuildRefine<Pick<TTable['_']['columns'], keyof TTable['$inferInsert']>>,
	>(
		table: TTable,
		refine?: TRefine,
	): BuildSchema<'update', TTable['_']['columns'], TRefine>;
}
