import { Column, ColumnBaseConfig } from '~/column';
import { ColumnBuilder, ColumnBuilderBaseConfig, ColumnBuilderWithConfig, UpdateCBConfig } from '~/column-builder';
import { SQL } from '~/sql';
import { Update } from '~/utils';
import { Simplify } from '~/utils';

import { ForeignKey, ForeignKeyBuilder, UpdateDeleteAction } from '~/mysql-core/foreign-keys';
import { AnyMySqlTable } from '~/mysql-core/table';

export interface ReferenceConfig {
	ref: () => AnyMySqlColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class MySqlColumnBuilder<
	T extends Partial<ColumnBuilderBaseConfig>,
	TConfig extends Record<string, unknown> = {},
> extends ColumnBuilder<T, TConfig> {
	private foreignKeyConfigs: ReferenceConfig[] = [];

	constructor(name: string) {
		super(name);
	}

	override notNull(): MySqlColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.notNull() as any;
	}

	override default(value: T['data'] | SQL): MySqlColumnBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		return super.default(value) as any;
	}

	override primaryKey(): MySqlColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
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
	buildForeignKeys(column: AnyMySqlColumn, table: AnyMySqlTable): ForeignKey[] {
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
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlColumn<T & { tableName: TTableName }>;
}

export type AnyMySqlColumnBuilder<TPartial extends Partial<ColumnBuilderBaseConfig> = {}> = MySqlColumnBuilder<
	Update<ColumnBuilderBaseConfig, TPartial>
>;

// To understand how to use `MySqlColumn` and `AnyMySqlColumn`, see `Column` and `AnyColumn` documentation.
export abstract class MySqlColumn<T extends Partial<ColumnBaseConfig>> extends Column<T> {
	declare protected $mySqlBrand: 'MySqlColumn';
	protected abstract $mySqlColumnBrand: string;

	constructor(
		override readonly table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlColumnBuilder<Omit<T, 'tableName'>>['config'],
	) {
		super(table, config);
	}
}

export type AnyMySqlColumn<TPartial extends Partial<ColumnBaseConfig> = {}> = MySqlColumn<
	Update<ColumnBaseConfig, TPartial>
>;

export type BuildColumn<
	TTableName extends string,
	TBuilder extends AnyMySqlColumnBuilder,
> = TBuilder extends ColumnBuilderWithConfig<infer T> ? MySqlColumn<Simplify<T & { tableName: TTableName }>> : never;

export type BuildColumns<
	TTableName extends string,
	TConfigMap extends Record<string, AnyMySqlColumnBuilder>,
> = Simplify<
	{
		[Key in keyof TConfigMap]: BuildColumn<TTableName, TConfigMap[Key]>;
	}
>;

export type ChangeColumnTableName<TColumn extends AnyMySqlColumn, TAlias extends string> = TColumn extends
	MySqlColumn<infer T> ? MySqlColumn<Simplify<Omit<T, 'tableName'> & { tableName: TAlias }>>
	: never;

export abstract class MySqlColumnBuilderWithAutoIncrement<
	T extends Partial<ColumnBuilderBaseConfig>,
	TConfig extends Record<string, unknown> = {},
> extends MySqlColumnBuilder<T, TConfig & { autoIncrement: boolean }> {
	constructor(name: string) {
		super(name);
		this.config.autoIncrement = false;
	}

	autoincrement(): MySqlColumnBuilderWithAutoIncrement<T> {
		this.config.autoIncrement = true;
		return this as ReturnType<this['autoincrement']>;
	}
}

export abstract class MySqlColumnWithAutoIncrement<T extends Partial<ColumnBaseConfig & { autoIncrement: boolean }>>
	extends MySqlColumn<T>
{
	declare protected $autoIncrement: T['autoIncrement'];

	readonly autoIncrement: boolean;

	constructor(
		override readonly table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlColumnBuilderWithAutoIncrement<Omit<T, 'tableName'>>['config'],
	) {
		super(table, config);
		this.autoIncrement = config.autoIncrement;
	}
}
