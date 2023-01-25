import { Column, ColumnBaseConfig } from '~/column';
import { ColumnBuilder, ColumnBuilderBaseConfig, ColumnBuilderWithConfig, UpdateCBConfig } from '~/column-builder';
import { SQL } from '~/sql';
import { Update } from '~/utils';
import { Simplify } from '~/utils';

import { ForeignKey, ForeignKeyBuilder, UpdateDeleteAction } from '~/sqlite-core/foreign-keys';
import { AnySQLiteTable } from '~/sqlite-core/table';

export interface ReferenceConfig {
	ref: () => AnySQLiteColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class SQLiteColumnBuilder<
	T extends Partial<ColumnBuilderBaseConfig>,
	TConfig extends Record<string, unknown> = {},
> extends ColumnBuilder<T, TConfig> {
	private foreignKeyConfigs: ReferenceConfig[] = [];

	constructor(name: string) {
		super(name);
	}

	override notNull(): SQLiteColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.notNull() as ReturnType<this['notNull']>;
	}

	override default(value: T['data'] | SQL): SQLiteColumnBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		return super.default(value) as ReturnType<this['default']>;
	}

	override primaryKey(): SQLiteColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.primaryKey() as ReturnType<this['primaryKey']>;
	}

	references(
		ref: ReferenceConfig['ref'],
		actions: ReferenceConfig['actions'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	/** @internal */
	buildForeignKeys(column: AnySQLiteColumn, table: AnySQLiteTable): ForeignKey[] {
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
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteColumn<Pick<T, keyof ColumnBuilderBaseConfig> & { tableName: TTableName }>;
}

export type AnySQLiteColumnBuilder<TPartial extends Partial<ColumnBuilderBaseConfig> = {}> = SQLiteColumnBuilder<
	Update<ColumnBuilderBaseConfig, TPartial>
>;

// To understand how to use `SQLiteColumn` and `AnySQLiteColumn`, see `Column` and `AnyColumn` documentation.
export abstract class SQLiteColumn<T extends Partial<ColumnBaseConfig>> extends Column<T> {
	declare protected $pgBrand: 'SQLiteColumn';
	protected abstract $sqliteColumnBrand: string;

	constructor(
		override readonly table: AnySQLiteTable<{ name: T['tableName'] }>,
		config: SQLiteColumnBuilder<Omit<T, 'tableName'>>['config'],
	) {
		super(table, config);
	}

	unsafe(): AnySQLiteColumn {
		return this as AnySQLiteColumn;
	}
}

export type AnySQLiteColumn<TPartial extends Partial<ColumnBaseConfig> = {}> = SQLiteColumn<
	Update<ColumnBaseConfig, TPartial>
>;

export type BuildColumn<
	TTableName extends string,
	TBuilder extends AnySQLiteColumnBuilder,
> = TBuilder extends ColumnBuilderWithConfig<infer T> ? SQLiteColumn<Simplify<T & { tableName: TTableName }>> : never;

export type BuildColumns<
	TTableName extends string,
	TConfigMap extends Record<string, AnySQLiteColumnBuilder>,
> = Simplify<
	{
		[Key in keyof TConfigMap]: BuildColumn<TTableName, TConfigMap[Key]>;
	}
>;

export type ChangeColumnTableName<TColumn extends AnySQLiteColumn, TAlias extends string> = TColumn extends
	SQLiteColumn<infer T> ? SQLiteColumn<Simplify<Omit<T, 'tableName'> & { tableName: TAlias }>>
	: never;
