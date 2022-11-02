import { GetColumnData } from 'drizzle-orm';
import { SelectFieldsOrdered } from 'drizzle-orm/operations';
import { SQL, SQLResponse } from 'drizzle-orm/sql';
import { Simplify } from 'drizzle-orm/utils';

import { AnySQLiteColumn } from './columns/common';

export type SQLiteSelectFields<TTableName extends string> = Record<
	string,
	| SQL
	| SQLResponse
	| AnySQLiteColumn<{ tableName: TTableName }>
>;

export type SQLiteSelectFieldsOrdered = (
	& Omit<SelectFieldsOrdered[number], 'column'>
	& { field: AnySQLiteColumn | SQL | SQLResponse }
)[];

export type SelectResultFields<TSelectedFields extends SQLiteSelectFields<string>> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: TSelectedFields[Key] extends infer TField
			? TField extends AnySQLiteColumn ? GetColumnData<TField>
			: TField extends SQLResponse<infer TDriverParam> ? TDriverParam
			: TField extends SQL ? unknown
			: never
			: never;
	}
>;
