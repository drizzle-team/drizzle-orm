import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgDateBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgDate<string, TNotNull, TDefault>, string, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgDate<TTableName, TNotNull, TDefault> {
		return new PgDate(table, this);
	}
}

export class PgDate<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, Date, string, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgDateBuilder<TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'date';
	}

	//@TODO fix mapping from pg to js types
	override mapToDriverValue(value: Date) {
		return value.toISOString();
	}
}

export function date(name: string) {
	return new PgDateBuilder(name);
}
