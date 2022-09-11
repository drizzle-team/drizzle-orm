import { ColumnData, ColumnDriverParam, TableName } from './branded-types';
import { AnyColumn, Column } from './column';
import { AnySQL, AnySQLResponse, SQL, SQLResponse } from './sql';

export type RequiredKeyOnly<TKey extends string, T extends AnyColumn> = T extends
	Column<any, any, any, infer TNotNull, infer THasDefault> ? [TNotNull, THasDefault] extends [true, false] | [] ? TKey
	: never
	: never;

export type OptionalKeyOnly<TKey extends string, T extends AnyColumn> = TKey extends RequiredKeyOnly<TKey, T> ? never
	: TKey;

export type SelectFields<
	TTableName extends TableName,
	TColumnDriverParam extends ColumnDriverParam = ColumnDriverParam,
> = {
	[key: string]:
		| SQL<TTableName>
		| SQLResponse<TTableName, ColumnData>
		| AnyColumn<TTableName, any, TColumnDriverParam>;
};

export type SelectFieldsOrdered = {
	name: string;
	resultTableName: string;
	column: AnyColumn | AnySQL | AnySQLResponse;
}[];
