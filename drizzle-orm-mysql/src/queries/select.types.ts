import { AnyColumn } from 'drizzle-orm';
import { TableName, Unwrap } from 'drizzle-orm/branded-types';
import { GetTableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyMySqlColumn, ChangeColumnTable } from '~/columns/common';
import { MySqlSelectFields, SelectResultFields } from '~/operations';
import { AnyMySQL } from '~/sql';
import { AnyMySqlTable, GetTableColumns } from '~/table';
import { MySqlSelect } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full' | 'full outer';

export interface JoinsValue {
	on: AnyMySQL;
	table: AnyMySqlTable;
	joinType: JoinType;
	aliasTable: AnyMySqlTable;
}

export type SelectResult<
	TTable extends AnyMySqlTable,
	TReturn,
	TInitialSelectResultFields extends Record<string, unknown>,
	TTableNamesMap extends Record<string, string>,
> = TReturn extends undefined ? TInitialSelectResultFields[]
	: Simplify<TReturn & { [Key in TTableNamesMap[Unwrap<GetTableName<TTable>>]]: TInitialSelectResultFields }>[];

export type AnyMySqlSelect = MySqlSelect<AnyMySqlTable, any, any, any, any>;

export type QueryFinisherMethods = 'getQuery' | 'getSQL' | 'execute';

export type PickJoin<TJoinReturn extends AnyMySqlSelect> = TJoinReturn;
export type PickWhere<TJoinReturn extends AnyMySqlSelect> = Omit<
	TJoinReturn,
	'where' | `${JoinType}Join`
>;
export type PickOrderBy<TJoinReturn extends AnyMySqlSelect> = Pick<
	TJoinReturn,
	'limit' | 'offset' | QueryFinisherMethods
>;
export type PickLimit<TJoinReturn extends AnyMySqlSelect> = Pick<TJoinReturn, 'offset' | QueryFinisherMethods>;
export type PickOffset<TJoinReturn extends AnyMySqlSelect> = Pick<TJoinReturn, QueryFinisherMethods>;

export type BuildAliasName<
	TTable extends AnyMySqlTable,
	TTableNamesMap extends Record<string, string>,
	TAlias extends { [name: string]: number },
> = `${TTableNamesMap[Unwrap<GetTableName<TTable>>]}${GetAliasSuffix<GetTableName<TTable>, TAlias>}`;

export type BuildAliasTable<TTable extends AnyMySqlTable, TAlias extends TableName> = MapColumnsToTableAlias<
	GetTableColumns<TTable>,
	TAlias
>;

export type MapColumnsToTableAlias<TColumns extends Record<string, AnyMySqlColumn>, TAlias extends TableName> = {
	[Key in keyof TColumns]: ChangeColumnTable<TColumns[Key], TAlias>;
};

export type GetAliasSuffix<
	TTableName extends TableName,
	TAlias extends { [name: string]: number },
> = TAlias extends { [name in Unwrap<TTableName>]: infer N } ? (N extends number ? `_${N}` : never) : '';

export type AppendToResult<
	TReturn,
	TAlias extends string,
	TSelectedFields extends MySqlSelectFields<TableName>,
> = TReturn extends undefined ? { [Key in TAlias]: SelectResultFields<TableName, TSelectedFields> }
	: Simplify<TReturn & { [Key in TAlias]: SelectResultFields<TableName, TSelectedFields> }>;

export type AppendToAliases<
	TJoins extends { [k: string]: AnyMySqlTable | Record<string, AnyColumn> },
	TJoinedTable extends AnyMySqlTable,
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
	TJoinedTable extends AnyMySqlTable<TableName<keyof TTableNamesMap & string>>,
	TJoinName extends string,
	TAliasName extends string = TJoinName,
> =
	| ((
		aliases: AppendToAliases<TAliases, TJoinedTable, TJoinName, TAliasName>,
	) => AnyMySQL<TableName<TJoinedTableNames | TAliasName>>)
	| AnyMySQL<TableName<TJoinedTableNames | TAliasName>>;

export type JoinSelect<
	TJoinedTable extends AnyMySqlTable,
	TAliasName extends string,
	TSelectedFields extends MySqlSelectFields<TableName>,
> = ((table: BuildAliasTable<TJoinedTable, TableName<TAliasName>>) => TSelectedFields) | TSelectedFields;
