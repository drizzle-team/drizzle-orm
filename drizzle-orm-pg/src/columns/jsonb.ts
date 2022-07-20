import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgJsonbBuilder<
	TData,
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgJsonb<string, TNotNull, TDefault, TData>, string, TNotNull, TDefault> {
	constructor(name: string) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgJsonb<TTableName, TNotNull, TDefault, TData> {
		return new PgJsonb(table, this);
	}
}

export class PgJsonb<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
	TData,
> extends PgColumn<TTableName, TData, string, TNotNull, TDefault> {
	constructor(table: AnyTable<TTableName>, builder: PgJsonbBuilder<TData, TNotNull, TDefault>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'jsonb';
	}

	override mapFromDriverValue(value: any): TData {
		return value;
	}
}

export function jsonb<TData = any>(name: string) {
	return new PgJsonbBuilder<TData>(name);
}

// const jsonColumn = jsonb<{ id: string }>('dbName');
