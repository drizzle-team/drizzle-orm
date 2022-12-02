import { GetColumnData } from 'drizzle-orm';
import { SelectFieldsOrderedV2 as SelectFieldsOrderedBase } from 'drizzle-orm/operations';
import { SQL, SQLResponse } from 'drizzle-orm/sql';
import { Simplify } from 'drizzle-orm/utils';

import { AnySQLiteColumn } from './columns/common';
import { AnySQLiteTable, GetTableConfig } from './table';

export type SQLiteSelectFields = {
	[Key: string]: SQL | SQLResponse | AnySQLiteColumn | SQLiteSelectFields | AnySQLiteTable;
};

export type SelectFieldsOrdered = (
	& Omit<SelectFieldsOrderedBase[number], 'column'>
	& { field: AnySQLiteColumn | SQL | SQLResponse }
)[];

export type SelectResultField<T> = T extends AnySQLiteTable ? SelectResultField<GetTableConfig<T, 'columns'>>
	: T extends AnySQLiteColumn ? GetColumnData<T>
	: T extends SQLResponse<infer TDriverParam> ? TDriverParam
	: T extends SQL ? unknown
	: T extends Record<string, any> ? { [Key in keyof T]: SelectResultField<T[Key]> }
	: never;

export type SelectResultFields<TSelectedFields extends SQLiteSelectFields> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: SelectResultField<TSelectedFields[Key]>;
	}
>;
