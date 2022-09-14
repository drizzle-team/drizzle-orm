import { Column } from 'drizzle-orm';
import { ColumnData, ColumnHasDefault, ColumnNotNull, TableName, Unwrap } from 'drizzle-orm/branded-types';
import { ColumnBuilder } from 'drizzle-orm/column-builder';
import { Simplify } from 'type-fest';

import { SQLiteColumnDriverParam } from '~/branded-types';
import { AnyForeignKey, AnyForeignKeyBuilder, ForeignKeyBuilder, UpdateDeleteAction } from '~/foreign-keys';
import { AnySQLiteSQL } from '~/sql';
import { AnySQLiteTable } from '~/table';

export interface ReferenceConfig<TData extends ColumnData> {
	ref: () => AnySQLiteColumn<any, TData>;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class SQLiteColumnBuilder<
	TData extends ColumnData,
	TDriverParam extends SQLiteColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends ColumnBuilder<TData, TDriverParam, TNotNull, THasDefault> {
	private foreignKeyConfigs: ReferenceConfig<TData>[] = [];

	constructor(name: string) {
		super(name);
	}

	override notNull(): SQLiteColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.notNull() as AnySQLiteColumnBuilder;
	}

	override default(
		value: Unwrap<TData> | AnySQLiteSQL,
	): SQLiteColumnBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>> {
		return super.default(value) as AnySQLiteColumnBuilder;
	}

	override primaryKey(): SQLiteColumnBuilder<
		TData,
		TDriverParam,
		ColumnNotNull<true>,
		THasDefault
	> {
		return super.primaryKey() as AnySQLiteColumnBuilder;
	}

	references(
		ref: ReferenceConfig<TData>['ref'],
		actions: ReferenceConfig<TData>['actions'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	/** @internal */
	buildForeignKeys(column: AnySQLiteColumn, table: AnySQLiteTable): AnyForeignKey[] {
		return this.foreignKeyConfigs.map(({ ref, actions }) => {
			const builder: AnyForeignKeyBuilder = new ForeignKeyBuilder(() => {
				const foreignColumn = ref();
				return { columns: [column], foreignColumns: [foreignColumn] };
			});
			if (actions.onUpdate) {
				builder.onUpdate(actions.onUpdate);
			}
			if (actions.onDelete) {
				builder.onDelete(actions.onDelete);
			}
			return builder.build(table);
		});
	}

	/** @internal */
	abstract override build<TTableName extends TableName>(
		table: AnySQLiteTable<TTableName>,
	): SQLiteColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>;
}

export type AnySQLiteColumnBuilder = SQLiteColumnBuilder<any, any, any, any>;

export abstract class SQLiteColumn<
	TTableName extends TableName<string>,
	TDataType extends ColumnData,
	TDriverData extends SQLiteColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends Column<TTableName, TDataType, TDriverData, TNotNull, THasDefault> {
	unsafe(): AnySQLiteColumn {
		return this;
	}
}

export type AnySQLiteColumn<
	TTableName extends TableName = any,
	TData extends ColumnData = any,
	TDriverParam extends SQLiteColumnDriverParam = SQLiteColumnDriverParam,
	TNotNull extends ColumnNotNull = any,
	THasDefault extends ColumnHasDefault = any,
> = SQLiteColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>;

export type BuildSQLiteColumn<
	TTableName extends TableName,
	TBuilder extends AnySQLiteColumnBuilder,
> = TBuilder extends SQLiteColumnBuilder<
	infer TData,
	infer TDriverParam,
	infer TNotNull,
	infer THasDefault
> ? SQLiteColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>
	: never;

export type BuildColumns<
	TTableName extends TableName,
	TConfigMap extends Record<string, AnySQLiteColumnBuilder>,
> = Simplify<
	{
		[Key in keyof TConfigMap]: BuildSQLiteColumn<TTableName, TConfigMap[Key]>;
	}
>;

export type ChangeColumnTable<
	TColumn extends AnySQLiteColumn,
	TAlias extends TableName,
> = TColumn extends SQLiteColumn<
	any,
	infer TData,
	infer TDriverParam,
	infer TNotNull,
	infer THasDefault
> ? SQLiteColumn<TAlias, TData, TDriverParam, TNotNull, THasDefault>
	: never;
