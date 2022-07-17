import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgSerialBuilder<TNotNull extends boolean = false> extends PgColumnBuilder<
	PgSerial<string, TNotNull>,
	number,
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

export class PgSerial<TTableName extends string, TNotNull extends boolean> extends PgColumn<
	TTableName,
	number,
	number,
	TNotNull,
	true
> {
	getSQLType(): string {
		return 'serial';
	}
}

export function serial(name: string) {
	return new PgSerialBuilder(name);
}
