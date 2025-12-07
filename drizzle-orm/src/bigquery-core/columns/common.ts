import type { AnyBigQueryTable, BigQueryTable } from '~/bigquery-core/table.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { Update } from '~/utils.ts';
import { uniqueKeyName } from '../unique-constraint.ts';

export interface BigQueryColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'bigquery' }> {}

export interface BigQueryGeneratedColumnConfig {
	mode?: 'stored';
}

export abstract class BigQueryColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string> & {
		data: any;
	},
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'bigquery' }, TExtraConfig>
	implements BigQueryColumnBuilderBase<T, TTypeConfig>
{
	static override readonly [entityKind]: string = 'BigQueryColumnBuilder';

	// BigQuery doesn't enforce foreign keys, but we keep the pattern for schema documentation
	unique(name?: string): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		return this;
	}

	generatedAlwaysAs(as: SQL | T['data'] | (() => SQL), config?: BigQueryGeneratedColumnConfig): HasGenerated<this, {
		type: 'always';
	}> {
		this.config.generated = {
			as,
			type: 'always',
			mode: config?.mode ?? 'stored',
		};
		return this as any;
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryColumn<MakeColumnConfig<T, TTableName>>;
}

// To understand how to use `BigQueryColumn` and `AnyBigQueryColumn`, see `Column` and `AnyColumn` documentation.
export abstract class BigQueryColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'bigquery' }> {
	static override readonly [entityKind]: string = 'BigQueryColumn';

	constructor(
		override readonly table: BigQueryTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		if (!config.uniqueName) {
			config.uniqueName = uniqueKeyName(table, [config.name]);
		}
		super(table, config);
	}
}

export type AnyBigQueryColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> = BigQueryColumn<
	Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
>;
