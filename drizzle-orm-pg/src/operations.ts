import { GetColumnData } from 'drizzle-orm';
import { SelectFieldsOrdered } from 'drizzle-orm/operations';
import { SQL, SQLResponse } from 'drizzle-orm/sql';
import { Simplify } from 'type-fest';

import { AnyPgColumn } from './columns/common';

export type PgSelectFields<TTableName extends string> = Record<
	string,
	| SQL
	| SQLResponse
	| AnyPgColumn<{ tableName: TTableName }>
>;

export type PgSelectFieldsOrdered = (
	& Omit<SelectFieldsOrdered[number], 'column'>
	& { field: AnyPgColumn | SQL | SQLResponse }
)[];

export type SelectResultFields<TSelectedFields extends PgSelectFields<string>> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: TSelectedFields[Key] extends infer TField
			? TField extends AnyPgColumn ? GetColumnData<TField>
			: TField extends SQLResponse<infer TDriverParam> ? TDriverParam
			: TField extends SQL ? unknown
			: never
			: never;
	}
>;
