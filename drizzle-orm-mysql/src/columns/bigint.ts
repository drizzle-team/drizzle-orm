import {
	ColumnData,
	ColumnDriverParam,
	ColumnHasDefault,
	ColumnNotNull,
	TableName,
} from 'drizzle-orm/branded-types';

import { AnyMySqlTable } from '~/table';

import {
	MySqlColumn,
	MySqlColumnBuilder,
	MySqlColumnBuilderWithAutoIncrement,
	MySqlColumnWithAutoIncrement,
} from './common';

export class MySqlBigInt53Builder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilderWithAutoIncrement<
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlBigInt53<TTableName, TNotNull, THasDefault> {
		return new MySqlBigInt53<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlBigInt53<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnWithAutoIncrement<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	brand!: 'MySqlBigInt53';

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

export class MySqlBigInt64Builder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<bigint>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlBigInt64<TTableName, TNotNull, THasDefault> {
		return new MySqlBigInt64<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlBigInt64<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumn<
	TTableName,
	ColumnData<bigint>,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	brand!: 'MySqlBigInt64';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

interface MySqlBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigint(name: string, config: MySqlBigIntConfig<'number'>): MySqlBigInt53Builder;
export function bigint(name: string, config: MySqlBigIntConfig<'bigint'>): MySqlBigInt64Builder;
export function bigint(name: string, { mode }: MySqlBigIntConfig) {
	if (mode === 'number') {
		return new MySqlBigInt53Builder(name);
	}
	return new MySqlBigInt64Builder(name);
}
