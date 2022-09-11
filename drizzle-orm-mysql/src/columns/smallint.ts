import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlSmallIntBuilder<
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
	): MySqlSmallInt<TTableName, TNotNull, THasDefault> {
		return new MySqlSmallInt<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlSmallInt<
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
	protected brand!: 'MySqlSmallInt';

	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	}
}

export function smallint(name: string) {
	return new MySqlSmallIntBuilder(name);
}
