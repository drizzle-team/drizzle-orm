import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgBigSerial53Builder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgBigSerial53<string, TNotNull, TDefault>, number, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<TTableName>,
	): PgBigSerial53<TTableName, TNotNull, TDefault> {
		return new PgBigSerial53<TTableName, TNotNull, TDefault>(table, this);
	}
}

export class PgBigSerial53<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, number, number, TNotNull, TDefault> {
	getSQLType(): string {
		return 'bigserial';
	}

	override mapFromDriverValue(value: any): number {
		if (typeof value === 'number') {
			return value;
		}
		return parseInt(value);
	}
}

export class PgBigSerial64Builder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgBigSerial64<string, TNotNull, TDefault>, number, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<TTableName>,
	): PgBigSerial64<TTableName, TNotNull, TDefault> {
		return new PgBigSerial64<TTableName, TNotNull, TDefault>(table, this);
	}
}

export class PgBigSerial64<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, bigint, number, TNotNull, TDefault> {
	getSQLType(): string {
		return 'bigserial';
	}

	override mapFromDriverValue(value: any): bigint {
		return BigInt(value);
	}
}

export function bigSerial(name: string, maxBytes: 'max_bytes_53' | 'max_bytes_64') {
	if (maxBytes === 'max_bytes_53') {
		return new PgBigSerial53Builder(name);
	}
	return new PgBigSerial64Builder(name);
}
