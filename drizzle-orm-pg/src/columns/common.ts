import { Column } from 'drizzle-orm';
import { ColumnData, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { ColumnBuilder } from 'drizzle-orm/column-builder';
import { Simplify } from 'type-fest';

import { PgColumnDriverParam } from '~/branded-types';
import { AnyPgTable } from '~/table';

export abstract class PgColumnBuilder<
	TData extends ColumnData,
	TDriverParam extends PgColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends ColumnBuilder<TData, TDriverParam, TNotNull, THasDefault> {
	/** @internal */
	abstract override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>;
}

export type AnyPgColumnBuilder = PgColumnBuilder<any, any, any, any>;

export abstract class PgColumn<
	TTableName extends TableName,
	TDataType extends ColumnData,
	TDriverData extends PgColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends Column<TTableName, TDataType, TDriverData, TNotNull, THasDefault> {}

export type AnyPgColumn<
	TTableName extends TableName = TableName,
> = PgColumn<TTableName, ColumnData, PgColumnDriverParam, ColumnNotNull, ColumnHasDefault>;

export type BuildPgColumn<TTableName extends TableName, TBuilder extends AnyPgColumnBuilder> = TBuilder extends
	PgColumnBuilder<
		infer TData,
		infer TDriverParam,
		infer TNotNull,
		infer THasDefault
	> ? PgColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>
	: never;

export type BuildPgColumns<
	TTableName extends TableName,
	TConfigMap extends Record<string, AnyPgColumnBuilder>,
> = Simplify<
	{
		[Key in keyof TConfigMap]: BuildPgColumn<TTableName, TConfigMap[Key]>;
	}
>;
