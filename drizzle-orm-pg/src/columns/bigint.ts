import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgBigInt53Builder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<ColumnData<number>, ColumnDriverParam<number | string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgBigInt53<TTableName, TNotNull, THasDefault> {
		return new PgBigInt53<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class PgBigInt53<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<number>, ColumnDriverParam<number | string>, TNotNull, THasDefault> {
	brand!: 'PgBigInt53';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: ColumnDriverParam<number | string>): ColumnData<number> {
		if (typeof value === 'number') {
			return value as ColumnData<any>;
		}
		return parseInt(value) as ColumnData<number>;
	}
}

export class PgBigInt64Builder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<ColumnData<bigint>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgBigInt64<TTableName, TNotNull, THasDefault> {
		return new PgBigInt64<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class PgBigInt64<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<bigint>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	brand!: 'PgBigInt64';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: ColumnDriverParam<string>): ColumnData<bigint> {
		return BigInt(value) as ColumnData<bigint>;
	}
}

export function bigint(name: string, maxBytes: 'max_bytes_53' | 'max_bytes_64') {
	if (maxBytes === 'max_bytes_53') {
		return new PgBigInt53Builder(name);
	}
	return new PgBigInt64Builder(name);
}
