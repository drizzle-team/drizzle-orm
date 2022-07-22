import { GetColumnData } from 'drizzle-orm';
import { ColumnData, TableName, Unwrap } from 'drizzle-orm/branded-types';
import { SelectFields } from 'drizzle-orm/operations';
import { AnySQLResponse, SQLResponse } from 'drizzle-orm/sql';
import { GetTableName, tableColumns } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';
import { PgColumnDriverParam } from './branded-types';

import { AnyPgColumn } from './columns/common';
import { AnyPgDialect, PgSession } from './connection';
import { PgDelete, PgInsert, PgSelect, PgUpdate } from './queries';
import { AnyPgTable, InferModel } from './table';

export type PgSelectFields<TTableName extends TableName> = SelectFields<TTableName, PgColumnDriverParam>;

export type PgSelectFieldsOrdered<TTableName extends TableName = TableName> = {
	name: string;
	column: AnyPgColumn<TTableName> | AnySQLResponse<TTableName>;
}[];

export type SelectResultFields<
	TTableName extends TableName,
	TSelectedFields extends PgSelectFields<TTableName>,
> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: TSelectedFields[Key] extends AnyPgColumn
			? GetColumnData<TSelectedFields[Key]>
			: TSelectedFields[Key] extends SQLResponse<TableName, infer TDriverParam> ? Unwrap<TDriverParam>
			: never;
	}
>;

export class PgTableOperations<TTable extends AnyPgTable, TTableNamesMap extends Record<string, string>> {
	constructor(
		protected table: TTable,
		private session: PgSession,
		private dialect: AnyPgDialect,
	) {}

	select(): PgSelect<TTable, TTableNamesMap, InferModel<TTable>>;
	select<TSelectedFields extends PgSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): PgSelect<TTable, TTableNamesMap, SelectResultFields<GetTableName<TTable>, TSelectedFields>>;
	select(fields?: PgSelectFields<GetTableName<TTable>>): PgSelect<TTable, TTableNamesMap, any> {
		const fieldsOrdered = this.dialect.orderSelectedFields(
			fields ?? this.table[tableColumns] as PgSelectFields<GetTableName<TTable>>,
		);
		return new PgSelect(this.table, fieldsOrdered, this.session, this.dialect);
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
