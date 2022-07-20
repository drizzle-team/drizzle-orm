import { ChangeColumnTable } from 'drizzle-orm';
import { TableName, Unwrap } from 'drizzle-orm/branded-types';
import { GetTableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgColumn } from '~/columns';
import { PgSelectFields, SelectResultFields } from '~/operations';
import { AnyPgTable, GetTableColumns } from '~/table';

export type BuildAliasName<
	TTable extends AnyPgTable,
	TAlias extends { [name: string]: number },
> = TableName<`${GetTableName<TTable>}${GetAliasIndex<GetTableName<TTable>, TAlias>}`>;

export type BuildAliasTable<TTable extends AnyPgTable, TAlias extends TableName> = MapColumnsToTableAlias<
	GetTableColumns<TTable>,
	TAlias
>;

export type MapColumnsToTableAlias<TColumns extends Record<string, AnyPgColumn>, TAlias extends TableName> = {
	[Key in keyof TColumns]: ChangeColumnTable<TColumns[Key], TAlias>;
};

type Increment<
	TNumber extends number,
	TCounter extends any[] = [],
> = TCounter['length'] extends TNumber ? [...TCounter, 0]['length']
	: Increment<TNumber, [...TCounter, 0]>;

export type IncrementAlias<
	TTableName extends string,
	TAlias extends { [name: string]: number },
> = TAlias extends { [key in TTableName]: infer N } ? N extends number ? Simplify<
			& Omit<TAlias, TTableName>
			& {
				[K in TTableName]: Increment<N>;
			}
		>
	: never
	: Omit<TAlias, TTableName> & { [Key in TTableName]: 2 };

export type GetAliasIndex<
	TTableName extends TableName,
	TAlias extends { [name: string]: number },
> = TAlias extends { [name in Unwrap<TTableName>]: infer N } ? (N extends number ? N : never) : 1;

export type AppendToReturn<
	TReturn,
	TAlias extends TableName,
	TSelectedFields extends PgSelectFields<TableName>,
> = TReturn extends undefined ? { [Key in Unwrap<TAlias>]: SelectResultFields<TableName, TSelectedFields> }
	: Simplify<TReturn & { [Key in Unwrap<TAlias>]: SelectResultFields<TableName, TSelectedFields> }>;

export type AppendToJoins<
	TJoins extends { [k: string]: any },
	TJoinedTable extends AnyPgTable,
	TAlias extends { [name: string]: number },
> = Simplify<
	& TJoins
	& {
		[Alias in Unwrap<BuildAliasName<TJoinedTable, TAlias>>]: BuildAliasTable<TJoinedTable, TableName<Alias>>;
	},
	{
		deep: true;
	}
>;
