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
import type { ForeignKey, UpdateDeleteAction } from '~/googlesql/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/googlesql/foreign-keys.ts';
import type { AnyGoogleSqlTable, GoogleSqlTable } from '~/googlesql/table.ts';
import type { SQL } from '~/sql/sql.ts';
import type { Update } from '~/utils.ts';
import { uniqueKeyName } from '../unique-constraint.ts';

export interface ReferenceConfig {
	ref: () => GoogleSqlColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface GoogleSqlColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'googlesql' }> {}

export interface GoogleSqlGeneratedColumnConfig {
	mode?: 'virtual' | 'stored';
}

export abstract class GoogleSqlColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string> & {
		data: any;
	},
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'googlesql' }, TExtraConfig>
	implements GoogleSqlColumnBuilderBase<T, TTypeConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlColumnBuilder';

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

	generatedAlwaysAs(as: SQL | T['data'] | (() => SQL), config?: GoogleSqlGeneratedColumnConfig): HasGenerated<this, {
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
	buildForeignKeys(column: GoogleSqlColumn, table: GoogleSqlTable): ForeignKey[] {
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
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlColumn<MakeColumnConfig<T, TTableName>>;
}

// To understand how to use `GoogleSqlColumn` and `AnyGoogleSqlColumn`, see `Column` and `AnyColumn` documentation.
export abstract class GoogleSqlColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'googlesql' }> {
	static override readonly [entityKind]: string = 'GoogleSqlColumn';

	constructor(
		override readonly table: GoogleSqlTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		if (!config.uniqueName) {
			config.uniqueName = uniqueKeyName(table, [config.name]);
		}
		super(table, config);
	}
}

export type AnyGoogleSqlColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> =
	GoogleSqlColumn<
		Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
	>;

export interface GoogleSqlColumnWithAutoIncrementConfig {
	autoIncrement: boolean;
}

export abstract class GoogleSqlColumnBuilderWithAutoIncrement<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends GoogleSqlColumnBuilder<T, TRuntimeConfig & GoogleSqlColumnWithAutoIncrementConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'GoogleSqlColumnBuilderWithAutoIncrement';

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

export abstract class GoogleSqlColumnWithAutoIncrement<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends GoogleSqlColumn<T, GoogleSqlColumnWithAutoIncrementConfig & TRuntimeConfig> {
	static override readonly [entityKind]: string = 'GoogleSqlColumnWithAutoIncrement';

	readonly autoIncrement: boolean = this.config.autoIncrement;
}
