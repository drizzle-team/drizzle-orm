import { AnyColumn } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { Simplify } from 'type-fest';

import { AnyPgColumn } from '~/columns';
import { ChangeColumnTableName } from '~/columns/common';
import { PgSelectFields, SelectResultFields } from '~/operations';
import { AnyPgTable, GetTableConfig, PgTable, PgTableWithColumns, TableConfig, UpdateTableConfig } from '~/table';

import { PgSelect } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export interface JoinsValue {
	on: SQL;
	table: AnyPgTable;
	joinType: JoinType;
}

export type JoinNullability = 'nullable' | 'null' | 'not-null';

export type ApplyNotNullMapToJoins<
	TResult extends Record<string, Record<string, unknown>>,
	TJoinsNotNullable extends Record<string, JoinNullability>,
> = TJoinsNotNullable extends TJoinsNotNullable ? {
		[TTableName in keyof TResult & keyof TJoinsNotNullable & string]: TJoinsNotNullable[TTableName] extends 'nullable'
			? TResult[TTableName] | null
			: TJoinsNotNullable[TTableName] extends 'null' ? null
			: TJoinsNotNullable[TTableName] extends 'not-null' ? TResult[TTableName]
			: never;
	}
	: never;

export type SelectResult<
	TTable extends AnyPgTable,
	TReturn,
	TInitialSelectResultFields extends Record<string, unknown>,
	TJoinsNotNullable extends Record<string, JoinNullability>,
> = TReturn extends undefined ? TInitialSelectResultFields[]
	: RemoveDuplicates<
		Simplify<
			ApplyNotNullMapToJoins<
				& TReturn
				& { [Key in GetTableConfig<TTable, 'name'>]: TInitialSelectResultFields },
				TJoinsNotNullable
			>
		>
	>[];

export type AnyPgSelect = PgSelect<AnyPgTable, any, any, any>;

export type BuildAliasTable<TTable extends AnyPgTable, TAlias extends string> = GetTableConfig<TTable> extends
	infer TConfig extends TableConfig ? PgTableWithColumns<
		Simplify<
			UpdateTableConfig<TConfig, {
				name: TAlias;
				columns: Simplify<MapColumnsToTableAlias<TConfig['columns'], TAlias>>;
			}>
		>
	>
	: never;

export type MapColumnsToTableAlias<TColumns extends Record<string, AnyPgColumn>, TAlias extends string> = {
	[Key in keyof TColumns]: ChangeColumnTableName<TColumns[Key], TAlias>;
};

export type AppendToResult<
	TReturn,
	TJoinedName extends string,
	TSelectedFields extends PgSelectFields<string>,
> = TReturn extends undefined ? { [Key in TJoinedName]: SelectResultFields<TSelectedFields> }
	: Simplify<TReturn & { [Key in TJoinedName]: SelectResultFields<TSelectedFields> }>;

export type AppendToAliases<
	TJoins extends { [k: string]: AnyPgTable | Record<string, AnyColumn> },
	TJoinedTable extends AnyPgTable,
	TJoinedName extends string,
	TDBName extends string = TJoinedName,
> = Simplify<
	& TJoins
	& { [Alias in TJoinedName]: BuildAliasTable<TJoinedTable, TDBName> },
	{ deep: true }
>;

export type JoinOn<
	TTableNamesMap extends Record<string, string>,
	TJoinedDBTableNames extends string,
	TAliases extends { [tableName: string]: any },
	TJoinedTable extends AnyPgTable<{ name: keyof TTableNamesMap & string }>,
	TJoinedName extends string,
	TDBName extends string = TJoinedName,
> =
	| ((
		aliases: AppendToAliases<TAliases, TJoinedTable, TJoinedName, TDBName>,
	) => SQL)
	| SQL;

export type JoinSelect<
	TJoinedTable extends AnyPgTable,
	TSelectedFields extends PgSelectFields<string>,
> =
	| ((table: TJoinedTable) => TSelectedFields)
	| TSelectedFields;

type SetJoinsNotNull<TJoinsNotNull extends Record<string, JoinNullability>, TValue extends JoinNullability> = {
	[Key in keyof TJoinsNotNull]: TValue;
};

// https://stackoverflow.com/a/70061272/9929789
type UnionToParm<U> = U extends any ? (k: U) => void : never;
type UnionToSect<U> = UnionToParm<U> extends ((k: infer I) => void) ? I : never;
type ExtractParm<F> = F extends { (a: infer A): void } ? A : never;
type SpliceOne<Union> = Exclude<Union, ExtractOne<Union>>;
type ExtractOne<Union> = ExtractParm<UnionToSect<UnionToParm<Union>>>;
type ToTupleRec<Union, Result extends any[] = []> = SpliceOne<Union> extends never ? [ExtractOne<Union>, ...Result]
	: ToTupleRec<SpliceOne<Union>, [ExtractOne<Union>, ...Result]>;
export type RemoveDuplicates<T> = ToTupleRec<T> extends any[] ? ToTupleRec<T>[number] : never;

export type AppendToJoinsNotNull<
	TJoinsNotNull extends Record<string, JoinNullability>,
	TJoinedName extends string,
	TJoinType extends JoinType,
> = Simplify<
	'left' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'nullable' }
		: 'right' extends TJoinType ? SetJoinsNotNull<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'not-null' }
		: 'inner' extends TJoinType ? SetJoinsNotNull<TJoinsNotNull, 'not-null'> & { [name in TJoinedName]: 'not-null' }
		: 'full' extends TJoinType ? 
				| (TJoinsNotNull & { [name in TJoinedName]: 'null' })
				| (SetJoinsNotNull<TJoinsNotNull, 'null'> & { [name in TJoinedName]: 'not-null' })
				| (TJoinsNotNull & { [name in TJoinedName]: 'not-null' })
		: never
>;
