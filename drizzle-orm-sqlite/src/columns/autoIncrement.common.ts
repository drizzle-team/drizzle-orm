import { ColumnData, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { SQLiteColumnDriverParam } from '~/branded-types';
import { AnySQLiteTable } from '..';
import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export abstract class SQLiteColumnBuilderWithAutoIncrement<
	TData extends ColumnData,
	TDriverParam extends SQLiteColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends SQLiteColumnBuilder<TData, TDriverParam, TNotNull, THasDefault> {
	/** @internal */
	_autoIncrement = false;

	autoIncrement(): SQLiteColumnBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>> {
		this._autoIncrement = true;
		return this as ReturnType<this['autoIncrement']>;
	}

	/** @internal */
	abstract override build<TTableName extends TableName>(
		table: AnySQLiteTable<TTableName>,
	): SQLiteColumnWithAutoIncrement<TTableName, TData, TDriverParam, TNotNull, THasDefault>;
}

export abstract class SQLiteColumnWithAutoIncrement<
	TTableName extends TableName<string>,
	TDataType extends ColumnData,
	TDriverData extends SQLiteColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends SQLiteColumn<TTableName, TDataType, TDriverData, TNotNull, THasDefault> {
	readonly autoIncrement: boolean;

	constructor(
		override readonly table: AnySQLiteTable<TTableName>,
		builder: SQLiteColumnBuilderWithAutoIncrement<TDataType, TDriverData, TNotNull, THasDefault>,
	) {
		super(table, builder);
		this.autoIncrement = builder._autoIncrement;
	}
}
