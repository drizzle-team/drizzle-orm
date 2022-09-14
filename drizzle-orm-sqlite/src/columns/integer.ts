import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnySQLiteTable } from '../table';
import { SQLiteColumnBuilderWithAutoIncrement, SQLiteColumnWithAutoIncrement } from './autoIncrement.common';

export class SQLiteIntegerBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends SQLiteColumnBuilderWithAutoIncrement<
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnySQLiteTable<TTableName>,
	): SQLiteInteger<TTableName, TNotNull, THasDefault> {
		return new SQLiteInteger<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class SQLiteInteger<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends SQLiteColumnWithAutoIncrement<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number | string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'SQLiteInteger';

	getSQLType(): string {
		return 'integer';
	}

	override mapFromDriverValue = (
		value: ColumnDriverParam<number | string>,
	): ColumnData<number> => {
		if (typeof value === 'string') {
			return parseInt(value) as ColumnData<number>;
		}
		return value as ColumnData<any>;
	};
}

export function integer(name: string) {
	return new SQLiteIntegerBuilder(name);
}

export function int(name: string) {
	return new SQLiteIntegerBuilder(name);
}
