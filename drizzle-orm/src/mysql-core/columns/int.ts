import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export type MySqlIntBuilderInitial<TName extends string> = MySqlIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlInt'>>
	extends MySqlColumnBuilderWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MySqlInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlInt<MakeColumnConfig<T, TTableName>> {
		return new MySqlInt<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlInt<T extends ColumnBaseConfig<'number', 'MySqlInt'>> extends MySqlColumnWithAutoIncrement<T> {
	static readonly [entityKind]: string = 'MySqlInt';

	getSQLType(): string {
		return 'int';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function int<TName extends string>(name: TName): MySqlIntBuilderInitial<TName> {
	return new MySqlIntBuilder(name);
}
