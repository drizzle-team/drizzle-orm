import { GetColumnData } from 'drizzle-orm';
import { SelectFieldsOrdered as SelectFieldsOrderedBase } from 'drizzle-orm/operations';
import { SQL, SQLResponse } from 'drizzle-orm/sql';
import { Simplify } from 'drizzle-orm/utils';

import { AnyPgColumn } from '~/columns/common';
import { AnyPgTable, GetTableConfig } from '~/table';

export type SelectFields = {
	[Key: string]: SQL | SQLResponse | AnyPgColumn | SelectFields | AnyPgTable;
};

export type SelectFieldsOrdered = (
	& Omit<SelectFieldsOrderedBase[number], 'column'>
	& { field: AnyPgColumn | SQL | SQLResponse }
)[];

export type SelectResultField<T> = T extends AnyPgTable ? SelectResultField<GetTableConfig<T, 'columns'>>
	: T extends AnyPgColumn ? GetColumnData<T>
	: T extends SQLResponse<infer TDriverParam> ? TDriverParam
	: T extends SQL ? unknown
	: T extends Record<string, any> ? { [Key in keyof T]: SelectResultField<T[Key]> }
	: never;

export type SelectResultFields<TSelectedFields extends SelectFields> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: SelectResultField<TSelectedFields[Key]>;
	}
>;
