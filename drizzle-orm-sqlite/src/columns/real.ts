import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnySQLiteTable } from '../table';
import { SQLiteColumnBuilderWithAutoIncrement, SQLiteColumnWithAutoIncrement } from './autoIncrement.common';

export class SQLiteRealBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends SQLiteColumnBuilderWithAutoIncrement<
	ColumnData<number>,
	ColumnDriverParam<number>,
	TNotNull,
	THasDefault
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnySQLiteTable<TTableName>,
	): SQLiteReal<TTableName, TNotNull, THasDefault> {
		return new SQLiteReal<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class SQLiteReal<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends SQLiteColumnWithAutoIncrement<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'SQLiteInteger';

	getSQLType(): string {
		return 'real';
	}
}

export function real(name: string) {
	return new SQLiteRealBuilder(name);
}
