import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlBooleanBuilder extends MySqlColumnBuilder<
	ColumnBuilderConfig<{
		data: boolean;
		driverParam: number | boolean;
	}>
> {
	/** @internal */
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlBoolean<TTableName> {
		return new MySqlBoolean(table, this.config);
	}
}

export class MySqlBoolean<TTableName extends string>
	extends MySqlColumn<ColumnConfig<{ tableName: TTableName; data: boolean; driverParam: number | boolean }>>
{
	protected override $mySqlColumnBrand!: 'MySqlBoolean';

	getSQLType(): string {
		return 'boolean';
	}

	override mapFromDriverValue(value: number | boolean): boolean {
		if (typeof value === 'boolean') {
			return value;
		}
		return value === 1;
	}
}

export function boolean(name: string) {
	return new MySqlBooleanBuilder(name);
}
