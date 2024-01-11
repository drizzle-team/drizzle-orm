import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';
import type { MySqlIntConfig } from './int.ts';

export type MySqlSmallIntBuilderInitial<TName extends string> = MySqlSmallIntBuilder<
	{
		name: TName;
		dataType: 'number';
		columnType: 'MySqlSmallInt';
		data: number;
		driverParam: number | string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlSmallInt'>>
	extends MySqlColumnBuilderWithAutoIncrement<T, MySqlIntConfig>
{
	static readonly [entityKind]: string = 'MySqlSmallIntBuilder';

	constructor(name: T['name'], config?: MySqlIntConfig) {
		super(name, 'number', 'MySqlSmallInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlSmallInt<MakeColumnConfig<T, TTableName>> {
		return new MySqlSmallInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlSmallInt<T extends ColumnBaseConfig<'number', 'MySqlSmallInt'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlIntConfig>
{
	static readonly [entityKind]: string = 'MySqlSmallInt';

	getSQLType(): string {
		return `smallint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function smallint<TName extends string>(
	name: TName,
	config?: MySqlIntConfig,
): MySqlSmallIntBuilderInitial<TName> {
	return new MySqlSmallIntBuilder(name, config);
}
