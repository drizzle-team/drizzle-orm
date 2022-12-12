import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import {  MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlTinyIntBuilder extends MySqlColumnBuilderWithAutoIncrement<
	ColumnBuilderConfig<{
		data: number;
		driverParam: number | string;
	}>
> {
	/** @internal */
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlTinyInt<TTableName> {
		return new MySqlTinyInt(table, this);
	}
}

export class MySqlTinyInt<
	TTableName extends string,
> extends MySqlColumnWithAutoIncrement<
	ColumnConfig<{
		tableName: TTableName;
		data: number;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlTinyInt';

	getSQLType(): string {
		return 'tinyint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	}
}

export function tinyint(name: string) {
	return new MySqlTinyIntBuilder(name);
}
