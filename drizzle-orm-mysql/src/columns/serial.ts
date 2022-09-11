import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlSerialBuilder extends MySqlColumnBuilder<
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlSerial<TTableName> {
		return new MySqlSerial<TTableName>(table, this);
	}
}

export class MySqlSerial<
	TTableName extends TableName,
> extends MySqlColumn<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	protected brand!: 'MySqlSerial';

	getSQLType(): string {
		return 'serial';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	}
}

export function serial(name: string) {
	return new MySqlSerialBuilder(name);
}
