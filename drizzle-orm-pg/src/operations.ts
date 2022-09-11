import { GetColumnData } from 'drizzle-orm';
import { ColumnData, TableName, Unwrap } from 'drizzle-orm/branded-types';
import { SelectFieldsOrdered } from 'drizzle-orm/operations';
import { AnySQLResponse, SQLResponse } from 'drizzle-orm/sql';
import { GetTableName, tableColumns, tableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgColumn } from './columns/common';
import { AnyPgDialect, PgSession } from './connection';
import { PgDelete, PgInsert, PgSelect, PgUpdate } from './queries';
import { AnyPgSQL, PgSQL } from './sql';
import { AnyPgTable, InferModel } from './table';

export type PgSelectFields<
	TTableName extends TableName,
> = Record<
	string,
	| PgSQL<TTableName | TableName>
	| SQLResponse<TTableName | TableName, ColumnData>
	| AnyPgColumn<TTableName>
>;

export type PgSelectFieldsOrdered = (
	& Omit<SelectFieldsOrdered[number], 'column'>
	& { column: AnyPgColumn | AnyPgSQL | AnySQLResponse }
)[];

export type SelectResultFields<
	TSelectedFields extends PgSelectFields<TableName>,
> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: TSelectedFields[Key] extends infer TField
			? TField extends AnyPgColumn ? GetColumnData<TField>
			: TField extends SQLResponse<TableName, infer TDriverParam> ? Unwrap<TDriverParam>
			: TField extends PgSQL<TableName> ? unknown
			: never
			: never;
	}
>;

export class PgTableOperations<TTable extends AnyPgTable, TTableNamesMap extends Record<string, string>> {
	constructor(
		protected table: TTable,
		private session: PgSession,
		private dialect: AnyPgDialect,
		private tableNamesMap: TTableNamesMap,
	) {}

	select(): PgSelect<TTable, TTableNamesMap, InferModel<TTable>>;
	select<TSelectedFields extends PgSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): PgSelect<TTable, TTableNamesMap, SelectResultFields<TSelectedFields>>;
	select(fields?: PgSelectFields<GetTableName<TTable>>): PgSelect<TTable, TTableNamesMap, any> {
		const fieldsOrdered = this.dialect.orderSelectedFields(
			fields ?? this.table[tableColumns] as Record<string, AnyPgColumn>,
			this.tableNamesMap[this.table[tableName]]!,
		);
		return new PgSelect(this.table, fieldsOrdered, this.session, this.dialect, this.tableNamesMap);
	}

	update(): Pick<PgUpdate<TTable>, 'set'> {
		return new PgUpdate(this.table, this.session, this.dialect);
	}

	insert(values: InferModel<TTable, 'insert'> | InferModel<TTable, 'insert'>[]): PgInsert<TTable> {
		return new PgInsert(
			this.table,
			Array.isArray(values) ? values : [values],
			this.session,
			this.dialect,
		);
	}

	delete(): PgDelete<TTable> {
		return new PgDelete(this.table, this.session, this.dialect);
	}
}
