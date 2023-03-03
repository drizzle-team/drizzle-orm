import { Column, ColumnBaseConfig } from '~/column';
import { ColumnBuilder, ColumnBuilderBaseConfig, ColumnBuilderWithConfig, UpdateCBConfig } from '~/column-builder';
import { SQL } from '~/sql';
import { Assume, Update } from '~/utils';
import { Simplify } from '~/utils';

import { ForeignKey, ForeignKeyBuilder, UpdateDeleteAction } from '~/pg-core/foreign-keys';
import { AnyPgTable } from '~/pg-core/table';
import { PgArray, PgArrayBuilder } from './array';
import { PgEnumColumn, PgEnumColumnBuilder } from './enum';
import { PgText, PgTextBuilder } from './text';

export interface ReferenceConfig {
	ref: () => AnyPgColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class PgColumnBuilder<
	T extends Partial<ColumnBuilderBaseConfig>,
	TConfig extends Record<string, unknown> = {},
> extends ColumnBuilder<T, TConfig> {
	protected abstract $pgColumnBuilderBrand: string;

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

	array(size?: number): PgArrayBuilder<
		{
			notNull: T['notNull'] & boolean;
			hasDefault: T['hasDefault'] & boolean;
			data: T['data'][];
			driverParam: T['driverParam'][];
		}
	> {
		return new PgArrayBuilder(this.config.name, this as PgColumnBuilder<any>, size);
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
		config: PgColumnBuilder<Omit<T, 'tableName'>>['config'],
	) {
		super(table, config);
	}
}

export type AnyPgColumn<TPartial extends Partial<ColumnBaseConfig> = {}> = PgColumn<
	Update<ColumnBaseConfig, TPartial>
>;

export type BuildColumn<
	TTableName extends string,
	TBuilder extends AnyPgColumnBuilder,
> = TBuilder extends PgArrayBuilder<infer T> ? PgArray<Simplify<T & { tableName: TTableName }>>
	: TBuilder extends PgTextBuilder<infer T> ? PgText<Simplify<T & { tableName: TTableName }>>
	: TBuilder extends PgEnumColumnBuilder<infer T> ? PgEnumColumn<Simplify<T & { tableName: TTableName }>>
	: TBuilder extends ColumnBuilderWithConfig<infer T> ? PgColumn<Simplify<T & { tableName: TTableName }>>
	: never;

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
