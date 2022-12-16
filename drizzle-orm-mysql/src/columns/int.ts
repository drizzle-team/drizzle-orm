import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlIntegerBuilder extends MySqlColumnBuilderWithAutoIncrement<
	ColumnBuilderConfig<{
		data: number;
		driverParam: number | string;
	}>
> {
	/** @internal */
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlInteger<TTableName> {
		return new MySqlInteger(table, this);
	}
}

export class MySqlInteger<
	TTableName extends string,
> extends MySqlColumnWithAutoIncrement<
ColumnConfig<{
	tableName: TTableName;
	data: number;
	driverParam: number | string;
}>
> {
	protected override $mySqlColumnBrand!: 'MySqlInteger';

	getSQLType(): string {
		return 'int';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	}
}

export function int(name: string) {
	return new MySqlIntegerBuilder(name);
}
