import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgDoublePrecisionBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<
	PgDoublePrecision<string, TNotNull, TDefault>,
	string,
	TNotNull,
	TDefault
> {
	/** @internal */ length: number | undefined;

	constructor(name: string, length?: number) {
		super(name);
		this.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgDoublePrecision<TTableName, TNotNull, TDefault> {
		return new PgDoublePrecision(table, this);
	}
}

export class PgDoublePrecision<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, number, string, TNotNull, TDefault> {
	constructor(
		table: AnyTable<TTableName>,
		builder: PgDoublePrecisionBuilder<TNotNull, TDefault>,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'double precision';
	}

	override mapFromDriverValue(value: any): number {
		return parseFloat(value);
	}
}

export function doubleprecision(name: string) {
	return new PgDoublePrecisionBuilder(name);
}
