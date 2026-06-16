import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumnBuilder } from './column.builder.ts';

export type MySqlColumnWithAutoIncrement<T extends ColumnBaseConfig<MySqlColumnTypes, string> = ColumnBaseConfig<MySqlColumnTypes, string>> = MySqlColumn<T & { columnType: MySqlColumnWithAutoIncrementTypes }>;

export type MySqlColumnTypes =
	| 'string'
	| 'number'
	| 'bigint'
	| 'boolean'
	| 'date'
	| 'buffer'
	| 'json'
	| 'custom'
	| 'self';

export type MySqlColumnWithAutoIncrementTypes =
	| 'MySqlInt'
	| 'MySqlBigInt53'
	| 'MySqlBigInt64'
	| 'MySqlDouble'
	| 'MySqlFloat'
	| 'MySqlMediumInt'
	| 'MySqlSmallInt'
	| 'MySqlTinyInt'
	| 'MySqlDecimal'
	| 'MySqlSerial';

export { MySqlColumnBuilder };

export abstract class MySqlColumn<
	T extends ColumnBaseConfig<MySqlColumnTypes, string> = ColumnBaseConfig<MySqlColumnTypes, string>,
	TRuntimeConfig extends object = object,
> extends Column<T, TRuntimeConfig, { dialect: 'mysql' }> {
	static readonly [entityKind]: string = 'MySqlColumn';

	constructor(
		override readonly table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		if (!config.uniqueName) {
			config.uniqueName = `${table[Symbol.for('drizzle:Name')]}_${config.name}_unique`;
		}
		super(table, config);
	}
}
