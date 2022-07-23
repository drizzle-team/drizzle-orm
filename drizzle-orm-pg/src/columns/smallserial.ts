import { AnyTable } from 'drizzle-orm';
import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { PgColumnBuilder, PgColumnWithMapper } from './common';

export class PgSmallSerialBuilder extends PgColumnBuilder<
	ColumnData<number>,
	ColumnDriverParam<number>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyTable<TTableName>,
	): PgSmallSerial<TTableName> {
		return new PgSmallSerial(table, this);
	}
}

export class PgSmallSerial<TTableName extends TableName> extends PgColumnWithMapper<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	protected brand!: 'PgSmallSerial';

	getSQLType(): string {
		return 'serial';
	}
}

export function smallserial(name: string) {
	return new PgSmallSerialBuilder(name);
}
