import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgVarcharBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgVarchar<string, TNotNull, TDefault>, string, TNotNull, TDefault> {
	/** @internal */ length: number | undefined;

	constructor(name: string, length?: number) {
		super(name);
		this.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgVarchar<TTableName, TNotNull, TDefault> {
		return new PgVarchar(table, this);
	}
}

export class PgVarchar<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, string, string, TNotNull, TDefault> {
	length: number | undefined;

	constructor(table: AnyTable<TTableName>, builder: PgVarcharBuilder<TNotNull, TDefault>) {
		super(table, builder);
		this.length = builder.length;
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `varchar(${this.length})` : `varchar`;
	}
}

export function varchar(name: string, length?: number) {
	return new PgVarcharBuilder(name, length);
}
