import { AnyTable, Table, AnyColumn, Column, InferColumnType } from '.';
import { SQL } from './sql';
import { TableName } from './utils';

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

export type InferType<
	TTable extends AnyTable,
	TInferMode extends 'select' | 'insert' = 'select',
> = TTable extends Table<any, infer TColumns>
	? TInferMode extends 'insert'
		? {
				[Key in keyof TColumns as RequiredKeyOnly<Key, TColumns[Key]>]: InferColumnType<
					TColumns[Key],
					'query'
				>;
		  } & {
				[Key in keyof TColumns as OptionalKeyOnly<Key, TColumns[Key]>]?: InferColumnType<
					TColumns[Key],
					'query'
				>;
		  }
		: {
				[Key in keyof TColumns]: InferColumnType<TColumns[Key], 'query'>;
		  }
	: never;

export interface UpdateConfig {
	where: SQL;
	set: SQL;
	table: AnyTable;
}

export type SelectFields<TTableName extends string> = {
	[Key: string]: SQL<TTableName> | Column<TTableName>;
};

export interface SelectConfig<TTable extends AnyTable> {
	fields: SelectFields<TableName<TTable>> | undefined;
	where: SQL<TableName<TTable>>;
	table: TTable;
}

export interface Return {}
