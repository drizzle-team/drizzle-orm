import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgSerialBuilder<TNotNull extends boolean = boolean> extends PgColumnBuilder<
	PgSerial<string, TNotNull>,
	TNotNull,
	true
> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgSerial<TTableName, TNotNull> {
		return new PgSerial(table, this);
	}
}

export class PgSerial<
	TTableName extends string = string,
	TNotNull extends boolean = boolean,
> extends PgColumn<TTableName, number, TNotNull, true> {
	getSQLType(): string {
		return 'serial';
	}
}

export function serial(table: string) {
	return new PgSerialBuilder(table);
}
