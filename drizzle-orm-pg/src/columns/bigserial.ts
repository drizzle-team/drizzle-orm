import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgBigSerial53Builder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<ColumnData<number>, ColumnDriverParam<number>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgBigSerial53<TTableName, TNotNull, THasDefault> {
		return new PgBigSerial53<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class PgBigSerial53<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<number>, ColumnDriverParam<number>, TNotNull, THasDefault> {
	getSQLType(): string {
		return 'bigserial';
	}

	override mapFromDriverValue(value: ColumnDriverParam<number>): ColumnData<number> {
		if (typeof value === 'number') {
			return value as ColumnData<any>;
		}
		return parseInt(value) as ColumnData<number>;
	}
}

export class PgBigSerial64Builder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<ColumnData<bigint>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgBigSerial64<TTableName, TNotNull, THasDefault> {
		return new PgBigSerial64<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class PgBigSerial64<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<bigint>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	getSQLType(): string {
		return 'bigserial';
	}

	override mapFromDriverValue(value: ColumnDriverParam<string>): ColumnData<bigint> {
		return BigInt(value) as ColumnData<bigint>;
	}
}

export function bigserial(name: string, maxBytes: 'max_bytes_53' | 'max_bytes_64') {
	if (maxBytes === 'max_bytes_53') {
		return new PgBigSerial53Builder(name);
	}
	return new PgBigSerial64Builder(name);
}
