import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyPgTable } from '~/table';

import { PgColumnBuilder, PgColumnWithMapper } from './common';

export class PgSerialBuilder extends PgColumnBuilder<
	ColumnData<number>,
	ColumnDriverParam<number>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgSerial<TTableName> {
		return new PgSerial(table, this);
	}
}

export class PgSerial<TTableName extends TableName> extends PgColumnWithMapper<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	protected brand!: 'PgSerial';

	getSQLType(): string {
		return 'serial';
	}
}

export function serial(name: string) {
	return new PgSerialBuilder(name);
}
