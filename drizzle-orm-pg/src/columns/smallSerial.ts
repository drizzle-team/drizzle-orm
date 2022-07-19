import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgSmallSerialBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgSmallSerial<string, TNotNull, TDefault>, number, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<TTableName>,
	): PgSmallSerial<TTableName, TNotNull, TDefault> {
		return new PgSmallSerial<TTableName, TNotNull, TDefault>(table, this);
	}
}

export class PgSmallSerial<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, number, number, TNotNull, TDefault> {
	getSQLType(): string {
		return 'smallserial';
	}

	override mapFromDriverValue(value: any): number {
		if (typeof value === 'number') {
			return value;
		}
		return parseInt(value);
	}
}

export function smallserial(name: string) {
	return new PgSmallSerialBuilder(name);
}
