import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import { Column } from '~/column.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { ForeignKey, UpdateDeleteAction } from '~/sqlite-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/sqlite-core/foreign-keys.ts';
import type { AnySQLiteTable, SQLiteTable } from '~/sqlite-core/table.ts';
import type { Update } from '~/utils.ts';
import { uniqueKeyName } from '../unique-constraint.ts';

export interface ReferenceConfig {
	ref: () => SQLiteColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface SQLiteColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'sqlite' }> {}

export interface SQLiteGeneratedColumnConfig {
	mode?: 'virtual' | 'stored';
}

export abstract class SQLiteColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = object,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'sqlite' }, TExtraConfig>
	implements SQLiteColumnBuilderBase<T, TTypeConfig>
{
	static override readonly [entityKind]: string = 'SQLiteColumnBuilder';

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

	generatedAlwaysAs(as: SQL | T['data'] | (() => SQL), config?: SQLiteGeneratedColumnConfig): HasGenerated<this, {
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
	buildForeignKeys(column: SQLiteColumn, table: SQLiteTable): ForeignKey[] {
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
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'sqlite' }> {
	static override readonly [entityKind]: string = 'SQLiteColumn';

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
