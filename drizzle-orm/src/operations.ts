import { AnyColumn, Column } from './column';
import { SQLResponse } from './sql';

export type RequiredKeyOnly<TKey extends string, T extends AnyColumn> = T extends Column<
	any,
	any,
	any,
	infer TNotNull,
	infer TDefault
>
	? [TNotNull, TDefault] extends [true, false] | []
		? TKey
		: never
	: never;

export type OptionalKeyOnly<
	TKey extends string,
	T extends AnyColumn,
> = TKey extends RequiredKeyOnly<TKey, T> ? never : TKey;

export type SelectFields<TTableName extends string, TDriverParam> = {
	[key: string]: SQLResponse<TTableName, TDriverParam> | AnyColumn<TTableName>;
};
