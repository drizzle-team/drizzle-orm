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
> extends PgColumn<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	brand!: 'PgBigInt53';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'number') {
			return value;
		}
		return parseInt(value);
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

abstract class Test {}

export class PgBigInt64<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, ColumnData<bigint>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	brand!: 'PgBigInt64';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

interface PgBigIntConfig<T extends 'number' | 'bigint'> {
	mode: T;
}

export function bigint(name: string, mode: PgBigIntConfig<'number'>): PgBigInt53Builder;
export function bigint(name: string, mode: PgBigIntConfig<'bigint'>): PgBigInt64Builder;
export function bigint(name: string, mode: any) {
	if (mode === 'number') {
		return new PgBigInt53Builder(name);
	}
	return new PgBigInt64Builder(name);
}
