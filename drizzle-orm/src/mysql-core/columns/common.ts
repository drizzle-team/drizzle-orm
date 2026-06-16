import type { ColumnBuilderBaseConfig, ColumnBuilderExtraConfig, HasDefault, MakeColumnConfig } from '~/column-builder.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import type { MySqlColumn } from './index.ts';

export interface MySqlColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<MySqlColumnDataType, string> = ColumnBuilderBaseConfig<
		MySqlColumnDataType,
		string
	>,
	TExtraConfig extends object = object,
> extends ColumnBuilder<T, TExtraConfig> {}

export type MySqlColumnDataType =
	| 'number'
	| 'bigint'
	| 'boolean'
	| 'date'
	| 'string'
	| 'buffer'
	| 'json'
	| 'custom'
	| 'self';

export abstract class MySqlColumnBuilder<
	T extends ColumnBuilderBaseConfig<MySqlColumnDataType, string> = ColumnBuilderBaseConfig<
		MySqlColumnDataType,
		string
	>,
	TExtraConfig extends object = object,
	TRuntimeConfig extends object = object,
	TExtraBuilderMethods extends object = object,
> extends ColumnBuilder<T, TExtraConfig, TRuntimeConfig, TExtraBuilderMethods> {
	static readonly [entityKind]: string = 'MySqlColumnBuilder';

	unique(name?: string): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		return this;
	}

	/** @internal */
	abstract override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlColumn<MakeColumnConfig<T, TTableName>>;
}

// To understand how to use `MySqlColumn` and `MySqlColumnBuilder`, see `column.ts` and `column-builder.ts` in the `pg-core` package.
export abstract class MySqlColumn<
	T extends ColumnBaseConfig<MySqlColumnDataType, string> = ColumnBaseConfig<MySqlColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends Column<T, TRuntimeConfig> {
	static readonly [entityKind]: string = 'MySqlColumn';

	constructor(
		override readonly table: AnyMySqlTable,
		config: ColumnBuilder<T>['config'],
	) {
		if (!config.uniqueName) {
			config.uniqueName = uniqueKeyName(table, [config.name]);
		}
		super(table, config);
	}
}

export function uniqueKeyName(table: AnyMySqlTable, columns: string[]) {
	return `${table[MySqlTable.Symbol.Name]}_${columns.join('_')}_unique`;
}

// Import after to avoid circular
import { MySqlTable } from '~/mysql-core/table.ts';
