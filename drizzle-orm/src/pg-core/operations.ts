import { GetColumnData } from '~/column';
import { SelectFieldsOrdered as SelectFieldsOrderedBase } from '~/operations';
import { SQL, SQLResponse } from '~/sql';
import { Simplify } from '~/utils';

import { AnyPgColumn } from '~/pg-core/columns/common';
import { AnyPgTable, GetTableConfig } from '~/pg-core/table';

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
