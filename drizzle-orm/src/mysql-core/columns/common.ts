import type { ColumnBaseConfig } from '~/column';
import { Column } from '~/column';
import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasDefault,
	MakeColumnConfig,
} from '~/column-builder';
import { ColumnBuilder } from '~/column-builder';
import { entityKind } from '~/entity';
import type { ForeignKey, UpdateDeleteAction } from '~/mysql-core/foreign-keys';
import { ForeignKeyBuilder } from '~/mysql-core/foreign-keys';
import type { AnyMySqlTable, MySqlTable } from '~/mysql-core/table';
import { type Update } from '~/utils';
import { uniqueKeyName } from '../unique-constraint';

export interface ReferenceConfig {
	ref: () => AnyMySqlColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class MySqlColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'mysql' }, TExtraConfig> {
	static readonly [entityKind]: string = 'MySqlColumnBuilder';

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
	): MySqlColumn<MakeColumnConfig<T, TTableName>>;
}

// To understand how to use `MySqlColumn` and `AnyMySqlColumn`, see `Column` and `AnyColumn` documentation.
export abstract class MySqlColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends Column<T, TRuntimeConfig, { dialect: 'mysql' }> {
	static readonly [entityKind]: string = 'MySqlColumn';

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
	static readonly [entityKind]: string = 'MySqlColumnBuilderWithAutoIncrement';

	constructor(name: NonNullable<T['name']>, dataType: T['dataType'], columnType: T['columnType']) {
		super(name, dataType, columnType);
		this.config.autoIncrement = false;
	}

	autoincrement(): HasDefault<this> {
		this.config.autoIncrement = true;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}
}

export abstract class MySqlColumnWithAutoIncrement<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends MySqlColumn<T, MySqlColumnWithAutoIncrementConfig & TRuntimeConfig> {
	static readonly [entityKind]: string = 'MySqlColumnWithAutoIncrement';

	readonly autoIncrement: boolean = this.config.autoIncrement;
}
