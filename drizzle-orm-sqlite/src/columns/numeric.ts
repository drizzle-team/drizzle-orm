import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnySQLiteTable } from '~/table';
import { SQLiteColumnBuilderWithAutoIncrement, SQLiteColumnWithAutoIncrement } from './autoIncrement.common';

export class SQLiteNumericBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends SQLiteColumnBuilderWithAutoIncrement<
	ColumnData<string>,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	constructor(name: string) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnySQLiteTable<TTableName>,
	): SQLiteNumeric<TTableName, TNotNull, THasDefault> {
		return new SQLiteNumeric(table, this);
	}
}

export class SQLiteNumeric<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends SQLiteColumnWithAutoIncrement<
	TTableName,
	ColumnData<string>,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'SQLiteNumeric';

	constructor(
		table: AnySQLiteTable<TTableName>,
		builder: SQLiteNumericBuilder<TNotNull, THasDefault>,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'numeric';
	}
}

export function numeric(name: string) {
	return new SQLiteNumericBuilder(name);
}
