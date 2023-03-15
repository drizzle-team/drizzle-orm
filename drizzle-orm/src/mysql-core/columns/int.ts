import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlIntegerBuilder extends MySqlColumnBuilderWithAutoIncrement<
	ColumnBuilderConfig<{
		data: number;
		driverParam: number | string;
	}>
> {
	/** @internal */
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlInteger<TTableName> {
		return new MySqlInteger(table, this.config);
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
