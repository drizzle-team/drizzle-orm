import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlIntegerBuilder<
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
	): MySqlInteger<TTableName, TNotNull, THasDefault> {
		return new MySqlInteger<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlInteger<
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
	protected brand!: 'MySqlInteger';

	getSQLType(): string {
		return 'int';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	}
}

export function int(name: string) {
	return new MySqlIntegerBuilder(name);
}
