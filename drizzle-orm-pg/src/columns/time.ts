import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgTimeBuilder<
	TType extends string = string,
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgTime<string, TType, TNotNull, TDefault>, string, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgTime<TTableName, TType, TNotNull, TDefault> {
		return new PgTime(table, this);
	}
}

export class PgTime<
	TTableName extends string,
	TType extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, TType, string, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgTimeBuilder<TType, TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'time';
	}

	override mapToDriverValue(value: TType) {
		return value;
	}
}

export function time<T extends string = string>(name: string) {
	return new PgTimeBuilder<T>(name);
}
