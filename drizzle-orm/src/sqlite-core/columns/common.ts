import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnType,
	HasGenerated,
} from '~/column-builder.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import { Column } from '~/column.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { ForeignKey, UpdateDeleteAction } from '~/sqlite-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/sqlite-core/foreign-keys.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { Update } from '~/utils.ts';

export type SQLiteColumns = Record<string, SQLiteColumn<any>>;

export interface ReferenceConfig {
	ref: () => SQLiteColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface SQLiteGeneratedColumnConfig {
	mode?: 'virtual' | 'stored';
}

export abstract class SQLiteColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType> = ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = object,
> extends ColumnBuilder<T, TRuntimeConfig, TExtraConfig> {
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
	abstract build(table: SQLiteTable): SQLiteColumn;
}

// To understand how to use `SQLiteColumn` and `AnySQLiteColumn`, see `Column` and `AnyColumn` documentation.
export abstract class SQLiteColumn<
	T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
	TRuntimeConfig extends object = {},
> extends Column<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'SQLiteColumn';

	/** @internal */
	override readonly table: SQLiteTable;

	constructor(
		table: SQLiteTable,
		config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig,
	) {
		super(table, config);
		this.table = table;
	}
}

export type AnySQLiteColumn<TPartial extends Partial<ColumnBaseConfig<ColumnType>> = {}> = SQLiteColumn<
	Required<Update<ColumnBaseConfig<ColumnType>, TPartial>>
>;
