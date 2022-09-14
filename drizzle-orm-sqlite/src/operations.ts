import { GetColumnData } from 'drizzle-orm';
import { ColumnData, TableName, Unwrap } from 'drizzle-orm/branded-types';
import { SelectFieldsOrdered } from 'drizzle-orm/operations';
import { AnySQLResponse, SQLResponse } from 'drizzle-orm/sql';
import { GetTableName, tableColumns, tableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';
import { SQLiteColumnDriverParam } from './branded-types';

import { AnySQLiteColumn } from './columns/common';
import { AnySQLiteDialect, SQLiteSession } from './connection';
import { SQLiteDelete, SQLiteInsert, SQLiteSelect, SQLiteUpdate } from './queries';
import { AnySQLiteTable, InferModel } from './table';

export type SQLiteSelectFields<
	TTableName extends TableName,
> = {
	[key: string]:
		| SQLResponse<TTableName, ColumnData>
		| AnySQLiteColumn<TTableName>;
};

export type SQLiteSelectFieldsOrdered<TTableName extends TableName = TableName> = (
	& Omit<SelectFieldsOrdered[number], 'column'>
	& {
		column: AnySQLiteColumn<TTableName> | AnySQLResponse<TTableName>;
	}
)[];

export type SelectResultFields<
	TSelectedFields extends SQLiteSelectFields<TableName>,
> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: TSelectedFields[Key] extends AnySQLiteColumn
			? GetColumnData<TSelectedFields[Key]>
			: TSelectedFields[Key] extends SQLResponse<TableName, infer TDriverParam> ? Unwrap<TDriverParam>
			: never;
	}
>;

export class SQLiteTableOperations<TTable extends AnySQLiteTable, TTableNamesMap extends Record<string, string>> {
	constructor(
		protected table: TTable,
		private session: SQLiteSession,
		private dialect: AnySQLiteDialect,
		private tableNamesMap: TTableNamesMap,
	) {}

	select(): SQLiteSelect<TTable, TTableNamesMap, InferModel<TTable>>;
	select<TSelectedFields extends SQLiteSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): SQLiteSelect<TTable, TTableNamesMap, SelectResultFields<TSelectedFields>>;
	select(fields?: SQLiteSelectFields<GetTableName<TTable>>): SQLiteSelect<TTable, TTableNamesMap, any> {
		const fieldsOrdered = this.dialect.orderSelectedFields(
			fields ?? this.table[tableColumns] as Record<string, AnySQLiteColumn>,
			this.tableNamesMap[this.table[tableName]]!,
		);
		return new SQLiteSelect(this.table, fieldsOrdered, this.session, this.dialect, this.tableNamesMap);
	}

	update(): Pick<SQLiteUpdate<TTable>, 'set'> {
		return new SQLiteUpdate(this.table, this.session, this.dialect);
	}

	insert(values: InferModel<TTable, 'insert'> | InferModel<TTable, 'insert'>[]): SQLiteInsert<TTable> {
		return new SQLiteInsert(
			this.table,
			Array.isArray(values) ? values : [values],
			this.session,
			this.dialect,
		);
	}

	delete(): SQLiteDelete<TTable> {
		return new SQLiteDelete(this.table, this.session, this.dialect);
	}
}
