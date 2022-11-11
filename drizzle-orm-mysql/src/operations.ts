import { GetColumnData } from 'drizzle-orm';
import { ColumnData, TableName, Unwrap } from 'drizzle-orm/branded-types';
import { SelectFieldsOrdered } from 'drizzle-orm/operations';
import { AnySQLResponse, SQLResponse } from 'drizzle-orm/sql';
import { GetTableName, tableColumns, tableNameSym } from 'drizzle-orm/utils';
import { Simplify } from 'drizzle-orm/utils';
import { AnyMySqlColumn } from './columns';
import { AnyMySqlDialect, MySqlSession } from './connection';
import { MySqlDelete, MySqlInsert, MySqlSelect, MySqlUpdate } from './queries';
import { AnyMySQL, MySQL } from './sql';
import { AnyMySqlTable, InferModel } from './table';

export type MySqlSelectFields<
	TTableName extends string,
> = {
	[key: string]:
		| SQLResponse<TTableName | TableName, ColumnData>
		| MySQL<TTableName | string>
		| AnyMySqlColumn<TTableName>;
};

export type MySqlSelectFieldsOrdered<TTableName extends string = string> = (
	& Omit<SelectFieldsOrdered[number], 'column'>
	& {
		column: AnyMySqlColumn<TTableName> | MySQL<TTableName | string> | AnySQLResponse<TTableName | string>;
	}
)[];

export type SelectResultFields<
	TSelectedFields extends MySqlSelectFields<string>,
> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: TSelectedFields[Key] extends AnyMySqlColumn
			? GetColumnData<TSelectedFields[Key]>
			: TSelectedFields[Key] extends SQLResponse<TableName, infer TDriverParam> ? Unwrap<TDriverParam>
			: TSelectedFields[Key] extends AnyMySQL ? unknown
			: never;
	}
>;

export class MySqlTableOperations<TTable extends AnyMySqlTable, TTableNamesMap extends Record<string, string>> {
	constructor(
		protected table: TTable,
		private session: MySqlSession,
		private dialect: AnyMySqlDialect,
		private tableNamesMap: TTableNamesMap,
	) {}

	select(): MySqlSelect<TTable, TTableNamesMap, InferModel<TTable>>;
	select<TSelectedFields extends MySqlSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): MySqlSelect<TTable, TTableNamesMap, SelectResultFields<TSelectedFields>>;
	select(fields?: MySqlSelectFields<GetTableConfig<TTable, 'name'>>): MySqlSelect<TTable, TTableNamesMap, any> {
		const fieldsOrdered = this.dialect.orderSelectedFields(
			fields ?? this.table[tableColumns] as Record<string, AnyMySqlColumn>,
			this.tableNamesMap[this.table[tableNameSym]]!,
		);
		return new MySqlSelect(this.table, fieldsOrdered, this.session, this.dialect, this.tableNamesMap);
	}

	update(): Pick<MySqlUpdate<TTable>, 'set'> {
		return new MySqlUpdate(this.table, this.session, this.dialect);
	}

	insert(values: InferModel<TTable, 'insert'> | InferModel<TTable, 'insert'>[]): MySqlInsert<TTable> {
		return new MySqlInsert(
			this.table,
			Array.isArray(values) ? values : [values],
			this.session,
			this.dialect,
		);
	}

	delete(): MySqlDelete<TTable> {
		return new MySqlDelete(this.table, this.session, this.dialect);
	}
}
