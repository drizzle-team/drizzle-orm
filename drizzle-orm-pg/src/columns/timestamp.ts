import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgTimestampBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgTimestamp<string, TNotNull, TDefault>, string, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgTimestamp<TTableName, TNotNull, TDefault> {
		return new PgTimestamp(table, this);
	}
}

export class PgTimestamp<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, string, Date, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgTimestampBuilder<TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'timestamp without time zone';
	}

	override mapToDriverValue(value: string) {
		return new Date(value);
	}
}

export class PgTimestampStringBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<
	PgTimestampString<string, TNotNull, TDefault>,
	string,
	TNotNull,
	TDefault
> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgTimestampString<TTableName, TNotNull, TDefault> {
		return new PgTimestampString(table, this);
	}
}

export class PgTimestampString<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, string, string, TNotNull, TDefault> {
	constructor(
		table: AnyTable<TTableName>,
		builder: PgTimestampStringBuilder<TNotNull, TDefault>,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'timestamp without time zone';
	}

	override mapToDriverValue(value: string) {
		return value;
	}
}

export function timestamp(name: string, mode?: 'string'): PgTimestampStringBuilder;
export function timestamp(name: string, mode?: 'date'): PgTimestampBuilder;
export function timestamp(name: string, mode: 'date' | 'string' = 'date') {
	if (mode === 'date') {
		return new PgTimestampBuilder(name);
	}
	return new PgTimestampStringBuilder(name);
}
