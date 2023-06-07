import type { AnyColumnHKT, ColumnBaseConfig, ColumnHKTBase } from '~/column';
import { Column } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { ColumnBuilder } from '~/column-builder';
import type { Assume, Update } from '~/utils';

import type { ForeignKey, UpdateDeleteAction } from '~/pg-core/foreign-keys';
import { ForeignKeyBuilder } from '~/pg-core/foreign-keys';
import type { AnyPgTable } from '~/pg-core/table';
import { PgArrayBuilder } from './array';

export interface ReferenceConfig {
	ref: () => AnyPgColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface PgColumnBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgColumnBuilder<PgColumnBuilderHKT, Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgColumnHKT;
}

export interface PgColumnHKT extends ColumnHKTBase {
	_type: PgColumn<PgColumnHKT, Assume<this['config'], ColumnBaseConfig>>;
}

export abstract class PgColumnBuilder<
	THKT extends ColumnBuilderHKTBase,
	T extends ColumnBuilderBaseConfig,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends ColumnBuilder<THKT, T, TRuntimeConfig, TTypeConfig & { pgBrand: 'PgColumnBuilder' }> {
	private foreignKeyConfigs: ReferenceConfig[] = [];

	array(size?: number): PgArrayBuilder<
		{
			name: NonNullable<T['name']>;
			notNull: NonNullable<T['notNull']>;
			hasDefault: NonNullable<T['hasDefault']>;
			data: T['data'][];
			driverParam: T['driverParam'][] | string;
		}
	> {
		return new PgArrayBuilder(this.config.name, this as PgColumnBuilder<any, any>, size);
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
	): PgColumn<
		Assume<THKT['_columnHKT'], ColumnHKTBase>,
		MakeColumnConfig<T, TTableName>
	>;
}

export type AnyPgColumnBuilder<TPartial extends Partial<ColumnBuilderBaseConfig> = {}> = PgColumnBuilder<
	PgColumnBuilderHKT,
	Required<Update<ColumnBuilderBaseConfig, TPartial>>
>;

// To understand how to use `PgColumn` and `AnyPgColumn`, see `Column` and `AnyColumn` documentation.
export abstract class PgColumn<
	THKT extends ColumnHKTBase,
	T extends ColumnBaseConfig,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<THKT, T, TRuntimeConfig, TTypeConfig & { pgBrand: 'PgColumn' }> {
}

export type AnyPgColumn<TPartial extends Partial<ColumnBaseConfig> = {}> = PgColumn<
	PgColumnHKT,
	Required<Update<ColumnBaseConfig, TPartial>>
>;

export interface AnyPgColumnHKT extends AnyColumnHKT {
	type: AnyPgColumn<Assume<this['config'], Partial<ColumnBaseConfig>>>;
}
