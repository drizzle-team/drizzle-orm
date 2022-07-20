import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgTimestampTzBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgTimestampTz<string, TNotNull, TDefault>, string, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgTimestampTz<TTableName, TNotNull, TDefault> {
		return new PgTimestampTz(table, this);
	}
}

export class PgTimestampTz<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, Date, string, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgTimestampTzBuilder<TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'timestamp with time zone';
	}

	override mapFromDriverValue(value: string) {
		return new Date(value);
	}
}

export class PgTimestampTzStringBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<
	PgTimestampTzString<string, TNotNull, TDefault>,
	string,
	TNotNull,
	TDefault
> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgTimestampTzString<TTableName, TNotNull, TDefault> {
		return new PgTimestampTzString(table, this);
	}
}

export class PgTimestampTzString<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, string, string, TNotNull, TDefault> {
	constructor(
		table: AnyTable<TTableName>,
		builder: PgTimestampTzStringBuilder<TNotNull, TDefault>,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'timestamp with time zone';
	}

	override mapFromDriverValue(value: string) {
		return value;
	}
}

export function timestamptz(name: string, mode: 'string'): PgTimestampTzStringBuilder;
export function timestamptz(name: string, mode?: 'date'): PgTimestampTzBuilder;
export function timestamptz(name: string, mode: 'date' | 'string' = 'date') {
	if (mode === 'date') {
		return new PgTimestampTzBuilder(name);
	}
	return new PgTimestampTzStringBuilder(name);
}
