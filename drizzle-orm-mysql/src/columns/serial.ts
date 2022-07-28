import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

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
> extends MySqlColumnWithMapper<
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

	override mapFromDriverValue = (value: ColumnDriverParam<number | string>): ColumnData<number> => {
		if (typeof value === 'string') {
			return parseInt(value) as ColumnData<number>;
		}
		return value as ColumnData<any>;
	};
}

export function serial(name: string) {
	return new MySqlSerialBuilder(name);
}
