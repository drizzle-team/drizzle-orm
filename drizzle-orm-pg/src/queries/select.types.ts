import { AnyColumn, ChangeColumnTable } from 'drizzle-orm';
import { TableName, Unwrap } from 'drizzle-orm/branded-types';
import { GetTableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgColumn } from '~/columns';
import { PgSelectFields, SelectResultFields } from '~/operations';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable, GetTableColumns } from '~/table';
import { PgSelect } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full' | 'full outer';

export interface JoinsValue {
	on: AnyPgSQL;
	table: AnyPgTable;
	joinType: JoinType;
	alias: AnyPgTable;
}

export type SelectResult<
	TTable extends AnyPgTable,
	TReturn,
	TInitialSelectResultFields extends Record<string, unknown>,
> = TReturn extends undefined ? TInitialSelectResultFields[]
	: Simplify<TReturn & { [k in Unwrap<GetTableName<TTable>>]: TInitialSelectResultFields }>[];

export type AnyPgSelect = PgSelect<AnyPgTable, any, any, any, any>;

export type QueryFinisherMethods = 'getQuery' | 'getSQL' | 'execute';

export type PickJoin<TJoinReturn extends AnyPgSelect> = TJoinReturn;
export type PickWhere<TJoinReturn extends AnyPgSelect> = Omit<
	TJoinReturn,
	'where' | `${JoinType}Join`
>;
export type PickOrderBy<TJoinReturn extends AnyPgSelect> = Pick<
	TJoinReturn,
	'limit' | 'offset' | QueryFinisherMethods
>;
export type PickLimit<TJoinReturn extends AnyPgSelect> = Pick<TJoinReturn, 'offset' | QueryFinisherMethods>;
export type PickOffset<TJoinReturn extends AnyPgSelect> = Pick<TJoinReturn, QueryFinisherMethods>;

export type BuildAliasName<
	TTable extends AnyPgTable,
	TTableNamesMap extends Record<string, string>,
	TAlias extends { [name: string]: number },
> = `${TTableNamesMap[Unwrap<GetTableName<TTable>>]}${GetAliasIndex<GetTableName<TTable>, TAlias>}`;

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
	TTable extends AnyPgTable,
	TAlias extends { [name: string]: number },
	TTableName extends string = Unwrap<GetTableName<TTable>>,
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
	TJoins extends { [k: string]: AnyPgTable | Record<string, AnyColumn> },
	TJoinedTable extends AnyPgTable,
	TAlias extends { [name: string]: number },
	TTableNamesMap extends Record<string, string>,
> = Simplify<
	& TJoins
	& {
		[Alias in BuildAliasName<TJoinedTable, TTableNamesMap, TAlias>]: BuildAliasTable<
			TJoinedTable,
			TableName<Alias>
		>;
	},
	{
		deep: true;
	}
>;
