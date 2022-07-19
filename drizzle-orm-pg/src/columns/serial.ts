import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgSerialBuilder extends PgColumnBuilder<
	PgSerial<string>,
	number,
	true,
	true
> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgSerial<TTableName> {
		return new PgSerial(table, this);
	}
}

export class PgSerial<TTableName extends string> extends PgColumn<
	TTableName,
	number,
	number,
	true,
	true
> {
	getSQLType(): string {
		return 'serial';
	}
}

export function serial(name: string) {
	return new PgSerialBuilder(name);
}
