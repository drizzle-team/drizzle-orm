import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import { Column } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig, UpdateCBConfig } from '~/column-builder';
import { ColumnBuilder } from '~/column-builder';
import type { Assume, Update } from '~/utils';

import type { ForeignKey, UpdateDeleteAction } from '~/mysql-core/foreign-keys';
import { ForeignKeyBuilder } from '~/mysql-core/foreign-keys';
import type { AnyMySqlTable } from '~/mysql-core/table';

export interface ReferenceConfig {
	ref: () => AnyMySqlColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface MySqlColumnBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlColumnBuilder<MySqlColumnBuilderHKT, Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlColumnHKT;
}

export interface MySqlColumnHKT extends ColumnHKTBase {
	_type: MySqlColumn<MySqlColumnHKT, Assume<this['config'], ColumnBaseConfig>>;
}

export abstract class MySqlColumnBuilder<
	THKT extends ColumnBuilderHKTBase,
	T extends ColumnBuilderBaseConfig,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends ColumnBuilder<THKT, T, TRuntimeConfig, TTypeConfig & { mysqlBrand: 'MySqlColumnBuilder' }> {
	private foreignKeyConfigs: ReferenceConfig[] = [];

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
	): MySqlColumn<Assume<THKT['_columnHKT'], ColumnHKTBase>, MakeColumnConfig<T, TTableName>>;
}

export type AnyMySqlColumnBuilder<TPartial extends Partial<ColumnBuilderBaseConfig> = {}> = MySqlColumnBuilder<
	MySqlColumnBuilderHKT,
	Required<Update<ColumnBuilderBaseConfig, TPartial>>
>;

// To understand how to use `MySqlColumn` and `AnyMySqlColumn`, see `Column` and `AnyColumn` documentation.
export abstract class MySqlColumn<
	THKT extends ColumnHKTBase,
	T extends ColumnBaseConfig,
	TRuntimeConfig extends object = {},
> extends Column<THKT, T, TRuntimeConfig, { mysqlBrand: 'MySqlColumn' }> {
}

export type AnyMySqlColumn<TPartial extends Partial<ColumnBaseConfig> = {}> = MySqlColumn<
	MySqlColumnHKT,
	Required<Update<ColumnBaseConfig, TPartial>>
>;

export interface MySqlColumnWithAutoIncrementConfig {
	autoIncrement: boolean;
}

export abstract class MySqlColumnBuilderWithAutoIncrement<
	THKT extends ColumnBuilderHKTBase,
	T extends ColumnBuilderBaseConfig,
	TRuntimeConfig extends object = {},
> extends MySqlColumnBuilder<THKT, T, TRuntimeConfig & MySqlColumnWithAutoIncrementConfig> {
	constructor(name: NonNullable<T['name']>) {
		super(name);
		this.config.autoIncrement = false;
	}

	autoincrement(): MySqlColumnBuilderWithAutoIncrement<THKT, UpdateCBConfig<T, { hasDefault: true }>, TRuntimeConfig> {
		this.config.autoIncrement = true;
		this.config.hasDefault = true;
		return this as ReturnType<this['autoincrement']>;
	}
}

export abstract class MySqlColumnWithAutoIncrement<
	THKT extends ColumnHKTBase,
	T extends ColumnBaseConfig,
	TRuntimeConfig extends object = {},
> extends MySqlColumn<THKT, T, MySqlColumnWithAutoIncrementConfig & TRuntimeConfig> {
	readonly autoIncrement: boolean = this.config.autoIncrement;
}
