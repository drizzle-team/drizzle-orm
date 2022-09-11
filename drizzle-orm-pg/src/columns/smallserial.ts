import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgSmallSerialBuilder extends PgColumnBuilder<
	ColumnData<number>,
	ColumnDriverParam<number>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgSmallSerial<TTableName> {
		return new PgSmallSerial(table, this);
	}
}

export class PgSmallSerial<TTableName extends TableName> extends PgColumn<
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
