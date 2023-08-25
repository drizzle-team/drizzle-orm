import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlTinyIntBuilderInitial<TName extends string> = MySqlTinyIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlTinyInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlTinyIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlTinyInt'>>
	extends MySqlColumnBuilderWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlTinyIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MySqlTinyInt');
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
	extends MySqlColumnWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlTinyInt';

	getSQLType(): string {
		return 'tinyint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function tinyint<TName extends string>(name: TName): MySqlTinyIntBuilderInitial<TName> {
	return new MySqlTinyIntBuilder(name);
}
