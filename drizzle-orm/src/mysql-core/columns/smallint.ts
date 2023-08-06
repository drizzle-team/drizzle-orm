import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export type MySqlSmallIntBuilderInitial<TName extends string> = MySqlSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlSmallInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlSmallInt'>>
	extends MySqlColumnBuilderWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlSmallIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MySqlSmallInt');
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
	extends MySqlColumnWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlSmallInt';

	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function smallint<TName extends string>(name: TName): MySqlSmallIntBuilderInitial<TName> {
	return new MySqlSmallIntBuilder(name);
}
