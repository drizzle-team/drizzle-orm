import { GetColumnData } from '~/column';
import { SelectFieldsOrdered as SelectFieldsOrderedBase } from '~/operations';
import { SQL, SQLResponse } from '~/sql';
import { Simplify } from '~/utils';
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
