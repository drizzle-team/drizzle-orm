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
> extends PgColumn<TTableName, string, Date, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgDateBuilder<TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'date';
	}

	override mapToDriverValue(value: string) {
		return new Date(value);
	}
}

export class PgDateStringBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgDateString<string, TNotNull, TDefault>, string, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgDateString<TTableName, TNotNull, TDefault> {
		return new PgDateString(table, this);
	}
}

export class PgDateString<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, string, string, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgDateStringBuilder<TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'date';
	}

	override mapToDriverValue(value: string) {
		return value;
	}
}

export function date(name: string, mode?: 'string'): PgDateStringBuilder;
export function date(name: string, mode?: 'date'): PgDateBuilder;
export function date(name: string, mode: 'date' | 'string' = 'date') {
	if (mode === 'date') {
		return new PgDateBuilder(name);
	}
	return new PgDateStringBuilder(name);
}

// const dateS = date('name').notNull();
// const dateD = date('name', 'date').notNull();
