import { AnyColumn } from './column';
import { SQL, SQLResponse } from './sql';

export type RequiredKeyOnly<TKey extends string, T extends AnyColumn> = T extends
	AnyColumn<{ notNull: true; hasDefault: false }> ? TKey
	: never;

export type OptionalKeyOnly<TKey extends string, T extends AnyColumn> = TKey extends RequiredKeyOnly<TKey, T> ? never
	: TKey;

export type SelectFields<TTableName extends string, TColumnDriverParam> = {
	[key: string]:
		| SQL
		| SQLResponse
		| AnyColumn<{ tableName: TTableName; driverParam: TColumnDriverParam }>;
};

export type SelectFieldsOrdered = {
	name: string;
	resultTableName: string;
	field: AnyColumn | SQL | SQLResponse;
}[];
