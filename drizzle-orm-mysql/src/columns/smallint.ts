import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlSmallIntBuilder<
	TNotNull extends boolean = false,
	THasDefault extends boolean = false,
> extends MySqlColumnBuilderWithAutoIncrement<
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<TTableName>,
	): MySqlSmallInt<TTableName, TNotNull, THasDefault> {
		return new MySqlSmallInt<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlSmallInt<
	TTableName extends string,
	TNotNull extends boolean,
	THasDefault extends boolean,
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
