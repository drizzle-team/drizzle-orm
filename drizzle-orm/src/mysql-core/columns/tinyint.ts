import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';
import type { MySqlIntConfig } from './int.ts';

export type MySqlTinyIntBuilderInitial<TName extends string> = MySqlTinyIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlTinyInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlTinyIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlTinyInt'>>
	extends MySqlColumnBuilderWithAutoIncrement<T, MySqlIntConfig>
{
	static override readonly [entityKind]: string = 'MySqlTinyIntBuilder';

	constructor(name: T['name'], config?: MySqlIntConfig) {
		super(name, 'number', 'MySqlTinyInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlTinyInt<MakeColumnConfig<T, TTableName>> {
		return new MySqlTinyInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlTinyInt<T extends ColumnBaseConfig<'number', 'MySqlTinyInt'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlIntConfig>
{
	static override readonly [entityKind]: string = 'MySqlTinyInt';

	getSQLType(): string {
		return `tinyint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function tinyint(): MySqlTinyIntBuilderInitial<''>;
export function tinyint(
	config?: MySqlIntConfig,
): MySqlTinyIntBuilderInitial<''>;
export function tinyint<TName extends string>(
	name: TName,
	config?: MySqlIntConfig,
): MySqlTinyIntBuilderInitial<TName>;
export function tinyint(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlTinyIntBuilder(name, config);
}
