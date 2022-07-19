import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgBigInteger53Builder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgBigInteger53<string, TNotNull, TDefault>, number, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<TTableName>,
	): PgBigInteger53<TTableName, TNotNull, TDefault> {
		return new PgBigInteger53<TTableName, TNotNull, TDefault>(table, this);
	}
}

export class PgBigInteger53<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, number, number, TNotNull, TDefault> {
	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: any): number {
		if (typeof value === 'number') {
			return value;
		}
		return parseInt(value);
	}
}

export class PgBigInteger64Builder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgBigInteger64<string, TNotNull, TDefault>, number, TNotNull, TDefault> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<TTableName>,
	): PgBigInteger64<TTableName, TNotNull, TDefault> {
		return new PgBigInteger64<TTableName, TNotNull, TDefault>(table, this);
	}
}

export class PgBigInteger64<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, bigint, number, TNotNull, TDefault> {
	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: any): bigint {
		return BigInt(value);
	}
}

export function bigint(name: string, maxBytes: 'max_bytes_53' | 'max_bytes_64') {
	if (maxBytes === 'max_bytes_53') {
		return new PgBigInteger53Builder(name);
	}
	return new PgBigInteger64Builder(name);
}
