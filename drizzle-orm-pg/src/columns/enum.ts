import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgEnumBuilder<
	TType extends string = string,
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgEnum<string, TType, TNotNull, TDefault>, string, TNotNull, TDefault> {
	/** @internal */ values: string[];
	/** @internal */ alias: string;

	constructor(name: string, alias: string, values: string[]) {
		super(name);
		this.alias = alias;
		this.values = values;
	}
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgEnum<TTableName, TType, TNotNull, TDefault> {
		return new PgEnum(table, this);
	}
}

export class PgEnum<
	TTableName extends string,
	TType extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, TType, string, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgEnumBuilder<TType, TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'text';
	}

	override mapToDriverValue(value: TType) {
		return value;
	}
}

export function cretaeEnum<T extends string = string>(alias: string, values: T[]) {
	return (name: string) => new PgEnumBuilder<T>(name, alias, values);
}

// const state = cretaeEnum('state', ['on', 'off']);
// const column = state('name').notNull();
