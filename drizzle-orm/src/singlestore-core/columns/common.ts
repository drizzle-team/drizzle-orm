import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasDefault,
	IsAutoincrement,
	MakeColumnConfig,
} from '~/column-builder.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable, SingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import type { Update } from '~/utils.ts';
import { uniqueKeyName } from '../unique-constraint.ts';

export interface SingleStoreColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'singlestore' }> {}

export interface SingleStoreGeneratedColumnConfig {
	mode?: 'virtual' | 'stored';
}

export abstract class SingleStoreColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string> & {
		data: any;
	},
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'singlestore' }, TExtraConfig>
	implements SingleStoreColumnBuilderBase<T, TTypeConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreColumnBuilder';

	unique(name?: string): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		return this;
	}

	// TODO: Implement generated columns for SingleStore (https://docs.singlestore.com/cloud/create-a-database/using-persistent-computed-columns/)
	/** @internal */
	generatedAlwaysAs(as: SQL | T['data'] | (() => SQL), config?: SingleStoreGeneratedColumnConfig) {
		this.config.generated = {
			as,
			type: 'always',
			mode: config?.mode ?? 'virtual',
		};
		return this as any;
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreColumn<MakeColumnConfig<T, TTableName>>;
}

// To understand how to use `SingleStoreColumn` and `AnySingleStoreColumn`, see `Column` and `AnyColumn` documentation.
export abstract class SingleStoreColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'singlestore' }> {
	static override readonly [entityKind]: string = 'SingleStoreColumn';

	constructor(
		override readonly table: SingleStoreTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		if (!config.uniqueName) {
			config.uniqueName = uniqueKeyName(table, [config.name]);
		}
		super(table, config);
	}
}

export type AnySingleStoreColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> =
	SingleStoreColumn<
		Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
	>;

export interface SingleStoreColumnWithAutoIncrementConfig {
	autoIncrement: boolean;
}

export abstract class SingleStoreColumnBuilderWithAutoIncrement<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends SingleStoreColumnBuilder<T, TRuntimeConfig & SingleStoreColumnWithAutoIncrementConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'SingleStoreColumnBuilderWithAutoIncrement';

	constructor(name: NonNullable<T['name']>, dataType: T['dataType'], columnType: T['columnType']) {
		super(name, dataType, columnType);
		this.config.autoIncrement = false;
	}

	autoincrement(): IsAutoincrement<HasDefault<this>> {
		this.config.autoIncrement = true;
		this.config.hasDefault = true;
		return this as IsAutoincrement<HasDefault<this>>;
	}
}

export abstract class SingleStoreColumnWithAutoIncrement<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends SingleStoreColumn<T, SingleStoreColumnWithAutoIncrementConfig & TRuntimeConfig> {
	static override readonly [entityKind]: string = 'SingleStoreColumnWithAutoIncrement';

	readonly autoIncrement: boolean = this.config.autoIncrement;
}
