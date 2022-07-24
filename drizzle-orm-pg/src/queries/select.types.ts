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
	aliasTable: AnyPgTable;
}

export type SelectResult<
	TTable extends AnyPgTable,
	TReturn,
	TInitialSelectResultFields extends Record<string, unknown>,
	TTableNamesMap extends Record<string, string>,
> = TReturn extends undefined ? TInitialSelectResultFields[]
	: Simplify<TReturn & { [Key in TTableNamesMap[Unwrap<GetTableName<TTable>>]]: TInitialSelectResultFields }>[];

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
> = `${TTableNamesMap[Unwrap<GetTableName<TTable>>]}${GetAliasSuffix<GetTableName<TTable>, TAlias>}`;

export type BuildAliasTable<TTable extends AnyPgTable, TAlias extends TableName> = MapColumnsToTableAlias<
	GetTableColumns<TTable>,
	TAlias
>;

export type MapColumnsToTableAlias<TColumns extends Record<string, AnyPgColumn>, TAlias extends TableName> = {
	[Key in keyof TColumns]: ChangeColumnTable<TColumns[Key], TAlias>;
};

export type GetAliasSuffix<
	TTableName extends TableName,
	TAlias extends { [name: string]: number },
> = TAlias extends { [name in Unwrap<TTableName>]: infer N } ? (N extends number ? `_${N}` : never) : '';

export type AppendToResult<
	TReturn,
	TAlias extends string,
	TSelectedFields extends PgSelectFields<TableName>,
> = TReturn extends undefined ? { [Key in TAlias]: SelectResultFields<TableName, TSelectedFields> }
	: Simplify<TReturn & { [Key in TAlias]: SelectResultFields<TableName, TSelectedFields> }>;

export type AppendToAliases<
	TJoins extends { [k: string]: AnyPgTable | Record<string, AnyColumn> },
	TJoinedTable extends AnyPgTable,
	TJoinName extends string,
	TAliasName extends string = TJoinName,
> = Simplify<
	& TJoins
	& {
		[Alias in TJoinName]: BuildAliasTable<
			TJoinedTable,
			TableName<TAliasName>
		>;
	},
	{
		deep: true;
	}
>;

export type JoinOn<
	TTableNamesMap extends Record<string, string>,
	TJoinedTableNames extends string,
	TAliases extends { [tableName: string]: any },
	TJoinedTable extends AnyPgTable<TableName<keyof TTableNamesMap & string>>,
	TJoinName extends string,
	TAliasName extends string = TJoinName,
> =
	| ((
		aliases: AppendToAliases<TAliases, TJoinedTable, TJoinName, TAliasName>,
	) => AnyPgSQL<TableName<TJoinedTableNames | TAliasName>>)
	| AnyPgSQL<TableName<TJoinedTableNames | TAliasName>>;

export type JoinSelect<
	TJoinedTable extends AnyPgTable,
	TAliasName extends string,
	TSelectedFields extends PgSelectFields<TableName>,
> = ((table: BuildAliasTable<TJoinedTable, TableName<TAliasName>>) => TSelectedFields) | TSelectedFields;
