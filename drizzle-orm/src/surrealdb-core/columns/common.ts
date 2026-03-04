import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	MakeColumnConfig,
} from '~/column-builder.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySurrealDBTable, SurrealDBTable } from '~/surrealdb-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import type { Update } from '~/utils.ts';
import { uniqueKeyName } from '../unique-constraint.ts';

export interface SurrealDBColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'surrealdb' }> {}

export interface SurrealDBGeneratedColumnConfig {
	mode?: 'virtual' | 'stored';
}

export abstract class SurrealDBColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string> & {
		data: any;
	},
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'surrealdb' }, TExtraConfig>
	implements SurrealDBColumnBuilderBase<T, TTypeConfig>
{
	static override readonly [entityKind]: string = 'SurrealDBColumnBuilder';

	unique(name?: string): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		return this;
	}

	/** @internal */
	generatedAlwaysAs(as: SQL | T['data'] | (() => SQL), _config?: SurrealDBGeneratedColumnConfig) {
		this.config.generated = {
			as,
			type: 'always',
			mode: _config?.mode ?? 'virtual',
		};
		return this as any;
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnySurrealDBTable<{ name: TTableName }>,
	): SurrealDBColumn<MakeColumnConfig<T, TTableName>>;
}

export abstract class SurrealDBColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'surrealdb' }> {
	static override readonly [entityKind]: string = 'SurrealDBColumn';

	constructor(
		override readonly table: SurrealDBTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		if (!config.uniqueName) {
			config.uniqueName = uniqueKeyName(table, [config.name]);
		}
		super(table, config);
	}
}

export type AnySurrealDBColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> =
	SurrealDBColumn<
		Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
	>;
