import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgBooleanBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<
	PgBooleanInteger<string, TNotNull, TDefault>,
	number,
	TNotNull,
	TDefault
> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<TTableName>,
	): PgBooleanInteger<TTableName, TNotNull, TDefault> {
		return new PgBooleanInteger<TTableName, TNotNull, TDefault>(table, this);
	}
}

export class PgBooleanInteger<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, boolean, number, TNotNull, TDefault> {
	getSQLType(): string {
		return 'boolean';
	}

	override mapFromDriverValue(value: any): boolean {
		return value;
	}
}

export function boolean(name: string) {
	return new PgBooleanBuilder(name);
}
