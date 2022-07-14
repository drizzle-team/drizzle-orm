import { AnyColumn, Column } from './column';
import { SQLResponse } from './sql';

export type RequiredKeyOnly<TKey, T extends AnyColumn> = T extends Column<
	any,
	any,
	any,
	infer TDefault
>
	? TDefault extends false
		? TKey
		: never
	: never;

export type OptionalKeyOnly<TKey, T extends AnyColumn> = T extends Column<
	any,
	any,
	any,
	infer TDefault
>
	? [TDefault] extends [true]
		? TKey
		: never
	: never;

export type SelectFields<TTableName extends string> = {
	[Key: string]: SQLResponse<TTableName> | Column<TTableName>;
};
