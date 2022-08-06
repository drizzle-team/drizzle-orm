import { AnyColumn } from 'drizzle-orm';
import { TableName, Unwrap } from 'drizzle-orm/branded-types';
import { GetTableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgColumn } from '~/columns';
import { ChangeColumnTable } from '~/columns/common';
import { PgSelectFields, SelectResultFields } from '~/operations';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable, GetTableColumns } from '~/table';

import { PgSelect } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export interface JoinsValue {
	on: AnyPgSQL;
	table: AnyPgTable;
	joinType: JoinType;
	aliasTable: AnyPgTable;
}

type NotNullableTablesOnly<Key extends string, TJoinsNotNullable extends Record<string, boolean>> =
	[TJoinsNotNullable[Key]] extends [true] ? Key : never;
type NullableTablesOnly<Key extends string, TJoinsNotNull extends Record<string, boolean>> = Key extends
	NotNullableTablesOnly<Key, TJoinsNotNull> ? never : Key;

type T = string extends never ? true : false;

type ApplyNotNullMapToJoins<
	TResult extends Record<string, Record<string, unknown>>,
	TJoinsNotNullable extends Record<string, boolean>,
> =
	& {
		[
			TTableName in (keyof TResult & keyof TJoinsNotNullable & string) as NotNullableTablesOnly<
				TTableName,
				TJoinsNotNullable
			>
		]: TResult[TTableName];
	}
	& {
		[
			TTableName in (keyof TResult & keyof TJoinsNotNullable & string) as NullableTablesOnly<
				TTableName,
				TJoinsNotNullable
			>
		]?: TResult[TTableName];
	};

export type SelectResult<
	TTable extends AnyPgTable,
	TReturn,
	TInitialSelectResultFields extends Record<string, unknown>,
	TTableNamesMap extends Record<string, string>,
	TJoinsNotNullable extends Record<string, boolean>,
> = TReturn extends undefined ? TInitialSelectResultFields[]
	: Simplify<
		ApplyNotNullMapToJoins<
			& TReturn
			& { [Key in TTableNamesMap[Unwrap<GetTableName<TTable>>]]: TInitialSelectResultFields },
			TJoinsNotNullable
		>
	>[];

export type AnyPgSelect = PgSelect<AnyPgTable, any, any, any, any, any, any>;

export type QueryFinisherMethods = 'getQuery' | 'getSQL' | 'execute';

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

export type BuildAliasTable<TTable extends AnyPgTable, TAlias extends TableName> = MapColumnsToTableAlias<
	GetTableColumns<TTable>,
	TAlias
>;

export type MapColumnsToTableAlias<TColumns extends Record<string, AnyPgColumn>, TAlias extends TableName> = {
	[Key in keyof TColumns]: ChangeColumnTable<TColumns[Key], TAlias>;
};

export type AppendToResult<
	TReturn,
	TJoinedName extends string,
	TSelectedFields extends PgSelectFields<TableName>,
> = TReturn extends undefined ? { [Key in TJoinedName]: SelectResultFields<TSelectedFields> }
	: Simplify<TReturn & { [Key in TJoinedName]: SelectResultFields<TSelectedFields> }>;

export type AppendToAliases<
	TJoins extends { [k: string]: AnyPgTable | Record<string, AnyColumn> },
	TJoinedTable extends AnyPgTable,
	TJoinedName extends string,
	TDBName extends string = TJoinedName,
> = Simplify<
	& TJoins
	& { [Alias in TJoinedName]: BuildAliasTable<TJoinedTable, TableName<TDBName>> },
	{ deep: true }
>;

export type JoinOn<
	TTableNamesMap extends Record<string, string>,
	TJoinedDBTableNames extends string,
	TAliases extends { [tableName: string]: any },
	TJoinedTable extends AnyPgTable<TableName<keyof TTableNamesMap & string>>,
	TJoinedName extends string,
	TDBName extends string = TJoinedName,
> =
	| ((
		aliases: AppendToAliases<TAliases, TJoinedTable, TJoinedName, TDBName>,
	) => AnyPgSQL<TableName<TJoinedDBTableNames | TDBName>>)
	| AnyPgSQL<TableName<TJoinedDBTableNames | TDBName>>;

export type JoinSelect<
	TJoinedTable extends AnyPgTable,
	TDBName extends string,
	TSelectedFields extends PgSelectFields<TableName>,
> =
	| ((table: BuildAliasTable<TJoinedTable, TableName<TDBName>>) => TSelectedFields)
	| TSelectedFields;

export type GetSelectedFields<T extends JoinSelect<any, any, any>> = T extends
	JoinSelect<any, any, infer TSelectedFields> ? TSelectedFields : never;

type SetJoinsNotNull<TJoinsNotNull extends Record<string, boolean>, TValue extends boolean> = {
	[Key in keyof TJoinsNotNull]: TValue;
};

export type AppendToJoinsNotNull<
	TJoinsNotNull extends Record<string, boolean>,
	TJoinedName extends string,
	TJoinType extends JoinType,
> = Simplify<
	'left' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: false }
		: 'right' extends TJoinType ? SetJoinsNotNull<TJoinsNotNull, false> & { [name in TJoinedName]: true }
		: 'inner' extends TJoinType ? SetJoinsNotNull<TJoinsNotNull, true> & { [name in TJoinedName]: true }
		: 'full' extends TJoinType ? SetJoinsNotNull<TJoinsNotNull, true> & { [name in TJoinedName]: true }
		: never
>;
