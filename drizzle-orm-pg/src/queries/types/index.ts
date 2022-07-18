import { TableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest/source/simplify';

import { PgColumn } from '~/columns';
import { PartialSelectResult, PgSelectFields } from '~/operations';
import { AnyPgTable, TableColumns } from '~/table';

export type BuildAlias<
	TTable extends AnyPgTable,
	TAlias extends { [name: string]: number },
> = `${TableName<TTable>}${GetAliasIndex<TableName<TTable>, TAlias>}`;

export type TableAlias<TTable extends AnyPgTable, TAlias extends string> = AliasColumns<
	TableColumns<TTable>,
	TAlias
>;

export type AliasColumns<TColumns, TAlias extends string> = {
	[Key in keyof TColumns]: TColumns[Key] extends PgColumn<
		any,
		infer TType,
		infer TDriverParam,
		infer TNotNull,
		infer TDefault
	>
		? PgColumn<TAlias, TType, TDriverParam, TNotNull, TDefault>
		: never;
};

type Increment<
	TNumber extends number,
	TCounter extends any[] = [],
> = TCounter['length'] extends TNumber
	? [...TCounter, 0]['length']
	: Increment<TNumber, [...TCounter, 0]>;

export type IncrementAlias<
	TTableName extends string,
	TAlias extends { [name: string]: number },
> = TAlias extends { [key in TTableName]: infer N }
	? N extends number
		? Simplify<
				Omit<TAlias, TTableName> & {
					[K in TTableName]: Increment<N>;
				}
		  >
		: never
	: Omit<TAlias, TTableName> & { [Key in TTableName]: 2 };

export type GetAliasIndex<
	TTableName extends string,
	TAlias extends { [name: string]: number },
> = TAlias extends { [name in TTableName]: infer N } ? (N extends number ? N : never) : 1;

export type AppendToReturn<
	TReturn,
	TAlias extends string,
	TSelectedFields extends PgSelectFields<string>,
> = TReturn extends undefined
	? { [Key in TAlias]: PartialSelectResult<string, TSelectedFields> }
	: Simplify<TReturn & { [Key in TAlias]: PartialSelectResult<string, TSelectedFields> }>;
