import { Column } from 'drizzle-orm';
import { ColumnData, ColumnHasDefault, ColumnNotNull, TableName, Unwrap } from 'drizzle-orm/branded-types';
import { ColumnBuilder } from 'drizzle-orm/column-builder';
import { Simplify } from 'type-fest';

import { PgColumnDriverParam } from '~/branded-types';
import { AnyForeignKey, ForeignKeyBuilder, UpdateDeleteAction } from '~/foreign-keys';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable } from '~/table';

export interface ReferenceConfig<TData extends ColumnData> {
	ref: () => AnyPgColumn<any, TData>;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class PgColumnBuilder<
	TData extends ColumnData,
	TDriverParam extends PgColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends ColumnBuilder<TData, TDriverParam, TNotNull, THasDefault> {
	private foreignKeyConfigs: ReferenceConfig<TData>[] = [];

	constructor(name: string) {
		super(name);
	}

	override notNull(): PgColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.notNull() as ReturnType<this['notNull']>;
	}

	override default(
		value: Unwrap<TData> | AnyPgSQL,
	): PgColumnBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>> {
		return super.default(value) as ReturnType<this['default']>;
	}

	override primaryKey(): PgColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.primaryKey() as ReturnType<this['primaryKey']>;
	}

	references(
		ref: ReferenceConfig<TData>['ref'],
		actions: ReferenceConfig<TData>['actions'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	/** @internal */
	buildForeignKeys(column: AnyPgColumn, table: AnyPgTable): AnyForeignKey[] {
		return this.foreignKeyConfigs.map(({ ref, actions }) => {
			const builder = new ForeignKeyBuilder(() => {
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
		table: AnyPgTable<TTableName>,
	): PgColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>;
}

export type AnyPgColumnBuilder = PgColumnBuilder<ColumnData, PgColumnDriverParam, ColumnNotNull, ColumnHasDefault>;

export abstract class PgColumn<
	TTableName extends TableName<string>,
	TData extends ColumnData,
	TDriverParam extends PgColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends Column<TTableName, TData, TDriverParam, TNotNull, THasDefault> {
	constructor(
		override readonly table: AnyPgTable<TTableName>,
		builder: PgColumnBuilder<TData, TDriverParam, TNotNull, THasDefault>,
	) {
		super(table, builder);
	}

	unsafe(): AnyPgColumn {
		return this;
	}
}

export type AnyPgColumn<
	TTableName extends TableName = any,
	TData extends ColumnData = any,
	TDriverParam extends PgColumnDriverParam = PgColumnDriverParam,
	TNotNull extends ColumnNotNull = any,
	THasDefault extends ColumnHasDefault = any,
> = PgColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>;

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

export type ChangeColumnTable<TColumn extends AnyPgColumn, TAlias extends TableName> = TColumn extends
	PgColumn<any, infer TData, infer TDriverParam, infer TNotNull, infer THasDefault> ? PgColumn<
		TAlias,
		TData,
		TDriverParam,
		TNotNull,
		THasDefault
	>
	: never;
