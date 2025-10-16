import { ColumnBuilder } from '~/column-builder.ts';
import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnType,
	HasDefault,
	HasGenerated,
	IsAutoincrement,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { ForeignKey, UpdateDeleteAction } from '~/mysql-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/mysql-core/foreign-keys.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import type { Update } from '~/utils.ts';

export type MySqlColumns = Record<string, MySqlColumn<any>>;

export interface ReferenceConfig {
	ref: () => MySqlColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface MySqlGeneratedColumnConfig {
	mode?: 'virtual' | 'stored';
}

export abstract class MySqlColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType> = ColumnBuilderBaseConfig<ColumnType> & {
		data: any;
	},
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TExtraConfig> {
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
	abstract build(table: MySqlTable): MySqlColumn;
}

// To understand how to use `MySqlColumn` and `AnyMySqlColumn`, see `Column` and `AnyColumn` documentation.
export abstract class MySqlColumn<
	T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
	TRuntimeConfig extends object = {},
> extends Column<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'MySqlColumn';

	/** @internal */
	override readonly table: MySqlTable;

	constructor(
		table: MySqlTable,
		config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig,
	) {
		super(table, config);
		this.table = table;
	}
}

export type AnyMySqlColumn<TPartial extends Partial<ColumnBaseConfig<ColumnType>> = {}> = MySqlColumn<
	Required<Update<ColumnBaseConfig<ColumnType>, TPartial>>
>;

export interface MySqlColumnWithAutoIncrementConfig {
	autoIncrement: boolean;
}

export abstract class MySqlColumnBuilderWithAutoIncrement<
	T extends ColumnBuilderBaseConfig<ColumnType> = ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends MySqlColumnBuilder<T, TRuntimeConfig & MySqlColumnWithAutoIncrementConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'MySqlColumnBuilderWithAutoIncrement';

	constructor(name: string, dataType: T['dataType'], columnType: string) {
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
	T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
> extends MySqlColumn<T, MySqlColumnWithAutoIncrementConfig & TRuntimeConfig> {
	static override readonly [entityKind]: string = 'MySqlColumnWithAutoIncrement';

	readonly autoIncrement: boolean = this.config.autoIncrement;
}
