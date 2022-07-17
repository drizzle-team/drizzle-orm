import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgIntegerBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgInteger<string, TNotNull, TDefault>, number, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<TTableName>,
	): PgInteger<TTableName, TNotNull, TDefault> {
		return new PgInteger<TTableName, TNotNull, TDefault>(table, this);
	}
}

export class PgInteger<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, number, number, TNotNull, TDefault> {
	getSQLType(): string {
		return 'integer';
	}

	override mapFromDriverValue(value: any): number {
		if (typeof value === 'number') {
			return value;
		}
		return parseInt(value);
	}
}

export function int(name: string) {
	return new PgIntegerBuilder(name);
}
