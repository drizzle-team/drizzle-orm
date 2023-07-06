import type { ColumnBaseConfig, ColumnHKT, ColumnHKTBase } from '~/column';
import { Column } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { ColumnBuilder } from '~/column-builder';
import { entityKind } from '~/entity';
import { type Assume, type Update } from '~/utils';

import type { ForeignKey, UpdateDeleteAction } from '~/sqlite-core/foreign-keys';
import { ForeignKeyBuilder } from '~/sqlite-core/foreign-keys';
import type { AnySQLiteTable } from '~/sqlite-core/table';

export interface ReferenceConfig {
	ref: () => AnySQLiteColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface SQLiteColumnBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteColumnBuilder<SQLiteColumnBuilderHKT, Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: SQLiteColumnHKT;
}

export interface SQLiteColumnHKT extends ColumnHKTBase {
	_type: SQLiteColumn<SQLiteColumnHKT, Assume<this['config'], ColumnBaseConfig>>;
}

export abstract class SQLiteColumnBuilder<
	THKT extends ColumnBuilderHKTBase,
	T extends ColumnBuilderBaseConfig,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends ColumnBuilder<THKT, T, TRuntimeConfig, TTypeConfig & { sqliteBrand: 'SQLiteColumnBuilder' }> {
	static readonly [entityKind]: string = 'SQLiteColumnBuilder';

	private foreignKeyConfigs: ReferenceConfig[] = [];

	references(
		ref: ReferenceConfig['ref'],
		actions: ReferenceConfig['actions'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	unique(
		name?: string,
	): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
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
	): SQLiteColumn<Assume<THKT['_columnHKT'], ColumnHKT>, MakeColumnConfig<T, TTableName>>;
}

export type AnySQLiteColumnBuilder<TPartial extends Partial<ColumnBuilderBaseConfig> = {}> = SQLiteColumnBuilder<
	SQLiteColumnBuilderHKT,
	Required<Update<ColumnBuilderBaseConfig, TPartial>>
>;

// To understand how to use `SQLiteColumn` and `AnySQLiteColumn`, see `Column` and `AnyColumn` documentation.
export abstract class SQLiteColumn<
	THKT extends ColumnHKT,
	T extends ColumnBaseConfig,
	TRuntimeConfig extends object = {},
> extends Column<THKT, T, TRuntimeConfig, { sqliteBrand: 'SQLiteColumn' }> {
	static readonly [entityKind]: string = 'SQLiteColumn';
}

export type AnySQLiteColumn<TPartial extends Partial<ColumnBaseConfig> = {}> = SQLiteColumn<
	SQLiteColumnHKT,
	Required<Update<ColumnBaseConfig, TPartial>>
>;
