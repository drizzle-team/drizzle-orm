import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgTextBuilder<
	TType extends string = string,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends PgColumnBuilder<PgText<TType, string, TNotNull, TDefault>, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgText<TType, TTableName, TNotNull, TDefault> {
		return new PgText(table, this);
	}
}

export class PgText<
	TType extends string = string,
	TTableName extends string = string,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends PgColumn<TTableName, TType, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgTextBuilder<TType, TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'text';
	}
}

export function text<T extends string = string>(name: string) {
	return new PgTextBuilder<T>(name);
}
