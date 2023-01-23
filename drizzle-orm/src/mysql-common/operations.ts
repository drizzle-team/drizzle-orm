import { GetColumnData } from 'drizzle-orm';
import { SelectFieldsOrdered as SelectFieldsOrderedBase } from 'drizzle-orm/operations';
import { SQL, SQLResponse } from 'drizzle-orm/sql';
import { Simplify } from 'drizzle-orm/utils';
import { AnyMySqlColumn } from './columns/common';
import { AnyMySqlTable, GetTableConfig } from './table';

export type SelectFields = {
	[Key: string]: SQL | SQLResponse | AnyMySqlColumn | SelectFields | AnyMySqlTable;
};

export type SelectFieldsOrdered = (
	& Omit<SelectFieldsOrderedBase[number], 'column'>
	& { field: AnyMySqlColumn | SQL | SQLResponse }
)[];

export type SelectResultField<T> = T extends AnyMySqlTable ? SelectResultField<GetTableConfig<T, 'columns'>>
	: T extends AnyMySqlColumn ? GetColumnData<T>
	: T extends SQLResponse<infer TDriverParam> ? TDriverParam
	: T extends SQL ? unknown
	: T extends Record<string, any> ? { [Key in keyof T]: SelectResultField<T[Key]> }
	: never;

export type SelectResultFields<TSelectedFields extends SelectFields> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: SelectResultField<TSelectedFields[Key]>;
	}
>;
