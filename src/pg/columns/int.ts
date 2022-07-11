import { AnyTable } from '../../core';
import { PgColumn, PgColumnBuilder } from '../core';

export class PgIntegerBuilder<
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends PgColumnBuilder<
	PgInteger<string, TNotNull, TDefault>,
	TNotNull,
	TDefault
> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgInteger<TTableName, TNotNull, TDefault> {
		return new PgInteger(table, this);
	}
}

export class PgInteger<
	TTableName extends string = string,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends PgColumn<TTableName, number, TNotNull, TDefault> {
	getSQLType(): string {
		return 'integer';
	}
}

export function int(table: string) {
	return new PgIntegerBuilder(table);
}
