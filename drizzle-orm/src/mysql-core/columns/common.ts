import { ColumnBuilder } from '~/column-builder.ts';
import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasDefault,
	HasGenerated,
	IsAutoincrement,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { ForeignKey, UpdateDeleteAction } from '~/mysql-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/mysql-core/foreign-keys.ts';
import type { AnyMySqlTable, MySqlTable } from '~/mysql-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import type { Update } from '~/utils.ts';
import { uniqueKeyName } from '../unique-constraint.ts';

export interface ReferenceConfig {
	ref: () => MySqlColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface MySqlColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'mysql' }> {}

export interface MySqlGeneratedColumnConfig {
	mode?: 'virtual' | 'stored';
}

export abstract class MySqlColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string> & {
		data: any;
	},
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'mysql' }, TExtraConfig>
	implements MySqlColumnBuilderBase<T, TTypeConfig>
{
	static override readonly [entityKind]: string = 'MySqlColumnBuilder';

	private foreignKeyConfigs: ReferenceConfig[] = [];

	references(ref: ReferenceConfig['ref'], actions: ReferenceConfig['actions'] = {}): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	unique(name?: string): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		return this;
	}

	generatedAlwaysAs(as: SQL | T['data'] | (() => SQL), config?: MySqlGeneratedColumnConfig): HasGenerated<this, {
		type: 'always';
	}> {
		this.config.generated = {
			as,
			type: 'always',
			mode: config?.mode ?? 'virtual',
		};
		return this as any;
	}

	/** @internal */
	buildForeignKeys(column: MySqlColumn, table: MySqlTable): ForeignKey[] {
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
	): MySqlColumn<MakeColumnConfig<T, TTableName>>;
}

// To understand how to use `MySqlColumn` and `AnyMySqlColumn`, see `Column` and `AnyColumn` documentation.
export abstract class MySqlColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'mysql' }> {
	static override readonly [entityKind]: string = 'MySqlColumn';

	constructor(
		override readonly table: MySqlTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		if (!config.uniqueName) {
			config.uniqueName = uniqueKeyName(table, [config.name]);
		}
		super(table, config);
	}
}

export type AnyMySqlColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> = MySqlColumn<
	Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
>;

export interface MySqlColumnWithAutoIncrementConfig {
	autoIncrement: boolean;
}

export abstract class MySqlColumnBuilderWithAutoIncrement<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends MySqlColumnBuilder<T, TRuntimeConfig & MySqlColumnWithAutoIncrementConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'MySqlColumnBuilderWithAutoIncrement';

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

export abstract class MySqlColumnWithAutoIncrement<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends MySqlColumn<T, MySqlColumnWithAutoIncrementConfig & TRuntimeConfig> {
	static override readonly [entityKind]: string = 'MySqlColumnWithAutoIncrement';

	readonly autoIncrement: boolean = this.config.autoIncrement;
}
