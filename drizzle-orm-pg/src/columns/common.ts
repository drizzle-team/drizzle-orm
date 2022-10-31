import { Column, ColumnBaseConfig } from 'drizzle-orm';
import { ColumnBuilder, ColumnBuilderBaseConfig, UpdateCBConfig } from 'drizzle-orm/column-builder';
import { SQL } from 'drizzle-orm/sql';
import { Update } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { ForeignKey, ForeignKeyBuilder, UpdateDeleteAction } from '~/foreign-keys';
import { AnyPgTable } from '~/table';

export interface ReferenceConfig {
	ref: () => AnyPgColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class PgColumnBuilder<T extends Partial<ColumnBuilderBaseConfig>> extends ColumnBuilder<T> {
	private foreignKeyConfigs: ReferenceConfig[] = [];

	constructor(name: string) {
		super(name);
	}

	override notNull(): PgColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.notNull() as any;
	}

	override default(value: T['data'] | SQL): PgColumnBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		return super.default(value) as any;
	}

	override primaryKey(): PgColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.primaryKey() as any;
	}

	references(
		ref: ReferenceConfig['ref'],
		actions: ReferenceConfig['actions'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	/** @internal */
	buildForeignKeys(column: AnyPgColumn, table: AnyPgTable): ForeignKey[] {
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

export type AnyPgColumnBuilder<TPartial extends Partial<ColumnBuilderBaseConfig> = {}> = PgColumnBuilder<
	Update<ColumnBuilderBaseConfig, TPartial>
>;

// To understand how to use `PgColumn` and `AnyPgColumn`, see `Column` and `AnyColumn` documentation.
export abstract class PgColumn<T extends Partial<ColumnBaseConfig>> extends Column<T> {
	declare protected $pgBrand: 'PgColumn';
	protected abstract $pgColumnBrand: string;

	constructor(
		override readonly table: AnyPgTable<{ name: T['tableName'] }>,
		builder: PgColumnBuilder<Omit<T, 'tableName'>>,
	) {
		super(table, builder);
	}

	unsafe(): AnyPgColumn {
		return this as AnyPgColumn;
	}
}

export type AnyPgColumn<TPartial extends Partial<ColumnBaseConfig> = {}> = PgColumn<
	Update<ColumnBaseConfig, TPartial>
>;

export type BuildColumn<
	TTableName extends string,
	TBuilder extends AnyPgColumnBuilder,
> = TBuilder extends PgColumnBuilder<infer T> ? PgColumn<Simplify<T & { tableName: TTableName }>> : never;

export type BuildColumns<
	TTableName extends string,
	TConfigMap extends Record<string, AnyPgColumnBuilder>,
> = Simplify<
	{
		[Key in keyof TConfigMap]: BuildColumn<TTableName, TConfigMap[Key]>;
	}
>;

export type ChangeColumnTableName<TColumn extends AnyPgColumn, TAlias extends string> = TColumn extends
	PgColumn<infer T> ? PgColumn<Simplify<Omit<T, 'tableName'> & { tableName: TAlias }>>
	: never;
