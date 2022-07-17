import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgTextBuilder<
	TType extends string = string,
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgText<string, TType, TNotNull, TDefault>, string, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgText<TTableName, TType, TNotNull, TDefault> {
		return new PgText(table, this);
	}
}

export class PgText<
	TTableName extends string,
	TType extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, TType, string, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgTextBuilder<TType, TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'text';
	}

	override mapToDriverValue(value: TType) {
		return `mapped text ${value}`;
	}
}

export function text<T extends string = string>(name: string) {
	return new PgTextBuilder<T>(name);
}
