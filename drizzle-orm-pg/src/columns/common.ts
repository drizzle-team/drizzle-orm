import { Column, ColumnBaseConfig, UpdateColumnConfig } from 'drizzle-orm';
import { ColumnBuilder, ColumnBuilderBaseConfig, UpdateColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { SQL } from 'drizzle-orm/sql';
import { Simplify } from 'type-fest';

import { AnyForeignKey, ForeignKeyBuilder, UpdateDeleteAction } from '~/foreign-keys';

import { AnyPgTable } from '..';

export interface ReferenceConfig<TData> {
	ref: () => AnyPgColumn<{ data: TData }>;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class PgColumnBuilder<T extends ColumnBuilderBaseConfig> extends ColumnBuilder<T>
	implements ColumnBuilder<T>
{
	declare protected pgFoo: 'bar';

	private foreignKeyConfigs: ReferenceConfig<T['data']>[] = [];

	constructor(name: string) {
		super(name);
	}

	override notNull(): PgColumnBuilder<UpdateColumnBuilderConfig<T, { notNull: true }>> {
		return super.notNull() as any;
	}

	override default(
		value: T['data'] | SQL,
	): PgColumnBuilder<UpdateColumnBuilderConfig<T, { hasDefault: true }>> {
		return super.default(value) as any;
	}

	override primaryKey(): PgColumnBuilder<UpdateColumnBuilderConfig<T, { notNull: true }>> {
		return super.primaryKey() as any;
	}

	references(
		ref: ReferenceConfig<T['data']>['ref'],
		actions: ReferenceConfig<T['data']>['actions'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	/** @internal */
	buildForeignKeys(column: AnyPgColumn, table: AnyPgTable): AnyForeignKey[] {
		return this.foreignKeyConfigs.map(({ ref, actions }) => {
			return ((ref, actions) => {
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
			})(ref, actions);
		});
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgColumn<T & { tableName: TTableName }>;
}

export type AnyPgColumnBuilder<TPartial extends Partial<ColumnBuilderBaseConfig> = {}> = Omit<
	PgColumnBuilder<
		UpdateColumnBuilderConfig<ColumnBuilderBaseConfig, TPartial>
	>,
	'notNull' | 'default' | 'primaryKey' | 'references'
>;

// To understand how to use `PgColumn` and `AnyPgColumn`, see `Column` and `AnyColumn` documentation.
export abstract class PgColumn<T extends ColumnBaseConfig> extends Column<T> {
	declare protected $pgBrand: 'PgColumn';
	protected abstract $pgColumnBrand: string;

	constructor(
		override readonly table: AnyPgTable<{ name: T['tableName'] }>,
		builder: PgColumnBuilder<Omit<T, 'tableName'>>,
	) {
		super(table, builder);
	}

	unsafe(): AnyPgColumn {
		return this;
	}
}

export type AnyPgColumn<TPartial extends Partial<ColumnBaseConfig> = {}> = PgColumn<
	UpdateColumnConfig<ColumnBaseConfig, TPartial>
>;

export type BuildPgColumn<
	TTableName extends string,
	TBuilder extends AnyPgColumnBuilder,
> = TBuilder extends PgColumnBuilder<infer T> ? PgColumn<Simplify<T & { tableName: TTableName }>> : never;

export type BuildPgColumns<
	TTableName extends string,
	TConfigMap extends Record<string, AnyPgColumnBuilder>,
> = Simplify<
	{
		[Key in keyof TConfigMap]: BuildPgColumn<TTableName, TConfigMap[Key]>;
	}
>;

export type ChangeColumnTableName<TColumn extends AnyPgColumn, TAlias extends string> = TColumn extends
	PgColumn<infer T> ? PgColumn<Simplify<UpdateColumnConfig<T, { tableName: TAlias }>>>
	: never;
