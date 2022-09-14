import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnySQLiteTable } from '~/table';

import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export class SQLiteTextBuilder<
	TData extends string = string,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends SQLiteColumnBuilder<ColumnData<TData>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnySQLiteTable<TTableName>,
	): SQLiteText<TTableName, TNotNull, THasDefault, TData> {
		return new SQLiteText(table, this);
	}
}

export class SQLiteText<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
	TData extends string,
> extends SQLiteColumn<
	TTableName,
	ColumnData<TData>,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'SQLiteText';

	getSQLType(): string {
		return 'text';
	}
}

export function text<T extends string = string>(name: string) {
	return new SQLiteTextBuilder<T>(name);
}
