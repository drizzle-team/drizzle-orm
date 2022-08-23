import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import {
	MySqlColumnBuilder,
	MySqlColumnBuilderWithAutoincrement,
	MySqlColumnWithAutoincrement,
	MySqlColumnWithMapper,
} from './common';

export class MySqlBigInt53Builder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilderWithAutoincrement<
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
> extends MySqlColumnWithAutoincrement<
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

	override mapFromDriverValue = (value: ColumnDriverParam<number | string>): ColumnData<number> => {
		if (typeof value === 'number') {
			return value as number as ColumnData<number>;
		}
		return parseInt(value) as ColumnData<number>;
	};
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
> extends MySqlColumnWithMapper<TTableName, ColumnData<bigint>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	brand!: 'MySqlBigInt64';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue = (value: ColumnDriverParam<string>): ColumnData<bigint> => {
		return BigInt(value) as ColumnData<bigint>;
	};
}

export function bigint(name: string, maxBytes: 'max_bytes_53' | 'max_bytes_64') {
	if (maxBytes === 'max_bytes_53') {
		return new MySqlBigInt53Builder(name);
	}
	return new MySqlBigInt64Builder(name);
}
