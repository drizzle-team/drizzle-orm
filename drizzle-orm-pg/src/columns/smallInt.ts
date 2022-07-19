import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgSmallIntegerBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgSmallInteger<string, TNotNull, TDefault>, number, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<TTableName>,
	): PgSmallInteger<TTableName, TNotNull, TDefault> {
		return new PgSmallInteger<TTableName, TNotNull, TDefault>(table, this);
	}
}

export class PgSmallInteger<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, number, number, TNotNull, TDefault> {
	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue(value: any): number {
		if (typeof value === 'number') {
			return value;
		}
		return parseInt(value);
	}
}

export function smallint(name: string) {
	return new PgSmallIntegerBuilder(name);
}
