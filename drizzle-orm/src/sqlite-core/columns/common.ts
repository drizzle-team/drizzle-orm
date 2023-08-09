import type { ColumnBaseConfig } from '~/column';
import { Column } from '~/column';
import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	MakeColumnConfig,
} from '~/column-builder';
import { ColumnBuilder } from '~/column-builder';
import { entityKind } from '~/entity';
import type { ForeignKey, UpdateDeleteAction } from '~/sqlite-core/foreign-keys';
import { ForeignKeyBuilder } from '~/sqlite-core/foreign-keys';
import type { AnySQLiteTable, SQLiteTable } from '~/sqlite-core/table';
import { type Update } from '~/utils';
import { uniqueKeyName } from '../unique-constraint';

export interface ReferenceConfig {
	ref: () => SQLiteColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class SQLiteColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = object,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'sqlite' }, TExtraConfig> {
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
	buildForeignKeys(column: SQLiteColumn, table: AnySQLiteTable): ForeignKey[] {
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
	): SQLiteColumn<MakeColumnConfig<T, TTableName>>;
}

// To understand how to use `SQLiteColumn` and `AnySQLiteColumn`, see `Column` and `AnyColumn` documentation.
export abstract class SQLiteColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends Column<T, TRuntimeConfig, { dialect: 'sqlite' }> {
	static readonly [entityKind]: string = 'SQLiteColumn';

	constructor(
		override readonly table: SQLiteTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		if (!config.uniqueName) {
			config.uniqueName = uniqueKeyName(table, [config.name]);
		}
		super(table, config);
	}
}

export type AnySQLiteColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> = SQLiteColumn<
	Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
>;
