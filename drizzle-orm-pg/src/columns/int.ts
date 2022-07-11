import { PgColumn } from '..';
import { AnyPgTable } from '..';
import { PgColumnBuilder } from './common';

export class PgIntegerBuilder<
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
	> extends PgColumnBuilder<PgInteger<string, TNotNull, TDefault>, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<TTableName>,
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

	override mapFromDriverValue(value: any): number {
		if (typeof value === 'number') {
			return value;
		}
		return parseInt(value);
	}
}

export function int(table: string) {
	return new PgIntegerBuilder(table);
}
