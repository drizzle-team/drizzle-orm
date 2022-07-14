import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgDateBuilder<
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends PgColumnBuilder<PgDate<string, TNotNull, TDefault>, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgDate<TTableName, TNotNull, TDefault> {
		return new PgDate(table, this);
	}
}

export class PgDate<
	TTableName extends string = string,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends PgColumn<TTableName, Date, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgDateBuilder<TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'text';
	}

	override mapToDriverValue(value: Date) {
		return value.toISOString();
	}
}

export function date(name: string) {
	return new PgDateBuilder(name);
}
