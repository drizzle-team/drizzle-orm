import { Simplify } from 'type-fest';

import { AnyColumn, Column, InferColumnType } from './column';
import { SQLExpr } from './sql';
import { AnyTable, Table } from './table';

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

export type InferColumns<TTable extends AnyTable> = TTable extends Table<any, infer TColumns>
	? TColumns
	: never;

export type InferType<
	TTable extends AnyTable,
	TInferMode extends 'select' | 'insert' = 'select',
> = TTable extends Table<any, infer TColumns>
	? TInferMode extends 'insert'
		? Simplify<
				{
					[Key in keyof TColumns as RequiredKeyOnly<Key, TColumns[Key]>]: InferColumnType<
						TColumns[Key],
						'query'
					>;
				} & {
					[Key in keyof TColumns as OptionalKeyOnly<
						Key,
						TColumns[Key]
					>]?: InferColumnType<TColumns[Key], 'query'>;
				}
		  >
		: {
				[Key in keyof TColumns]: InferColumnType<TColumns[Key], 'query'>;
		  }
	: never;

export type SelectFields<TTableName extends string> = {
	[Key: string]: SQLExpr<TTableName> | Column<TTableName>;
};
